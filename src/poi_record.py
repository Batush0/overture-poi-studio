from dataclasses import dataclass
from typing import Dict
from typing import Union


@dataclass(frozen=True)
class PoiRecord:
    place_id: str
    name: str
    district: str
    primary_category: str
    basic_category: str
    top_category: str
    hierarchy: str
    brand: str
    address: str
    phone: str
    website: str
    latitude: float
    longitude: float
    confidence: float
    operating_status: str
    is_branded: bool = False

    def to_dict(self) -> Dict[str, Union[str, float, bool]]:
        return {
            "id": self.place_id,
            "name": self.name,
            "district": self.district,
            "top_category": self.top_category,
            "basic_category": self.basic_category,
            "primary_category": self.primary_category,
            "hierarchy": self.hierarchy,
            "brand": self.brand,
            "is_branded": self.is_branded,
            "address": self.address,
            "phone": self.phone,
            "website": self.website,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "confidence": self.confidence,
            "operating_status": self.operating_status,
        }
