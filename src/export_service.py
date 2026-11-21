import csv
import io
import json
from typing import Any
from typing import Dict
from typing import List
from typing import Tuple

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.styles import PatternFill


class ExportService:
    COLUMNS = (
        ("name", "Name"),
        ("district", "District / Area"),
        ("topCategory", "Top Category"),
        ("basicCategory", "Basic Category"),
        ("primaryCategory", "Primary Category"),
        ("brand", "Brand"),
        ("isBranded", "Branded"),
        ("address", "Address"),
        ("phone", "Phone"),
        ("website", "Website"),
        ("lat", "Latitude"),
        ("lon", "Longitude"),
        ("confidence", "Confidence"),
    )

    def export_file(
        self,
        items: List[Dict[str, Any]],
        fmt: str,
    ) -> Tuple[bytes, str, str]:
        if fmt == "xlsx":
            return (
                self._to_excel_bytes(items),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "overture_poi_export.xlsx",
            )
        if fmt == "geojson":
            return (
                self._to_geojson_bytes(items),
                "application/geo+json; charset=utf-8",
                "overture_poi_export.geojson",
            )
        return (
            self._to_csv_bytes(items),
            "text/csv; charset=utf-8",
            "overture_poi_export.csv",
        )

    def _to_csv_bytes(self, items: List[Dict[str, Any]]) -> bytes:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow([label for _, label in self.COLUMNS])
        for item in items:
            writer.writerow([
                self._format_cell(key, item.get(key, ""))
                for key, _ in self.COLUMNS
            ])
        return ("\ufeff" + buffer.getvalue()).encode("utf-8")

    def _to_excel_bytes(self, items: List[Dict[str, Any]]) -> bytes:
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Overture POI Export"
        header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        headers = [label for _, label in self.COLUMNS]
        sheet.append(headers)
        for col_idx in range(1, len(headers) + 1):
            cell = sheet.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
        for item in items:
            sheet.append([
                self._format_cell(key, item.get(key, ""))
                for key, _ in self.COLUMNS
            ])
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        self._adjust_widths(sheet)
        output = io.BytesIO()
        workbook.save(output)
        return output.getvalue()

    def _to_geojson_bytes(self, items: List[Dict[str, Any]]) -> bytes:
        features = [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(item.get("lon", 0)), float(item.get("lat", 0))],
                },
                "properties": {
                    key: item.get(key, "")
                    for key, _ in self.COLUMNS
                    if key not in ("lat", "lon")
                },
            }
            for item in items
        ]
        return json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False).encode("utf-8")

    def _format_cell(
        self,
        key: str,
        value: Any,
    ) -> Any:
        if key == "isBranded":
            return "Yes" if value else "No"
        return value

    def _adjust_widths(self, sheet: Any) -> None:
        widths = [32, 18, 22, 24, 24, 18, 10, 42, 18, 28, 12, 12, 12]
        for idx, width in enumerate(widths, start=1):
            sheet.column_dimensions[sheet.cell(row=1, column=idx).column_letter].width = width
