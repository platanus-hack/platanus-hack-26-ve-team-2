# VISTA

**Conversa con personajes históricos en realidad aumentada, justo en el lugar donde ocurrió la historia.**

## ¿Qué es?

VISTA es una app móvil (Android e iOS) que convierte sitios históricos en experiencias vivas. En vez de leer una placa, llegas al lugar, apuntas la cámara y un personaje histórico aparece frente a ti para contarte lo que pasó ahí.

## ¿Cómo funciona?

1. **Mapa de regiones**: la app muestra en el mapa las zonas con simulaciones disponibles y detecta cuándo entras en una.
2. **Realidad aumentada**: al activar la simulación, un modelo 3D animado del personaje (por ejemplo, Simón Bolívar) aparece anclado al piso usando ARCore/ARKit.
3. **Conversación por voz**: le haces preguntas hablando. Tu audio se transcribe, un LLM responde en personaje con el contexto histórico del sitio y la respuesta vuelve como voz sintetizada con visemas para la sincronía labial del avatar.

## Stack

- **App**: Expo (React Native, TypeScript), expo-router, ViroReact para AR, Google Maps.
- **Backend**: FastAPI, PostgreSQL + PostGIS para zonas geográficas, SQLAlchemy y Alembic.
- **Voz**: ElevenLabs (Scribe para STT, Agents para el LLM, Flash v2.5 para TTS) detrás de una capa de proveedores intercambiables.

## Equipo

- José Parra ([@joseparra97](https://github.com/joseparra97))
- Juan Romero ([@juanromeroraffo](https://github.com/juanromeroraffo))
- Jose Chourio ([@choucoder](https://github.com/choucoder))
