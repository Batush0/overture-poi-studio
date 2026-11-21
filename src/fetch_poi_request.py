from typing import Dict
from typing import List
from typing import Optional

from pydantic import BaseModel


class FetchPoiRequest(BaseModel):
    country_code: str = "TR"
    region_code: Optional[str] = None
    districts: List[str] = []
    bbox: Optional[Dict[str, float]] = None
    polygon: Optional[List[List[float]]] = None
    deduplicate: bool = True
    force_refresh: bool = False
