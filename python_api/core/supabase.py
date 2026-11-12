"""A small client for Supabase's REST API (PostgREST), using the service role key.

Only what the Python features need: read rows (paged, with `in` lists chunked so URLs stay short)
and insert rows. The service role bypasses row-level security, so callers must check who is asking.
"""

from collections.abc import Iterable, Iterator, Sequence
from typing import Any

import httpx

from python_api.core import settings

PAGE_SIZE = 1000
IN_CHUNK_SIZE = 50


def chunked(values: Sequence[str], size: int = IN_CHUNK_SIZE) -> Iterator[list[str]]:
    for i in range(0, len(values), size):
        yield list(values[i : i + size])


def in_filter(values: Iterable[str]) -> str:
    return f"in.({','.join(values)})"


class SupabaseRest:
    def __init__(self, url: str, key: str, client: httpx.Client | None = None):
        self._base = f"{url.rstrip('/')}/rest/v1"
        self._client = client or httpx.Client(timeout=30)
        self._headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    @classmethod
    def from_env(cls) -> "SupabaseRest":
        return cls(settings.supabase_url(), settings.supabase_service_key())

    def select(
        self, table: str, columns: str, filters: dict[str, str] | None = None
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        while True:
            params = {"select": columns, "limit": str(PAGE_SIZE), "offset": str(len(rows))}
            params.update(filters or {})
            response = self._client.get(f"{self._base}/{table}", params=params, headers=self._headers)
            self._raise_for_error(response, f"read {table}")
            page = response.json()
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                return rows

    def select_in(
        self,
        table: str,
        columns: str,
        column: str,
        values: Sequence[str],
        filters: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        """`select` where `column` is one of `values`, asked for in chunks."""
        rows: list[dict[str, Any]] = []
        for chunk in chunked(values):
            rows.extend(self.select(table, columns, {**(filters or {}), column: in_filter(chunk)}))
        return rows

    def insert(self, table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not rows:
            return []
        response = self._client.post(
            f"{self._base}/{table}",
            json=rows,
            headers={**self._headers, "Prefer": "return=representation"},
        )
        self._raise_for_error(response, f"insert into {table}")
        return response.json()

    @staticmethod
    def _raise_for_error(response: httpx.Response, what: str) -> None:
        if response.is_success:
            return
        raise RuntimeError(f"Supabase could not {what}: {response.status_code} {response.text}")
