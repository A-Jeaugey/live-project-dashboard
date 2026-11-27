"""Routes de lecture consommées par l'interface. Formes : `app/core/models.py`."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.models import IssueDetail, Me, Snapshot, StreamEvent
from app.gitlab.bus import EventBus
from app.gitlab.client import GitLabError
from app.gitlab.sync import Synchronizer
from app.web.auth import current_user, me_from_session

router = APIRouter()

PING_SECONDS = 20.0
User = Annotated[dict[str, Any], Depends(current_user)]


def _sse(event: StreamEvent) -> str:
    return f"data: {event.model_dump_json()}\n\n"


async def event_stream(
    bus: EventBus, current_version: Callable[[], int], ping_seconds: float = PING_SECONDS
) -> AsyncIterator[str]:
    """Flux SSE : un `hello` à la connexion, un `changed` par nouvelle version, un ping de maintien."""
    queue = bus.subscribe()
    try:
        yield _sse(StreamEvent(type="hello", version=current_version(), activity=[]))
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=ping_seconds)
            except TimeoutError:
                yield ": ping\n\n"
            else:
                yield _sse(event)
    finally:
        bus.unsubscribe(queue)


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/me")
async def me(request: Request, user: User) -> Me:
    return me_from_session(user, request.app.state.config)


@router.get("/api/snapshot")
async def snapshot(request: Request, user: User) -> Snapshot:
    sync: Synchronizer = request.app.state.sync
    return sync.snapshot


@router.get("/api/issues/{iid}")
async def issue_detail(iid: int, request: Request, user: User) -> IssueDetail:
    sync: Synchronizer = request.app.state.sync
    try:
        detail = await sync.issue_detail(iid)
    except GitLabError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if detail is None:
        raise HTTPException(status_code=404, detail=f"L'issue #{iid} n'existe pas")
    return detail


@router.get("/api/stream")
async def stream(request: Request, user: User) -> StreamingResponse:
    sync: Synchronizer = request.app.state.sync
    return StreamingResponse(
        event_stream(sync.bus, lambda: sync.snapshot.version),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
