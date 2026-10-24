"""Catálogo hardcodeado mientras las regiones no viven en la base de datos."""

from app.simulations.domain import Region, Simulation

CARABOBO_PROMPT = """\
Estás en el Campo de Carabobo, Venezuela, lugar de la Batalla de Carabobo del 24 de junio de 1821,
que selló la independencia de Venezuela. El ejército patriota al mando de Simón Bolívar venció a
las tropas realistas de Miguel de la Torre. Destacaron José Antonio Páez y sus llaneros y la
Legión Británica; cayeron los generales Manuel Cedeño y Ambrosio Plaza. La escena recrea las
posiciones de las tropas en la sabana.
"""

# Edificio Centro Banaven ("Cubo Negro"), Chuao, Caracas. Huella del edificio en OpenStreetMap
# ampliada ~25 m por lado para tolerar el error del GPS en la calle.
CUBO_NEGRO = Region(
    id="cubo_negro",
    name="Cubo Negro",
    description="Centro Banaven, Chuao, Caracas. Zona de pruebas de la experiencia AR.",
    rings=(
        (
            (-66.85391, 10.48483),
            (-66.85391, 10.48365),
            (-66.85271, 10.48365),
            (-66.85271, 10.48483),
            (-66.85391, 10.48483),
        ),
    ),
    simulations=(
        Simulation(
            id="carabobo_prueba",
            title="La Batalla de Carabobo",
            description="Simulación de prueba: Bolívar y Manuela Sáenz te cuentan la batalla.",
            prompt=CARABOBO_PROMPT,
            voice_location_id="campo_carabobo",
        ),
    ),
)

REGIONS: tuple[Region, ...] = (CUBO_NEGRO,)
