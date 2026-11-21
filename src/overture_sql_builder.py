from typing import Any
from typing import List
from typing import Sequence
from typing import Tuple

from src.bounding_box import BoundingBox


class OvertureSqlBuilder:
    def build_regions_query(
        self,
        divisions_path: str,
        country_code: str,
    ) -> Tuple[str, List[Any]]:
        sql = f"""
            SELECT
                region AS code,
                names.primary AS name
            FROM read_parquet(
                '{divisions_path}',
                filename=true,
                hive_partitioning=1
            )
            WHERE country = ?
              AND subtype = 'region'
              AND class = 'land'
              AND region IS NOT NULL
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY region
                ORDER BY ST_Area(geometry) DESC
            ) = 1
            ORDER BY names.primary
        """
        return sql, [country_code]

    def build_districts_query(
        self,
        divisions_path: str,
        country_code: str,
        region_code: str,
    ) -> Tuple[str, List[Any]]:
        sql = f"""
            SELECT
                names.primary AS name,
                ROUND(bbox.xmin, 6) AS min_lon,
                ROUND(bbox.ymin, 6) AS min_lat,
                ROUND(bbox.xmax, 6) AS max_lon,
                ROUND(bbox.ymax, 6) AS max_lat,
                ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry, 0.0015)) AS geojson
            FROM read_parquet(
                '{divisions_path}',
                filename=true,
                hive_partitioning=1
            )
            WHERE country = ?
              AND region = ?
              AND subtype IN ('county', 'localadmin', 'locality')
              AND class = 'land'
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY names.primary
                ORDER BY
                    CASE WHEN subtype = 'county' THEN 0 ELSE 1 END,
                    ST_Area(geometry) DESC
            ) = 1
            ORDER BY names.primary
        """
        return sql, [country_code, region_code]

    def build_district_places_query(
        self,
        divisions_path: str,
        places_path: str,
        country_code: str,
        region_code: str,
        district_names: Sequence[str],
        bbox: BoundingBox,
    ) -> Tuple[str, List[Any]]:
        placeholders = ", ".join("?" for _ in district_names)
        sql = f"""
            WITH target_districts AS (
                SELECT names.primary AS district_name, geometry AS district_geom
                FROM read_parquet('{divisions_path}', filename=true, hive_partitioning=1)
                WHERE country = ?
                  AND region = ?
                  AND subtype IN ('county', 'localadmin', 'locality')
                  AND class = 'land'
                  AND names.primary IN ({placeholders})
                QUALIFY ROW_NUMBER() OVER (
                    PARTITION BY names.primary
                    ORDER BY
                        CASE WHEN subtype = 'county' THEN 0 ELSE 1 END,
                        ST_Area(geometry) DESC
                ) = 1
            ),
            candidate_places AS (
                SELECT
                    id,
                    COALESCE(names.primary, '') AS name,
                    COALESCE(taxonomy.primary, '') AS primary_category,
                    COALESCE(basic_category, '') AS basic_category,
                    taxonomy.hierarchy AS hierarchy,
                    COALESCE(brand.names.primary, '') AS brand,
                    addresses,
                    phones,
                    websites,
                    ROUND((bbox.ymin + bbox.ymax) / 2.0, 6) AS latitude,
                    ROUND((bbox.xmin + bbox.xmax) / 2.0, 6) AS longitude,
                    ROUND(COALESCE(confidence, 0.0), 3) AS confidence,
                    COALESCE(operating_status, '') AS operating_status,
                    geometry AS place_geom
                FROM read_parquet('{places_path}', filename=true, hive_partitioning=1)
                WHERE bbox.xmin BETWEEN ? AND ?
                  AND bbox.ymin BETWEEN ? AND ?
            )
            SELECT
                p.id, p.name, d.district_name, p.primary_category, p.basic_category,
                p.hierarchy, p.brand, p.addresses, p.phones, p.websites,
                p.latitude, p.longitude, p.confidence, p.operating_status
            FROM candidate_places p
            JOIN target_districts d
              ON ST_Intersects(p.place_geom, d.district_geom)
        """
        params: List[Any] = [
            country_code,
            region_code,
            *district_names,
            bbox.min_lon,
            bbox.max_lon,
            bbox.min_lat,
            bbox.max_lat,
        ]
        return sql, params

    def build_bbox_places_query(
        self,
        places_path: str,
        bbox: BoundingBox,
    ) -> Tuple[str, List[Any]]:
        sql = f"""
            SELECT
                id,
                COALESCE(names.primary, '') AS name,
                COALESCE(addresses[1].locality, 'Seçili Alan') AS district_name,
                COALESCE(taxonomy.primary, '') AS primary_category,
                COALESCE(basic_category, '') AS basic_category,
                taxonomy.hierarchy AS hierarchy,
                COALESCE(brand.names.primary, '') AS brand,
                addresses,
                phones,
                websites,
                ROUND((bbox.ymin + bbox.ymax) / 2.0, 6) AS latitude,
                ROUND((bbox.xmin + bbox.xmax) / 2.0, 6) AS longitude,
                ROUND(COALESCE(confidence, 0.0), 3) AS confidence,
                COALESCE(operating_status, '') AS operating_status
            FROM read_parquet('{places_path}', filename=true, hive_partitioning=1)
            WHERE bbox.xmin BETWEEN ? AND ?
              AND bbox.ymin BETWEEN ? AND ?
        """
        return sql, [bbox.min_lon, bbox.max_lon, bbox.min_lat, bbox.max_lat]

    def build_polygon_places_query(
        self,
        places_path: str,
        bbox: BoundingBox,
        wkt_polygon: str,
    ) -> Tuple[str, List[Any]]:
        sql = f"""
            SELECT
                id,
                COALESCE(names.primary, '') AS name,
                COALESCE(addresses[1].locality, 'Poligon Alanı') AS district_name,
                COALESCE(taxonomy.primary, '') AS primary_category,
                COALESCE(basic_category, '') AS basic_category,
                taxonomy.hierarchy AS hierarchy,
                COALESCE(brand.names.primary, '') AS brand,
                addresses,
                phones,
                websites,
                ROUND((bbox.ymin + bbox.ymax) / 2.0, 6) AS latitude,
                ROUND((bbox.xmin + bbox.xmax) / 2.0, 6) AS longitude,
                ROUND(COALESCE(confidence, 0.0), 3) AS confidence,
                COALESCE(operating_status, '') AS operating_status
            FROM read_parquet('{places_path}', filename=true, hive_partitioning=1)
            WHERE bbox.xmin BETWEEN ? AND ?
              AND bbox.ymin BETWEEN ? AND ?
              AND ST_Intersects(geometry, ST_GeomFromText(?))
        """
        return sql, [
            bbox.min_lon,
            bbox.max_lon,
            bbox.min_lat,
            bbox.max_lat,
            wkt_polygon,
        ]
