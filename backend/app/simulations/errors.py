class SimulationError(Exception):
    code = "simulation_error"


class RegionNotFoundError(SimulationError):
    code = "region_not_found"


class SimulationNotFoundError(SimulationError):
    code = "simulation_not_found"
