"""Réception des webhooks GitLab. Un webhook est un signal de relecture, jamais une donnée."""

from __future__ import annotations

import json
import logging
import time
from collections import OrderedDict
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.config import Settings
from app.core.webhooks import verify_webhook
from app.gitlab.sync import Synchronizer

log = logging.getLogger(__name__)

router = APIRouter()

MAX_BODY_BYTES = 5 * 1024 * 1024
REMEMBERED_DELIVERIES = 512
ISSUE_KINDS = {"issue", "work_item", "confidential_issue"}


class DeliveryMemory:
    """Retient les dernières livraisons pour ignorer les doublons (GitLab renvoie en cas d'échec)."""

    def __init__(self, size: int = REMEMBERED_DELIVERIES) -> None:
        self._size = size
        self._seen: OrderedDict[str, None] = OrderedDict()

    def already_seen(self, key: str) -> bool:
        if key in self._seen:
            self._seen.move_to_end(key)
            return True
        self._seen[key] = None
        while len(self._seen) > self._size:
            self._seen.popitem(last=False)
        return False


def signal_for(payload: dict[str, Any]) -> tuple[str, int | None]:
    """Ce qu'il faut relire après ce webhook : (nature, iid de l'issue si elle seule est concernée)."""
    kind = str(payload.get("object_kind") or payload.get("event_type") or "other")
    attributes = payload.get("object_attributes") or {}
    if kind in ISSUE_KINDS:
        return _issue_signal(attributes.get("iid"))
    if kind in {"note", "confidential_note"} and payload.get("issue"):
        return _issue_signal((payload.get("issue") or {}).get("iid"))
    return kind, None


def _issue_signal(iid: Any) -> tuple[str, int | None]:
    try:
        return "issue", int(iid)
    except (TypeError, ValueError):
        return "other", None


def concerns_other_project(payload: dict[str, Any], sync: Synchronizer, settings: Settings) -> bool:
    """Vrai seulement si le webhook désigne clairement un autre projet que le nôtre."""
    project = payload.get("project") or {}
    known = sync.raw.project or {}
    sent_id, sent_path = project.get("id"), project.get("path_with_namespace")
    if sent_id is not None and known.get("id") is not None:
        return int(sent_id) != int(known["id"])
    if sent_path:
        expected = known.get("path_with_namespace") or settings.gitlab_project
        if not str(expected).isdigit():
            return str(sent_path) != str(expected)
    return False


@router.post("/hooks/gitlab")
async def gitlab_webhook(request: Request) -> dict[str, str]:
    settings: Settings = request.app.state.settings
    sync: Synchronizer = request.app.state.sync
    deliveries: DeliveryMemory = request.app.state.deliveries

    declared = request.headers.get("content-length", "0")
    if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Corps trop volumineux")
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Corps trop volumineux")

    result = verify_webhook(
        request.headers,
        body,
        secret=settings.gitlab_webhook_secret.get_secret_value() or None,
        signing_token=settings.gitlab_webhook_signing_token.get_secret_value() or None,
        now=time.time(),
    )
    if not result.ok:
        log.warning("Webhook refusé (%s)", result.reason)
        raise HTTPException(status_code=403, detail="Webhook refusé")

    try:
        payload = json.loads(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Corps illisible") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Corps inattendu")

    delivery = (
        request.headers.get("idempotency-key")
        or request.headers.get("x-gitlab-event-uuid")
        or request.headers.get("webhook-id")
    )
    if delivery and deliveries.already_seen(delivery):
        return {"status": "duplicate"}

    if concerns_other_project(payload, sync, settings):
        return {"status": "ignored"}

    sync.note_webhook()
    sync.signal(*signal_for(payload))
    return {"status": "ok"}
