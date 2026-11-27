"""Ce qui demande de l'attention : relectures qui traînent, tâches dormantes, membres disponibles."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from app.core.models import (
    Attention,
    Inconsistent,
    Issue,
    IssueStale,
    Member,
    MemberIdle,
    MergeRequest,
    MrWaiting,
    NeedsTriage,
    Pipeline,
    PipelineFailed,
)

SECONDS_PER_HOUR = 3600


def review_state(
    *,
    draft: bool,
    author: str,
    approved_by: Sequence[str],
    created_at: datetime,
    now: datetime,
    review_hours: int,
) -> tuple[bool, int | None, bool]:
    """État de relecture d'une merge request ouverte : (en attente, heures d'attente, en retard).

    Une merge request attend une relecture tant qu'elle n'est pas un brouillon et qu'aucun membre
    autre que son auteur ne l'a approuvée.
    """
    approved_by_other = any(user != author for user in approved_by)
    waiting = not draft and not approved_by_other
    if not waiting:
        return False, None, False
    hours = max(0, int((now - created_at).total_seconds() // SECONDS_PER_HOUR))
    return True, hours, hours >= review_hours


def stale_days(*, column: str, last_activity_at: datetime, now: datetime, threshold: int) -> int | None:
    """Jours sans activité d'une tâche en cours, ou None si elle n'atteint pas le seuil."""
    if column != "doing":
        return None
    days = (now - last_activity_at).days
    return days if days >= threshold else None


def build_attention(
    *,
    issues: Sequence[Issue],
    merge_requests: Sequence[MergeRequest],
    members: Sequence[Member],
    pipelines: Sequence[Pipeline],
) -> list[Attention]:
    """Liste ordonnée du plus urgent au moins urgent."""
    items: list[Attention] = []

    if pipelines and pipelines[0].status == "failed":
        latest = pipelines[0]
        items.append(PipelineFailed(pipeline_id=latest.id, ref=latest.ref, web_url=latest.web_url))

    for mr in sorted(merge_requests, key=lambda m: m.waiting_hours or 0, reverse=True):
        if mr.overdue and mr.waiting_hours is not None:
            items.append(
                MrWaiting(mr=mr.iid, hours=mr.waiting_hours, author=mr.author, reviewers=mr.reviewers)
            )

    open_issues = [issue for issue in issues if issue.column != "done"]

    for issue in sorted(open_issues, key=lambda i: i.stale_days or 0, reverse=True):
        if issue.stale_days is not None:
            items.append(IssueStale(issue=issue.iid, days=issue.stale_days, assignees=issue.assignees))

    for issue in open_issues:
        for flag in issue.flags:
            if flag != "needs_triage":
                items.append(Inconsistent(issue=issue.iid, flag=flag))

    for issue in open_issues:
        if "needs_triage" in issue.flags:
            items.append(NeedsTriage(issue=issue.iid))

    busy = {user for issue in open_issues if issue.column == "doing" for user in issue.assignees}
    available_todo = sum(1 for issue in open_issues if issue.column == "todo" and not issue.assignees)
    for member in members:
        if member.in_project and member.username not in busy:
            items.append(MemberIdle(member=member.username, available_todo=available_todo))

    return items
