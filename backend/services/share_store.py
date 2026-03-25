import time
import uuid
import threading
import logging
from typing import Optional

logger = logging.getLogger(__name__)

SHARE_TTL = 604800


class ShareSnapshot:
    def __init__(self, share_id: str, messages: list, schema: dict, files: list[str]):
        self.share_id = share_id
        self.messages = messages
        self.schema = schema
        self.files = files
        self.created_at = time.time()

    def is_expired(self) -> bool:
        return (time.time() - self.created_at) > SHARE_TTL


class ShareStore:
    _instance: Optional["ShareStore"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "ShareStore":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._shares: dict[str, ShareSnapshot] = {}
                    cls._instance._shares_lock = threading.Lock()
        return cls._instance

    def create_share(self, messages: list, schema: dict, files: list[str]) -> str:
        share_id = str(uuid.uuid4())[:8]
        with self._shares_lock:
            self._shares[share_id] = ShareSnapshot(share_id, messages, schema, files)
        logger.info(f"Created share: {share_id}")
        return share_id

    def get_share(self, share_id: str) -> Optional[ShareSnapshot]:
        with self._shares_lock:
            snapshot = self._shares.get(share_id)
            if snapshot is None:
                return None
            if snapshot.is_expired():
                del self._shares[share_id]
                logger.info(f"Share expired: {share_id}")
                return None
            return snapshot

    def cleanup_expired(self) -> int:
        expired = []
        with self._shares_lock:
            for sid, snap in list(self._shares.items()):
                if snap.is_expired():
                    expired.append(sid)
            for sid in expired:
                del self._shares[sid]
        return len(expired)


share_store = ShareStore()
