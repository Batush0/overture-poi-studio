from pathlib import Path
from typing import Any
from typing import Dict

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Response
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from src.country_catalog import CountryCatalog
from src.division_service import DivisionService
from src.export_poi_request import ExportPoiRequest
from src.export_service import ExportService
from src.fetch_poi_request import FetchPoiRequest
from src.overture_poi_fetcher import OverturePoiFetcher
from src.overture_release_resolver import OvertureReleaseResolver
from src.overture_sql_builder import OvertureSqlBuilder
from src.poi_cache_store import PoiCacheStore
from src.poi_classifier import PoiClassifier
from src.poi_deduplicator import PoiDeduplicator
from src.poi_fetch_coordinator import PoiFetchCoordinator
from src.poi_row_mapper import PoiRowMapper


class ApiApplication:
    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir
        self._catalog = CountryCatalog()
        resolver = OvertureReleaseResolver()
        sql_builder = OvertureSqlBuilder()
        classifier = PoiClassifier()
        deduplicator = PoiDeduplicator()
        self._division_service = DivisionService(
            release_resolver=resolver,
            sql_builder=sql_builder,
            catalog=self._catalog,
            cache_dir=base_dir / "cache" / "divisions",
        )
        self._cache_store = PoiCacheStore(
            cache_dir=base_dir / "cache" / "queries",
            classifier=classifier,
            deduplicator=deduplicator,
        )
        poi_fetcher = OverturePoiFetcher(
            release_resolver=resolver,
            sql_builder=sql_builder,
            row_mapper=PoiRowMapper(),
            division_service=self._division_service,
            classifier=classifier,
            deduplicator=deduplicator,
        )
        self._fetch_coordinator = PoiFetchCoordinator(
            catalog=self._catalog,
            cache_store=self._cache_store,
            poi_fetcher=poi_fetcher,
        )
        self._export_service = ExportService()

    def build(self) -> FastAPI:
        app = FastAPI(title="Overture POI Studio")
        self._register_routes(app)
        app.mount(
            "/",
            StaticFiles(directory=str(self._base_dir / "web"), html=True),
            name="web",
        )
        return app

    def _register_routes(self, app: FastAPI) -> None:
        app.add_api_route("/api/countries", self._list_countries, methods=["GET"])
        app.add_api_route("/api/countries/{country_code}/regions", self._list_regions, methods=["GET"])
        app.add_api_route("/api/countries/{country_code}/regions/{region_code}/districts", self._list_districts, methods=["GET"])
        app.add_api_route("/api/cache", self._list_cache, methods=["GET"])
        app.add_api_route("/api/cache/{cache_key}", self._get_cached, methods=["GET"])
        app.add_api_route("/api/pois/initial", self._get_initial, methods=["GET"])
        app.add_api_route("/api/pois/fetch", self._fetch_pois, methods=["POST"])
        app.add_api_route("/api/pois/fetch-stream", self._fetch_pois_stream, methods=["POST"])
        app.add_api_route("/api/pois/export", self._export_pois, methods=["POST"])

        @app.middleware("http")
        async def _no_cache_headers(request: Any, call_next: Any) -> Any:
            response = await call_next(request)
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            return response

    def _list_countries(self) -> Dict[str, Any]:
        return {"countries": self._catalog.list_countries()}

    def _list_regions(
        self,
        country_code: str,
        refresh: bool = False,
    ) -> Dict[str, Any]:
        code = country_code.strip().upper()
        if len(code) != 2:
            raise HTTPException(status_code=400, detail="2 harfli ISO ülke kodu gerekli.")
        regions = self._division_service.get_regions(code, refresh)
        return {"countryCode": code, "regions": regions}

    def _list_districts(
        self,
        country_code: str,
        region_code: str,
        refresh: bool = False,
    ) -> Dict[str, Any]:
        districts = self._division_service.get_districts(
            country_code=country_code.strip().upper(),
            region_code=region_code.strip(),
            force_refresh=refresh,
        )
        return {
            "countryCode": country_code.upper(),
            "regionCode": region_code,
            "districts": [{"name": d["name"], "bbox": d["bbox"]} for d in districts],
        }

    def _list_cache(self) -> Dict[str, Any]:
        return {"entries": self._cache_store.list_entries()}

    def _get_cached(self, cache_key: str) -> Dict[str, Any]:
        cached = self._cache_store.load(cache_key)
        if not cached:
            raise HTTPException(status_code=404, detail="Kayıtlı veri seti bulunamadı.")
        cached["meta"]["fromCache"] = True
        return cached

    def _get_initial(self) -> Dict[str, Any]:
        entries = self._cache_store.list_entries()
        if entries:
            cached = self._cache_store.load(entries[0]["key"])
            if cached:
                cached["meta"]["fromCache"] = True
                return cached
        seed = self._cache_store.load_seed_csv(
            csv_path=self._base_dir / "output" / "denizli_merkez_tum_poi.csv",
            title="Denizli · Merkezefendi, Pamukkale",
            country_code="TR",
            region_code="TR-20",
            districts=["Merkezefendi", "Pamukkale"],
        )
        if seed:
            key = self._cache_store.build_key("TR|TR-20|Merkezefendi,Pamukkale", True)
            self._cache_store.save(key, seed)
            return seed
        return self._empty_response()

    def _fetch_pois(self, request: FetchPoiRequest) -> Dict[str, Any]:
        return self._fetch_coordinator.fetch(request)

    def _fetch_pois_stream(self, request: FetchPoiRequest) -> StreamingResponse:
        return StreamingResponse(
            self._fetch_coordinator.stream_fetch(request),
            media_type="application/x-ndjson",
        )

    def _export_pois(self, request: ExportPoiRequest) -> Response:
        content, media_type, filename = self._export_service.export_file(
            items=request.items,
            fmt=request.format,
        )
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    def _empty_response(self) -> Dict[str, Any]:
        return {
            "meta": {"title": "Veri seti seçilmedi", "count": 0, "rawCount": 0, "removedDuplicates": 0, "brandedCount": 0, "fromCache": False},
            "boundaries": {"type": "FeatureCollection", "features": []},
            "data": {"districts": [], "categories": [], "basicCategories": [], "topCategories": [], "items": []},
        }
