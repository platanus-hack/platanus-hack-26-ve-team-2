# VISTA

**Un guía turístico con IA en tu bolsillo: llegas a un lugar, apuntas la cámara y la historia aparece frente a ti para conversar contigo.**

## ¿Qué problema resuelve?

Cuando visitas un lugar nuevo, la historia que pasó ahí está escondida en placas que nadie lee, guías caros con horario fijo o artículos que no responden preguntas. Y aprender historia (o cualquier tema) sigue siendo, casi siempre, leer y memorizar.

VISTA convierte cualquier lugar en una experiencia viva: un guía que sabe dónde estás, te cuenta lo que ocurrió ahí, responde lo que le preguntes con su propia voz y te deja **ver** los momentos históricos en 3D, en el sitio real.

## ¿Qué puede hacer hoy?

- **Mapa de lugares cercanos:** según tu ubicación, la app te muestra las zonas con experiencias disponibles y detecta cuándo entras en una (geocercas con PostGIS).
- **Un guía que te acompaña en realidad aumentada:** el personaje (en el demo, Simón Bolívar) aparece en 3D anclado al piso, a escala real. Puedes moverlo, girarlo, cambiarle el tamaño o decirle *"sígueme"* y camina contigo; *"quédate"* y se detiene.
- **Conversación por voz natural:** le hablas y te responde en personaje, con voz propia y sincronía labial. La respuesta empieza a sonar con la primera frase, mientras la IA sigue pensando, para que se sienta como una conversación y no como esperar a un chatbot.
- **"¿Qué es esto?":** enfocas algo con la cámara (un monumento, un cañón, un libro) y el personaje lo mira y te lo explica, conectándolo con su historia: *"Ah, un cuaderno... en páginas como estas se escribió mi historia"*.
- **Respuestas en las que puedes confiar:** el guía no inventa. Cuando le preguntan un dato concreto que no conoce con seguridad (una fecha, una cifra, un nombre), lo verifica en la web antes de responder. Ante temas polémicos explica con honestidad, también las críticas, y en política actual se mantiene neutral.
- **Simulaciones 3D de lo que pasó ahí:** desde el guía entras a escenas históricas recreadas en el lugar. En el demo, Bolívar y Domingo de Monteverde se enfrentan cara a cara en una batalla coreografiada con efectos de sonido, y puedes preguntarle a los personajes sobre lo que estás viendo.

## Más allá del turismo: una plataforma para aprender

Mientras lo construíamos nos dimos cuenta de que lo valioso no es solo el lugar, sino **tener a alguien que sabe, frente a ti, dispuesto a responder todo**. El mismo motor (personaje + contexto + voz + visión + verificación) sirve para:

- **Estudiar para un examen** conversando con el protagonista del tema (el Bolívar presentador ya está pensado para responder con exactitud a quien estudia).
- **Practicar una exposición** frente a un público o un evaluador virtual que te hace preguntas.
- **Aprender idiomas** hablando con un personaje nativo en situaciones reales.
- **Museos, colegios y ciudades** que quieran dar vida a su propio contenido.

Cada personaje se define con su personalidad, su voz, su contexto y los lugares u objetos que reconoce. Crear uno nuevo es configuración, no código: el siguiente paso es que el usuario cree sus propios personajes según lo que quiera aprender o practicar.

## ¿Cómo funciona?

1. **Ubicación:** la app consulta las regiones cercanas y activa la experiencia al entrar en una.
2. **AR:** un modelo 3D animado se ancla a una superficie real usando ARCore/ARKit.
3. **Voz:** tu audio se transcribe, un LLM responde en personaje con el contexto del lugar y la respuesta vuelve como voz sintetizada frase a frase, con visemas para mover la boca del avatar.
4. **Visión y verificación:** si preguntas por lo que enfocas, el personaje mira la captura; si falta un dato, Claude lo busca en la web antes de contestar.

## Stack

- **App:** Expo (React Native, TypeScript), expo-router, ViroReact (ARCore/ARKit), Google Maps.
- **Backend:** FastAPI con WebSockets, PostgreSQL + PostGIS, SQLAlchemy y Alembic.
- **IA:** Claude (conversación en streaming, visión y búsqueda web para verificar datos) y ElevenLabs (transcripción y voz), detrás de una capa de proveedores intercambiables.
- **3D:** modelos y animaciones de batalla horneados con scripts de Blender.

## Equipo

- José Parra ([@joseparra97](https://github.com/joseparra97))
- Juan Romero ([@juanromeroraffo](https://github.com/juanromeroraffo))
- Jose Chourio ([@choucoder](https://github.com/choucoder))
