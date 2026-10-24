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

TRINCHERAS_PROMPT = """\
Es el 12 de febrero de 1814, en La Victoria. José Félix Ribas defiende el pueblo con una tropa
improvisada, en buena parte estudiantes y seminaristas de Caracas, contra las fuerzas realistas de
José Tomás Boves al mando de Francisco Tomás Morales. Los dos bandos se tirotean durante horas
desde parapetos y barricadas; al caer la tarde llega Vicente Campo Elías con refuerzos y los
realistas se retiran. Bolívar no estuvo en la batalla: la conoce por Ribas y la cuenta con orgullo.
En la escena el visitante está entre las dos trincheras, una a cada lado.
"""


def presenter_prompt(scenes: tuple[Simulation, ...]) -> str:
    """Contexto de la conversación general: Bolívar recibe al visitante y le ofrece las escenas."""
    titles = ", ".join(f"«{s.title}»" for s in scenes)
    return f"""\
Recibes al visitante como anfitrión de esta experiencia de realidad aumentada sobre la historia de
Venezuela y conversas con él sobre tu vida, tus ideas, tu tiempo y lo que vino después. Si quiere
vivir una escena concreta, puede tocar el botón de simulaciones de la pantalla y elegir una:
{titles}.
Invítalo a hacerlo cuando venga al caso, sin repetirlo en cada respuesta.
"""


# Edificio Centro Banaven ("Cubo Negro"), Chuao, Caracas. Círculo centrado en la huella del edificio
# en OpenStreetMap; 75 m de radio cubren el edificio (~58 m al vértice) más margen para el GPS.
CUBO_NEGRO_CENTER = (-66.8533115, 10.4842436)

CUBO_NEGRO_SCENES = (
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
    Simulation(
        id="trincheras",
        title="Las trincheras de La Victoria",
        description="Patriotas y realistas se disparan desde sus parapetos. Necesitas un espacio abierto.",
        prompt=TRINCHERAS_PROMPT,
        voice_location_id="la_victoria",
        character_id="bolivar",
        space="open",
    ),
)

CUBO_NEGRO = Region(
    id="cubo_negro",
    name="Cubo Negro",
    description="Centro Banaven, Chuao, Caracas. Zona de pruebas de la experiencia AR.",
    rings=(circle_ring(CUBO_NEGRO_CENTER, radius_m=75),),
    # La primera es la que arranca con "Comenzar simulación": la conversación general con Bolívar
    simulations=(
        Simulation(
            id="bolivar_general",
            title="Conversa con Bolívar",
            description="El Libertador te recibe y responde lo que quieras saber sobre su vida.",
            prompt=presenter_prompt(CUBO_NEGRO_SCENES),
            voice_location_id="presentador",
            character_id="bolivar",
            kind="general",
        ),
        *CUBO_NEGRO_SCENES,
    ),
)

REGIONS: tuple[Region, ...] = (CUBO_NEGRO,)
