"""Catálogo hardcodeado mientras las regiones no viven en la base de datos."""

from app.simulations.domain import Region, Simulation
from app.simulations.geometry import circle_ring

CARABOBO_PROMPT = """\
Estás en el Campo de Carabobo, Venezuela, lugar de la Batalla de Carabobo del 24 de junio de 1821,
que selló la independencia de Venezuela. El ejército patriota al mando de Simón Bolívar venció a
las tropas realistas de Miguel de la Torre. Destacaron José Antonio Páez y sus llaneros y la
Legión Británica; cayeron los generales Manuel Cedeño y Ambrosio Plaza. La escena recrea las
posiciones de las tropas en la sabana.
"""

BATALLA_PROMPT = """\
Es 1813, en plena Campaña Admirable. Simón Bolívar avanza desde los Andes hacia Caracas y queda
frente a frente con Domingo de Monteverde, el capitán canario que en 1812 derrotó a la Primera
República y gobierna Venezuela para el rey. Bolívar lo vence en Los Taguanes, entra en Caracas el
6 de agosto de 1813 y obliga a Monteverde a encerrarse en Puerto Cabello. En la escena ambos
jefes se encuentran cara a cara antes del combate.
"""

# Edificio Centro Banaven ("Cubo Negro"), Chuao, Caracas. Círculo centrado en la huella del edificio
# en OpenStreetMap; 75 m de radio cubren el edificio (~58 m al vértice) más margen para el GPS.
CUBO_NEGRO_CENTER = (-66.8533115, 10.4842436)

CUBO_NEGRO = Region(
    id="cubo_negro",
    name="Cubo Negro",
    description="Centro Banaven, Chuao, Caracas. Zona de pruebas de la experiencia AR.",
    rings=(circle_ring(CUBO_NEGRO_CENTER, radius_m=75),),
    simulations=(
        Simulation(
            id="carabobo_prueba",
            title="La Batalla de Carabobo",
            description="Simulación de prueba: Bolívar y Manuela Sáenz te cuentan la batalla.",
            prompt=CARABOBO_PROMPT,
            voice_location_id="campo_carabobo",
            character_id="bolivar",
        ),
        Simulation(
            id="batalla",
            title="Batalla",
            description="Domingo de Monteverde llega a enfrentarse cara a cara con Bolívar.",
            prompt=BATALLA_PROMPT,
            voice_location_id="campana_admirable",
            character_id="bolivar",
        ),
    ),
)

REGIONS: tuple[Region, ...] = (CUBO_NEGRO,)
