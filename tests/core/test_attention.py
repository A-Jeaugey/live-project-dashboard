from datetime import timedelta

from app.core.attention import build_attention, review_state, stale_days
from app.core.snapshot import RawState, build_snapshot
from tests import factories
from tests.factories import NOW


def state(**kwargs):
    defaults = {
        "draft": False,
        "author": "theo.wu",
        "approved_by": [],
        "created_at": NOW - timedelta(hours=5),
        "now": NOW,
        "review_hours": 48,
    }
    defaults.update(kwargs)
    return review_state(**defaults)


def test_une_mr_recente_attend_sans_etre_en_retard():
    assert state() == (True, 5, False)


def test_une_mr_est_en_retard_a_partir_du_seuil():
    assert state(created_at=NOW - timedelta(hours=47, minutes=59)) == (True, 47, False)
    assert state(created_at=NOW - timedelta(hours=48)) == (True, 48, True)
    assert state(created_at=NOW - timedelta(days=3, hours=2)) == (True, 74, True)


def test_un_brouillon_n_attend_pas_de_relecture():
    assert state(draft=True, created_at=NOW - timedelta(days=10)) == (False, None, False)


def test_l_approbation_d_un_autre_membre_met_fin_a_l_attente():
    assert state(approved_by=["louis.landanger"], created_at=NOW - timedelta(days=5)) == (False, None, False)


def test_l_auto_approbation_ne_compte_pas():
    assert state(approved_by=["theo.wu"], created_at=NOW - timedelta(days=5)) == (True, 120, True)


def test_le_seuil_de_relecture_est_reglable():
    assert state(created_at=NOW - timedelta(hours=25), review_hours=24) == (True, 25, True)


def test_stale_days_ne_concerne_que_les_taches_en_cours():
    old = NOW - timedelta(days=30)
    assert stale_days(column="doing", last_activity_at=old, now=NOW, threshold=14) == 30
    for column in ("idea", "todo", "done"):
        assert stale_days(column=column, last_activity_at=old, now=NOW, threshold=14) is None


def test_stale_days_respecte_le_seuil():
    def days(n, hours=0):
        return stale_days(
            column="doing", last_activity_at=NOW - timedelta(days=n, hours=hours), now=NOW, threshold=14
        )

    assert days(13, 23) is None
    assert days(14) == 14
    assert days(16, 5) == 16


def snapshot(raw: RawState):
    from app.core.models import ProjectInfo, SyncStatus

    return build_snapshot(
        raw,
        factories.config(),
        now=NOW,
        version=1,
        sync=SyncStatus(mode="polling", ok=True, last_success_at=NOW, last_error=None, last_webhook_at=None),
        project_fallback=ProjectInfo(
            name="Jeu", path="groupe/jeu", web_url=factories.PROJECT_URL, default_branch="main"
        ),
    )


def raw_state(**kwargs) -> RawState:
    members = [
        factories.user("arthur.jeaugey", user_id=1),
        factories.user("theo.wu", user_id=2),
        factories.user("louis.landanger", user_id=3),
    ]
    return RawState(project=factories.project(), members=members, **kwargs)


def test_scenario_complet_dans_l_ordre_d_urgence():
    issues = {
        14: factories.issue(14, labels=["En cours"], assignees=["theo.wu"], updated_days_ago=1),
        17: factories.issue(17, labels=["En cours"], assignees=["arthur.jeaugey"], updated_days_ago=16.2),
        12: factories.issue(12, labels=["À faire"]),
        18: factories.issue(18, labels=["À faire"]),
        19: factories.issue(19, labels=["À faire"], assignees=["theo.wu"]),
        26: factories.issue(26, labels=[]),
        8: factories.issue(8, labels=["En cours"], state="closed", updated_days_ago=40),
    }
    mrs = {
        7: factories.merge_request(7, reviewers=["louis.landanger"], created_hours_ago=74),
        8: factories.merge_request(8, author="arthur.jeaugey", created_hours_ago=5),
    }
    result = snapshot(raw_state(issues=issues, merge_requests=mrs, mr_closes={7: [14]}))

    kinds = [item.kind for item in result.attention]
    assert kinds == ["mr_waiting", "issue_stale", "inconsistent", "needs_triage", "member_idle"]

    waiting, stale, inconsistent, triage, idle = result.attention
    assert (waiting.mr, waiting.hours, waiting.author, waiting.reviewers) == (
        7,
        74,
        "theo.wu",
        ["louis.landanger"],
    )
    assert (stale.issue, stale.days, stale.assignees) == (17, 16, ["arthur.jeaugey"])
    assert (inconsistent.issue, inconsistent.flag) == (19, "todo_assigned")
    assert triage.issue == 26
    # Louis n'a rien en cours ; deux tâches « À faire » n'ont personne (la 19 est déjà attribuée).
    assert (idle.member, idle.available_todo) == ("louis.landanger", 2)


def test_une_tache_fermee_ne_declenche_rien():
    issues = {8: factories.issue(8, labels=["En cours"], state="closed", updated_days_ago=60)}
    result = snapshot(raw_state(issues=issues))
    assert [item.kind for item in result.attention] == ["member_idle"] * 3


def test_la_mr_liee_reveille_une_tache_dormante():
    issues = {17: factories.issue(17, labels=["En cours"], assignees=["theo.wu"], updated_days_ago=20)}
    mrs = {9: factories.merge_request(9, created_hours_ago=30, updated_hours_ago=2)}
    result = snapshot(raw_state(issues=issues, merge_requests=mrs, mr_closes={9: [17]}))
    issue = result.issues[0]
    assert issue.stale_days is None
    assert issue.merge_requests == [9]
    assert issue.last_activity_at == result.merge_requests[0].updated_at
    assert "issue_stale" not in [item.kind for item in result.attention]


def test_un_pipeline_en_echec_passe_en_premier():
    pipelines = [
        {
            "id": 5,
            "status": "failed",
            "ref": "main",
            "sha": "a" * 40,
            "created_at": factories.ago(hours=1),
            "web_url": "u5",
        },
        {
            "id": 4,
            "status": "success",
            "ref": "main",
            "sha": "b" * 40,
            "created_at": factories.ago(hours=9),
            "web_url": "u4",
        },
    ]
    result = snapshot(raw_state(pipelines=pipelines))
    first = result.attention[0]
    assert first.kind == "pipeline_failed" and first.pipeline_id == 5 and first.ref == "main"


def test_un_ancien_echec_suivi_d_un_succes_n_alerte_pas():
    pipelines = [
        {
            "id": 6,
            "status": "success",
            "ref": "main",
            "sha": "c" * 40,
            "created_at": factories.ago(hours=1),
            "web_url": "u6",
        },
        {
            "id": 5,
            "status": "failed",
            "ref": "main",
            "sha": "a" * 40,
            "created_at": factories.ago(hours=9),
            "web_url": "u5",
        },
    ]
    assert "pipeline_failed" not in [item.kind for item in snapshot(raw_state(pipelines=pipelines)).attention]


def test_un_membre_absent_du_projet_n_est_pas_dit_disponible():
    raw = raw_state()
    raw.members = [factories.user("arthur.jeaugey")]
    result = snapshot(raw)
    assert [m.in_project for m in result.members] == [True, False, False]
    assert [(i.kind, i.member) for i in result.attention] == [("member_idle", "arthur.jeaugey")]


def test_build_attention_accepte_des_listes_vides():
    assert build_attention(issues=[], merge_requests=[], members=[], pipelines=[]) == []
