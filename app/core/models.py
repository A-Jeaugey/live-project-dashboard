"""Formes échangées avec l'interface. Miroir exact de `frontend/src/lib/types.ts`."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

ColumnKey = Literal["idea", "todo", "doing", "done"]
IssueFlag = Literal["needs_triage", "multiple_columns", "doing_unassigned", "todo_assigned"]


class Me(BaseModel):
    username: str
    name: str
    first_name: str
    avatar_url: str | None


class Member(BaseModel):
    username: str
    name: str
    first_name: str
    avatar_url: str | None
    web_url: str | None
    in_project: bool


class Domain(BaseModel):
    name: str
    color: str


class MilestoneRef(BaseModel):
    id: int
    title: str
    deadline_key: str | None


class TaskProgress(BaseModel):
    done: int
    total: int


class Issue(BaseModel):
    iid: int
    title: str
    column: ColumnKey
    flags: list[IssueFlag]
    domains: list[str]
    assignees: list[str]
    author: str | None
    milestone: MilestoneRef | None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    last_activity_at: datetime
    stale_days: int | None
    notes_count: int
    tasks: TaskProgress | None
    merge_requests: list[int]
    web_url: str


class Note(BaseModel):
    id: int
    author: str
    author_name: str
    body: str
    created_at: datetime


class IssueDetail(Issue):
    description: str
    notes: list[Note]


class MergeRequest(BaseModel):
    iid: int
    title: str
    author: str
    reviewers: list[str]
    approved_by: list[str]
    draft: bool
    created_at: datetime
    updated_at: datetime
    waiting_review: bool
    waiting_hours: int | None
    overdue: bool
    closes: list[int]
    source_branch: str
    pipeline_status: str | None
    web_url: str


class DeadlineMilestone(BaseModel):
    id: int
    title: str
    web_url: str
    total: int
    closed: int
    doing: int
    todo: int


class Deadline(BaseModel):
    key: str
    title: str
    short_title: str
    week_of: date
    target_date: date
    days_left: int
    past: bool
    night: int | None
    milestone: DeadlineMilestone | None


class Pipeline(BaseModel):
    id: int
    status: str
    ref: str
    sha: str
    created_at: datetime
    web_url: str


class Playable(BaseModel):
    rule: Literal["pipeline", "tag", "commit"]
    source: Literal["pipeline", "tag", "commit", "none"]
    fallback_reason: Literal["no_pipeline", "no_successful_pipeline", "no_tag"] | None
    sha: str | None
    short_sha: str | None
    title: str | None
    author_name: str | None
    committed_at: datetime | None
    tag: str | None
    web_url: str | None


class MrWaiting(BaseModel):
    kind: Literal["mr_waiting"] = "mr_waiting"
    mr: int
    hours: int
    author: str
    reviewers: list[str]


class IssueStale(BaseModel):
    kind: Literal["issue_stale"] = "issue_stale"
    issue: int
    days: int
    assignees: list[str]


class MemberIdle(BaseModel):
    kind: Literal["member_idle"] = "member_idle"
    member: str
    available_todo: int


class NeedsTriage(BaseModel):
    kind: Literal["needs_triage"] = "needs_triage"
    issue: int


class Inconsistent(BaseModel):
    kind: Literal["inconsistent"] = "inconsistent"
    issue: int
    flag: IssueFlag


class PipelineFailed(BaseModel):
    kind: Literal["pipeline_failed"] = "pipeline_failed"
    pipeline_id: int
    ref: str
    web_url: str


Attention = Annotated[
    MrWaiting | IssueStale | MemberIdle | NeedsTriage | Inconsistent | PipelineFailed,
    Field(discriminator="kind"),
]

ActivityKind = Literal[
    "issue_opened",
    "issue_closed",
    "issue_reopened",
    "mr_opened",
    "mr_merged",
    "mr_closed",
    "mr_approved",
    "commented",
    "pushed",
    "joined",
    "other",
]


class ActivityTarget(BaseModel):
    type: Literal["issue", "merge_request", "branch", "project", "milestone"]
    iid: int | None
    title: str | None
    web_url: str | None


class Activity(BaseModel):
    id: str
    at: datetime
    actor: str | None
    actor_name: str | None
    kind: ActivityKind
    target: ActivityTarget | None
    detail: str | None


class SyncStatus(BaseModel):
    mode: Literal["webhook", "polling"]
    ok: bool
    last_success_at: datetime | None
    last_error: str | None
    last_webhook_at: datetime | None


class ProjectInfo(BaseModel):
    name: str
    path: str
    web_url: str
    default_branch: str


class ColumnLabelNames(BaseModel):
    idea: str
    todo: str
    doing: str


class SnapshotSettings(BaseModel):
    done_window_days: int
    stale_days: int
    review_hours: int
    column_labels: ColumnLabelNames


class Setup(BaseModel):
    missing_labels: list[str]
    missing_milestones: list[str]


class Snapshot(BaseModel):
    version: int
    generated_at: datetime
    sync: SyncStatus
    project: ProjectInfo
    settings: SnapshotSettings
    members: list[Member]
    domains: list[Domain]
    setup: Setup
    deadlines: list[Deadline]
    issues: list[Issue]
    merge_requests: list[MergeRequest]
    pipelines: list[Pipeline]
    playable: Playable
    attention: list[Attention]
    activity: list[Activity]


class StreamEvent(BaseModel):
    type: Literal["hello", "changed"]
    version: int
    activity: list[Activity]
