import re
from dataclasses import replace
from typing import Dict
from typing import List
from typing import Tuple

from src.poi_record import PoiRecord


class PoiDeduplicator:
    NON_ALNUM = re.compile(r"[^a-z0-9çğıöşü]+")
    DIGITS_ONLY = re.compile(r"\D+")

    def deduplicate(
        self,
        records: List[PoiRecord],
    ) -> Tuple[List[PoiRecord], int]:
        sorted_records = sorted(
            records,
            key=lambda item: (item.confidence, self._richness_score(item)),
            reverse=True,
        )
        by_name_grid: Dict[Tuple[str, int, int], PoiRecord] = {}
        by_phone_grid: Dict[Tuple[str, int, int], Tuple[str, int, int]] = {}
        removed_count = 0

        for record in sorted_records:
            name_key = self._name_grid_key(record)
            phone_key = self._phone_grid_key(record)
            existing_key = self._find_existing_key(
                name_key=name_key,
                phone_key=phone_key,
                by_name_grid=by_name_grid,
                by_phone_grid=by_phone_grid,
            )
            if existing_key is not None:
                by_name_grid[existing_key] = self._merge_records(
                    primary=by_name_grid[existing_key],
                    secondary=record,
                )
                removed_count += 1
                continue
            by_name_grid[name_key] = record
            if phone_key is not None:
                by_phone_grid[phone_key] = name_key

        result = sorted(
            by_name_grid.values(),
            key=lambda item: (item.district, item.top_category, item.name),
        )
        return result, removed_count

    def _find_existing_key(
        self,
        name_key: Tuple[str, int, int],
        phone_key: Tuple[str, int, int] | None,
        by_name_grid: Dict[Tuple[str, int, int], PoiRecord],
        by_phone_grid: Dict[Tuple[str, int, int], Tuple[str, int, int]],
    ) -> Tuple[str, int, int] | None:
        if name_key in by_name_grid:
            return name_key
        if phone_key is not None and phone_key in by_phone_grid:
            return by_phone_grid[phone_key]
        return None

    def _name_grid_key(self, record: PoiRecord) -> Tuple[str, int, int]:
        normalized = (
            record.name.replace("İ", "i")
            .replace("I", "ı")
            .lower()
        )
        clean_name = self.NON_ALNUM.sub("", normalized)
        lat_cell = round(record.latitude * 2000)
        lon_cell = round(record.longitude * 2000)
        return (clean_name or record.place_id, lat_cell, lon_cell)

    def _phone_grid_key(self, record: PoiRecord) -> Tuple[str, int, int] | None:
        digits = self.DIGITS_ONLY.sub("", record.phone)
        if len(digits) < 7:
            return None
        tail = digits[-10:]
        lat_cell = round(record.latitude * 500)
        lon_cell = round(record.longitude * 500)
        return (tail, lat_cell, lon_cell)

    def _richness_score(self, record: PoiRecord) -> int:
        return sum([
            bool(record.address),
            bool(record.phone),
            bool(record.website),
            bool(record.primary_category),
            bool(record.brand),
        ])

    def _merge_records(
        self,
        primary: PoiRecord,
        secondary: PoiRecord,
    ) -> PoiRecord:
        return replace(
            primary,
            address=primary.address or secondary.address,
            phone=primary.phone or secondary.phone,
            website=primary.website or secondary.website,
            primary_category=primary.primary_category or secondary.primary_category,
            basic_category=primary.basic_category or secondary.basic_category,
            hierarchy=primary.hierarchy or secondary.hierarchy,
            brand=primary.brand or secondary.brand,
        )
