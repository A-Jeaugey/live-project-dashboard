"""Échéances du calendrier officiel et comptes à rebours. Fonctions pures."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.config import DeadlineConfig
from app.core.columns import normalize_label
from app.core.models import ColumnKey, Deadline, DeadlineMilestone


def target_date(deadline: DeadlineConfig) -> date:
    """Jour visé par le compte à rebours : la date exacte si elle est connue, sinon le lundi."""
    return deadline.exact_date or deadline.week_of


def days_left(target: date, now: datetime, tz: ZoneInfo) -> int:
    """Nombre de jours calendaires entre aujourd'hui (dans le fuseau du projet) et la cible."""
    return (target - now.astimezone(tz).date()).days


def is_past(deadline: DeadlineConfig, now: datetime, tz: ZoneInfo) -> bool:
    """Une échéance donnée par semaine n'est passée qu'une fois la semaine finie."""
    last_day = deadline.exact_date or (deadline.week_of + timedelta(days=6))
    return now.astimezone(tz).date() > last_day


def match_milestone(
    deadline: DeadlineConfig, milestones: Iterable[Mapping[str, Any]]
) -> Mapping[str, Any] | None:
    """Jalon GitLab d'une échéance : celui dont le titre vaut `jalon`, sinon le titre de l'échéance."""
    wanted = normalize_label(deadline.milestone_title or deadline.title)
    for milestone in milestones:
        if normalize_label(str(milestone.get("title", ""))) == wanted:
            return milestone
    return None


def deadline_keys_by_milestone(
    deadlines: Sequence[DeadlineConfig], milestones: Sequence[Mapping[str, Any]]
) -> dict[int, str]:
    """Identifiant de jalon GitLab → clé de l'échéance correspondante."""
    result: dict[int, str] = {}
    for deadline in deadlines:
        milestone = match_milestone(deadline, milestones)
        if milestone is not None:
            result[int(milestone["id"])] = deadline.key
    return result


def build_deadlines(
    deadlines: Sequence[DeadlineConfig],
    milestones: Sequence[Mapping[str, Any]],
    issue_columns_by_milestone: Mapping[int, Sequence[ColumnKey]],
    *,
    now: datetime,
    tz: ZoneInfo,
) -> list[Deadline]:
    """Échéances triées par date, avec leur jalon et son avancement.

    `issue_columns_by_milestone` donne, pour chaque jalon, la colonne de chacune de ses issues.
    """
    built: list[Deadline] = []
    for deadline in sorted(deadlines, key=target_date):
        target = target_date(deadline)
        milestone = match_milestone(deadline, milestones)
        progress: DeadlineMilestone | None = None
        if milestone is not None:
            columns = list(issue_columns_by_milestone.get(int(milestone["id"]), []))
            closed = sum(1 for c in columns if c == "done")
            doing = sum(1 for c in columns if c == "doing")
            progress = DeadlineMilestone(
                id=int(milestone["id"]),
                title=str(milestone["title"]),
                web_url=str(milestone.get("web_url") or ""),
                total=len(columns),
                closed=closed,
                doing=doing,
                todo=len(columns) - closed - doing,
            )
        built.append(
            Deadline(
                key=deadline.key,
                title=deadline.title,
                short_title=deadline.short_title,
                week_of=deadline.week_of,
                target_date=target,
                days_left=days_left(target, now, tz),
                past=is_past(deadline, now, tz),
                night=deadline.night,
                milestone=progress,
            )
        )
    return built
