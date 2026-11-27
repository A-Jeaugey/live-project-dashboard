import asyncio

from app.gitlab.sync import INTERNAL_ERROR
from tests import factories
from tests.gitlab.conftest import API


def seed(gitlab) -> None:
    gitlab.issues = {
        14: factories.issue(14, labels=["En cours"], assignees=["theo.wu"], updated_days_ago=0.5),
        12: factories.issue(12, labels=["À faire"]),
        8: factories.issue(8, labels=["En cours"], state="closed", updated_days_ago=1),
    }
    gitlab.merge_requests = {
        7: factories.merge_request(7, reviewers=["louis.landanger"], created_hours_ago=74)
    }
    gitlab.closes = {7: [14]}
    gitlab.commits = [{"id": "a" * 40, "short_id": "aaaaaaaa", "title": "Init", "author_name": "Arthur"}]
    gitlab.events = [
        {
            "id": 1,
            "action_name": "opened",
            "target_type": "Issue",
            "target_iid": 12,
            "target_title": "Tâche 12",
            "author": factories.user("arthur.jeaugey"),
            "author_username": "arthur.jeaugey",
            "created_at": factories.ago(hours=3),
        }
    ]


async def test_la_premiere_lecture_construit_l_instantane(gitlab, sync):
    seed(gitlab)
    assert sync.snapshot.version == 0 and not sync.snapshot.sync.ok, "avant toute lecture"

    assert await sync.full_refresh() is True
    snapshot = sync.snapshot
    assert snapshot.version == 1
    assert snapshot.sync.ok and snapshot.sync.mode == "polling" and snapshot.sync.last_error is None
    assert snapshot.sync.last_success_at == factories.NOW
    assert snapshot.project.path == "groupe/jeu"
    assert {i.iid: i.column for i in snapshot.issues} == {14: "doing", 12: "todo", 8: "done"}
    assert [(mr.iid, mr.closes, mr.overdue) for mr in snapshot.merge_requests] == [(7, [14], True)]
    assert snapshot.issues[0].merge_requests == [7]
    assert snapshot.playable.source == "commit" and snapshot.playable.fallback_reason == "no_pipeline"
    assert [a.kind for a in snapshot.activity] == ["issue_opened"]
    assert [m.in_project for m in snapshot.members] == [True, True, True]
    assert {r.method for r in gitlab.requests} == {"GET"}


async def test_la_version_n_augmente_que_si_le_contenu_change(gitlab, sync):
    seed(gitlab)
    queue = sync.bus.subscribe()
    await sync.full_refresh()
    assert (await queue.get()).version == 1

    await sync.full_refresh()
    await sync.incremental_refresh()
    assert sync.snapshot.version == 1 and queue.empty(), "aucun changement : pas de nouvelle version"

    gitlab.issues[12] = factories.issue(
        12, labels=["En cours"], assignees=["louis.landanger"], updated_days_ago=0
    )
    await sync.full_refresh()
    assert sync.snapshot.version == 2
    event = queue.get_nowait()
    assert (event.type, event.version, event.activity) == ("changed", 2, [])


async def test_une_panne_garde_le_dernier_instantane_et_se_signale(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    queue = sync.bus.subscribe()

    gitlab.down = True
    clock.advance(seconds=30)
    assert await sync.incremental_refresh() is False
    snapshot = sync.snapshot
    assert len(snapshot.issues) == 3, "les données restent affichées"
    assert not snapshot.sync.ok and "injoignable" in snapshot.sync.last_error
    assert snapshot.sync.last_success_at == factories.NOW, "la date du dernier succès ne bouge pas"
    assert snapshot.version == 2 and queue.get_nowait().version == 2, "l'interface est prévenue de la panne"

    clock.advance(seconds=30)
    await sync.incremental_refresh()
    assert sync.snapshot.version == 2, "la panne qui dure ne crée pas de nouvelle version"

    gitlab.down = False
    clock.advance(seconds=30)
    assert await sync.incremental_refresh() is True
    assert sync.snapshot.sync.ok and sync.snapshot.sync.last_error is None
    assert sync.snapshot.version == 3


async def test_gitlab_en_panne_au_demarrage_ne_fait_pas_planter(gitlab, sync):
    gitlab.down = True
    await sync.start()
    snapshot = sync.snapshot
    assert snapshot.version == 1 and not snapshot.sync.ok and snapshot.sync.last_success_at is None
    assert snapshot.project.name == "Jeu", "le projet vient de la configuration"
    assert [m.first_name for m in snapshot.members] == ["Arthur", "Théo", "Louis"]
    assert snapshot.issues == []

    gitlab.down = False
    seed(gitlab)
    await sync.tick()
    assert sync.snapshot.sync.ok and len(sync.snapshot.issues) == 3, "la lecture complète est retentée"


async def test_une_erreur_inattendue_est_contenue_et_ne_fuit_pas(gitlab, sync):
    gitlab.router.get(f"{API}/labels").respond(200, json=[{"pas_de_nom": True, "name": None}])
    gitlab.router.get(f"{API}/issues").respond(200, json=[{"titre": "sans iid"}])
    assert await sync.full_refresh() is False
    assert sync.snapshot.sync.last_error == INTERNAL_ERROR


async def test_l_interrogation_incrementale_ne_demande_que_le_recent(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    gitlab.reset_calls()

    clock.advance(seconds=30)
    gitlab.issues[12] = factories.issue(
        12, labels=["En cours"], assignees=["louis.landanger"], updated_days_ago=0
    )
    gitlab.issues[12]["updated_at"] = clock.now.isoformat()
    await sync.incremental_refresh()

    issue_calls = [r for r in gitlab.requests if r.url.path.endswith("/issues")]
    assert len(issue_calls) == 1
    after = issue_calls[0].url.params["updated_after"]
    assert after == (factories.NOW - (clock.now - factories.NOW) * 3).isoformat(), (
        "dernière synchro moins la marge"
    )
    assert {i.iid: i.column for i in sync.snapshot.issues}[12] == "doing"
    assert len(sync.snapshot.issues) == 3, "les issues non modifiées sont conservées"
    assert gitlab.count("/members/all") == 0 and gitlab.count("/") == 0, (
        "membres et projet : relecture complète seulement"
    )


async def test_le_detail_d_une_mr_n_est_relu_que_si_elle_change(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    assert gitlab.count("/merge_requests/7") == 1 and gitlab.count("/merge_requests/7/closes_issues") == 1

    gitlab.reset_calls()
    clock.advance(seconds=30)
    await sync.incremental_refresh()
    assert gitlab.count("/merge_requests/7") == 0 and gitlab.count("/merge_requests/7/closes_issues") == 0
    assert gitlab.count("/merge_requests/7/approvals") == 1, "les approbations sont relues à chaque passage"
    assert sync.snapshot.merge_requests[0].closes == [14]

    gitlab.reset_calls()
    gitlab.merge_requests[7] = {**gitlab.merge_requests[7], "updated_at": clock.now.isoformat()}
    gitlab.closes[7] = [14, 12]
    clock.advance(seconds=30)
    await sync.incremental_refresh()
    assert gitlab.count("/merge_requests/7") == 1
    assert sync.snapshot.merge_requests[0].closes == [12, 14]


async def test_une_approbation_met_fin_a_l_attente_des_le_passage_suivant(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    assert sync.snapshot.attention[0].kind == "mr_waiting"
    gitlab.approvals[7] = ["louis.landanger"]
    clock.advance(seconds=30)
    await sync.incremental_refresh()
    assert not sync.snapshot.merge_requests[0].waiting_review
    assert "mr_waiting" not in [a.kind for a in sync.snapshot.attention]


async def test_une_mr_fusionnee_disparait(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    del gitlab.merge_requests[7]
    clock.advance(seconds=30)
    await sync.incremental_refresh()
    assert sync.snapshot.merge_requests == []
    assert {i.iid: i.merge_requests for i in sync.snapshot.issues}[14] == []


async def test_les_nouveaux_evenements_accompagnent_le_message_de_changement(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    queue = sync.bus.subscribe()

    gitlab.events.insert(
        0,
        {
            "id": 2,
            "action_name": "closed",
            "target_type": "Issue",
            "target_iid": 12,
            "target_title": "Tâche 12",
            "author": factories.user("louis.landanger"),
            "author_username": "louis.landanger",
            "created_at": clock.now.isoformat(),
        },
    )
    clock.advance(seconds=30)
    await sync.incremental_refresh()
    event = queue.get_nowait()
    assert [(a.id, a.kind, a.actor) for a in event.activity] == [("2", "issue_closed", "louis.landanger")]


async def test_le_temps_qui_passe_met_a_jour_les_durees(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    assert sync.snapshot.merge_requests[0].waiting_hours == 74
    version = sync.snapshot.version
    clock.advance(hours=2)
    await sync.incremental_refresh()
    assert sync.snapshot.merge_requests[0].waiting_hours == 76
    assert sync.snapshot.version == version + 1


# --- webhooks -------------------------------------------------------------------------------------


async def test_un_signal_d_issue_ne_relit_que_cette_issue(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    gitlab.reset_calls()

    gitlab.issues[12] = factories.issue(
        12, labels=["En cours"], assignees=["louis.landanger"], updated_days_ago=0
    )
    await sync.handle_signals({("issue", 12)})
    assert sorted(set(gitlab.paths())) == ["/events", "/issues/12"]
    assert {i.iid: i.column for i in sync.snapshot.issues}[12] == "doing"


async def test_un_signal_sur_une_issue_supprimee_la_retire(gitlab, sync):
    seed(gitlab)
    await sync.full_refresh()
    del gitlab.issues[12]
    await sync.handle_signals({("issue", 12)})
    assert 12 not in {i.iid for i in sync.snapshot.issues}


async def test_un_signal_de_merge_request_declenche_une_relecture_incrementale(gitlab, sync):
    seed(gitlab)
    await sync.full_refresh()
    gitlab.reset_calls()
    gitlab.approvals[7] = ["louis.landanger"]
    await sync.handle_signals({("merge_request", 7), ("issue", 14)})
    assert gitlab.count("/merge_requests") == 1 and gitlab.count("/issues") == 1
    assert not sync.snapshot.merge_requests[0].waiting_review


async def test_les_signaux_rapproches_sont_regroupes(gitlab, sync):
    seed(gitlab)
    await sync.full_refresh()
    gitlab.reset_calls()
    for _ in range(5):
        sync.signal("issue", 12)
        sync.signal("issue", 14)
    await sync._drain_task
    assert gitlab.count("/issues/12") == 1 and gitlab.count("/issues/14") == 1
    assert gitlab.count("/events") == 1


async def test_un_signal_recu_pendant_un_traitement_n_est_pas_perdu(gitlab, sync):
    seed(gitlab)
    await sync.full_refresh()
    gitlab.reset_calls()
    sync.signal("issue", 12)
    await asyncio.sleep(0)  # le traitement démarre
    sync.signal("issue", 14)
    await sync._drain_task
    assert gitlab.count("/issues/12") == 1 and gitlab.count("/issues/14") == 1


async def test_tant_que_les_webhooks_arrivent_on_n_interroge_plus(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    assert sync.mode == "polling"

    sync.note_webhook()
    assert sync.mode == "webhook"
    gitlab.reset_calls()
    clock.advance(seconds=30)
    await sync.tick()
    assert gitlab.requests == [], "en mode webhook, un passage ne coûte aucune requête"
    assert sync.snapshot.sync.mode == "webhook" and sync.snapshot.sync.last_webhook_at == factories.NOW

    clock.advance(seconds=3600)
    assert sync.mode == "polling", "sans webhook depuis une heure, on recommence à interroger"


async def test_la_relecture_complete_reste_due_meme_en_mode_webhook(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    sync.note_webhook()
    gitlab.reset_calls()
    clock.advance(seconds=601)
    await sync.tick()
    assert gitlab.count("/members/all") == 1
    assert sync.mode == "webhook", "rien n'a changé : les webhooks gardent notre confiance"


async def test_un_changement_sans_webhook_fait_revenir_a_l_interrogation(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    sync.note_webhook()
    gitlab.issues[12] = factories.issue(
        12, labels=["En cours"], assignees=["louis.landanger"], updated_days_ago=0
    )
    clock.advance(seconds=601)
    await sync.tick()
    assert sync.mode == "polling"
    assert {i.iid: i.column for i in sync.snapshot.issues}[12] == "doing"


async def test_un_passage_en_mode_interrogation_fait_une_relecture_incrementale(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    gitlab.reset_calls()
    clock.advance(seconds=30)
    await sync.tick()
    assert gitlab.count("/issues") == 1
    assert any("updated_after" in r.url.params for r in gitlab.requests)
    assert gitlab.count("/members/all") == 0


# --- détail ---------------------------------------------------------------------------------------


async def test_le_detail_d_une_issue_est_relu_a_la_demande(gitlab, sync):
    seed(gitlab)
    await sync.full_refresh()
    gitlab.issues[14]["description"] = "- [x] grille\n- [ ] patrouille"
    gitlab.notes[14] = [
        {
            "id": 2,
            "body": "système",
            "system": True,
            "author": factories.user("theo.wu"),
            "created_at": factories.ago(hours=2),
        },
        {
            "id": 1,
            "body": "Je relis ce soir.",
            "system": False,
            "author": factories.user("louis.landanger"),
            "created_at": factories.ago(hours=3),
        },
    ]
    detail = await sync.issue_detail(14)
    assert detail is not None
    assert detail.description.startswith("- [x] grille")
    assert [(n.author, n.body) for n in detail.notes] == [("louis.landanger", "Je relis ce soir.")]
    assert detail.merge_requests == [7] and detail.column == "doing"
    assert await sync.issue_detail(999) is None


async def test_la_boucle_de_fond_tourne_et_s_arrete_proprement(gitlab, client, clock):
    from app.gitlab.sync import Synchronizer
    from tests.gitlab.conftest import FALLBACK

    seed(gitlab)
    synchronizer = Synchronizer(
        client, factories.config(), project_fallback=FALLBACK, poll_interval=0.01, clock=clock
    )
    await synchronizer.start()
    gitlab.reset_calls()
    await asyncio.sleep(0.08)
    assert gitlab.count("/issues") >= 2, "la boucle interroge régulièrement"
    await synchronizer.stop()
    calls = len(gitlab.requests)
    await asyncio.sleep(0.05)
    assert len(gitlab.requests) == calls, "plus aucune requête après l'arrêt"


async def test_des_donnees_illisibles_ne_vident_pas_l_ecran(gitlab, sync, clock):
    seed(gitlab)
    await sync.full_refresh()
    version = sync.snapshot.version

    # Une issue sans date de création : la lecture réussit, mais l'instantané ne peut pas être construit.
    gitlab.issues[12] = {"iid": 12, "title": "Réponse incomplète", "state": "opened", "labels": []}
    clock.advance(seconds=30)
    assert await sync.full_refresh() is False
    snapshot = sync.snapshot
    assert snapshot.sync.last_error == INTERNAL_ERROR and not snapshot.sync.ok
    assert len(snapshot.issues) == 3, "le dernier instantané lisible reste affiché"
    assert snapshot.version == version + 1, "l'interface est prévenue"

    gitlab.issues[12] = factories.issue(12, labels=["À faire"])
    clock.advance(seconds=30)
    assert await sync.full_refresh() is True
    assert sync.snapshot.sync.ok and sync.snapshot.sync.last_error is None


async def test_des_donnees_illisibles_au_demarrage_ne_font_pas_planter(gitlab, sync):
    gitlab.issues[1] = {"iid": 1, "state": "opened"}
    await sync.start()
    assert sync.snapshot.sync.last_error == INTERNAL_ERROR
    assert sync.snapshot.issues == []
