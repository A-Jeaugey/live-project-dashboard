"""Traduction des événements GitLab du projet en fil d'activité. Fonctions pures."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from app.core.models import Activity, ActivityKind, ActivityTarget

BOT_USERNAME = re.compile(r"^(project|group)_\d+_bot")

_ISSUE_TYPES = {"Issue", "WorkItem"}
_NOTE_TYPES = {"Note", "DiffNote", "DiscussionNote"}
_ISSUE_ACTIONS: dict[str, ActivityKind] = {
    "opened": "issue_opened",
    "created": "issue_opened",
    "closed": "issue_closed",
    "reopened": "issue_reopened",
}
_MR_ACTIONS: dict[str, ActivityKind] = {
    "opened": "mr_opened",
    "created": "mr_opened",
    "merged": "mr_merged",
    "accepted": "mr_merged",
    "closed": "mr_closed",
    "approved": "mr_approved",
}


def is_bot(username: str | None) -> bool:
    """Vrai pour les utilisateurs techniques créés par les tokens de projet ou de groupe."""
    return bool(username) and BOT_USERNAME.match(username or "") is not None


def _issue_target(base: str, iid: Any, title: Any) -> ActivityTarget:
    return ActivityTarget(
        type="issue",
        iid=int(iid) if iid is not None else None,
        title=title,
        web_url=f"{base}/-/issues/{iid}" if iid is not None else None,
    )


def _mr_target(base: str, iid: Any, title: Any) -> ActivityTarget:
    return ActivityTarget(
        type="merge_request",
        iid=int(iid) if iid is not None else None,
        title=title,
        web_url=f"{base}/-/merge_requests/{iid}" if iid is not None else None,
    )


def _push(event: Mapping[str, Any], base: str) -> tuple[ActivityTarget, str]:
    push = event.get("push_data") or {}
    ref = str(push.get("ref") or "")
    count = int(push.get("commit_count") or 0)
    action = push.get("action")
    kind_of_ref = "tag" if push.get("ref_type") == "tag" else "branche"
    if action == "removed":
        detail = f"{kind_of_ref} {ref} supprimée" if kind_of_ref == "branche" else f"tag {ref} supprimé"
    elif count == 0:
        detail = f"{kind_of_ref} {ref} créée" if kind_of_ref == "branche" else f"tag {ref} créé"
    elif count == 1:
        title = push.get("commit_title")
        detail = f"1 commit sur {ref}" + (f" : {title}" if title else "")
    else:
        detail = f"{count} commits sur {ref}"
    target = ActivityTarget(
        type="branch", iid=None, title=ref or None, web_url=f"{base}/-/tree/{ref}" if ref else None
    )
    return target, detail


def map_event(event: Mapping[str, Any], project_web_url: str) -> Activity:
    """Un événement de l'API `/projects/:id/events` → une ligne du fil d'activité."""
    base = project_web_url.rstrip("/")
    action = str(event.get("action_name") or "")
    target_type = event.get("target_type")
    author = event.get("author") or {}
    username = event.get("author_username") or author.get("username")

    kind: ActivityKind = "other"
    target: ActivityTarget | None = None
    detail: str | None = None

    if event.get("push_data"):
        kind = "pushed"
        target, detail = _push(event, base)
    elif target_type in _NOTE_TYPES:
        kind = "commented"
        note = event.get("note") or {}
        iid = note.get("noteable_iid")
        if note.get("noteable_type") == "MergeRequest":
            target = _mr_target(base, iid, event.get("target_title"))
        elif note.get("noteable_type") in _ISSUE_TYPES:
            target = _issue_target(base, iid, event.get("target_title"))
    elif target_type in _ISSUE_TYPES:
        kind = _ISSUE_ACTIONS.get(action, "other")
        target = _issue_target(base, event.get("target_iid"), event.get("target_title"))
    elif target_type == "MergeRequest":
        kind = _MR_ACTIONS.get(action, "other")
        target = _mr_target(base, event.get("target_iid"), event.get("target_title"))
    elif target_type == "Milestone":
        target = ActivityTarget(type="milestone", iid=None, title=event.get("target_title"), web_url=None)
        detail = action or None
    elif action == "joined":
        kind = "joined"
        target = ActivityTarget(type="project", iid=None, title=None, web_url=base or None)
    else:
        detail = action or None

    return Activity(
        id=str(event.get("id")),
        at=datetime.fromisoformat(str(event["created_at"])),
        actor=username,
        actor_name=author.get("name"),
        kind=kind,
        target=target,
        detail=detail,
    )


def build_activity(
    events: Sequence[Mapping[str, Any]], project_web_url: str, limit: int = 50
) -> list[Activity]:
    """Fil d'activité, du plus récent au plus ancien."""
    mapped = [map_event(event, project_web_url) for event in events if event.get("created_at")]
    mapped.sort(key=lambda a: a.at, reverse=True)
    return mapped[:limit]
