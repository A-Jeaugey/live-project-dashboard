"""Construction de l'instantané affiché, à partir des réponses brutes de GitLab. Fonctions pures."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.config import ProjectConfig
from app.core import attention as attention_rules
from app.core.activity import build_activity, is_bot
from app.core.calendar import build_deadlines, deadline_keys_by_milestone, is_past, match_milestone
from app.core.columns import ColumnLabels, classify, normalize_label
from app.core.models import (
    ColumnKey,
    ColumnLabelNames,
    Domain,
    Issue,
    IssueDetail,
    Member,
    MergeRequest,
    MilestoneRef,
    Note,
    Pipeline,
    ProjectInfo,
    Setup,
    Snapshot,
    SnapshotSettings,
    SyncStatus,
    TaskProgress,
)
from app.core.playable import choose_playable


@dataclass
class RawState:
    """Dernières réponses de GitLab, telles quelles. Seule la synchro y écrit."""

    project: dict[str, Any] | None = None
    labels: list[dict[str, Any]] = field(default_factory=list)
    milestones: list[dict[str, Any]] = field(default_factory=list)
    issues: dict[int, dict[str, Any]] = field(default_factory=dict)
    members: list[dict[str, Any]] = field(default_factory=list)
    merge_requests: dict[int, dict[str, Any]] = field(default_factory=dict)
    mr_approvals: dict[int, list[str]] = field(default_factory=dict)
    mr_closes: dict[int, list[int]] = field(default_factory=dict)
    pipelines: list[dict[str, Any]] = field(default_factory=list)
    last_commit: dict[str, Any] | None = None
    commits: dict[str, dict[str, Any]] = field(default_factory=dict)
    tags: list[dict[str, Any]] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)


def _dt(value: Any) -> datetime:
    return datetime.fromisoformat(str(value))


def _optional_dt(value: Any) -> datetime | None:
    return datetime.fromisoformat(value) if isinstance(value, str) and value else None


def _usernames(people: Any) -> list[str]:
    return [str(p["username"]) for p in (people or []) if p and p.get("username")]


def column_labels_of(config: ProjectConfig) -> ColumnLabels:
    return ColumnLabels(idea=config.columns.idea, todo=config.columns.todo, doing=config.columns.doing)


def build_project(raw: Mapping[str, Any] | None, fallback: ProjectInfo) -> ProjectInfo:
    if not raw:
        return fallback
    return ProjectInfo(
        name=str(raw.get("name") or fallback.name),
        path=str(raw.get("path_with_namespace") or fallback.path),
        web_url=str(raw.get("web_url") or fallback.web_url),
        default_branch=str(raw.get("default_branch") or fallback.default_branch),
    )


def build_members(raw_members: Sequence[Mapping[str, Any]], config: ProjectConfig) -> list[Member]:
    """Membres de la configuration d'abord, puis les autres membres humains du projet GitLab."""
    humans = {
        str(m["username"]): m
        for m in raw_members
        if m.get("username") and not is_bot(m.get("username")) and m.get("state", "active") == "active"
    }
    members: list[Member] = []
    seen: set[str] = set()
    for configured in config.members:
        raw = humans.get(configured.gitlab)
        seen.add(configured.gitlab)
        members.append(
            Member(
                username=configured.gitlab,
                name=str(raw.get("name")) if raw else configured.first_name,
                first_name=configured.first_name,
                avatar_url=raw.get("avatar_url") if raw else None,
                web_url=raw.get("web_url") if raw else None,
                in_project=raw is not None,
            )
        )
    for username, raw in humans.items():
        if username in seen:
            continue
        name = str(raw.get("name") or username)
        members.append(
            Member(
                username=username,
                name=name,
                first_name=name.split()[0] if name.split() else username,
                avatar_url=raw.get("avatar_url"),
                web_url=raw.get("web_url"),
                in_project=True,
            )
        )
    return members


def build_domains(raw_labels: Sequence[Mapping[str, Any]], config: ProjectConfig) -> list[Domain]:
    """Domaines de la configuration, avec la couleur du label GitLab quand il existe."""
    colors = {normalize_label(str(label.get("name", ""))): label.get("color") for label in raw_labels}
    return [
        Domain(name=domain.name, color=str(colors.get(normalize_label(domain.name)) or domain.color))
        for domain in config.domains
    ]


def build_setup(raw: RawState, config: ProjectConfig, *, now: datetime, tz: ZoneInfo) -> Setup:
    """Labels et jalons que l'organisation attend et que GitLab n'a pas encore."""
    existing = {normalize_label(str(label.get("name", ""))) for label in raw.labels}
    expected = [
        config.columns.idea,
        config.columns.todo,
        config.columns.doing,
        *(d.name for d in config.domains),
    ]
    missing_labels = [name for name in expected if normalize_label(name) not in existing]
    missing_milestones = [
        deadline.milestone_title or deadline.title
        for deadline in config.deadlines
        if not is_past(deadline, now, tz) and match_milestone(deadline, raw.milestones) is None
    ]
    return Setup(missing_labels=missing_labels, missing_milestones=missing_milestones)


def build_merge_requests(raw: RawState, *, now: datetime, review_hours: int) -> list[MergeRequest]:
    built: list[MergeRequest] = []
    for iid, mr in raw.merge_requests.items():
        if mr.get("state", "opened") != "opened":
            continue
        author = str((mr.get("author") or {}).get("username") or "")
        approved_by = list(raw.mr_approvals.get(iid, []))
        draft = bool(mr.get("draft") or mr.get("work_in_progress"))
        created_at = _dt(mr["created_at"])
        waiting, hours, overdue = attention_rules.review_state(
            draft=draft,
            author=author,
            approved_by=approved_by,
            created_at=created_at,
            now=now,
            review_hours=review_hours,
        )
        pipeline = mr.get("head_pipeline") or mr.get("pipeline") or {}
        built.append(
            MergeRequest(
                iid=iid,
                title=str(mr.get("title") or ""),
                author=author,
                reviewers=_usernames(mr.get("reviewers")),
                approved_by=approved_by,
                draft=draft,
                created_at=created_at,
                updated_at=_dt(mr.get("updated_at") or mr["created_at"]),
                waiting_review=waiting,
                waiting_hours=hours,
                overdue=overdue,
                closes=sorted(raw.mr_closes.get(iid, [])),
                source_branch=str(mr.get("source_branch") or ""),
                pipeline_status=pipeline.get("status"),
                web_url=str(mr.get("web_url") or ""),
            )
        )
    built.sort(key=lambda m: m.created_at)
    return built


def build_issue(
    raw_issue: Mapping[str, Any],
    *,
    config: ProjectConfig,
    column_labels: ColumnLabels,
    deadline_keys: Mapping[int, str],
    linked_mrs: Sequence[MergeRequest],
    now: datetime,
) -> Issue:
    labels = [str(label) for label in raw_issue.get("labels") or []]
    assignees = _usernames(raw_issue.get("assignees"))
    column, flags = classify(
        closed=raw_issue.get("state") == "closed",
        labels=labels,
        has_assignee=bool(assignees),
        column_labels=column_labels,
    )

    normalized = {normalize_label(label) for label in labels}
    domains = [d.name for d in config.domains if normalize_label(d.name) in normalized]

    milestone_raw = raw_issue.get("milestone")
    milestone = None
    if milestone_raw:
        milestone_id = int(milestone_raw["id"])
        milestone = MilestoneRef(
            id=milestone_id,
            title=str(milestone_raw.get("title") or ""),
            deadline_key=deadline_keys.get(milestone_id),
        )

    updated_at = _dt(raw_issue.get("updated_at") or raw_issue["created_at"])
    last_activity_at = max([updated_at, *(mr.updated_at for mr in linked_mrs)])

    completion = raw_issue.get("task_completion_status") or {}
    total_tasks = int(completion.get("count") or 0)
    tasks = (
        TaskProgress(done=int(completion.get("completed_count") or 0), total=total_tasks)
        if total_tasks
        else None
    )

    return Issue(
        iid=int(raw_issue["iid"]),
        title=str(raw_issue.get("title") or ""),
        column=column,
        flags=flags,
        domains=domains,
        assignees=assignees,
        author=(raw_issue.get("author") or {}).get("username"),
        milestone=milestone,
        created_at=_dt(raw_issue["created_at"]),
        updated_at=updated_at,
        closed_at=_optional_dt(raw_issue.get("closed_at")),
        last_activity_at=last_activity_at,
        stale_days=attention_rules.stale_days(
            column=column,
            last_activity_at=last_activity_at,
            now=now,
            threshold=config.thresholds.stale_days,
        ),
        notes_count=int(raw_issue.get("user_notes_count") or 0),
        tasks=tasks,
        merge_requests=sorted(mr.iid for mr in linked_mrs),
        web_url=str(raw_issue.get("web_url") or ""),
    )


def build_issues(
    raw: RawState, config: ProjectConfig, merge_requests: Sequence[MergeRequest], *, now: datetime
) -> list[Issue]:
    column_labels = column_labels_of(config)
    deadline_keys = deadline_keys_by_milestone(config.deadlines, raw.milestones)
    mrs_by_issue: dict[int, list[MergeRequest]] = defaultdict(list)
    for mr in merge_requests:
        for issue_iid in mr.closes:
            mrs_by_issue[issue_iid].append(mr)
    issues = [
        build_issue(
            raw_issue,
            config=config,
            column_labels=column_labels,
            deadline_keys=deadline_keys,
            linked_mrs=mrs_by_issue.get(iid, []),
            now=now,
        )
        for iid, raw_issue in raw.issues.items()
    ]
    issues.sort(key=lambda issue: issue.iid, reverse=True)
    return issues


def build_issue_detail(
    issue: Issue, raw_issue: Mapping[str, Any], raw_notes: Sequence[Mapping[str, Any]]
) -> IssueDetail:
    """Détail d'une issue : description et commentaires humains, du plus ancien au plus récent."""
    notes = [
        Note(
            id=int(note["id"]),
            author=str((note.get("author") or {}).get("username") or ""),
            author_name=str((note.get("author") or {}).get("name") or ""),
            body=str(note.get("body") or ""),
            created_at=_dt(note["created_at"]),
        )
        for note in raw_notes
        if not note.get("system")
    ]
    notes.sort(key=lambda note: note.created_at)
    return IssueDetail(**issue.model_dump(), description=str(raw_issue.get("description") or ""), notes=notes)


def build_pipelines(raw_pipelines: Sequence[Mapping[str, Any]]) -> list[Pipeline]:
    return [
        Pipeline(
            id=int(p["id"]),
            status=str(p.get("status") or ""),
            ref=str(p.get("ref") or ""),
            sha=str(p.get("sha") or ""),
            created_at=_dt(p["created_at"]),
            web_url=str(p.get("web_url") or ""),
        )
        for p in raw_pipelines
    ]


def build_snapshot(
    raw: RawState,
    config: ProjectConfig,
    *,
    now: datetime,
    version: int,
    sync: SyncStatus,
    project_fallback: ProjectInfo,
) -> Snapshot:
    """Assemble tout ce que l'interface affiche. Ne lit que `raw`, `config` et `now`."""
    tz = ZoneInfo(config.project.timezone)
    project = build_project(raw.project, project_fallback)

    members = build_members(raw.members, config)
    merge_requests = build_merge_requests(raw, now=now, review_hours=config.thresholds.review_hours)
    issues = build_issues(raw, config, merge_requests, now=now)
    pipelines = build_pipelines(raw.pipelines)

    columns_by_milestone: dict[int, list[ColumnKey]] = defaultdict(list)
    for issue in issues:
        if issue.milestone is not None:
            columns_by_milestone[issue.milestone.id].append(issue.column)

    return Snapshot(
        version=version,
        generated_at=now,
        sync=sync,
        project=project,
        settings=SnapshotSettings(
            done_window_days=config.thresholds.done_window_days,
            stale_days=config.thresholds.stale_days,
            review_hours=config.thresholds.review_hours,
            column_labels=ColumnLabelNames(
                idea=config.columns.idea, todo=config.columns.todo, doing=config.columns.doing
            ),
        ),
        members=members,
        domains=build_domains(raw.labels, config),
        setup=build_setup(raw, config, now=now, tz=tz),
        deadlines=build_deadlines(config.deadlines, raw.milestones, columns_by_milestone, now=now, tz=tz),
        issues=issues,
        merge_requests=merge_requests,
        pipelines=pipelines,
        playable=choose_playable(
            rule=config.playable.rule,
            tag_pattern=config.playable.tag_pattern,
            pipelines=raw.pipelines,
            tags=raw.tags,
            last_commit=raw.last_commit,
            commits_by_sha=raw.commits,
            project_web_url=project.web_url,
        ),
        attention=attention_rules.build_attention(
            issues=issues, merge_requests=merge_requests, members=members, pipelines=pipelines
        ),
        activity=build_activity(raw.events, project.web_url),
    )
