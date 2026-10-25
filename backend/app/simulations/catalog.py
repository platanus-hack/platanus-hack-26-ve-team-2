"""Catálogo hardcodeado mientras las regiones no viven en la base de datos."""

from app.simulations.domain import SCENE_ACTION, Region, Simulation
from app.simulations.geometry import circle_ring

BATALLA_PROMPT = """\
Es julio de 1812, en Puerto Cabello. El coronel Simón Bolívar comanda la plaza y el Castillo de San
Felipe, donde la Primera República guarda su arsenal y a los presos realistas. El 30 de junio el
oficial Francisco Fernández Vinoni se subleva, libera a los presos y toma el castillo, que vuelve
sus cañones contra la ciudad. Bolívar resiste varios días con muy poca tropa, pero el 6 de julio
pierde la plaza y se embarca hacia La Guaira; las fuerzas de Domingo de Monteverde, el capitán
canario que avanza para el rey, se quedan con Puerto Cabello. Poco después cae la Primera
República. En la escena Monteverde y Bolívar se enfrentan cara a cara por el castillo.
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
    """Contexto de la conversación general: Bolívar recibe al visitante, le ofrece las escenas y
    las lanza él mismo si se las pide (la app abre la escena al terminar de hablar)."""
    listing = "\n".join(f"- {s.id}: «{s.title}». {s.description}" for s in scenes)
    example = scenes[0].id if scenes else "id"
    return f"""\
Recibes al visitante como anfitrión de esta experiencia de realidad aumentada sobre la historia de
Venezuela y conversas con él sobre tu vida, tus ideas, tu tiempo y lo que vino después. Puedes
mostrarle estas escenas (id: título y de qué trata):
{listing}
Si el visitante pide ver, vivir o que le cuentes uno de esos episodios, aunque lo diga con otras
palabras ("háblame de la pérdida del castillo", "quiero ver lo de las trincheras"), empieza tu
respuesta con la etiqueta de esa escena, por ejemplo [{SCENE_ACTION}:{example}], y sigue con una
presentación breve, de una o dos frases, que termine invitándolo a mirar: la escena empieza sola
cuando terminas de hablar. Usa la etiqueta solo si lo que pide coincide claramente con una escena y
nunca inventes un id; si no, responde normalmente, sin etiqueta. También puede elegirlas con el
botón de simulaciones de la pantalla: invítalo cuando venga al caso, sin repetirlo en cada
respuesta.
"""


# Edificio Centro Banaven ("Cubo Negro"), Chuao, Caracas. Círculo centrado en la huella del edificio
# en OpenStreetMap; 75 m de radio cubren el edificio (~58 m al vértice) más margen para el GPS.
CUBO_NEGRO_CENTER = (-66.8533115, 10.4842436)

CUBO_NEGRO_SCENES = (
    Simulation(
        id="batalla",
        title="Pérdida del Castillo de San Felipe",
        description="Monteverde llega a arrebatarle a Bolívar el castillo de Puerto Cabello.",
        prompt=BATALLA_PROMPT,
        voice_location_id="campana_admirable",
        character_id="bolivar",
    ),
    Simulation(
        id="trincheras",
        title="Las trincheras de La Victoria",
        description="Patriotas y realistas se disparan desde sus parapetos. Necesitas unos 6 m libres.",
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
