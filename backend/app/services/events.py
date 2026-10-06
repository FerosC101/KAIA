"""In-process pub/sub for live KAIA Reader status (consumed by the WebSocket endpoint).

Single-process only; for multi-worker deployments swap for Redis pub/sub behind the
same `publish` / `subscribe` interface.
"""

import asyncio
from collections import defaultdict
from contextlib import contextmanager


class ReaderEventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._last_event: dict[str, dict] = {}

    def publish(self, reader_code: str, event: dict) -> None:
        self._last_event[reader_code] = event
        for queue in list(self._subscribers[reader_code]):
            queue.put_nowait(event)

    def last_event(self, reader_code: str) -> dict | None:
        return self._last_event.get(reader_code)

    @contextmanager
    def subscribe(self, reader_code: str):
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[reader_code].add(queue)
        try:
            yield queue
        finally:
            self._subscribers[reader_code].discard(queue)

    @property
    def connection_count(self) -> int:
        return sum(len(s) for s in self._subscribers.values())


reader_events = ReaderEventBus()
