"""Catálogo hardcodeado mientras las regiones no viven en la base de datos."""

from app.simulations.domain import Region, Simulation

CARABOBO_PROMPT = """\
Estás en el Campo de Carabobo, Venezuela, lugar de la Batalla de Carabobo del 24 de junio de 1821,
que selló la independencia de Venezuela. El ejército patriota al mando de Simón Bolívar venció a
las tropas realistas de Miguel de la Torre. Destacaron José Antonio Páez y sus llaneros y la
Legión Británica; cayeron los generales Manuel Cedeño y Ambrosio Plaza. La escena recrea las
posiciones de las tropas en la sabana.
"""

# Edificio Centro Banaven ("Cubo Negro"), Chuao, Caracas. Contorno irregular alrededor de la huella
# del edificio en OpenStreetMap, con ~20-35 m de margen para tolerar el error del GPS en la calle.
CUBO_NEGRO = Region(
    id="cubo_negro",
    name="Cubo Negro",
    description="Centro Banaven, Chuao, Caracas. Zona de pruebas de la experiencia AR.",
    rings=(
        (
            (-66.85384, 10.48474),
            (-66.85352, 10.48489),
            (-66.85318, 10.48481),
            (-66.85289, 10.48486),
            (-66.85268, 10.48462),
            (-66.85276, 10.48431),
            (-66.85263, 10.48401),
            (-66.85281, 10.48372),
            (-66.85315, 10.48362),
            (-66.85349, 10.48369),
            (-66.85382, 10.48358),
            (-66.85396, 10.48392),
            (-66.85386, 10.48425),
            (-66.85399, 10.48453),
            (-66.85384, 10.48474),
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
