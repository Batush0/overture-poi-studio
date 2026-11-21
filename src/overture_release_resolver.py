import re
from typing import Optional

import duckdb


class OvertureReleaseResolver:
    STAC_CATALOG_URL = "https://stac.overturemaps.org/catalog.json"
    FALLBACK_RELEASE = "2026-11-18.0"
    RELEASE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}\.\d+$")
    S3_REGION = "us-west-2"

    def __init__(self) -> None:
        self._cached_release: Optional[str] = None

    def create_connection(self) -> duckdb.DuckDBPyConnection:
        connection = duckdb.connect()
        connection.execute("INSTALL httpfs;")
        connection.execute("INSTALL spatial;")
        connection.execute("LOAD httpfs;")
        connection.execute("LOAD spatial;")
        connection.execute(f"SET s3_region = '{self.S3_REGION}';")
        return connection

    def resolve_latest(
        self,
        connection: duckdb.DuckDBPyConnection,
    ) -> str:
        if self._cached_release:
            return self._cached_release
        try:
            row = connection.execute(
                f"SELECT latest FROM read_json('{self.STAC_CATALOG_URL}')"
            ).fetchone()
            if row and row[0]:
                candidate = str(row[0])
                if self.RELEASE_PATTERN.match(candidate):
                    self._cached_release = candidate
                    return candidate
        except duckdb.Error:
            pass
        self._cached_release = self.FALLBACK_RELEASE
        return self._cached_release

    def build_s3_path(
        self,
        release: str,
        theme: str,
        feature_type: str,
    ) -> str:
        return (
            f"s3://overturemaps-us-west-2/release/{release}"
            f"/theme={theme}/type={feature_type}/*"
        )
