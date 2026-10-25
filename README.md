# Arvi

<img src="./project-logo.png" alt="Arvi" width="200" />

**Un guía turístico con IA en tu bolsillo: llegas a un lugar, apuntas la cámara y la historia aparece frente a ti para conversar contigo.**

Platanus Hack 26: Caracas ft. Yummy · Track: 🤝 Trust · team-2

## Qué hace

- **Lugares cercanos en el mapa:** según tu ubicación, la app muestra las zonas con experiencias y detecta cuándo entras en una.
- **Guía en realidad aumentada:** un personaje 3D (en el demo, Simón Bolívar) aparece anclado al piso. Lo puedes mover, girar y escalar, o decirle *"sígueme"* para que camine contigo.
- **Conversación por voz:** le hablas y responde en personaje, con su voz y sincronía labial, frase a frase para que no haya esperas.
- **"¿Qué es esto?":** enfocas un monumento, un objeto o un libro y el personaje lo mira y te lo explica.
- **No inventa:** si no conoce un dato con seguridad, lo verifica en la web antes de responder.
- **Simulaciones 3D:** escenas históricas recreadas en el lugar, como el enfrentamiento entre Bolívar y Monteverde.

El mismo motor de personajes sirve para la educación: estudiar para exámenes, practicar exposiciones o idiomas. Más detalle en [project-description.md](./project-description.md).

## Stack

- **App** ([frontend/](./frontend)): Expo (React Native, TypeScript), ViroReact (ARCore/ARKit), Google Maps.
- **API** ([backend/](./backend)): FastAPI + WebSockets, PostgreSQL/PostGIS.
- **IA:** Claude (conversación, visión y verificación web) y ElevenLabs (voz y transcripción).

## Correr el proyecto

```bash
# Backend: API en http://localhost:8000 (docs en /docs)
cp backend/.env.example backend/.env   # ANTHROPIC_API_KEY, ELEVENLABS_API_KEY
docker compose up --build

# App: necesita un dev build en un dispositivo con ARCore/ARKit (no funciona en Expo Go)
cd frontend && cp .env.example .env && npm install && npm run android   # o npm run ios
```

API desplegada: https://api-platanus.jp6.dev

## Equipo

- José Parra ([@joseparra97](https://github.com/joseparra97))
- Juan Romero ([@juanromeroraffo](https://github.com/juanromeroraffo))
- Jose Chourio ([@choucoder](https://github.com/choucoder))
