"""Dernière version jouable, selon la règle configurée. Fonction pure."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from fnmatch import fnmatchcase
from typing import Any, Literal

from app.core.models import Playable

Rule = Literal["pipeline", "tag", "commit"]
Fallback = Literal["no_pipeline", "no_successful_pipeline", "no_tag"]


def _parse(value: Any) -> datetime | None:
    return datetime.fromisoformat(value) if isinstance(value, str) and value else None


def _from_commit(
    rule: Rule,
    source: Literal["pipeline", "tag", "commit"],
    commit: Mapping[str, Any] | None,
    *,
    fallback: Fallback | None = None,
    tag: str | None = None,
    web_url: str | None = None,
    sha: str | None = None,
) -> Playable:
    commit = commit or {}
    full_sha = commit.get("id") or sha
    return Playable(
        rule=rule,
        source=source,
        fallback_reason=fallback,
        sha=full_sha,
        short_sha=commit.get("short_id") or (full_sha[:8] if full_sha else None),
        title=commit.get("title"),
        author_name=commit.get("author_name"),
        committed_at=_parse(commit.get("committed_date") or commit.get("created_at")),
        tag=tag,
        web_url=web_url or commit.get("web_url"),
    )


def choose_playable(
    *,
    rule: Rule,
    tag_pattern: str,
    pipelines: Sequence[Mapping[str, Any]],
    tags: Sequence[Mapping[str, Any]],
    last_commit: Mapping[str, Any] | None,
    commits_by_sha: Mapping[str, Mapping[str, Any]],
    project_web_url: str,
) -> Playable:
    """Choisit ce qu'on montre comme « dernière version jouable ».

    `pipelines` et `tags` sont attendus du plus récent au plus ancien, comme les renvoie GitLab.
    Quand la règle ne peut pas s'appliquer, on se rabat sur le dernier commit de la branche par
    défaut et `fallback_reason` dit pourquoi.
    """
    fallback: Fallback | None = None

    if rule == "pipeline":
        success = next((p for p in pipelines if p.get("status") == "success"), None)
        if success is not None:
            sha = str(success.get("sha") or "")
            return _from_commit(
                rule, "pipeline", commits_by_sha.get(sha), web_url=success.get("web_url"), sha=sha or None
            )
        fallback = "no_successful_pipeline" if pipelines else "no_pipeline"

    if rule == "tag":
        match = next((t for t in tags if fnmatchcase(str(t.get("name", "")), tag_pattern)), None)
        if match is not None:
            name = str(match["name"])
            return _from_commit(
                rule, "tag", match.get("commit"), tag=name, web_url=f"{project_web_url}/-/tags/{name}"
            )
        fallback = "no_tag"

    if last_commit is None:
        return Playable(
            rule=rule,
            source="none",
            fallback_reason=fallback,
            sha=None,
            short_sha=None,
            title=None,
            author_name=None,
            committed_at=None,
            tag=None,
            web_url=None,
        )
    return _from_commit(rule, "commit", last_commit, fallback=fallback)
