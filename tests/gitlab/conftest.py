"""GitLab simulé avec respx : les tests modifient ses données entre deux relectures."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
import respx

from app.core.models import ProjectInfo
from app.gitlab.client import GitLabClient
from app.gitlab.sync import Synchronizer
from tests import factories

BASE = "https://gitlab.example"
PROJECT = "groupe/jeu"
API = f"{BASE}/api/v4/projects/groupe%2Fjeu"
FALLBACK = ProjectInfo(name="Jeu", path=PROJECT, web_url=f"{BASE}/{PROJECT}", default_branch="main")


class Clock:
    def __init__(self) -> None:
        self.now: datetime = factories.NOW

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: float) -> None:
        self.now += timedelta(**kwargs)


class FakeGitLab:
    """État d'un faux projet GitLab, servi par respx."""

    def __init__(self, router: respx.MockRouter) -> None:
        self.router = router
        self.down = False
        self.project = factories.project()
        self.labels: list[dict[str, Any]] = [
            factories.label("Idée"),
            factories.label("À faire"),
            factories.label("En cours"),
        ]
        self.milestones: list[dict[str, Any]] = [factories.milestone(7, "Remise du CdST")]
        self.issues: dict[int, dict[str, Any]] = {}
        self.notes: dict[int, list[dict[str, Any]]] = {}
        self.members: list[dict[str, Any]] = [
            factories.user("arthur.jeaugey", user_id=1),
            factories.user("theo.wu", user_id=2),
            factories.user("louis.landanger", user_id=3),
        ]
        self.merge_requests: dict[int, dict[str, Any]] = {}
        self.approvals: dict[int, list[str]] = {}
        self.closes: dict[int, list[int]] = {}
        self.pipelines: list[dict[str, Any]] = []
        self.commits: list[dict[str, Any]] = []
        self.tags: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        # Réponses forcées pour un chemin donné (relatif au projet), prioritaires sur les données.
        self.overrides: dict[str, httpx.Response] = {}
        self.log: list[httpx.Request] = []
        self._wire()

    # --- observation ----------------------------------------------------------------------------

    @property
    def requests(self) -> list[httpx.Request]:
        return list(self.log)

    def paths(self) -> list[str]:
        return [r.url.path.split("/projects/groupe/jeu", 1)[-1] or "/" for r in self.requests]

    def count(self, suffix: str) -> int:
        return sum(1 for path in self.paths() if path == suffix)

    def reset_calls(self) -> None:
        self.log.clear()

    # --- câblage --------------------------------------------------------------------------------

    def _json(self, producer):
        def handler(request: httpx.Request, **kwargs: str) -> httpx.Response:
            self.log.append(request)
            if self.down:
                raise httpx.ConnectError("connexion refusée", request=request)
            forced = self.overrides.get(request.url.path.split("/projects/groupe/jeu", 1)[-1])
            if forced is not None:
                return forced
            result = producer(request, **kwargs)
            if isinstance(result, httpx.Response):
                return result
            return httpx.Response(200, json=result)

        return handler

    def _wire(self) -> None:
        route = self.router
        not_found = httpx.Response(404, json={"message": "404 Not Found"})

        def issues(request: httpx.Request) -> list[dict[str, Any]]:
            after = request.url.params.get("updated_after")
            found = list(self.issues.values())
            if after:
                limit = datetime.fromisoformat(after)
                found = [i for i in found if datetime.fromisoformat(i["updated_at"]) > limit]
            return found

        def one_issue(request: httpx.Request, iid: str):
            return self.issues.get(int(iid)) or not_found

        def one_mr(request: httpx.Request, iid: str):
            return self.merge_requests.get(int(iid)) or not_found

        def member(request: httpx.Request, user_id: str):
            return next((m for m in self.members if m["id"] == int(user_id)), None) or not_found

        def commit(request: httpx.Request, sha: str):
            return next((c for c in self.commits if c["id"] == sha), None) or not_found

        route.get(url__regex=rf"^{re.escape(API)}$").mock(side_effect=self._json(lambda r: self.project))
        route.get(f"{API}/labels").mock(side_effect=self._json(lambda r: self.labels))
        route.get(f"{API}/milestones").mock(side_effect=self._json(lambda r: self.milestones))
        route.get(f"{API}/issues").mock(side_effect=self._json(issues))
        route.get(url__regex=rf"^{re.escape(API)}/issues/(?P<iid>\d+)/notes(\?.*)?$").mock(
            side_effect=self._json(lambda r, iid: self.notes.get(int(iid), []))
        )
        route.get(url__regex=rf"^{re.escape(API)}/issues/(?P<iid>\d+)$").mock(
            side_effect=self._json(one_issue)
        )
        route.get(f"{API}/members/all").mock(side_effect=self._json(lambda r: self.members))
        route.get(url__regex=rf"^{re.escape(API)}/members/all/(?P<user_id>\d+)$").mock(
            side_effect=self._json(member)
        )
        route.get(f"{API}/merge_requests").mock(
            side_effect=self._json(lambda r: [dict(mr) for mr in self.merge_requests.values()])
        )
        route.get(url__regex=rf"^{re.escape(API)}/merge_requests/(?P<iid>\d+)/approvals$").mock(
            side_effect=self._json(
                lambda r, iid: {
                    "approved_by": [{"user": {"username": u}} for u in self.approvals.get(int(iid), [])]
                }
            )
        )
        route.get(url__regex=rf"^{re.escape(API)}/merge_requests/(?P<iid>\d+)/closes_issues(\?.*)?$").mock(
            side_effect=self._json(lambda r, iid: [{"iid": i} for i in self.closes.get(int(iid), [])])
        )
        route.get(url__regex=rf"^{re.escape(API)}/merge_requests/(?P<iid>\d+)$").mock(
            side_effect=self._json(one_mr)
        )
        route.get(f"{API}/pipelines").mock(side_effect=self._json(lambda r: self.pipelines))
        route.get(f"{API}/repository/commits").mock(side_effect=self._json(lambda r: self.commits[:1]))
        route.get(url__regex=rf"^{re.escape(API)}/repository/commits/(?P<sha>[0-9a-f]+)$").mock(
            side_effect=self._json(commit)
        )
        route.get(f"{API}/repository/tags").mock(side_effect=self._json(lambda r: self.tags))
        route.get(f"{API}/events").mock(side_effect=self._json(lambda r: self.events))


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def gitlab():
    with respx.mock(assert_all_called=False) as router:
        yield FakeGitLab(router)


@pytest.fixture
async def client(gitlab):
    client = GitLabClient(BASE, "jeton-de-test", PROJECT)
    yield client
    await client.aclose()


@pytest.fixture
async def sync(gitlab, client, clock):
    synchronizer = Synchronizer(
        client,
        factories.config(),
        project_fallback=FALLBACK,
        poll_interval=30,
        full_refresh_interval=600,
        webhook_fresh_seconds=3600,
        clock=clock,
    )
    yield synchronizer
    await synchronizer.stop()
