"""The field grid every baked layer shares: a north-up UTM square of 2 m cells (zone 18N for the park).

The extent is a 600 m square over the mapped meadows of the Secteur des Champs and the Chalet
d'accueil des Champs (OpenStreetMap landuse=meadow ways 477189276 to 477189278).
"""
from __future__ import annotations

import math
from dataclasses import dataclass


def utm_crs(lat: float, lon: float) -> str:
    """The standard UTM zone of a point as an EPSG code: 326zz north of the equator, 327zz south,
    zone zz = floor((lon + 180) / 6) + 1 (the Norway and Svalbard exceptions do not apply in
    North America). Montreal is zone 18, Saskatoon 13, Iowa 15."""
    zone = min(60, int(math.floor((lon + 180.0) / 6.0)) + 1)
    return f"EPSG:{(32600 if lat >= 0 else 32700) + zone}"


def epsg_number(crs: str) -> int:
    """'EPSG:32618' -> 32618, for services that take a bare spatial reference number."""
    return int(crs.split(":")[1])


@dataclass(frozen=True)
class Grid:
    x0: float          # west edge, metres (UTM)
    y_top: float       # north edge, metres (UTM)
    res: float         # cell side, metres
    size: int          # cells per side
    crs: str = "EPSG:32618"

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        side = self.res * self.size
        return (self.x0, self.y_top - side, self.x0 + side, self.y_top)

    def transform(self):
        from rasterio.transform import from_origin
        return from_origin(self.x0, self.y_top, self.res, self.res)

    def center(self, row: float, col: float) -> tuple[float, float]:
        """UTM coordinates of the centre of cell (row, col)."""
        return (self.x0 + (col + 0.5) * self.res, self.y_top - (row + 0.5) * self.res)

    @classmethod
    def around(cls, lat: float, lon: float, side_m: float = 600.0, res: float = 2.0,
               crs: str | None = None) -> "Grid":
        """A square of `side_m` centred on (lat, lon) in the point's own UTM zone (utm_crs), its
        corner snapped to 30 m (the HLS and crop inventory pixel) so the 30 m reads line up with
        whole satellite pixels."""
        from rasterio.warp import transform
        crs = crs or utm_crs(lat, lon)
        xs, ys = transform("EPSG:4326", crs, [lon], [lat])
        x0 = round((xs[0] - side_m / 2) / 30.0) * 30.0
        y_top = round((ys[0] + side_m / 2) / 30.0) * 30.0
        return cls(x0, y_top, res, round(side_m / res), crs)

    def coarse(self, res: float) -> "Grid":
        """Same extent at a coarser cell size (for 10-30 m satellite reads)."""
        n = round(self.size * self.res / res)
        return Grid(self.x0, self.y_top, self.res * self.size / n, n, self.crs)


# The first bake sat 90 m east and 480 m north of this, on woods and a housing street; lidar
# showed 1.1 ha of open ground there. Shifts are multiples of 30 m, the HLS pixel.
PARCEL = Grid(x0=596172.8437110512, y_top=5039681.716137531, res=2.0, size=300)
