"""Synchronisation avec GitLab : un instantané en mémoire, reconstruit uniquement depuis l'API.

Principe : GitLab est la seule source de vérité. Un webhook n'est qu'un signal (« quelque chose a
changé ») qui déclenche une relecture ; son contenu n'est jamais copié dans le cache.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from app.config import ProjectConfig
from app.core.calendar import deadline_keys_by_milestone
from app.core.models import IssueDetail, ProjectInfo, Snapshot, StreamEvent, SyncStatus
from app.core.snapshot import RawState, build_issue, build_issue_detail, build_snapshot, column_labels_of
from app.gitlab.bus import EventBus
from app.gitlab.client import GitLabClient, GitLabError
from app.store.db import Store

log = logging.getLogger(__name__)

# Marge reprise à chaque interrogation incrémentale, pour ne rien rater si les horloges diffèrent.
UPDATED_AFTER_MARGIN = timedelta(seconds=90)
INTERNAL_ERROR = "Erreur interne pendant la synchronisation"
STORE_LAST_WEBHOOK = "last_webhook_at"

MergeRequestData = tuple[dict[int, dict[str, Any]], dict[int, list[str]], dict[int, list[int]]]


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Synchronizer:
    def __init__(
        self,
        client: GitLabClient,
        config: ProjectConfig,
        *,
        project_fallback: ProjectInfo,
        bus: EventBus | None = None,
        store: Store | None = None,
        poll_interval: float = 30.0,
        full_refresh_interval: float = 600.0,
        webhook_fresh_seconds: float = 3600.0,
        clock: Callable[[], datetime] = _utcnow,
    ) -> None:
        self.client = client
        self.config = config
        self.bus = bus or EventBus()
        self.raw = RawState()

        self._project_fallback = project_fallback
        self._store = store
        self._poll_interval = poll_interval
        self._full_refresh_interval = full_refresh_interval
        self._webhook_fresh = timedelta(seconds=webhook_fresh_seconds)
        self._clock = clock

        self._lock = asyncio.Lock()
        self._task: asyncio.Task[None] | None = None
        self._drain_task: asyncio.Task[None] | None = None
        self._pending: set[tuple[str, int | None]] = set()

        self._ok = False
        self._last_error: str | None = None
        self._last_success_at: datetime | None = None
        self._last_full_at: datetime | None = None
        self._issues_synced_at: datetime | None = None
        self._last_webhook_at: datetime | None = self._load_last_webhook()
        self._webhook_trusted_until: datetime | None = None

        self._version = 0
        self._digest: str | None = None
        self._seen_activity: set[str] | None = None
        self._snapshot = self._build(self._clock())

    # --- lecture --------------------------------------------------------------------------------

    @property
    def snapshot(self) -> Snapshot:
        return self._snapshot

    @property
    def mode(self) -> str:
        return "webhook" if self._webhooks_trusted(self._clock()) else "polling"

    async def issue_detail(self, iid: int) -> IssueDetail | None:
        """Détail d'une issue, relu dans GitLab à la demande. None si elle n'existe pas."""
        raw_issue = await self.client.issue(iid)
        if raw_issue is None:
            return None
        notes = await self.client.issue_notes(iid)
        linked = [mr for mr in self._snapshot.merge_requests if iid in mr.closes]
        issue = build_issue(
            raw_issue,
            config=self.config,
            column_labels=column_labels_of(self.config),
            deadline_keys=deadline_keys_by_milestone(self.config.deadlines, self.raw.milestones),
            linked_mrs=linked,
            now=self._clock(),
        )
        return build_issue_detail(issue, raw_issue, notes)

    # --- cycle de vie ---------------------------------------------------------------------------

    async def start(self) -> None:
        """Première lecture complète, puis boucle de fond. Ne lève jamais : une panne se lit dans `sync`."""
        await self.full_refresh()
        self._task = asyncio.create_task(self._run(), name="gitlab-sync")

    async def stop(self) -> None:
        for task in (self._task, self._drain_task):
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        self._task = self._drain_task = None
        await self.client.aclose()

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self._poll_interval)
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:  # la boucle ne doit jamais mourir
                log.exception("Passage de synchronisation en échec")

    async def tick(self) -> None:
        """Un passage de la boucle : relecture complète si elle est due, sinon selon le mode."""
        now = self._clock()
        full_due = (
            self._last_full_at is None
            or (now - self._last_full_at).total_seconds() >= self._full_refresh_interval
        )
        if full_due:
            await self.full_refresh()
        elif not self._webhooks_trusted(now):
            await self.incremental_refresh()
        else:
            # Les webhooks font le travail : on ne rafraîchit que ce qui dépend de l'heure.
            async with self._lock:
                self._rebuild()

    # --- relectures -----------------------------------------------------------------------------

    async def full_refresh(self) -> bool:
        async with self._lock:
            return await self._guarded(self._full)

    async def incremental_refresh(self) -> bool:
        async with self._lock:
            return await self._guarded(self._incremental)

    async def _full(self) -> None:
        started = self._clock()
        fresh = await self._fetch_all()
        if self._last_full_at is not None and self._webhooks_trusted(started) and self._differs(fresh):
            # Un changement est passé sans webhook : on ne leur fait plus confiance.
            log.warning("Changement détecté sans webhook : retour à l'interrogation périodique")
            self._webhook_trusted_until = None
        self.raw = fresh
        self._last_full_at = started
        self._issues_synced_at = started

    async def _incremental(self) -> None:
        started = self._clock()
        since = (self._issues_synced_at or started) - UPDATED_AFTER_MARGIN
        client = self.client
        issues, labels, milestones, events = await asyncio.gather(
            client.issues(updated_after=since), client.labels(), client.milestones(), client.events()
        )
        for issue in issues:
            self.raw.issues[int(issue["iid"])] = issue
        self.raw.labels, self.raw.milestones, self.raw.events = labels, milestones, events
        self.raw.merge_requests, self.raw.mr_approvals, self.raw.mr_closes = await self._fetch_merge_requests(
            self.raw
        )
        await self._fetch_repository(self.raw)
        self._issues_synced_at = started

    async def _refresh_issues(self, iids: set[int]) -> None:
        results = await asyncio.gather(*(self.client.issue(iid) for iid in sorted(iids)))
        for iid, issue in zip(sorted(iids), results, strict=True):
            if issue is None:
                self.raw.issues.pop(iid, None)
            else:
                self.raw.issues[iid] = issue
        self.raw.events = await self.client.events()

    async def _fetch_all(self) -> RawState:
        client = self.client
        project, labels, milestones, issues, members, events = await asyncio.gather(
            client.project(),
            client.labels(),
            client.milestones(),
            client.issues(),
            client.members(),
            client.events(),
        )
        fresh = RawState(
            project=project,
            labels=labels,
            milestones=milestones,
            issues={int(issue["iid"]): issue for issue in issues},
            members=members,
            events=events,
            commits=dict(self.raw.commits),
        )
        merge_requests, _ = await asyncio.gather(
            self._fetch_merge_requests(None), self._fetch_repository(fresh)
        )
        fresh.merge_requests, fresh.mr_approvals, fresh.mr_closes = merge_requests
        return fresh

    async def _fetch_merge_requests(self, previous: RawState | None) -> MergeRequestData:
        """Merge requests ouvertes, avec approbations et issues fermées.

        Les approbations sont relues à chaque fois ; le détail et les issues liées seulement quand
        la merge request est nouvelle ou a changé.
        """
        listed = await self.client.merge_requests()

        async def one(item: dict[str, Any]) -> tuple[int, dict[str, Any], list[str], list[int]]:
            iid = int(item["iid"])
            old = previous.merge_requests.get(iid) if previous else None
            unchanged = (
                old is not None
                and old.get("updated_at") == item.get("updated_at")
                and old.get("sha") == item.get("sha")
            )
            if unchanged and previous is not None and old is not None:
                detail = {**item, "head_pipeline": old.get("head_pipeline")}
                closes = previous.mr_closes.get(iid, [])
            else:
                detail = await self.client.merge_request(iid) or item
                closes = await self.client.mr_closes_issues(iid)
            return iid, detail, await self.client.mr_approvals(iid), closes

        results = await asyncio.gather(*(one(item) for item in listed))
        return (
            {iid: detail for iid, detail, _, _ in results},
            {iid: approvals for iid, _, approvals, _ in results},
            {iid: closes for iid, _, _, closes in results},
        )

    async def _fetch_repository(self, raw: RawState) -> None:
        branch = str((raw.project or {}).get("default_branch") or self._project_fallback.default_branch)
        raw.pipelines, raw.last_commit, raw.tags = await asyncio.gather(
            self.client.pipelines(branch), self.client.last_commit(branch), self.client.tags()
        )
        if self.config.playable.rule == "pipeline":
            success = next((p for p in raw.pipelines if p.get("status") == "success"), None)
            sha = str(success.get("sha") or "") if success else ""
            if sha and sha not in raw.commits:
                commit = await self.client.commit(sha)
                if commit is not None:
                    raw.commits[sha] = commit

    def _differs(self, fresh: RawState) -> bool:
        return fresh.issues != self.raw.issues or set(fresh.merge_requests) != set(self.raw.merge_requests)

    async def _guarded(self, work: Callable[[], Awaitable[None]]) -> bool:
        """Exécute une relecture. En cas d'échec, on garde le dernier instantané et on le signale."""
        try:
            await work()
        except GitLabError as exc:
            log.warning("Synchronisation GitLab en échec : %s", exc)
            self._ok, self._last_error = False, str(exc)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Erreur inattendue pendant la synchronisation")
            self._ok, self._last_error = False, INTERNAL_ERROR
        else:
            self._ok, self._last_error = True, None
            self._last_success_at = self._clock()
        self._rebuild()
        return self._ok

    # --- webhooks -------------------------------------------------------------------------------

    def note_webhook(self) -> None:
        """À appeler pour chaque webhook valide : tant qu'ils arrivent, on interroge moins."""
        now = self._clock()
        self._last_webhook_at = now
        self._webhook_trusted_until = now + self._webhook_fresh
        if self._store is not None:
            self._store.set(STORE_LAST_WEBHOOK, now.isoformat())

    def signal(self, kind: str, iid: int | None = None) -> None:
        """Demande une relecture ciblée, sans attendre. Les signaux rapprochés sont regroupés."""
        self._pending.add((kind, iid))
        if self._drain_task is None or self._drain_task.done():
            self._drain_task = asyncio.create_task(self._drain(), name="gitlab-signals")

    async def _drain(self) -> None:
        while self._pending:
            batch, self._pending = self._pending, set()
            await self.handle_signals(batch)

    async def handle_signals(self, batch: set[tuple[str, int | None]]) -> None:
        issue_iids = {iid for kind, iid in batch if kind == "issue" and iid is not None}
        only_issues = all(kind == "issue" and iid is not None for kind, iid in batch)
        async with self._lock:
            if only_issues:
                await self._guarded(lambda: self._refresh_issues(issue_iids))
            else:
                await self._guarded(self._incremental)

    def _webhooks_trusted(self, now: datetime) -> bool:
        return self._webhook_trusted_until is not None and now < self._webhook_trusted_until

    def _load_last_webhook(self) -> datetime | None:
        if self._store is None:
            return None
        value = self._store.get(STORE_LAST_WEBHOOK)
        try:
            return datetime.fromisoformat(value) if value else None
        except ValueError:
            return None

    # --- instantané -----------------------------------------------------------------------------

    def _status(self, now: datetime) -> SyncStatus:
        return SyncStatus(
            mode="webhook" if self._webhooks_trusted(now) else "polling",
            ok=self._ok,
            last_success_at=self._last_success_at,
            last_error=self._last_error,
            last_webhook_at=self._last_webhook_at,
        )

    def _build(self, now: datetime) -> Snapshot:
        return build_snapshot(
            self.raw,
            self.config,
            now=now,
            version=self._version,
            sync=self._status(now),
            project_fallback=self._project_fallback,
        )

    def _rebuild(self) -> None:
        """Reconstruit l'instantané ; la version n'augmente que si son contenu a changé."""
        now = self._clock()
        try:
            snapshot = self._build(now)
        except Exception:
            # Une réponse de GitLab que l'on ne sait pas lire ne doit ni planter le serveur ni
            # vider l'écran : on garde le dernier instantané et on signale le problème.
            log.exception("Instantané impossible à construire : le précédent est conservé")
            self._ok, self._last_error = False, INTERNAL_ERROR
            snapshot = self._snapshot.model_copy(update={"sync": self._status(now), "generated_at": now})
        content = snapshot.model_dump_json(exclude={"version", "generated_at", "sync"})
        state = f"{snapshot.sync.mode}|{snapshot.sync.ok}|{snapshot.sync.last_error}"
        digest = hashlib.sha256(f"{content}|{state}".encode()).hexdigest()

        if digest == self._digest:
            self._snapshot = snapshot
            return

        self._digest = digest
        self._version += 1
        self._snapshot = snapshot.model_copy(update={"version": self._version})

        current = {activity.id for activity in snapshot.activity}
        if self._seen_activity is None:
            fresh_activity = []  # premier chargement : rien n'est « nouveau »
        else:
            fresh_activity = [a for a in snapshot.activity if a.id not in self._seen_activity]
        if self._ok:
            self._seen_activity = (self._seen_activity or set()) | current
        self.bus.publish(StreamEvent(type="changed", version=self._version, activity=fresh_activity))
