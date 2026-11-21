import json
from pathlib import Path
from typing import Any
from typing import Dict
from typing import List
from typing import Sequence

from src.country_catalog import CountryCatalog
from src.overture_release_resolver import OvertureReleaseResolver
from src.overture_sql_builder import OvertureSqlBuilder


class DivisionService:
    def __init__(
        self,
        release_resolver: OvertureReleaseResolver,
        sql_builder: OvertureSqlBuilder,
        catalog: CountryCatalog,
        cache_dir: Path,
    ) -> None:
        self._release_resolver = release_resolver
        self._sql_builder = sql_builder
        self._catalog = catalog
        self._cache_dir = cache_dir

    def get_regions(
        self,
        country_code: str,
        force_refresh: bool = False,
    ) -> List[Dict[str, str]]:
        code = country_code.upper()
        if code == "TR" and not force_refresh:
            return self._catalog.list_turkey_regions()
        cache_path = self._cache_dir / f"regions_{code}.json"
        if cache_path.exists() and not force_refresh:
            return json.loads(cache_path.read_text(encoding="utf-8"))
        regions = self._query_regions(code)
        self._save_json(cache_path, regions)
        return regions

    def get_districts(
        self,
        country_code: str,
        region_code: str,
        force_refresh: bool = False,
    ) -> List[Dict[str, Any]]:
        code = country_code.upper()
        cache_path = self._cache_dir / f"districts_{code}_{region_code}.json"
        if cache_path.exists() and not force_refresh:
            return json.loads(cache_path.read_text(encoding="utf-8"))
        districts = self._query_districts(code, region_code)
        self._save_json(cache_path, districts)
        return districts

    def get_boundaries_geojson(
        self,
        country_code: str,
        region_code: str,
        district_names: Sequence[str],
    ) -> Dict[str, Any]:
        districts = self.get_districts(country_code, region_code)
        selected = set(district_names)
        features = [
            {
                "type": "Feature",
                "properties": {"name": item["name"], "region": region_code},
                "geometry": item["geojson"],
            }
            for item in districts
            if (not selected or item["name"] in selected) and item.get("geojson")
        ]
        return {"type": "FeatureCollection", "features": features}

    def _query_regions(self, country_code: str) -> List[Dict[str, str]]:
        connection = self._release_resolver.create_connection()
        try:
            release = self._release_resolver.resolve_latest(connection)
            path = self._release_resolver.build_s3_path(release, "divisions", "division_area")
            sql, params = self._sql_builder.build_regions_query(path, country_code)
            rows = connection.execute(sql, params).fetchall()
            return [{"code": str(row[0]), "name": str(row[1])} for row in rows]
        finally:
            connection.close()

    def _query_districts(
        self,
        country_code: str,
        region_code: str,
    ) -> List[Dict[str, Any]]:
        connection = self._release_resolver.create_connection()
        try:
            release = self._release_resolver.resolve_latest(connection)
            path = self._release_resolver.build_s3_path(release, "divisions", "division_area")
            sql, params = self._sql_builder.build_districts_query(path, country_code, region_code)
            rows = connection.execute(sql, params).fetchall()
            return [
                {
                    "name": str(row[0]),
                    "bbox": {
                        "min_lon": float(row[1]),
                        "min_lat": float(row[2]),
                        "max_lon": float(row[3]),
                        "max_lat": float(row[4]),
                    },
                    "geojson": json.loads(row[5]) if row[5] else None,
                }
                for row in rows
            ]
        finally:
            connection.close()

    def _save_json(
        self,
        path: Path,
        payload: Any,
    ) -> None:
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
