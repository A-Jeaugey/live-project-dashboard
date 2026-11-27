import httpx
import pytest

from app.gitlab.client import GitLabClient, GitLabError
from tests import factories
from tests.gitlab.conftest import API, BASE, PROJECT


async def test_le_token_part_en_bearer_et_le_chemin_du_projet_est_encode(gitlab, client):
    project = await client.project()
    assert project["path_with_namespace"] == "groupe/jeu"
    request = gitlab.requests[0]
    assert request.headers["Authorization"] == "Bearer jeton-de-test"
    assert "private-token" not in request.headers
    assert request.url.raw_path == b"/api/v4/projects/groupe%2Fjeu"


async def test_un_identifiant_numerique_de_projet_fonctionne_aussi(gitlab):
    route = gitlab.router.get(f"{BASE}/api/v4/projects/32662").respond(json={"id": 32662})
    client = GitLabClient(BASE + "/", "t", "32662")
    assert (await client.project())["id"] == 32662
    assert route.called
    await client.aclose()


async def test_la_pagination_par_numero_de_page_est_suivie(gitlab, client):
    pages = {None: ([{"iid": 1}, {"iid": 2}], "2"), "2": ([{"iid": 3}], "3"), "3": ([{"iid": 4}], "")}

    def handler(request: httpx.Request) -> httpx.Response:
        items, next_page = pages[request.url.params.get("page")]
        return httpx.Response(200, json=items, headers={"X-Next-Page": next_page})

    route = gitlab.router.get(f"{API}/issues").mock(side_effect=handler)
    issues = await client.issues()
    assert [i["iid"] for i in issues] == [1, 2, 3, 4]
    assert route.call_count == 3
    first = route.calls[0].request.url.params
    assert (first["per_page"], first["state"], first["scope"]) == ("100", "all", "all")
    assert route.calls[1].request.url.params["state"] == "all", (
        "les filtres sont conservés d'une page à l'autre"
    )


async def test_la_pagination_par_lien_est_suivie(gitlab, client):
    next_url = f"{API}/labels?id_after=2&per_page=100"

    def handler(request: httpx.Request) -> httpx.Response:
        if "id_after" in request.url.params:
            return httpx.Response(200, json=[{"name": "c"}])
        return httpx.Response(
            200, json=[{"name": "a"}, {"name": "b"}], headers={"Link": f'<{next_url}>; rel="next"'}
        )

    gitlab.router.get(f"{API}/labels").mock(side_effect=handler)
    assert [label["name"] for label in await client.labels()] == ["a", "b", "c"]


async def test_la_pagination_s_arrete_a_la_limite_de_pages(gitlab):
    gitlab.router.get(f"{API}/labels").respond(json=[{"name": "x"}], headers={"X-Next-Page": "2"})
    client = GitLabClient(BASE, "t", PROJECT, max_pages=3)
    assert len(await client.labels()) == 3
    await client.aclose()


async def test_updated_after_est_transmis(gitlab, client):
    await client.issues(updated_after=factories.NOW)
    params = gitlab.requests[-1].url.params
    assert params["updated_after"] == factories.NOW.isoformat()
    assert params["order_by"] == "updated_at"


@pytest.mark.parametrize(
    ("status", "fragment"),
    [(401, "token du serveur"), (403, "droits"), (429, "débit"), (500, "en erreur (500)"), (418, "418")],
)
async def test_les_erreurs_http_deviennent_des_messages_lisibles(gitlab, client, status, fragment):
    gitlab.router.get(f"{API}/labels").respond(status)
    with pytest.raises(GitLabError) as error:
        await client.labels()
    assert error.value.status == status
    assert fragment in str(error.value)
    assert "jeton-de-test" not in str(error.value)


async def test_une_panne_reseau_devient_une_erreur_gitlab_sans_secret(gitlab, client):
    gitlab.down = True
    with pytest.raises(GitLabError) as error:
        await client.project()
    assert "injoignable" in str(error.value) and "jeton-de-test" not in str(error.value)
    assert error.value.status is None


async def test_un_delai_depasse_est_signale(gitlab, client):
    gitlab.router.get(f"{API}/labels").mock(side_effect=httpx.ReadTimeout("trop long"))
    with pytest.raises(GitLabError, match="délai dépassé"):
        await client.labels()


async def test_une_reponse_illisible_est_signalee(gitlab, client):
    gitlab.router.get(f"{API}/events").respond(200, text="<html>maintenance</html>")
    with pytest.raises(GitLabError, match="illisible"):
        await client.events()
    gitlab.router.get(f"{API}/labels").respond(200, json={"message": "pas une liste"})
    with pytest.raises(GitLabError, match="inattendue"):
        await client.labels()


async def test_les_ressources_absentes_donnent_none_ou_une_liste_vide(gitlab, client):
    assert await client.issue(999) is None
    assert await client.merge_request(999) is None
    assert await client.member(999) is None
    assert await client.commit("abc123") is None
    gitlab.router.get(f"{API}/repository/commits").respond(404)
    gitlab.router.get(f"{API}/repository/tags").respond(404)
    assert await client.last_commit("main") is None, "dépôt vide"
    assert await client.tags() == []


async def test_un_depot_sans_commit_renvoie_none(gitlab, client):
    assert await client.last_commit("main") is None
    assert gitlab.requests[-1].url.params["ref_name"] == "main"


async def test_membre_present(gitlab, client):
    member = await client.member(2)
    assert member is not None and member["username"] == "theo.wu"


async def test_les_approbations_donnent_des_noms_d_utilisateur(gitlab, client):
    gitlab.approvals[7] = ["louis.landanger", "arthur.jeaugey"]
    assert await client.mr_approvals(7) == ["louis.landanger", "arthur.jeaugey"]
    assert await client.mr_approvals(8) == []


@pytest.mark.parametrize("status", [403, 404])
async def test_des_approbations_indisponibles_valent_aucune_approbation(gitlab, client, status):
    gitlab.approvals[7] = ["louis.landanger"]
    gitlab.overrides["/merge_requests/7/approvals"] = httpx.Response(status)
    assert await client.mr_approvals(7) == []


async def test_des_approbations_en_erreur_serveur_remontent(gitlab, client):
    gitlab.overrides["/merge_requests/7/approvals"] = httpx.Response(502)
    with pytest.raises(GitLabError):
        await client.mr_approvals(7)


async def test_closes_issues(gitlab, client):
    gitlab.closes[7] = [14, 3]
    assert await client.mr_closes_issues(7) == [14, 3]


async def test_les_notes_sont_demandees_dans_l_ordre_chronologique(gitlab, client):
    gitlab.notes[14] = [{"id": 1}, {"id": 2}]
    assert [n["id"] for n in await client.issue_notes(14)] == [1, 2]
    params = gitlab.requests[-1].url.params
    assert (params["sort"], params["order_by"]) == ("asc", "created_at")


async def test_le_client_n_emet_que_des_get(gitlab, client):
    await client.project()
    await client.issues()
    await client.merge_requests()
    await client.pipelines("main")
    await client.events()
    assert {request.method for request in gitlab.requests} == {"GET"}
