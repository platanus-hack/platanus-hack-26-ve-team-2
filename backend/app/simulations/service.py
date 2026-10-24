from app.simulations.domain import Region, SimulationStart
from app.simulations.errors import RegionNotFoundError, SimulationNotFoundError
from app.simulations.repository import RegionRepository


class SimulationService:
    def __init__(self, regions: RegionRepository) -> None:
        self._regions = regions

    def list_regions(self) -> list[Region]:
        return self._regions.list()

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
