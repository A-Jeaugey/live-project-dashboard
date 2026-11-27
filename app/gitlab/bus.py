"""Bus d'événements en mémoire : la synchro publie, le flux SSE (et plus tard le bot) écoutent."""

from __future__ import annotations

import asyncio
import contextlib

from app.core.models import StreamEvent

QUEUE_SIZE = 32


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[StreamEvent]] = set()

    def subscribe(self) -> asyncio.Queue[StreamEvent]:
        queue: asyncio.Queue[StreamEvent] = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[StreamEvent]) -> None:
        self._subscribers.discard(queue)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def publish(self, event: StreamEvent) -> None:
        """Distribue sans jamais bloquer : un abonné trop lent perd le message le plus ancien.

        Ce n'est pas grave : chaque message porte le numéro de version, et l'interface recharge
        l'instantané complet dès qu'elle en voit un nouveau.
        """
        for queue in list(self._subscribers):
            if queue.full():
                with contextlib.suppress(asyncio.QueueEmpty):
                    queue.get_nowait()
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(event)
