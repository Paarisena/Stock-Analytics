import time


class ModelCache:
    """Simple in-memory cache with 24-hour TTL."""

    def __init__(self, ttl_seconds: int = 86400):
        self.ttl = ttl_seconds
        self._cache: dict[str, dict] = {}

    def get(self, symbol: str) -> dict | None:
        key = symbol.upper()
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["timestamp"] < self.ttl:
                return entry["data"]
            else:
                del self._cache[key]
        return None

    def set(self, symbol: str, data: dict):
        key = symbol.upper()
        self._cache[key] = {
            "data": data,
            "timestamp": time.time(),
        }

    def clear(self):
        self._cache.clear()

    def size(self) -> int:
        return len(self._cache)