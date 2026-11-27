"""Vérification des webhooks GitLab. Fonctions pures : ni réseau, ni horloge implicite."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

Reason = Literal[
    "not_configured",
    "bad_token",
    "missing_signature",
    "bad_timestamp",
    "stale_timestamp",
    "bad_signature",
]

SIGNING_PREFIX = "whsec_"
DEFAULT_TOLERANCE_SECONDS = 300


@dataclass(frozen=True)
class Verification:
    ok: bool
    reason: Reason | None = None


def _signing_key(token: str) -> bytes:
    """Clé HMAC : le jeton sans son préfixe, décodé en base64 (ou tel quel s'il n'est pas en base64)."""
    raw = token.removeprefix(SIGNING_PREFIX)
    try:
        return base64.b64decode(raw + "=" * (-len(raw) % 4), validate=True)
    except (binascii.Error, ValueError):
        return raw.encode()


def sign(signing_token: str, message_id: str, timestamp: str, body: bytes) -> str:
    """Signature attendue, au format `v1,<base64>` de la convention Standard Webhooks."""
    signed = f"{message_id}.{timestamp}.".encode() + body
    digest = hmac.new(_signing_key(signing_token), signed, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def _check_secret(headers: Mapping[str, str], secret: str) -> Verification:
    received = headers.get("x-gitlab-token", "")
    if not received or not hmac.compare_digest(received.encode(), secret.encode()):
        return Verification(False, "bad_token")
    return Verification(True)


def _check_signature(
    headers: Mapping[str, str], body: bytes, signing_token: str, now: float, tolerance: int
) -> Verification:
    message_id = headers.get("webhook-id", "")
    timestamp = headers.get("webhook-timestamp", "")
    received = headers.get("webhook-signature", "")
    if not message_id or not timestamp or not received:
        return Verification(False, "missing_signature")
    try:
        sent_at = int(timestamp)
    except ValueError:
        return Verification(False, "bad_timestamp")
    if abs(now - sent_at) > tolerance:
        return Verification(False, "stale_timestamp")

    expected = sign(signing_token, message_id, timestamp, body).encode()
    # L'en-tête peut porter plusieurs signatures séparées par des espaces (rotation de clé).
    matches = [hmac.compare_digest(candidate.encode(), expected) for candidate in received.split()]
    if not any(matches):
        return Verification(False, "bad_signature")
    return Verification(True)


def verify_webhook(
    headers: Mapping[str, str],
    body: bytes,
    *,
    secret: str | None,
    signing_token: str | None,
    now: float,
    tolerance: int = DEFAULT_TOLERANCE_SECONDS,
) -> Verification:
    """Accepte un webhook seulement si chaque mécanisme configuré le valide.

    `secret` correspond à l'en-tête `X-Gitlab-Token`, `signing_token` à la signature HMAC
    (`webhook-id`, `webhook-timestamp`, `webhook-signature`). Sans aucun des deux, tout est refusé.
    `now` est l'heure courante en secondes Unix.
    """
    if not secret and not signing_token:
        return Verification(False, "not_configured")

    lowered = {key.lower(): value for key, value in headers.items()}
    if secret:
        result = _check_secret(lowered, secret)
        if not result.ok:
            return result
    if signing_token:
        result = _check_signature(lowered, body, signing_token, now, tolerance)
        if not result.ok:
            return result
    return Verification(True)
