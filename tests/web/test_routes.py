import asyncio
import base64
import json
import time

import httpx
import pytest
from authlib.integrations.base_client import OAuthError
from pydantic import ValidationError

from app.core.models import StreamEvent
from app.core.webhooks import sign
from app.gitlab.bus import EventBus
from app.web.api import event_stream
from app.web.auth import safe_next
from app.web.hooks import DeliveryMemory, signal_for
from tests import factories
from tests.web.conftest import APP_URL, WEBHOOK_SECRET, make_settings

ORIGIN = {"Origin": APP_URL}

# --- accès ----------------------------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/api/me", "/api/snapshot", "/api/issues/14", "/api/stream"])
async def test_sans_session_l_api_repond_401(harness, path):
    response = await harness.http.get(path)
    assert response.status_code == 401
    assert response.json() == {"detail": "Connexion requise"}


async def test_healthz_est_public(harness):
    response = await harness.http.get("/healthz")
    assert (response.status_code, response.json()) == (200, {"status": "ok"})


async def test_un_membre_se_connecte_et_lit_l_api(harness):
    response = await harness.login()
    assert (response.status_code, response.headers["location"]) == (303, "/")
    cookie = response.headers["set-cookie"].lower()
    assert (
        "carnet_session=" in cookie
        and "httponly" in cookie
        and "secure" in cookie
        and "samesite=lax" in cookie
    )

    me = (await harness.http.get("/api/me")).json()
    assert me == {
        "username": "arthur.jeaugey",
        "name": "Arthur Jeaugey",
        "first_name": "Arthur",
        "avatar_url": "https://gitlab.example/a.png",
    }
    snapshot = (await harness.http.get("/api/snapshot")).json()
    assert snapshot["version"] == 1 and snapshot["sync"]["ok"] is True
    assert [i["iid"] for i in snapshot["issues"]] == [14, 12]
    assert snapshot["project"]["path"] == "groupe/jeu"


async def test_l_adresse_de_retour_vient_de_la_configuration_en_production(harness):
    await harness.http.get("/auth/login", headers={"Host": "pirate.example"})
    assert harness.oauth.redirect_uri == f"{APP_URL}/auth/callback"


async def test_le_chemin_de_retour_est_conserve_mais_jamais_externe(harness):
    response = await harness.login(next_path="/tableau?domaine=son")
    assert response.headers["location"] == "/tableau?domaine=son"
    response = await harness.login(next_path="//pirate.example/vol")
    assert response.headers["location"] == "/"
    response = await harness.login(next_path="https://pirate.example")
    assert response.headers["location"] == "/"


def test_safe_next():
    assert safe_next("/echeances") == "/echeances"
    assert safe_next("/tableau?qui=theo.wu&t=14") == "/tableau?qui=theo.wu&t=14"
    for bad in (
        None,
        "",
        "https://ailleurs.example",
        "//ailleurs.example",
        "/\\ailleurs.example",
        "tableau",
        # Un navigateur supprime tabulations et retours à la ligne : « /\t/x » deviendrait « //x ».
        "/\t/ailleurs.example",
        "/\n/ailleurs.example",
        "/ /ailleurs.example",
        "/\x00tableau",
    ):
        assert safe_next(bad) == "/", bad


async def test_un_non_membre_est_refuse(harness):
    harness.oauth.login_as(99, "intrus.externe")
    response = await harness.login()
    assert (response.status_code, response.headers["location"]) == (303, "/?erreur=non_membre")
    assert (await harness.http.get("/api/me")).status_code == 401
    assert (await harness.http.get("/api/snapshot")).status_code == 401


@pytest.mark.parametrize(
    "change",
    [{"state": "blocked"}, {"access_level": 5}, {"username": "project_42_bot_abc"}],
    ids=["compte bloqué", "niveau insuffisant", "robot"],
)
async def test_un_membre_inactif_ou_technique_est_refuse(harness, change):
    harness.gitlab.members[0] = {**harness.gitlab.members[0], **change}
    response = await harness.login()
    assert response.headers["location"] == "/?erreur=non_membre"


async def test_un_refus_efface_la_session_precedente(harness):
    await harness.login()
    assert (await harness.http.get("/api/me")).status_code == 200
    harness.oauth.login_as(99, "intrus.externe")
    await harness.login()
    assert (await harness.http.get("/api/me")).status_code == 401


async def test_une_identite_incoherente_est_refusee(harness):
    harness.oauth.signed_subject = "2"  # le jeton signé désigne quelqu'un d'autre que le profil
    response = await harness.login()
    assert response.headers["location"] == "/?erreur=connexion"
    assert (await harness.http.get("/api/me")).status_code == 401


async def test_un_profil_sans_identifiant_numerique_est_refuse(harness):
    harness.oauth.profile = {"sub": "", "nickname": "arthur.jeaugey"}
    harness.oauth.signed_subject = None
    assert (await harness.login()).headers["location"] == "/?erreur=connexion"


async def test_un_echec_oauth_renvoie_a_l_accueil_avec_un_code(harness):
    harness.oauth.error = OAuthError(error="access_denied", description="refus")
    assert (await harness.login()).headers["location"] == "/?erreur=connexion"
    harness.oauth.error = httpx.ConnectError("panne")
    assert (await harness.login()).headers["location"] == "/?erreur=gitlab"


async def test_gitlab_en_panne_pendant_le_controle_d_appartenance(harness):
    harness.gitlab.down = True
    assert (await harness.login()).headers["location"] == "/?erreur=gitlab"
    assert (await harness.http.get("/api/me")).status_code == 401


async def test_sans_application_oauth_configuree_la_connexion_est_impossible(gitlab, clock):
    from app.gitlab.client import GitLabClient
    from app.gitlab.sync import Synchronizer
    from app.web.app import create_app
    from tests.gitlab.conftest import BASE, FALLBACK, PROJECT

    sync = Synchronizer(
        GitLabClient(BASE, "t", PROJECT), factories.config(), project_fallback=FALLBACK, clock=clock
    )
    app = create_app(make_settings(gitlab_oauth_client_id=""), config=factories.config(), synchronizer=sync)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=APP_URL) as http:
        response = await http.get("/auth/login")
    assert (response.status_code, response.headers["location"]) == (303, "/?erreur=configuration")
    await sync.stop()


# --- revérification de l'appartenance ---------------------------------------------------------------


async def test_un_membre_retire_du_projet_perd_l_acces(harness, monkeypatch):
    await harness.login()
    harness.gitlab.members = harness.gitlab.members[1:]  # Arthur quitte le projet
    assert (await harness.http.get("/api/me")).status_code == 200, "pas de revérification avant le délai"

    later = time.time() + 601
    monkeypatch.setattr(time, "time", lambda: later)
    response = await harness.http.get("/api/me")
    assert (response.status_code, response.json()["detail"]) == (401, "Tu n'es plus membre du projet")
    assert (await harness.http.get("/api/snapshot")).status_code == 401, "la session est effacée"


async def test_la_reverification_reussie_n_est_pas_refaite_a_chaque_requete(harness, monkeypatch):
    await harness.login()
    later = time.time() + 601
    monkeypatch.setattr(time, "time", lambda: later)
    harness.gitlab.reset_calls()
    for _ in range(3):
        assert (await harness.http.get("/api/me")).status_code == 200
    assert harness.gitlab.count("/members/all/1") == 1


async def test_gitlab_en_panne_ne_deconnecte_personne(harness, monkeypatch):
    await harness.login()
    later = time.time() + 601
    monkeypatch.setattr(time, "time", lambda: later)
    harness.gitlab.down = True
    assert (await harness.http.get("/api/me")).status_code == 200
    harness.gitlab.down = False
    harness.gitlab.members = harness.gitlab.members[1:]
    assert (await harness.http.get("/api/me")).status_code == 401, "revérifié dès que GitLab revient"


# --- déconnexion et origine -------------------------------------------------------------------------


async def test_la_deconnexion_exige_la_bonne_origine(harness):
    await harness.login()
    assert (await harness.http.post("/auth/logout")).status_code == 403
    assert (
        await harness.http.post("/auth/logout", headers={"Origin": "https://pirate.example"})
    ).status_code == 403
    assert (await harness.http.get("/api/me")).status_code == 200, "toujours connecté"

    response = await harness.http.post("/auth/logout", headers=ORIGIN)
    assert response.status_code == 204
    assert (await harness.http.get("/api/me")).status_code == 401


async def test_les_origines_supplementaires_sont_acceptees():
    settings = make_settings(allowed_origins="http://127.0.0.1:5173, http://localhost:5173/")
    assert settings.origins == {APP_URL, "http://127.0.0.1:5173", "http://localhost:5173"}


async def test_les_en_tetes_de_securite_sont_poses(harness):
    response = await harness.http.get("/healthz")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["strict-transport-security"].startswith("max-age=")
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp and "frame-ancestors 'none'" in csp and "https://gitlab.example" in csp


# --- détail d'une issue -----------------------------------------------------------------------------


async def test_detail_d_une_issue(harness):
    await harness.login()
    harness.gitlab.issues[14]["description"] = "Le prof patrouille."
    harness.gitlab.notes[14] = [
        {
            "id": 1,
            "body": "Je relis ce soir.",
            "system": False,
            "author": factories.user("louis.landanger", "Louis"),
            "created_at": factories.ago(hours=3),
        }
    ]
    detail = (await harness.http.get("/api/issues/14")).json()
    assert detail["description"] == "Le prof patrouille."
    note = detail["notes"][0]
    assert (note["id"], note["author"], note["author_name"]) == (1, "louis.landanger", "Louis")
    assert note["body"] == "Je relis ce soir." and note["created_at"]
    assert detail["column"] == "doing" and detail["iid"] == 14


async def test_detail_introuvable_ou_gitlab_en_panne(harness):
    await harness.login()
    response = await harness.http.get("/api/issues/999")
    assert (response.status_code, response.json()["detail"]) == (404, "L'issue #999 n'existe pas")
    assert (await harness.http.get("/api/issues/abc")).status_code == 422

    harness.gitlab.down = True
    response = await harness.http.get("/api/issues/14")
    assert response.status_code == 502 and "injoignable" in response.json()["detail"]


# --- webhooks ---------------------------------------------------------------------------------------

ISSUE_HOOK = {"object_kind": "issue", "project": {"id": 42}, "object_attributes": {"iid": 12}}


async def post_hook(harness, payload=ISSUE_HOOK, **headers):
    return await harness.http.post("/hooks/gitlab", content=json.dumps(payload), headers=headers)


async def test_un_webhook_valide_declenche_une_relecture_ciblee(harness):
    harness.gitlab.issues[12] = factories.issue(
        12, labels=["En cours"], assignees=["louis.landanger"], updated_days_ago=0
    )
    harness.gitlab.reset_calls()
    response = await post_hook(
        harness, **{"X-Gitlab-Token": WEBHOOK_SECRET, "Idempotency-Key": "livraison-1"}
    )
    assert (response.status_code, response.json()) == (200, {"status": "ok"})
    await harness.sync._drain_task
    assert sorted(set(harness.gitlab.paths())) == ["/events", "/issues/12"]
    snapshot = harness.sync.snapshot
    assert {i.iid: i.column for i in snapshot.issues}[12] == "doing"
    assert snapshot.sync.mode == "webhook" and snapshot.sync.last_webhook_at is not None


async def test_un_webhook_n_a_pas_besoin_d_origine_mais_de_son_secret(harness):
    assert (await post_hook(harness)).status_code == 403
    assert (await post_hook(harness, **{"X-Gitlab-Token": "faux"})).status_code == 403
    assert (await post_hook(harness, **{"X-Gitlab-Token": "faux", **ORIGIN})).status_code == 403
    assert harness.sync.mode == "polling", "un webhook refusé ne compte pas"


async def test_sans_secret_configure_tous_les_webhooks_sont_refuses(gitlab, clock):
    from app.gitlab.client import GitLabClient
    from app.gitlab.sync import Synchronizer
    from app.web.app import create_app
    from tests.gitlab.conftest import BASE, FALLBACK, PROJECT

    sync = Synchronizer(
        GitLabClient(BASE, "t", PROJECT), factories.config(), project_fallback=FALLBACK, clock=clock
    )
    app = create_app(make_settings(gitlab_webhook_secret=""), config=factories.config(), synchronizer=sync)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=APP_URL) as http:
        for headers in ({}, {"X-Gitlab-Token": ""}, {"X-Gitlab-Token": "nimporte"}):
            response = await http.post("/hooks/gitlab", content=json.dumps(ISSUE_HOOK), headers=headers)
            assert (response.status_code, response.json()) == (403, {"detail": "Webhook refusé"})
    await sync.stop()


async def test_une_livraison_repetee_est_ignoree(harness):
    headers = {"X-Gitlab-Token": WEBHOOK_SECRET, "Idempotency-Key": "livraison-7"}
    assert (await post_hook(harness, **headers)).json() == {"status": "ok"}
    await harness.sync._drain_task
    harness.gitlab.reset_calls()
    assert (await post_hook(harness, **headers)).json() == {"status": "duplicate"}
    assert harness.gitlab.requests == []


async def test_un_webhook_d_un_autre_projet_est_ignore(harness):
    payload = {**ISSUE_HOOK, "project": {"id": 7, "path_with_namespace": "autre/projet"}}
    response = await post_hook(harness, payload, **{"X-Gitlab-Token": WEBHOOK_SECRET})
    assert response.json() == {"status": "ignored"}
    assert harness.sync.mode == "polling"


async def test_un_corps_illisible_est_refuse_proprement(harness):
    headers = {"X-Gitlab-Token": WEBHOOK_SECRET}
    response = await harness.http.post("/hooks/gitlab", content=b"pas du json", headers=headers)
    assert response.status_code == 400
    response = await harness.http.post("/hooks/gitlab", content=b"[1, 2]", headers=headers)
    assert response.status_code == 400


async def test_un_corps_enorme_est_refuse(harness):
    response = await harness.http.post(
        "/hooks/gitlab", content=b"x" * (5 * 1024 * 1024 + 1), headers={"X-Gitlab-Token": WEBHOOK_SECRET}
    )
    assert response.status_code == 413


async def test_un_webhook_signe_est_accepte_et_un_rejeu_tardif_refuse(gitlab, clock):
    from app.gitlab.client import GitLabClient
    from app.gitlab.sync import Synchronizer
    from app.web.app import create_app
    from tests.gitlab.conftest import BASE, FALLBACK, PROJECT

    token = "whsec_" + base64.b64encode(b"k" * 32).decode()
    sync = Synchronizer(
        GitLabClient(BASE, "t", PROJECT), factories.config(), project_fallback=FALLBACK, clock=clock
    )
    await sync.full_refresh()
    settings = make_settings(gitlab_webhook_secret="", gitlab_webhook_signing_token=token)
    app = create_app(settings, config=factories.config(), synchronizer=sync)
    body = json.dumps(ISSUE_HOOK).encode()

    def headers(timestamp: float, payload: bytes = body) -> dict[str, str]:
        ts = str(int(timestamp))
        return {
            "webhook-id": "m1",
            "webhook-timestamp": ts,
            "webhook-signature": sign(token, "m1", ts, payload),
        }

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=APP_URL) as http:
        assert (
            await http.post("/hooks/gitlab", content=body, headers=headers(time.time()))
        ).status_code == 200
        assert (
            await http.post("/hooks/gitlab", content=body, headers=headers(time.time() - 3600))
        ).status_code == 403
        tampered = body.replace(b"12", b"13")
        assert (
            await http.post("/hooks/gitlab", content=tampered, headers=headers(time.time()))
        ).status_code == 403
        assert (await http.post("/hooks/gitlab", content=body)).status_code == 403
    await sync.stop()


def test_signal_for():
    assert signal_for({"object_kind": "issue", "object_attributes": {"iid": 12}}) == ("issue", 12)
    assert signal_for({"object_kind": "work_item", "object_attributes": {"iid": "7"}}) == ("issue", 7)
    assert signal_for({"object_kind": "note", "issue": {"iid": 14}}) == ("issue", 14)
    assert signal_for({"object_kind": "note", "merge_request": {"iid": 7}}) == ("note", None)
    assert signal_for({"object_kind": "merge_request", "object_attributes": {"iid": 7}}) == (
        "merge_request",
        None,
    )
    assert signal_for({"object_kind": "pipeline"}) == ("pipeline", None)
    assert signal_for({"object_kind": "push"}) == ("push", None)
    assert signal_for({"event_type": "milestone"}) == ("milestone", None)
    assert signal_for({"object_kind": "issue", "object_attributes": {}}) == ("other", None)
    assert signal_for({}) == ("other", None)


def test_delivery_memory_oublie_les_plus_anciennes():
    memory = DeliveryMemory(size=2)
    assert not memory.already_seen("a") and not memory.already_seen("b")
    assert memory.already_seen("a")
    assert not memory.already_seen("c")  # « b » sort de la mémoire
    assert not memory.already_seen("b")


# --- flux SSE ---------------------------------------------------------------------------------------


async def test_le_flux_envoie_hello_puis_les_changements_puis_un_ping():
    bus = EventBus()
    stream = event_stream(bus, lambda: 7, ping_seconds=0.02)

    hello = await anext(stream)
    assert hello.startswith("data: ") and hello.endswith("\n\n")
    assert json.loads(hello[6:]) == {"type": "hello", "version": 7, "activity": []}
    assert bus.subscriber_count == 1

    bus.publish(StreamEvent(type="changed", version=8, activity=[]))
    assert json.loads((await anext(stream))[6:])["version"] == 8

    assert await anext(stream) == ": ping\n\n"

    await stream.aclose()
    assert bus.subscriber_count == 0, "l'abonnement est libéré à la déconnexion"


async def test_un_abonne_lent_ne_bloque_pas_la_publication():
    bus = EventBus()
    queue = bus.subscribe()
    for version in range(1, 100):
        bus.publish(StreamEvent(type="changed", version=version, activity=[]))
    received = []
    while not queue.empty():
        received.append(queue.get_nowait().version)
    assert received[-1] == 99 and len(received) <= 32, "le plus récent est toujours conservé"
    await asyncio.sleep(0)


# --- interface compilée -----------------------------------------------------------------------------


@pytest.fixture
async def with_dist(tmp_path, gitlab, clock):
    from app.gitlab.client import GitLabClient
    from app.gitlab.sync import Synchronizer
    from app.web.app import create_app
    from tests.gitlab.conftest import BASE, FALLBACK, PROJECT

    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Carnet</title>")
    (dist / "assets" / "app-abc123.js").write_text("console.log('carnet')")
    (dist / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("ne pas servir")

    sync = Synchronizer(
        GitLabClient(BASE, "t", PROJECT), factories.config(), project_fallback=FALLBACK, clock=clock
    )
    app = create_app(make_settings(frontend_dist=str(dist)), config=factories.config(), synchronizer=sync)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=APP_URL) as http:
        yield http
    await sync.stop()


async def test_l_interface_compilee_est_servie_avec_repli_sur_index(with_dist):
    for path in ["/", "/tableau", "/echeances/cdst", "/?erreur=non_membre"]:
        response = await with_dist.get(path)
        assert response.status_code == 200 and "Carnet" in response.text
        assert response.headers["cache-control"] == "no-cache"

    asset = await with_dist.get("/assets/app-abc123.js")
    assert asset.status_code == 200 and "immutable" in asset.headers["cache-control"]
    assert (await with_dist.get("/favicon.svg")).headers["cache-control"] == "no-cache"


async def test_les_fichiers_absents_et_les_routes_reservees_ne_retombent_pas_sur_index(with_dist):
    assert (await with_dist.get("/assets/absent.js")).status_code == 404
    assert (await with_dist.get("/api/inconnu")).status_code == 404
    assert (await with_dist.get("/auth/inconnu")).status_code == 404
    assert (await with_dist.get("/hooks/gitlab")).status_code in (404, 405)


@pytest.mark.parametrize(
    "path", ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt", "/..%2fsecret.txt"]
)
async def test_on_ne_sort_pas_du_dossier_compile(with_dist, path):
    response = await with_dist.get(path)
    assert "ne pas servir" not in response.text


async def test_sans_interface_compilee_le_serveur_reste_utilisable(harness):
    response = await harness.http.get("/")
    assert response.status_code == 404 and "non compilée" in response.json()["detail"]
    assert (await harness.http.get("/healthz")).status_code == 200


# --- configuration ----------------------------------------------------------------------------------


def test_un_secret_de_session_trop_court_est_refuse_en_production():
    with pytest.raises(ValidationError, match="au moins 32"):
        make_settings(session_secret="court")
    assert make_settings(app_env="dev", session_secret="court").app_env == "dev"


def test_les_adresses_sont_validees_et_nettoyees():
    assert make_settings(gitlab_url="https://gitlab.example/").gitlab_url == "https://gitlab.example"
    with pytest.raises(ValidationError):
        make_settings(app_base_url="carnet.test")


def test_les_secrets_ne_s_affichent_pas():
    settings = make_settings()
    assert "jeton-de-test" not in repr(settings) and WEBHOOK_SECRET not in repr(settings)
    assert "s" * 48 not in str(settings.model_dump())
