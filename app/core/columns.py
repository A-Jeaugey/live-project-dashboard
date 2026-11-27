"""Correspondance labels GitLab → colonnes du tableau. Fonctions pures."""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass

from app.core.models import ColumnKey, IssueFlag


def normalize_label(name: str) -> str:
    """Forme de comparaison d'un nom de label : accents composés, casse ignorée, espaces resserrés."""
    return " ".join(unicodedata.normalize("NFC", name).casefold().split())


@dataclass(frozen=True)
class ColumnLabels:
    """Noms des labels GitLab qui placent une issue ouverte dans une colonne."""

    idea: str
    todo: str
    doing: str

    def keys_in(self, labels: Iterable[str]) -> set[ColumnKey]:
        """Colonnes désignées par les labels fournis."""
        wanted: dict[str, ColumnKey] = {
            normalize_label(self.idea): "idea",
            normalize_label(self.todo): "todo",
            normalize_label(self.doing): "doing",
        }
        return {wanted[n] for n in map(normalize_label, labels) if n in wanted}


def classify(
    *,
    closed: bool,
    labels: Iterable[str],
    has_assignee: bool,
    column_labels: ColumnLabels,
) -> tuple[ColumnKey, list[IssueFlag]]:
    """Colonne d'une issue et incohérences à signaler.

    La première règle qui s'applique gagne : fermée, puis « En cours », « À faire », « Idée ».
    Une issue ouverte sans label de colonne est rangée dans les idées avec le drapeau « à trier ».
    Une issue fermée ne porte jamais de drapeau : son état prime sur ses labels.
    """
    if closed:
        return "done", []

    present = column_labels.keys_in(labels)
    flags: list[IssueFlag] = []

    column: ColumnKey
    if "doing" in present:
        column = "doing"
    elif "todo" in present:
        column = "todo"
    elif "idea" in present:
        column = "idea"
    else:
        column = "idea"
        flags.append("needs_triage")

    if len(present) > 1:
        flags.append("multiple_columns")
    if column == "doing" and not has_assignee:
        flags.append("doing_unassigned")
    if column == "todo" and has_assignee:
        flags.append("todo_assigned")
    return column, flags
