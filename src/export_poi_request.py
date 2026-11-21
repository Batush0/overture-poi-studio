from typing import Any
from typing import Dict
from typing import List

from pydantic import BaseModel


class ExportPoiRequest(BaseModel):
    format: str = "csv"
    items: List[Dict[str, Any]] = []
