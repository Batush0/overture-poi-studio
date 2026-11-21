from typing import Any
from typing import Callable
from typing import Dict
from typing import List
from typing import Optional
from typing import Sequence
from typing import Tuple

from src.bounding_box import BoundingBox
from src.division_service import DivisionService
from src.overture_release_resolver import OvertureReleaseResolver
from src.overture_sql_builder import OvertureSqlBuilder
from src.poi_classifier import PoiClassifier
from src.poi_deduplicator import PoiDeduplicator
from src.poi_record import PoiRecord
from src.poi_row_mapper import PoiRowMapper

ProgressCallback = Optional[Callable[[int], None]]


class OverturePoiFetcher:
    BATCH_SIZE = 250

    def __init__(
        self,
        release_resolver: OvertureReleaseResolver,
        sql_builder: OvertureSqlBuilder,
        row_mapper: PoiRowMapper,
        division_service: DivisionService,
        classifier: PoiClassifier,
        deduplicator: PoiDeduplicator,
    ) -> None:
        self._release_resolver = release_resolver
        self._sql_builder = sql_builder
        self._row_mapper = row_mapper
        self._division_service = division_service
        self._classifier = classifier
        self._deduplicator = deduplicator

    def fetch_by_districts(
        self,
        country_code: str,
        region_code: str,
        district_names: Sequence[str],
        deduplicate: bool = True,
        on_progress: ProgressCallback = None,
    ) -> Tuple[List[PoiRecord], int, int, Dict[str, Any]]:
        districts = self._division_service.get_districts(country_code, region_code)
        selected = self._filter_districts(districts, district_names)
        if not selected:
            return [], 0, 0, {"type": "FeatureCollection", "features": []}
        bbox = self._combine_bbox(selected)
        target_names = [item["name"] for item in selected]
        raw_records = self._run_district_query(
            country_code=country_code,
            region_code=region_code,
            district_names=target_names,
            bbox=bbox,
            on_progress=on_progress,
        )
        boundaries = self._division_service.get_boundaries_geojson(
            country_code=country_code,
            region_code=region_code,
            district_names=target_names,
        )
        final_records, removed = self._post_process(raw_records, deduplicate)
        return final_records, len(raw_records), removed, boundaries

    def fetch_by_bbox(
        self,
        bbox: BoundingBox,
        deduplicate: bool = True,
        on_progress: ProgressCallback = None,
    ) -> Tuple[List[PoiRecord], int, int]:
        connection = self._release_resolver.create_connection()
        try:
            release = self._release_resolver.resolve_latest(connection)
            place_path = self._release_resolver.build_s3_path(release, "places", "place")
            sql, params = self._sql_builder.build_bbox_places_query(place_path, bbox)
            raw_records = self._fetch_rows_stream(connection, sql, params, on_progress)
        finally:
            connection.close()
        final_records, removed = self._post_process(raw_records, deduplicate)
        return final_records, len(raw_records), removed

    def fetch_by_polygon(
        self,
        ring: List[List[float]],
        bbox: BoundingBox,
        deduplicate: bool = True,
        on_progress: ProgressCallback = None,
    ) -> Tuple[List[PoiRecord], int, int]:
        wkt_coords = ", ".join(f"{pt[0]} {pt[1]}" for pt in ring)
        wkt_polygon = f"POLYGON(({wkt_coords}))"
        connection = self._release_resolver.create_connection()
        try:
            release = self._release_resolver.resolve_latest(connection)
            place_path = self._release_resolver.build_s3_path(release, "places", "place")
            sql, params = self._sql_builder.build_polygon_places_query(
                places_path=place_path,
                bbox=bbox,
                wkt_polygon=wkt_polygon,
            )
            raw_records = self._fetch_rows_stream(connection, sql, params, on_progress)
        finally:
            connection.close()
        final_records, removed = self._post_process(raw_records, deduplicate)
        return final_records, len(raw_records), removed

    def _run_district_query(
        self,
        country_code: str,
        region_code: str,
        district_names: Sequence[str],
        bbox: BoundingBox,
        on_progress: ProgressCallback = None,
    ) -> List[PoiRecord]:
        connection = self._release_resolver.create_connection()
        try:
            release = self._release_resolver.resolve_latest(connection)
            div_path = self._release_resolver.build_s3_path(release, "divisions", "division_area")
            place_path = self._release_resolver.build_s3_path(release, "places", "place")
            sql, params = self._sql_builder.build_district_places_query(
                divisions_path=div_path,
                places_path=place_path,
                country_code=country_code,
                region_code=region_code,
                district_names=district_names,
                bbox=bbox,
            )
            return self._fetch_rows_stream(connection, sql, params, on_progress)
        finally:
            connection.close()

    def _fetch_rows_stream(
        self,
        connection: Any,
        sql: str,
        params: Sequence[Any],
        on_progress: ProgressCallback,
    ) -> List[PoiRecord]:
        cursor = connection.execute(sql, params)
        records: List[PoiRecord] = []
        while True:
            batch = cursor.fetchmany(self.BATCH_SIZE)
            if not batch:
                break
            records.extend(self._row_mapper.map_row(row) for row in batch)
            if on_progress:
                on_progress(len(records))
        if on_progress and not records:
            on_progress(0)
        return records

    def _post_process(
        self,
        records: List[PoiRecord],
        deduplicate: bool,
    ) -> Tuple[List[PoiRecord], int]:
        enriched = [self._classifier.enrich(item) for item in records]
        if not deduplicate:
            return enriched, 0
        return self._deduplicator.deduplicate(enriched)

    def _filter_districts(
        self,
        districts: List[Dict[str, Any]],
        names: Sequence[str],
    ) -> List[Dict[str, Any]]:
        if not names:
            return districts
        wanted = set(names)
        return [item for item in districts if item["name"] in wanted]

    def _combine_bbox(self, districts: List[Dict[str, Any]]) -> BoundingBox:
        return BoundingBox(
            min_lon=min(item["bbox"]["min_lon"] for item in districts),
            min_lat=min(item["bbox"]["min_lat"] for item in districts),
            max_lon=max(item["bbox"]["max_lon"] for item in districts),
            max_lat=max(item["bbox"]["max_lat"] for item in districts),
        )
