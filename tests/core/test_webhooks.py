import base64

from app.core.webhooks import sign, verify_webhook

SECRET = "un-secret-partage"
SIGNING_TOKEN = "whsec_" + base64.b64encode(b"cle-de-signature-de-32-octets!!!").decode()
BODY = b'{"object_kind":"issue","object_attributes":{"iid":12}}'
NOW = 1_795_000_000.0


def signed_headers(
    body: bytes = BODY, *, timestamp: float = NOW, message_id: str = "msg_1", token=SIGNING_TOKEN
):
    ts = str(int(timestamp))
    return {
        "webhook-id": message_id,
        "webhook-timestamp": ts,
        "webhook-signature": sign(token, message_id, ts, body),
    }


def verify(headers, body: bytes = BODY, *, secret=None, signing_token=None, now: float = NOW):
    return verify_webhook(headers, body, secret=secret, signing_token=signing_token, now=now)


# --- rien de configuré --------------------------------------------------------------------------


def test_sans_secret_configure_tout_est_refuse():
    result = verify({"X-Gitlab-Token": "nimporte"}, secret=None, signing_token=None)
    assert not result.ok and result.reason == "not_configured"
    assert not verify({}, secret="", signing_token="").ok


# --- secret simple ------------------------------------------------------------------------------


def test_le_bon_secret_est_accepte():
    assert verify({"X-Gitlab-Token": SECRET}, secret=SECRET).ok


def test_le_nom_de_l_en_tete_est_insensible_a_la_casse():
    assert verify({"x-gitlab-token": SECRET}, secret=SECRET).ok
    assert verify({"X-GITLAB-TOKEN": SECRET}, secret=SECRET).ok


def test_un_mauvais_secret_est_refuse():
    for received in ["", "autre", SECRET + "x", SECRET[:-1], SECRET.upper()]:
        result = verify({"X-Gitlab-Token": received}, secret=SECRET)
        assert not result.ok and result.reason == "bad_token"


def test_l_absence_d_en_tete_est_refusee():
    assert verify({}, secret=SECRET).reason == "bad_token"


def test_un_secret_avec_accents_ne_fait_pas_planter_la_comparaison():
    assert verify({"X-Gitlab-Token": "sécrêt"}, secret="sécrêt").ok
    assert not verify({"X-Gitlab-Token": "secret"}, secret="sécrêt").ok


# --- signature ----------------------------------------------------------------------------------


def test_une_signature_valide_est_acceptee():
    assert verify(signed_headers(), signing_token=SIGNING_TOKEN).ok


def test_la_signature_suit_la_convention_standard_webhooks():
    # Vecteur calculé à la main : HMAC-SHA256 de "msg_1.1795000000.<corps>" avec la clé décodée.
    import hashlib
    import hmac

    key = base64.b64decode(SIGNING_TOKEN.removeprefix("whsec_"))
    expected = base64.b64encode(hmac.new(key, b"msg_1.1795000000." + BODY, hashlib.sha256).digest()).decode()
    assert sign(SIGNING_TOKEN, "msg_1", "1795000000", BODY) == f"v1,{expected}"


def test_un_corps_altere_est_refuse():
    result = verify(signed_headers(), BODY.replace(b"12", b"13"), signing_token=SIGNING_TOKEN)
    assert not result.ok and result.reason == "bad_signature"


def test_un_identifiant_ou_un_horodatage_modifie_invalide_la_signature():
    headers = signed_headers()
    assert verify({**headers, "webhook-id": "msg_2"}, signing_token=SIGNING_TOKEN).reason == "bad_signature"
    shifted = {**headers, "webhook-timestamp": str(int(NOW) + 1)}
    assert verify(shifted, signing_token=SIGNING_TOKEN).reason == "bad_signature"


def test_un_rejeu_tardif_est_refuse():
    headers = signed_headers(timestamp=NOW - 301)
    result = verify(headers, signing_token=SIGNING_TOKEN)
    assert not result.ok and result.reason == "stale_timestamp"
    assert verify(signed_headers(timestamp=NOW - 299), signing_token=SIGNING_TOKEN).ok


def test_un_horodatage_trop_dans_le_futur_est_refuse():
    assert (
        verify(signed_headers(timestamp=NOW + 301), signing_token=SIGNING_TOKEN).reason == "stale_timestamp"
    )
    assert verify(signed_headers(timestamp=NOW + 299), signing_token=SIGNING_TOKEN).ok


def test_un_horodatage_illisible_est_refuse():
    headers = {**signed_headers(), "webhook-timestamp": "hier"}
    assert verify(headers, signing_token=SIGNING_TOKEN).reason == "bad_timestamp"


def test_des_en_tetes_de_signature_manquants_sont_refuses():
    full = signed_headers()
    for missing in full:
        partial = {k: v for k, v in full.items() if k != missing}
        assert verify(partial, signing_token=SIGNING_TOKEN).reason == "missing_signature"


def test_une_signature_faite_avec_une_autre_cle_est_refusee():
    other = "whsec_" + base64.b64encode(b"une-autre-cle-de-32-octets-!!!!!").decode()
    assert verify(signed_headers(token=other), signing_token=SIGNING_TOKEN).reason == "bad_signature"


def test_plusieurs_signatures_dans_l_en_tete_une_seule_suffit():
    headers = signed_headers()
    headers["webhook-signature"] = "v1,AAAA " + headers["webhook-signature"]
    assert verify(headers, signing_token=SIGNING_TOKEN).ok


def test_un_jeton_sans_prefixe_est_accepte():
    bare = SIGNING_TOKEN.removeprefix("whsec_")
    assert verify(signed_headers(token=bare), signing_token=bare).ok
    # Le préfixe ne change pas la clé : les deux écritures signent pareil.
    assert verify(signed_headers(token=bare), signing_token=SIGNING_TOKEN).ok


def test_un_jeton_qui_n_est_pas_du_base64_sert_de_cle_brute():
    token = "pas du base64 !"
    assert verify(signed_headers(token=token), signing_token=token).ok


# --- les deux mécanismes ------------------------------------------------------------------------


def test_quand_les_deux_sont_configures_les_deux_sont_exiges():
    both = {**signed_headers(), "X-Gitlab-Token": SECRET}
    assert verify(both, secret=SECRET, signing_token=SIGNING_TOKEN).ok
    assert verify(signed_headers(), secret=SECRET, signing_token=SIGNING_TOKEN).reason == "bad_token"
    only_secret = {"X-Gitlab-Token": SECRET}
    assert verify(only_secret, secret=SECRET, signing_token=SIGNING_TOKEN).reason == "missing_signature"
