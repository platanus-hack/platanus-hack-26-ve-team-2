import math

from app.simulations.domain import Ring

_EARTH_RADIUS_M = 6_371_000


def circle_ring(center: tuple[float, float], radius_m: float, segments: int = 48) -> Ring:
    """Anillo GeoJSON cerrado que aproxima un círculo de `radius_m` metros alrededor de (lng, lat).

    Proyección equirectangular local: precisa para radios de pocos cientos de metros.
    """
    lng, lat = center
    dlat = math.degrees(radius_m / _EARTH_RADIUS_M)
    dlng = dlat / math.cos(math.radians(lat))
    points = [
        (
            round(lng + dlng * math.cos(2 * math.pi * i / segments), 7),
            round(lat + dlat * math.sin(2 * math.pi * i / segments), 7),
        )
        for i in range(segments)
    ]
    return (*points, points[0])
