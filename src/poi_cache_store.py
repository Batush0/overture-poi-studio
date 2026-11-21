import csv
import hashlib
import json
from pathlib import Path
from typing import Any
from typing import Dict
from typing import List
from typing import Optional

from src.poi_classifier import PoiClassifier
from src.poi_deduplicator import PoiDeduplicator
from src.poi_record import PoiRecord


class PoiCacheStore:
    def __init__(
        self,
        cache_dir: Path,
        classifier: PoiClassifier,
        deduplicator: PoiDeduplicator,
    ) -> None:
        self._cache_dir = cache_dir
        self._classifier = classifier
        self._deduplicator = deduplicator

    def build_key(
        self,
        label: str,
        deduplicate: bool,
    ) -> str:
        digest = hashlib.sha1(f"v2|{label}|{deduplicate}".encode("utf-8")).hexdigest()[:12]
        return f"dataset_{digest}"

    def load(self, key: str) -> Optional[Dict[str, Any]]:
        path = self._cache_dir / f"{key}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def save(
        self,
        key: str,
        payload: Dict[str, Any],
    ) -> None:
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        path = self._cache_dir / f"{key}.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    def list_entries(self) -> List[Dict[str, Any]]:
        if not self._cache_dir.exists():
            return []
        entries: List[Dict[str, Any]] = []
        for path in sorted(
            self._cache_dir.glob("dataset_*.json"),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        ):
            meta = json.loads(path.read_text(encoding="utf-8")).get("meta", {})
            entries.append({
                "key": path.stem,
                "title": meta.get("title", path.stem),
                "countryCode": meta.get("countryCode", ""),
                "regionCode": meta.get("regionCode", ""),
                "count": meta.get("count", 0),
                "removedDuplicates": meta.get("removedDuplicates", 0),
            })
        return entries

    def load_seed_csv(
        self,
        csv_path: Path,
        title: str,
        country_code: str,
        region_code: str,
        districts: List[str],
    ) -> Optional[Dict[str, Any]]:
        if not csv_path.exists():
            return None
        records = self._read_csv_records(csv_path)
        enriched = [self._classifier.enrich(item) for item in records]
        deduplicated, removed = self._deduplicator.deduplicate(enriched)
        return self.encode_response(
            records=deduplicated,
            raw_count=len(records),
            removed_duplicates=removed,
            title=title,
            country_code=country_code,
            region_code=region_code,
            districts=districts,
            boundaries={"type": "FeatureCollection", "features": []},
            from_cache=True,
        )

    def encode_response(
        self,
        records: List[PoiRecord],
        raw_count: int,
        removed_duplicates: int,
        title: str,
        country_code: str,
        region_code: str,
        districts: List[str],
        boundaries: Dict[str, Any],
        from_cache: bool,
    ) -> Dict[str, Any]:
        district_list: List[str] = []
        district_idx: Dict[str, int] = {}
        primary_list: List[str] = []
        primary_idx: Dict[str, int] = {}
        basic_list: List[str] = []
        basic_idx: Dict[str, int] = {}
        top_list: List[str] = []
        top_idx: Dict[str, int] = {}
        items: List[List[Any]] = []
        branded_count = 0

        for item in records:
            if item.is_branded:
                branded_count += 1
            items.append([
                item.name,
                self._index_of(item.district or "Bilinmiyor", district_list, district_idx),
                self._index_of(item.primary_category, primary_list, primary_idx),
                self._index_of(item.basic_category, basic_list, basic_idx),
                self._index_of(item.top_category, top_list, top_idx),
                1 if item.is_branded else 0,
                item.brand,
                item.address,
                item.phone,
                item.website,
                item.latitude,
                item.longitude,
                item.confidence,
            ])

        return {
            "meta": {
                "title": title,
                "countryCode": country_code,
                "regionCode": region_code,
                "districts": districts,
                "rawCount": raw_count,
                "count": len(records),
                "removedDuplicates": removed_duplicates,
                "brandedCount": branded_count,
                "fromCache": from_cache,
            },
            "boundaries": boundaries,
            "data": {
                "districts": district_list,
                "categories": primary_list,
                "basicCategories": basic_list,
                "topCategories": top_list,
                "items": items,
            },
        }

    def _read_csv_records(self, csv_path: Path) -> List[PoiRecord]:
        records: List[PoiRecord] = []
        with csv_path.open(mode="r", encoding="utf-8-sig", newline="") as file:
            for row in csv.DictReader(file):
                hierarchy = row.get("hierarchy", "")
                top = hierarchy.split(">")[0].strip() if hierarchy else ""
                records.append(PoiRecord(
                    place_id=row.get("id", ""),
                    name=row.get("name", ""),
                    district=row.get("district", ""),
                    primary_category=row.get("primary_category", ""),
                    basic_category=row.get("basic_category", ""),
                    top_category=top,
                    hierarchy=hierarchy,
                    brand=row.get("brand", ""),
                    address=row.get("address", ""),
                    phone=row.get("phone", ""),
                    website=row.get("website", ""),
                    latitude=round(float(row.get("latitude", "0") or 0), 6),
                    longitude=round(float(row.get("longitude", "0") or 0), 6),
                    confidence=round(float(row.get("confidence", "0") or 0), 3),
                    operating_status=row.get("operating_status", ""),
                ))
        return records

    def _index_of(
        self,
        value: str,
        values: List[str],
        lookup: Dict[str, int],
    ) -> int:
        if value not in lookup:
            lookup[value] = len(values)
            values.append(value)
        return lookup[value]
