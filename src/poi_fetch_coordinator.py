import json
import queue
import threading
from typing import Any
from typing import Callable
from typing import Dict
from typing import Iterator
from typing import List
from typing import Optional

from fastapi import HTTPException

from src.bounding_box import BoundingBox
from src.country_catalog import CountryCatalog
from src.fetch_poi_request import FetchPoiRequest
from src.overture_poi_fetcher import OverturePoiFetcher
from src.poi_cache_store import PoiCacheStore

ProgressCallback = Optional[Callable[[int], None]]


class PoiFetchCoordinator:
    def __init__(
        self,
        catalog: CountryCatalog,
        cache_store: PoiCacheStore,
        poi_fetcher: OverturePoiFetcher,
    ) -> None:
        self._catalog = catalog
        self._cache_store = cache_store
        self._poi_fetcher = poi_fetcher

    def fetch(
        self,
        request: FetchPoiRequest,
        on_progress: ProgressCallback = None,
    ) -> Dict[str, Any]:
        if request.polygon and len(request.polygon) >= 3:
            return self._fetch_polygon(request, on_progress)
        if request.bbox:
            return self._fetch_bbox(request, on_progress)
        if not request.region_code:
            raise HTTPException(status_code=400, detail="Bölge veya harita alanı seçmelisin.")
        return self._fetch_districts(request, on_progress)

    def stream_fetch(self, request: FetchPoiRequest) -> Iterator[str]:
        event_queue: queue.Queue[Dict[str, Any]] = queue.Queue()

        def _on_progress(count: int) -> None:
            event_queue.put({"type": "progress", "count": count})

        def _worker() -> None:
            try:
                payload = self.fetch(request, on_progress=_on_progress)
                event_queue.put({"type": "result", "payload": payload})
            except HTTPException as exc:
                event_queue.put({"type": "error", "detail": str(exc.detail)})
            except Exception as exc:
                event_queue.put({"type": "error", "detail": str(exc)})

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()
        while True:
            item = event_queue.get()
            yield json.dumps(item, ensure_ascii=False) + "\n"
            if item["type"] in ("result", "error"):
                break

    def _fetch_districts(
        self,
        request: FetchPoiRequest,
        on_progress: ProgressCallback,
    ) -> Dict[str, Any]:
        country = request.country_code.strip().upper()
        sorted_districts = sorted(set(request.districts))
        label = f"{country}|{request.region_code}|{','.join(sorted_districts)}"
        cache_key = self._cache_store.build_key(label, request.deduplicate)
        if not request.force_refresh:
            cached = self._cache_store.load(cache_key)
            if cached:
                cached["meta"]["fromCache"] = True
                if on_progress:
                    on_progress(int(cached["meta"].get("count", 0)))
                return cached
        records, raw_count, removed, boundaries = self._poi_fetcher.fetch_by_districts(
            country_code=country,
            region_code=request.region_code or "",
            district_names=sorted_districts,
            deduplicate=request.deduplicate,
            on_progress=on_progress,
        )
        region_name = self._catalog.get_region_name(request.region_code or "")
        sub_label = ", ".join(sorted_districts) if sorted_districts else "Tüm Bölgeler"
        payload = self._cache_store.encode_response(
            records=records,
            raw_count=raw_count,
            removed_duplicates=removed,
            title=f"{region_name} · {sub_label}",
            country_code=country,
            region_code=request.region_code or "",
            districts=sorted_districts,
            boundaries=boundaries,
            from_cache=False,
        )
        self._cache_store.save(cache_key, payload)
        return payload

    def _fetch_polygon(
        self,
        request: FetchPoiRequest,
        on_progress: ProgressCallback,
    ) -> Dict[str, Any]:
        ring = self._normalize_ring(request.polygon or [])
        lons = [pt[0] for pt in ring]
        lats = [pt[1] for pt in ring]
        bbox = BoundingBox(
            min_lon=min(lons),
            min_lat=min(lats),
            max_lon=max(lons),
            max_lat=max(lats),
        )
        records, raw_count, removed = self._poi_fetcher.fetch_by_polygon(
            ring=ring,
            bbox=bbox,
            deduplicate=request.deduplicate,
            on_progress=on_progress,
        )
        center_lat = sum(lats[:-1]) / max(len(lats) - 1, 1)
        center_lon = sum(lons[:-1]) / max(len(lons) - 1, 1)
        title = f"Poligon ({center_lat:.3f}, {center_lon:.3f})"
        boundaries = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"name": "Selected Polygon"},
                "geometry": {"type": "Polygon", "coordinates": [ring]},
            }],
        }
        payload = self._cache_store.encode_response(
            records=records,
            raw_count=raw_count,
            removed_duplicates=removed,
            title=title,
            country_code="",
            region_code="",
            districts=[],
            boundaries=boundaries,
            from_cache=False,
        )
        self._cache_store.save(self._cache_store.build_key(title, request.deduplicate), payload)
        return payload

    def _fetch_bbox(
        self,
        request: FetchPoiRequest,
        on_progress: ProgressCallback,
    ) -> Dict[str, Any]:
        box = request.bbox or {}
        bbox = BoundingBox(
            min_lon=float(box["min_lon"]),
            min_lat=float(box["min_lat"]),
            max_lon=float(box["max_lon"]),
            max_lat=float(box["max_lat"]),
        )
        records, raw_count, removed = self._poi_fetcher.fetch_by_bbox(
            bbox=bbox,
            deduplicate=request.deduplicate,
            on_progress=on_progress,
        )
        title = f"Alan ({bbox.min_lat:.3f}, {bbox.min_lon:.3f})"
        payload = self._cache_store.encode_response(
            records=records,
            raw_count=raw_count,
            removed_duplicates=removed,
            title=title,
            country_code="",
            region_code="",
            districts=[],
            boundaries=self._bbox_to_geojson(bbox),
            from_cache=False,
        )
        self._cache_store.save(self._cache_store.build_key(title, request.deduplicate), payload)
        return payload

    def _normalize_ring(self, points: List[List[float]]) -> List[List[float]]:
        ring = [[round(float(pt[0]), 6), round(float(pt[1]), 6)] for pt in points]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        return ring

    def _bbox_to_geojson(self, bbox: BoundingBox) -> Dict[str, Any]:
        coords = [[
            [bbox.min_lon, bbox.min_lat],
            [bbox.max_lon, bbox.min_lat],
            [bbox.max_lon, bbox.max_lat],
            [bbox.min_lon, bbox.max_lat],
            [bbox.min_lon, bbox.min_lat],
        ]]
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"name": "Selected Area"},
                "geometry": {"type": "Polygon", "coordinates": coords},
            }],
        }
