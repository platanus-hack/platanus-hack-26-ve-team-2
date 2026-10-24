from fastapi.testclient import TestClient
from geoalchemy2.shape import from_shape
from shapely.geometry import shape

from app.main import app
from app.models.zone import Zone
from app.schemas.zone import Polygon, ZoneOut

client = TestClient(app)

SQUARE = Polygon(coordinates=[[(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]])


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_zone_geojson_roundtrip():
    zone = Zone(id=1, name="test", geom=from_shape(shape(SQUARE.model_dump()), srid=4326))
    assert ZoneOut.from_model(zone).geometry == SQUARE


def test_contains_validates_coordinates():
    assert client.get("/zones/contains", params={"lat": 100, "lng": 0}).status_code == 422
