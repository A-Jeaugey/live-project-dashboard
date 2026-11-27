from app.core.activity import build_activity, is_bot, map_event
from app.core.models import ProjectInfo, SyncStatus
from app.core.playable import choose_playable
from app.core.snapshot import RawState, build_issue_detail, build_snapshot
from tests import factories
from tests.factories import NOW, PROJECT_URL

FALLBACK = ProjectInfo(name="Jeu", path="groupe/jeu", web_url=PROJECT_URL, default_branch="main")
SYNC = SyncStatus(mode="polling", ok=True, last_success_at=NOW, last_error=None, last_webhook_at=None)


def snapshot(raw: RawState, config=None):
    return build_snapshot(
        raw, config or factories.config(), now=NOW, version=3, sync=SYNC, project_fallback=FALLBACK
    )


# --- projet vide (état réel du dépôt du jeu au démarrage) -----------------------------------------


def test_un_projet_vide_donne_un_instantane_complet_et_coherent():
    result = snapshot(RawState(project=factories.project()))
    assert result.version == 3
    assert result.issues == [] and result.merge_requests == [] and result.pipelines == []
    assert result.activity == []
    assert result.playable.source == "none" and result.playable.fallback_reason == "no_pipeline"
    assert result.setup.missing_labels == ["Idée", "À faire", "En cours", "gameplay", "son"]
    assert result.setup.missing_milestones == ["Remise du CdST", "Première soutenance"]
    assert [m.in_project for m in result.members] == [False, False, False]
    assert result.attention == []
    assert [d.milestone for d in result.deadlines] == [None, None, None]


def test_sans_reponse_de_gitlab_le_projet_vient_de_la_configuration():
    result = snapshot(RawState())
    assert result.project == FALLBACK


# --- issues ---------------------------------------------------------------------------------------


def test_une_issue_est_traduite_avec_ses_domaines_son_jalon_et_ses_cases():
    cdst = factories.milestone(7, "Remise du CdST")
    raw = RawState(
        project=factories.project(),
        milestones=[cdst],
        labels=[factories.label("gameplay", "#abcdef"), factories.label("Idée")],
        issues={
            12: factories.issue(
                12,
                labels=["SON", "À faire", "gameplay", "bug"],
                milestone=cdst,
                user_notes_count=4,
                task_completion_status={"count": 3, "completed_count": 2},
            )
        },
    )
    result = snapshot(raw)
    issue = result.issues[0]
    assert issue.column == "todo" and issue.flags == []
    assert issue.domains == ["gameplay", "son"], "ordre de la configuration, label inconnu ignoré"
    assert issue.milestone is not None and issue.milestone.deadline_key == "cdst"
    assert issue.notes_count == 4
    assert issue.tasks is not None and (issue.tasks.done, issue.tasks.total) == (2, 3)
    assert issue.author == "arthur.jeaugey"
    assert issue.web_url.endswith("/-/issues/12")
    # La couleur du label GitLab remplace celle de la configuration quand il existe.
    assert {d.name: d.color for d in result.domains} == {"gameplay": "#abcdef", "son": "#222222"}
    assert result.setup.missing_labels == ["À faire", "En cours", "son"]
    assert result.setup.missing_milestones == ["Première soutenance"]


def test_une_issue_sans_case_a_cocher_n_a_pas_de_progression():
    result = snapshot(RawState(issues={1: factories.issue(1)}))
    assert result.issues[0].tasks is None


def test_les_issues_sont_triees_de_la_plus_recente_a_la_plus_ancienne():
    result = snapshot(RawState(issues={n: factories.issue(n) for n in (3, 12, 7)}))
    assert [i.iid for i in result.issues] == [12, 7, 3]


def test_un_jalon_inconnu_du_calendrier_n_a_pas_de_cle():
    other = factories.milestone(9, "Jalon libre")
    result = snapshot(RawState(milestones=[other], issues={1: factories.issue(1, milestone=other)}))
    assert result.issues[0].milestone.deadline_key is None


def test_le_detail_exclut_les_notes_systeme_et_trie_par_date():
    raw_issue = factories.issue(14, labels=["En cours"], assignees=["theo.wu"], description="**Texte**")
    result = snapshot(RawState(issues={14: raw_issue}))
    notes = [
        {
            "id": 3,
            "body": "second",
            "system": False,
            "author": factories.user("theo.wu"),
            "created_at": factories.ago(hours=1),
        },
        {
            "id": 2,
            "body": "a ajouté le label",
            "system": True,
            "author": factories.user("theo.wu"),
            "created_at": factories.ago(hours=2),
        },
        {
            "id": 1,
            "body": "premier",
            "system": False,
            "author": factories.user("louis.landanger", "Louis L."),
            "created_at": factories.ago(hours=3),
        },
    ]
    detail = build_issue_detail(result.issues[0], raw_issue, notes)
    assert detail.description == "**Texte**"
    assert [(n.body, n.author, n.author_name) for n in detail.notes] == [
        ("premier", "louis.landanger", "Louis L."),
        ("second", "theo.wu", "Theo"),
    ]
    assert detail.iid == 14 and detail.column == "doing"


# --- membres --------------------------------------------------------------------------------------


def test_les_robots_et_les_comptes_bloques_ne_sont_pas_des_membres():
    raw = RawState(
        members=[
            factories.user("arthur.jeaugey", "Arthur Jeaugey"),
            factories.user("project_32662_bot_8f4dc0e3b508", "Claude code"),
            {**factories.user("theo.wu"), "state": "blocked"},
            factories.user("invite.surprise", "Invité Surprise"),
        ]
    )
    members = snapshot(raw).members
    assert [(m.username, m.first_name, m.in_project) for m in members] == [
        ("arthur.jeaugey", "Arthur", True),
        ("theo.wu", "Théo", False),
        ("louis.landanger", "Louis", False),
        ("invite.surprise", "Invité", True),
    ]
    assert members[0].name == "Arthur Jeaugey"
    assert is_bot("project_32662_bot_8f4dc0e3b508") and is_bot("group_12_bot_ab")
    assert not is_bot("arthur.jeaugey") and not is_bot(None)


# --- merge requests ---------------------------------------------------------------------------------


def test_les_merge_requests_portent_leur_etat_de_relecture():
    raw = RawState(
        merge_requests={
            7: factories.merge_request(7, reviewers=["louis.landanger"], created_hours_ago=74),
            8: factories.merge_request(8, created_hours_ago=5, draft=True),
            9: factories.merge_request(9, created_hours_ago=90),
        },
        mr_approvals={9: ["arthur.jeaugey"]},
        mr_closes={7: [14, 3]},
    )
    by_iid = {mr.iid: mr for mr in snapshot(raw).merge_requests}
    assert (by_iid[7].waiting_review, by_iid[7].waiting_hours, by_iid[7].overdue) == (True, 74, True)
    assert by_iid[7].closes == [3, 14] and by_iid[7].reviewers == ["louis.landanger"]
    assert (by_iid[8].waiting_review, by_iid[8].waiting_hours, by_iid[8].overdue) == (False, None, False)
    assert (by_iid[9].waiting_review, by_iid[9].approved_by) == (False, ["arthur.jeaugey"])
    assert by_iid[7].pipeline_status is None


# --- dernière version jouable -----------------------------------------------------------------------

COMMIT = {
    "id": "a3f9c2e1" + "0" * 32,
    "short_id": "a3f9c2e1",
    "title": "Fusion de !6",
    "author_name": "Louis",
    "committed_date": factories.ago(days=2),
    "web_url": f"{PROJECT_URL}/-/commit/a3f9c2e1",
}


def playable(**kwargs):
    defaults = {
        "rule": "pipeline",
        "tag_pattern": "jouable-*",
        "pipelines": [],
        "tags": [],
        "last_commit": COMMIT,
        "commits_by_sha": {},
        "project_web_url": PROJECT_URL,
    }
    defaults.update(kwargs)
    return choose_playable(**defaults)


def test_sans_pipeline_on_se_rabat_sur_le_dernier_commit_en_le_disant():
    result = playable()
    assert (result.rule, result.source, result.fallback_reason) == ("pipeline", "commit", "no_pipeline")
    assert (result.short_sha, result.title, result.author_name) == ("a3f9c2e1", "Fusion de !6", "Louis")
    assert result.web_url == COMMIT["web_url"]


def test_des_pipelines_tous_en_echec_donnent_une_autre_raison():
    result = playable(pipelines=[{"id": 1, "status": "failed", "sha": "f" * 40}])
    assert (result.source, result.fallback_reason) == ("commit", "no_successful_pipeline")


def test_le_dernier_pipeline_reussi_est_retenu_meme_s_il_n_est_pas_le_plus_recent():
    sha = "b" * 40
    result = playable(
        pipelines=[
            {"id": 3, "status": "failed", "sha": "c" * 40, "web_url": "p3"},
            {"id": 2, "status": "success", "sha": sha, "web_url": "p2"},
            {"id": 1, "status": "success", "sha": "d" * 40, "web_url": "p1"},
        ],
        commits_by_sha={
            sha: {"id": sha, "short_id": "bbbbbbbb", "title": "Version stable", "author_name": "Théo"}
        },
    )
    assert (result.source, result.fallback_reason, result.sha) == ("pipeline", None, sha)
    assert (result.title, result.web_url) == ("Version stable", "p2")


def test_un_pipeline_reussi_dont_le_commit_est_inconnu_garde_son_sha():
    sha = "e" * 40
    result = playable(pipelines=[{"id": 2, "status": "success", "sha": sha, "web_url": "p2"}])
    assert (result.source, result.sha, result.short_sha, result.title) == ("pipeline", sha, "eeeeeeee", None)


def test_la_regle_tag_prend_le_premier_tag_qui_correspond_au_motif():
    tags = [
        {"name": "v0.3", "commit": {"id": "1" * 40, "title": "pas jouable"}},
        {"name": "jouable-2", "commit": {"id": "2" * 40, "short_id": "22222222", "title": "Nuit 1 jouable"}},
        {"name": "jouable-1", "commit": {"id": "3" * 40}},
    ]
    result = playable(rule="tag", tags=tags)
    assert (result.source, result.tag, result.title) == ("tag", "jouable-2", "Nuit 1 jouable")
    assert result.web_url == f"{PROJECT_URL}/-/tags/jouable-2"


def test_la_regle_tag_sans_tag_se_rabat_sur_le_commit():
    result = playable(rule="tag", tags=[{"name": "v1", "commit": {"id": "1" * 40}}])
    assert (result.source, result.fallback_reason) == ("commit", "no_tag")


def test_la_regle_commit_n_a_jamais_de_repli():
    result = playable(rule="commit", pipelines=[{"id": 1, "status": "success", "sha": "f" * 40}])
    assert (result.source, result.fallback_reason) == ("commit", None)


def test_un_depot_vide_n_a_pas_de_version_jouable():
    result = playable(last_commit=None)
    assert (result.source, result.sha, result.fallback_reason) == ("none", None, "no_pipeline")


# --- activité ---------------------------------------------------------------------------------------


def event(event_id, action, target_type=None, *, username="theo.wu", hours_ago=1, **extra):
    return {
        "id": event_id,
        "action_name": action,
        "target_type": target_type,
        "author": factories.user(username),
        "author_username": username,
        "created_at": factories.ago(hours=hours_ago),
        **extra,
    }


def test_les_evenements_gitlab_sont_traduits():
    cases = [
        (event(1, "opened", "Issue", target_iid=25, target_title="Mode photo"), "issue_opened", "issue", 25),
        (event(2, "closed", "Issue", target_iid=8, target_title="Plan"), "issue_closed", "issue", 8),
        (event(3, "reopened", "WorkItem", target_iid=8, target_title="Plan"), "issue_reopened", "issue", 8),
        (
            event(4, "opened", "MergeRequest", target_iid=8, target_title="Couloir"),
            "mr_opened",
            "merge_request",
            8,
        ),
        (
            event(5, "accepted", "MergeRequest", target_iid=6, target_title="Proto"),
            "mr_merged",
            "merge_request",
            6,
        ),
        (
            event(6, "approved", "MergeRequest", target_iid=7, target_title="IA"),
            "mr_approved",
            "merge_request",
            7,
        ),
        (
            event(7, "closed", "MergeRequest", target_iid=5, target_title="Essai"),
            "mr_closed",
            "merge_request",
            5,
        ),
    ]
    for raw, kind, target_type, iid in cases:
        activity = map_event(raw, PROJECT_URL)
        assert (activity.kind, activity.target.type, activity.target.iid) == (kind, target_type, iid)
        assert activity.actor == "theo.wu" and activity.actor_name == "Theo"
        assert activity.id == str(raw["id"])


def test_un_commentaire_pointe_vers_ce_qui_est_commente():
    on_issue = event(
        8,
        "commented on",
        "Note",
        target_title="IA de poursuite",
        note={"noteable_type": "Issue", "noteable_iid": 14, "body": "ok"},
    )
    on_mr = event(
        9,
        "commented on",
        "DiffNote",
        target_title="Pathfinding",
        note={"noteable_type": "MergeRequest", "noteable_iid": 7, "body": "ok"},
    )
    issue_activity, mr_activity = map_event(on_issue, PROJECT_URL), map_event(on_mr, PROJECT_URL)
    assert (issue_activity.kind, issue_activity.target.type, issue_activity.target.iid) == (
        "commented",
        "issue",
        14,
    )
    assert issue_activity.target.web_url == f"{PROJECT_URL}/-/issues/14"
    assert (mr_activity.kind, mr_activity.target.type, mr_activity.target.iid) == (
        "commented",
        "merge_request",
        7,
    )
    assert mr_activity.target.web_url == f"{PROJECT_URL}/-/merge_requests/7"


def test_les_pushs_sont_resumes_en_francais():
    def push(count, action="pushed", ref="feat/14-poursuite", ref_type="branch", title="Corrige la grille"):
        data = {
            "commit_count": count,
            "action": action,
            "ref_type": ref_type,
            "ref": ref,
            "commit_title": title,
        }
        return map_event(event(10, "pushed to", None, push_data=data), PROJECT_URL)

    assert push(2).detail == "2 commits sur feat/14-poursuite"
    assert push(1).detail == "1 commit sur feat/14-poursuite : Corrige la grille"
    assert push(0, action="created").detail == "branche feat/14-poursuite créée"
    assert push(0, action="removed").detail == "branche feat/14-poursuite supprimée"
    assert push(0, action="created", ref="jouable-1", ref_type="tag").detail == "tag jouable-1 créé"
    activity = push(2)
    assert (activity.kind, activity.target.type, activity.target.title) == (
        "pushed",
        "branch",
        "feat/14-poursuite",
    )


def test_les_evenements_inconnus_ne_font_pas_planter():
    joined = map_event(event(11, "joined"), PROJECT_URL)
    assert (joined.kind, joined.target.type) == ("joined", "project")
    odd = map_event(event(12, "destroyed", "Snippet"), PROJECT_URL)
    assert (odd.kind, odd.target, odd.detail) == ("other", None, "destroyed")
    milestone = map_event(event(13, "closed", "Milestone", target_title="CdST"), PROJECT_URL)
    assert (milestone.kind, milestone.target.type, milestone.target.title) == ("other", "milestone", "CdST")


def test_le_fil_est_trie_du_plus_recent_au_plus_ancien_et_borne():
    events = [event(n, "opened", "Issue", target_iid=n, hours_ago=n) for n in range(1, 61)]
    activity = build_activity(list(reversed(events)), PROJECT_URL, limit=50)
    assert len(activity) == 50
    assert [a.id for a in activity[:3]] == ["1", "2", "3"]


def test_l_instantane_se_serialise_selon_le_contrat():
    raw = RawState(
        project=factories.project(),
        members=[factories.user("arthur.jeaugey")],
        issues={1: factories.issue(1, labels=["En cours"])},
        merge_requests={7: factories.merge_request(7, created_hours_ago=74)},
    )
    data = snapshot(raw).model_dump(mode="json")
    assert set(data) == {
        "version", "generated_at", "sync", "project", "settings", "members", "domains", "setup",
        "deadlines", "issues", "merge_requests", "pipelines", "playable", "attention", "activity",
    }  # fmt: skip
    assert data["deadlines"][1]["week_of"] == "2026-12-07"
    assert data["settings"]["column_labels"] == {"idea": "Idée", "todo": "À faire", "doing": "En cours"}
    assert {item["kind"] for item in data["attention"]} == {"mr_waiting", "inconsistent", "member_idle"}
    assert data["generated_at"].endswith(("Z", "+00:00"))
