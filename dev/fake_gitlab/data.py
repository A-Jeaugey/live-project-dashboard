"""Données d'exemple du faux GitLab. Toutes les dates sont relatives à l'instant du démarrage.

Ce sont des données inventées pour le développement : le vrai projet n'est jamais modifié.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

PROJECT_ID = 32662
PROJECT_PATH = "arthur.jeaugey/5-nights-at-epita"

USERS: dict[str, dict[str, Any]] = {
    "arthur.jeaugey": {"id": 101, "name": "Arthur Jeaugey", "color": "#3F7BD9"},
    "theo.wu": {"id": 102, "name": "Théo Wu", "color": "#8257D6"},
    "samuel.mopty": {"id": 103, "name": "Samuel Mopty", "color": "#1A9A7C"},
    "louis.landanger": {"id": 104, "name": "Louis Landanger", "color": "#D9482B"},
    "eliott.damagnez": {"id": 105, "name": "Eliott Damagnez", "color": "#D9941A"},
    # N'est pas membre du projet : sert à vérifier que la connexion lui est refusée.
    "intrus.externe": {"id": 199, "name": "Intrus Externe", "color": "#6F7B8C"},
}
MEMBERS = ["arthur.jeaugey", "theo.wu", "samuel.mopty", "louis.landanger", "eliott.damagnez"]
BOT_USERNAME = f"project_{PROJECT_ID}_bot_0123456789abcdef"

LABELS = [
    ("Idée", "#F2C94C"),
    ("À faire", "#6F7B8C"),
    ("En cours", "#3F7BD9"),
    ("gameplay", "#3F7BD9"),
    ("profs", "#D9482B"),
    ("3d", "#8257D6"),
    ("son", "#1A9A7C"),
    ("code", "#5E9C2E"),
    ("ui", "#D9941A"),
    ("orga", "#6F7B8C"),
]

# Seuls les trois premiers jalons existent : les deux dernières soutenances restent « à créer ».
MILESTONES = [
    (1, "Remise du CdST", "2026-12-07"),
    (2, "Validation du CdST", "2026-12-14"),
    (3, "Première soutenance", "2027-01-04"),
]

DESCRIPTION_14 = """Le prof patrouille entre des points de passage. S'il voit le joueur, il le poursuit \
en suivant la grille des couloirs.

- [x] Grille de navigation des couloirs
- [x] Poursuite en ligne de vue
- [ ] Retour à la patrouille quand le joueur est perdu
"""


@dataclass
class State:
    base_url: str
    now: datetime
    project: dict[str, Any] = field(default_factory=dict)
    labels: list[dict[str, Any]] = field(default_factory=list)
    milestones: list[dict[str, Any]] = field(default_factory=list)
    issues: dict[int, dict[str, Any]] = field(default_factory=dict)
    notes: dict[int, list[dict[str, Any]]] = field(default_factory=dict)
    members: list[dict[str, Any]] = field(default_factory=list)
    merge_requests: dict[int, dict[str, Any]] = field(default_factory=dict)
    approvals: dict[int, list[str]] = field(default_factory=dict)
    closes: dict[int, list[int]] = field(default_factory=dict)
    pipelines: list[dict[str, Any]] = field(default_factory=list)
    commits: list[dict[str, Any]] = field(default_factory=list)
    tags: list[dict[str, Any]] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    next_event_id: int = 1000
    next_note_id: int = 500

    @property
    def project_url(self) -> str:
        return f"{self.base_url}/{PROJECT_PATH}"

    def user(self, username: str) -> dict[str, Any]:
        info = USERS[username]
        return {
            "id": info["id"],
            "username": username,
            "name": info["name"],
            "state": "active",
            "avatar_url": f"{self.base_url}/avatars/{username}.svg",
            "web_url": f"{self.base_url}/{username}",
        }

    def milestone(self, title: str | None) -> dict[str, Any] | None:
        return next((m for m in self.milestones if m["title"] == title), None)

    def add_event(self, action: str, target_type: str | None, username: str, **extra: Any) -> dict[str, Any]:
        self.next_event_id += 1
        event = {
            "id": self.next_event_id,
            "project_id": PROJECT_ID,
            "action_name": action,
            "target_type": target_type,
            "author": self.user(username),
            "author_username": username,
            "created_at": datetime.now(UTC).isoformat(),
            **extra,
        }
        self.events.insert(0, event)
        return event


def build_state(base_url: str, now: datetime | None = None) -> State:
    now = now or datetime.now(UTC)
    state = State(base_url=base_url.rstrip("/"), now=now)

    def ago(*, days: float = 0, hours: float = 0, minutes: float = 0) -> str:
        return (now - timedelta(days=days, hours=hours, minutes=minutes)).isoformat()

    state.project = {
        "id": PROJECT_ID,
        "name": "5-nights-at-epita",
        "path": "5-nights-at-epita",
        "path_with_namespace": PROJECT_PATH,
        "default_branch": "main",
        "visibility": "private",
        "web_url": state.project_url,
        "created_at": ago(days=35),
        "last_activity_at": ago(hours=4),
    }
    state.labels = [
        {"id": 10 + index, "name": name, "color": color, "text_color": "#FFFFFF", "description": None}
        for index, (name, color) in enumerate(LABELS)
    ]
    state.milestones = [
        {
            "id": 700 + iid,
            "iid": iid,
            "project_id": PROJECT_ID,
            "title": title,
            "description": "",
            "state": "active",
            "due_date": due,
            "start_date": None,
            "created_at": ago(days=30),
            "updated_at": ago(days=30),
            "web_url": f"{state.project_url}/-/milestones/{iid}",
        }
        for iid, title, due in MILESTONES
    ]
    state.members = [{**state.user(username), "access_level": 50} for username in MEMBERS]
    state.members.append(
        {
            "id": 900,
            "username": BOT_USERNAME,
            "name": "Carnet de bord",
            "state": "active",
            "avatar_url": None,
            "web_url": f"{base_url}/{BOT_USERNAME}",
            "access_level": 20,
        }
    )

    def issue(
        iid: int,
        title: str,
        *,
        labels: list[str],
        author: str,
        created: str,
        updated: str,
        milestone: str | None = None,
        assignees: list[str] | None = None,
        closed: str | None = None,
        description: str = "",
        notes: int = 0,
        tasks: tuple[int, int] = (0, 0),
    ) -> None:
        people = [state.user(a) for a in assignees or []]
        state.issues[iid] = {
            "id": 40000 + iid,
            "iid": iid,
            "project_id": PROJECT_ID,
            "title": title,
            "description": description,
            "state": "closed" if closed else "opened",
            "created_at": created,
            "updated_at": updated,
            "closed_at": closed,
            "labels": labels,
            "milestone": state.milestone(milestone),
            "assignees": people,
            "assignee": people[0] if people else None,
            "author": state.user(author),
            "type": "ISSUE",
            "user_notes_count": notes,
            "task_completion_status": {"count": tasks[1], "completed_count": tasks[0]},
            "web_url": f"{state.project_url}/-/issues/{iid}",
        }

    cdst, soutenance = "Remise du CdST", "Première soutenance"

    # Deux anciennes tâches fermées : elles comptent dans le jalon CdST mais plus dans « Fait ».
    issue(
        3,
        "Choisir le sujet et le nom du jeu",
        labels=["orga"],
        author="arthur.jeaugey",
        assignees=["arthur.jeaugey"],
        milestone=cdst,
        created=ago(days=34),
        updated=ago(days=30),
        closed=ago(days=30),
    )
    issue(
        5,
        "Lister les fonctionnalités pour le CdST",
        labels=["orga"],
        author="arthur.jeaugey",
        assignees=["samuel.mopty"],
        milestone=cdst,
        created=ago(days=32),
        updated=ago(days=22),
        closed=ago(days=22),
    )

    issue(
        8,
        "Plan de l'étage relevé et mis au propre",
        labels=["3d"],
        author="samuel.mopty",
        assignees=["samuel.mopty"],
        milestone=soutenance,
        created=ago(days=20),
        updated=ago(hours=15.5),
        closed=ago(hours=15.5),
    )
    issue(
        9,
        "Modéliser le couloir principal de l'étage",
        labels=["En cours", "3d"],
        author="samuel.mopty",
        assignees=["samuel.mopty"],
        milestone=soutenance,
        created=ago(days=12),
        updated=ago(hours=5),
    )
    issue(
        11,
        "Prototype de la scène Panda3D",
        labels=["code"],
        author="louis.landanger",
        assignees=["louis.landanger"],
        milestone=soutenance,
        created=ago(days=18),
        updated=ago(days=2),
        closed=ago(days=2),
    )
    issue(
        12,
        "Déplacements du joueur et collisions",
        labels=["À faire", "gameplay"],
        author="arthur.jeaugey",
        milestone=soutenance,
        created=ago(days=15),
        updated=ago(days=6),
    )
    issue(
        14,
        "IA de poursuite : le prof suit le joueur dans les couloirs",
        labels=["En cours", "profs"],
        author="theo.wu",
        assignees=["theo.wu"],
        milestone=soutenance,
        created=ago(days=14),
        updated=ago(hours=4.75),
        description=DESCRIPTION_14,
        notes=2,
        tasks=(2, 3),
    )
    issue(
        17,
        "Menu principal et écran de pause",
        labels=["En cours", "ui"],
        author="eliott.damagnez",
        assignees=["eliott.damagnez"],
        milestone=soutenance,
        created=ago(days=21),
        updated=ago(days=16, hours=3),
    )
    issue(
        18,
        "Bruits de pas selon la surface",
        labels=["À faire", "son"],
        author="samuel.mopty",
        milestone=soutenance,
        created=ago(days=10),
        updated=ago(days=7),
    )
    issue(
        19,
        "Lampe torche avec batterie",
        labels=["À faire", "gameplay"],
        author="theo.wu",
        milestone=soutenance,
        created=ago(days=9),
        updated=ago(days=9),
    )
    issue(
        20,
        "Plan du CdST validé en groupe",
        labels=["orga"],
        author="arthur.jeaugey",
        assignees=["arthur.jeaugey"],
        milestone=cdst,
        created=ago(days=11),
        updated=ago(days=4),
        closed=ago(days=4),
    )
    issue(
        21,
        "Rédiger la section « Répartition des tâches » du CdST",
        labels=["En cours", "orga"],
        author="arthur.jeaugey",
        assignees=["arthur.jeaugey"],
        milestone=cdst,
        created=ago(days=6),
        updated=ago(days=1),
    )
    issue(
        22,
        "Relire et mettre en page le CdST",
        labels=["À faire", "orga"],
        author="arthur.jeaugey",
        milestone=cdst,
        created=ago(days=6),
        updated=ago(days=5),
    )
    issue(
        23,
        "Un prof qui n'apparaît que si on regarde ailleurs",
        labels=["Idée", "profs"],
        author="theo.wu",
        created=ago(days=8),
        updated=ago(days=8),
    )
    issue(
        24,
        "Distributeur de café qui redonne de l'endurance",
        labels=["Idée", "gameplay"],
        author="louis.landanger",
        created=ago(days=5),
        updated=ago(days=5),
    )
    issue(
        25,
        "Mode photo pour la soutenance",
        labels=["Idée", "ui"],
        author="eliott.damagnez",
        created=ago(hours=6),
        updated=ago(hours=6),
    )
    # Créée directement dans GitLab, sans colonne ni domaine : elle doit apparaître « à trier ».
    issue(
        26,
        "Musique d'ambiance qui s'accélère pendant une poursuite",
        labels=[],
        author="samuel.mopty",
        created=ago(days=1, hours=2),
        updated=ago(days=1, hours=2),
    )

    def note(note_id: int, author: str, body: str, created: str, *, system: bool = False) -> dict[str, Any]:
        return {
            "id": note_id,
            "body": body,
            "author": state.user(author),
            "created_at": created,
            "updated_at": created,
            "system": system,
            "noteable_type": "Issue",
        }

    state.notes[14] = [
        note(401, "theo.wu", "assigned to @theo.wu", ago(days=14), system=True),
        note(
            402,
            "louis.landanger",
            "Je relis !7 ce soir. Le prof traverse encore la porte de la salle 204.",
            ago(hours=5.3),
        ),
        note(403, "theo.wu", "Vu, la grille est mal alignée à cet endroit. Je corrige.", ago(hours=4.75)),
    ]

    def merge_request(
        iid: int,
        title: str,
        *,
        author: str,
        reviewer: str,
        branch: str,
        created: str,
        updated: str,
        closes: int,
    ) -> None:
        state.merge_requests[iid] = {
            "id": 50000 + iid,
            "iid": iid,
            "project_id": PROJECT_ID,
            "title": title,
            "description": f"Closes #{closes}",
            "state": "opened",
            "draft": False,
            "work_in_progress": False,
            "created_at": created,
            "updated_at": updated,
            "source_branch": branch,
            "target_branch": "main",
            "author": state.user(author),
            "assignees": [state.user(author)],
            "reviewers": [state.user(reviewer)],
            "sha": f"{iid:02d}" + "c0ffee" * 6 + "ab",
            "head_pipeline": None,
            "user_notes_count": 0,
            "web_url": f"{state.project_url}/-/merge_requests/{iid}",
        }
        state.closes[iid] = [closes]
        state.approvals[iid] = []

    merge_request(
        7,
        "Poursuite : pathfinding sur la grille des couloirs",
        author="theo.wu",
        reviewer="louis.landanger",
        branch="feat/14-ia-de-poursuite",
        created=ago(days=3, hours=2),
        updated=ago(hours=17),
        closes=14,
    )
    merge_request(
        8,
        "Couloir principal : maillage et textures",
        author="samuel.mopty",
        reviewer="arthur.jeaugey",
        branch="feat/9-couloir-principal",
        created=ago(hours=5),
        updated=ago(hours=5),
        closes=9,
    )

    last_sha = "a3f9c2e1" + "5b" * 16
    state.commits = [
        {
            "id": last_sha,
            "short_id": last_sha[:8],
            "title": "Merge branch 'feat/11-prototype-scene' into 'main'",
            "message": "Merge branch 'feat/11-prototype-scene' into 'main'\n\nCloses #11",
            "author_name": "Louis Landanger",
            "authored_date": ago(days=2),
            "committed_date": ago(days=2),
            "created_at": ago(days=2),
            "web_url": f"{state.project_url}/-/commit/{last_sha}",
        }
    ]

    def event(
        event_id: int, action: str, target_type: str | None, username: str, created: str, **extra: Any
    ) -> dict:
        return {
            "id": event_id,
            "project_id": PROJECT_ID,
            "action_name": action,
            "target_type": target_type,
            "author": state.user(username),
            "author_username": username,
            "created_at": created,
            **extra,
        }

    state.events = [
        event(
            906,
            "commented on",
            "Note",
            "theo.wu",
            ago(hours=4.75),
            target_title=state.issues[14]["title"],
            note={"noteable_type": "Issue", "noteable_iid": 14, "body": "Vu, la grille est mal alignée."},
        ),
        event(
            905,
            "opened",
            "MergeRequest",
            "samuel.mopty",
            ago(hours=5),
            target_iid=8,
            target_title=state.merge_requests[8]["title"],
        ),
        event(
            904,
            "commented on",
            "Note",
            "louis.landanger",
            ago(hours=5.3),
            target_title=state.issues[14]["title"],
            note={"noteable_type": "Issue", "noteable_iid": 14, "body": "Je relis !7 ce soir."},
        ),
        event(
            903,
            "opened",
            "Issue",
            "eliott.damagnez",
            ago(hours=6),
            target_iid=25,
            target_title=state.issues[25]["title"],
        ),
        event(
            902,
            "closed",
            "Issue",
            "samuel.mopty",
            ago(hours=15.5),
            target_iid=8,
            target_title=state.issues[8]["title"],
        ),
        event(
            901,
            "pushed to",
            None,
            "theo.wu",
            ago(hours=17),
            push_data={
                "commit_count": 2,
                "action": "pushed",
                "ref_type": "branch",
                "ref": "feat/14-ia-de-poursuite",
                "commit_title": "Corrige l'alignement de la grille",
            },
        ),
        event(
            900,
            "opened",
            "Issue",
            "samuel.mopty",
            ago(days=1, hours=2),
            target_iid=26,
            target_title=state.issues[26]["title"],
        ),
        event(
            899,
            "accepted",
            "MergeRequest",
            "arthur.jeaugey",
            ago(days=2),
            target_iid=6,
            target_title="Prototype de la scène Panda3D",
        ),
        event(
            898,
            "closed",
            "Issue",
            "louis.landanger",
            ago(days=2),
            target_iid=11,
            target_title=state.issues[11]["title"],
        ),
        event(
            897,
            "opened",
            "MergeRequest",
            "theo.wu",
            ago(days=3, hours=2),
            target_iid=7,
            target_title=state.merge_requests[7]["title"],
        ),
        event(
            896,
            "closed",
            "Issue",
            "arthur.jeaugey",
            ago(days=4),
            target_iid=20,
            target_title=state.issues[20]["title"],
        ),
    ]
    return state
