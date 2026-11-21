from dataclasses import replace

from src.poi_record import PoiRecord


class PoiClassifier:
    KNOWN_BRAND_TOKENS = (
        "bim", "a101", "a-101", "şok", "migros", "carrefour", "ekomini",
        "koçtaş", "tekzen", "bauhaus", "lc waikiki", "defacto", "koton",
        "starbucks", "mcdonald", "burger king", "domino", "popeyes", "kfc",
        "gratis", "watsons", "rossmann", "teknosa", "mediamarkt", "ikea",
        "lidl", "aldi", "tesco", "walmart", "target", "costco", "shell",
        "opet", "petrol ofisi", "totalenergies", "ziraat bank", "garanti",
        "iş bankası", "yapı kredi", "akbank", "halkbank", "vakıfbank",
    )

    def enrich(self, record: PoiRecord) -> PoiRecord:
        top_category = self._resolve_top_category(record)
        branded = self._is_branded(record)
        return replace(
            record,
            top_category=top_category,
            is_branded=branded,
        )

    def _resolve_top_category(self, record: PoiRecord) -> str:
        if record.top_category:
            return record.top_category
        if record.hierarchy:
            first = record.hierarchy.split(">")[0].strip()
            if first:
                return first
        if record.basic_category:
            return record.basic_category
        if record.primary_category:
            return record.primary_category
        return "uncategorized"

    def _is_branded(self, record: PoiRecord) -> bool:
        if record.brand.strip():
            return True
        normalized = (
            record.name.replace("İ", "i")
            .replace("I", "ı")
            .lower()
        )
        return any(token in normalized for token in self.KNOWN_BRAND_TOKENS)
