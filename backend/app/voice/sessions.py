"""Sesiones de conversación en memoria, con TTL y tope de tamaño (evita crecer sin límite).

Una sesión queda atada a una ubicación/personaje en el servidor: el cliente no puede cambiar de
persona a mitad de conversación. Los ids son tokens aleatorios no adivinables.
Para varias réplicas de la API habría que mover esto a Redis.
"""

import asyncio
import secrets
import time
from collections import OrderedDict, deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from app.voice.ports import ChatMessage

EvictCallback = Callable[[str], Awaitable[None]]


@dataclass
class VoiceSession:
    id: str
    location_id: str
    character_id: str
    history: deque[ChatMessage]
    last_seen: float = field(default_factory=time.monotonic)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)  # un turno a la vez por sesión


class SessionStore:
    def __init__(
        self, ttl_s: int, max_sessions: int, history_turns: int, on_evict: EvictCallback
    ) -> None:
        self._ttl_s = ttl_s
        self._max = max_sessions
        self._history_len = history_turns * 2
        self._on_evict = on_evict
        self._sessions: OrderedDict[str, VoiceSession] = OrderedDict()  # orden = último uso

    @property
    def ttl_s(self) -> int:
        return self._ttl_s

    async def create(self, location_id: str, character_id: str) -> VoiceSession:
        await self.purge_expired()
        while len(self._sessions) >= self._max:
            oldest_id = next(iter(self._sessions))
            await self.delete(oldest_id)
        session = VoiceSession(
            id=secrets.token_urlsafe(24),
            location_id=location_id,
            character_id=character_id,
            history=deque(maxlen=self._history_len),
        )
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> VoiceSession | None:
        session = self._sessions.get(session_id)
        if session is None or self._expired(session):
            return None
        session.last_seen = time.monotonic()
        self._sessions.move_to_end(session_id)
        return session

    async def delete(self, session_id: str) -> None:
        if self._sessions.pop(session_id, None) is not None:
            await self._on_evict(session_id)

    async def purge_expired(self) -> None:
        for sid in [sid for sid, s in self._sessions.items() if self._expired(s)]:
            await self.delete(sid)

    async def clear(self) -> None:
        for sid in list(self._sessions):
            await self.delete(sid)

    def _expired(self, session: VoiceSession) -> bool:
        return time.monotonic() - session.last_seen > self._ttl_s
