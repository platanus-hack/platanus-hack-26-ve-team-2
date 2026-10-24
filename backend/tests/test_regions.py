from fastapi.testclient import TestClient
from shapely.geometry import Point, shape

from app.core.config import get_settings
from app.main import app
from app.simulations.catalog import REGIONS
from app.voice.personas import PersonaCatalog

client = TestClient(app)


def test_list_regions_returns_cubo_negro_as_geojson():
    regions = client.get("/regions").json()
    assert [r["id"] for r in regions] == ["cubo_negro"]
    region = regions[0]
    polygon = shape(region["geometry"])
    assert polygon.is_valid
    center = region["center"]
    assert polygon.contains(Point(center["lng"], center["lat"]))
    assert region["simulations"][0]["id"] == "carabobo_prueba"
    assert "prompt" not in region["simulations"][0]  # el prompt es contexto del servidor


def test_start_without_body_uses_default_simulation():
    res = client.post("/regions/cubo_negro/simulations/start")
    assert res.status_code == 200
    assert res.json() == {
        "simulation_id": "carabobo_prueba",
        "region_id": "cubo_negro",
        "voice_location_id": "campo_carabobo",
    }


def test_start_specific_simulation():
    res = client.post(
        "/regions/cubo_negro/simulations/start", json={"simulation_id": "carabobo_prueba"}
    )
    assert res.json()["simulation_id"] == "carabobo_prueba"


def test_start_unknown_region_or_simulation_is_404():
    assert client.post("/regions/nope/simulations/start").status_code == 404
    res = client.post("/regions/cubo_negro/simulations/start", json={"simulation_id": "nope"})
    assert res.status_code == 404


def test_simulations_point_to_existing_voice_locations():
    catalog = PersonaCatalog.from_yaml(get_settings().voice_personas_file)
    for region in REGIONS:
        for sim in region.simulations:
            assert sim.voice_location_id in catalog.locations, sim.id
