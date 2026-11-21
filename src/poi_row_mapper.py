from typing import Optional
from typing import Sequence
from typing import Any

from src.poi_record import PoiRecord


class PoiRowMapper:
    def map_row(self, row: Sequence[Any]) -> PoiRecord:
        hierarchy_list = [str(item) for item in (row[5] or []) if item]
        top_category = hierarchy_list[0] if hierarchy_list else ""
        return PoiRecord(
            place_id=str(row[0]),
            name=str(row[1]),
            district=str(row[2] or ""),
            primary_category=str(row[3]),
            basic_category=str(row[4]),
            top_category=top_category,
            hierarchy=" > ".join(hierarchy_list),
            brand=str(row[6]),
            address=self._format_address(row[7]),
            phone=self._extract_first(row[8]),
            website=self._extract_first(row[9]),
            latitude=float(row[10]),
            longitude=float(row[11]),
            confidence=float(row[12]),
            operating_status=str(row[13]),
        )

    def _format_address(self, addresses: Optional[Sequence[Any]]) -> str:
        if not addresses or not isinstance(addresses[0], dict):
            return ""
        first = addresses[0]
        parts = [
            first.get("freeform"),
            first.get("locality"),
            first.get("postcode"),
        ]
        return ", ".join(str(part) for part in parts if part)

    def _extract_first(self, values: Optional[Sequence[Any]]) -> str:
        if not values or values[0] is None:
            return ""
        return str(values[0])
