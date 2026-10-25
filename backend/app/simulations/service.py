from app.simulations.domain import Region, Simulation, SimulationStart
from app.simulations.errors import RegionNotFoundError, SimulationNotFoundError
from app.simulations.repository import RegionRepository


class SimulationService:
    def __init__(self, regions: RegionRepository) -> None:
        self._regions = regions

    def list_regions(self) -> list[Region]:
        return self._regions.list()

    def get_simulation(self, simulation_id: str) -> Simulation:
        simulation = self._regions.find_simulation(simulation_id)
        if simulation is None:
            raise SimulationNotFoundError(f"Simulación '{simulation_id}' no existe")
        return simulation

    def scene_to_launch(self, from_simulation: Simulation, scene_id: str) -> Simulation | None:
        """La escena que pidió lanzar el personaje de `from_simulation`, si puede: solo el
        presentador (conversación general) lanza escenas, y solo las de su región."""
        if from_simulation.kind != "general":
            return None
        region = self._regions.region_of(from_simulation.id)
        scene = region.simulation(scene_id) if region else None
        return scene if scene is not None and scene.kind == "scene" else None

    def start(self, region_id: str, simulation_id: str | None = None) -> SimulationStart:
        """Resuelve qué simulación arranca en la región (la indicada o la por defecto).

        Punto de extensión: aquí se registrará la ejecución y se prepararán los objetos de la
        escena cuando dejen de vivir solo en el teléfono.
        """
        region = self._regions.get(region_id)
        if region is None:
            raise RegionNotFoundError(f"Región '{region_id}' no existe")
        if simulation_id is None:
            return SimulationStart(region_id=region.id, simulation=region.default_simulation)
        simulation = region.simulation(simulation_id)
        if simulation is None:
            raise SimulationNotFoundError(
                f"Simulación '{simulation_id}' no existe en la región '{region_id}'"
            )
        return SimulationStart(region_id=region.id, simulation=simulation)
