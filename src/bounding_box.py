from dataclasses import dataclass


@dataclass(frozen=True)
class BoundingBox:
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    @classmethod
    def denizli_center(cls) -> "BoundingBox":
        return cls(
            min_lon=28.9800,
            min_lat=37.7100,
            max_lon=29.1800,
            max_lat=37.8600,
        )
