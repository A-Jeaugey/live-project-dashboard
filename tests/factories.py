"""Fabriques de réponses GitLab simplifiées pour les tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.config import ProjectConfig

NOW = datetime(2026, 11, 27, 13, 0, tzinfo=UTC)  # vendredi 27 novembre 2026, 14 h à Paris
PROJECT_URL = "https://gitlab.example/groupe/jeu"


def ago(*, days: float = 0, hours: float = 0) -> str:
    return (NOW - timedelta(days=days, hours=hours)).isoformat()


def user(username: str, name: str | None = None, user_id: int = 1) -> dict[str, Any]:
    return {
        "id": user_id,
        "username": username,
        "name": name or username.split(".")[0].capitalize(),
        "state": "active",
        "avatar_url": f"https://gitlab.example/avatars/{username}.png",
        "web_url": f"https://gitlab.example/{username}",
    }


def issue(
    iid: int,
    *,
    labels: list[str] | None = None,
    state: str = "opened",
    assignees: list[str] | None = None,
    milestone: dict[str, Any] | None = None,
    updated_days_ago: float = 1,
    title: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "id": 1000 + iid,
        "iid": iid,
        "title": title or f"Tâche {iid}",
        "description": "",
        "state": state,
        "labels": labels or [],
        "assignees": [user(a) for a in assignees or []],
        "author": user("arthur.jeaugey"),
        "milestone": milestone,
        "created_at": ago(days=30),
        "updated_at": ago(days=updated_days_ago),
        "closed_at": ago(days=updated_days_ago) if state == "closed" else None,
        "user_notes_count": 0,
        "task_completion_status": {"count": 0, "completed_count": 0},
        "web_url": f"{PROJECT_URL}/-/issues/{iid}",
        **extra,
    }


def merge_request(
    iid: int,
    *,
    author: str = "theo.wu",
    reviewers: list[str] | None = None,
    created_hours_ago: float = 5,
    updated_hours_ago: float | None = None,
    draft: bool = False,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "id": 2000 + iid,
        "iid": iid,
        "title": f"MR {iid}",
        "state": "opened",
        "draft": draft,
        "author": user(author),
        "reviewers": [user(r) for r in reviewers or []],
        "created_at": ago(hours=created_hours_ago),
        "updated_at": ago(hours=updated_hours_ago if updated_hours_ago is not None else created_hours_ago),
        "source_branch": f"feat/{iid}-sujet",
        "sha": f"{iid:040x}",
        "web_url": f"{PROJECT_URL}/-/merge_requests/{iid}",
        **extra,
    }


def milestone(milestone_id: int, title: str) -> dict[str, Any]:
    return {
        "id": milestone_id,
        "iid": milestone_id,
        "title": title,
        "state": "active",
        "web_url": f"{PROJECT_URL}/-/milestones/{milestone_id}",
    }


def label(name: str, color: str = "#123456") -> dict[str, Any]:
    return {"id": abs(hash(name)) % 10_000, "name": name, "color": color}


def project() -> dict[str, Any]:
    return {
        "id": 42,
        "name": "jeu",
        "path_with_namespace": "groupe/jeu",
        "web_url": PROJECT_URL,
        "default_branch": "main",
    }


def config(**overrides: Any) -> ProjectConfig:
    data: dict[str, Any] = {
        "projet": {"nom": "Jeu", "fuseau": "Europe/Paris"},
        "domaines": [{"nom": "gameplay", "couleur": "#111111"}, {"nom": "son", "couleur": "#222222"}],
        "membres": [
            {"prenom": "Arthur", "gitlab": "arthur.jeaugey"},
            {"prenom": "Théo", "gitlab": "theo.wu"},
            {"prenom": "Louis", "gitlab": "louis.landanger"},
        ],
        "echeances": [
            {"cle": "groupes", "titre": "Constitution des groupes", "semaine_du": "2026-10-19"},
            {
                "cle": "cdst",
                "titre": "Remise du CdST",
                "titre_court": "CdST",
                "semaine_du": "2026-12-07",
                "nuit": 1,
            },
            {"cle": "soutenance-1", "titre": "Première soutenance", "semaine_du": "2027-01-04", "nuit": 2},
        ],
    }
    data.update(overrides)
    return ProjectConfig.model_validate(data)
