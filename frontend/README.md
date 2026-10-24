# Frontend — App AR (Expo)

App Expo (SDK 57, expo-router, TypeScript) para Android e iOS con realidad aumentada vía
[ViroReact](https://viro-community.readme.io/) (`@reactvision/react-viro`).

> ViroReact usa código nativo (ARCore/ARKit): **no funciona en Expo Go**. Hay que usar un
> development build. Viro 3.0.x soporta Expo SDK 57 / RN 0.86 — no actualizar la SDK hasta que
> Viro publique soporte.

## Requisitos
- Node 20+
- Android: Android Studio + dispositivo físico con [ARCore](https://developers.google.com/ar/devices)
  (el emulador no sirve para AR). iOS: macOS + Xcode + iPhone con ARKit.
- O bien builds en la nube con EAS (`npx eas-cli@latest build --profile development`).

## Uso
```bash
npm install
npm run android               # expo run:android → compila e instala el dev build
npm run ios                   # expo run:ios (macOS)
npm start                     # servidor de Metro para un dev build ya instalado
```

`android/` e `ios/` se generan con prebuild (Continuous Native Generation) y están en `.gitignore`;
la configuración nativa vive en `app.json` (plugins de Viro y expo-location).

## Configuración
Un solo `.env` (no versionado; copialo con `cp .env.example .env`) para desarrollo y producción, sin distinción de entornos:
- `EXPO_PUBLIC_API_URL=https://api-platanus.jp6.dev`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (la usan `app.config.js` y el mapa)

Todo se lee en `src/config/environment.ts` (`Environment.API_BASE_URL`, `WS_BASE_URL`, `GOOGLE_MAPS_API_KEY`).
No uses `process.env` en otro lugar. `WS_BASE_URL` se deriva de la API (`https` → `wss`).
Para apuntar a un backend local sin tocar el `.env`: `EXPO_PUBLIC_API_URL=http://<tu-ip>:8000 npm start`.

## Estructura
```
src/
├── app/                 Rutas de expo-router. Archivos delgados que solo re-exportan una screen.
├── screens/<feature>/   Pantallas: componen componentes, manejan estado y navegación.
├── components/
│   ├── common/          Design system: primitivas reutilizables (Icon, CircleButton, PrimaryButton…).
│   ├── map/             Componentes del dominio mapa (SitePin, UserDot, estilo de Google Maps).
│   └── ar/              Componentes del dominio AR (SimulationsSheet, FigureSilhouette, escena Viro).
├── api/
│   ├── client.ts        Cliente HTTP (fetch): base URL, timeout, errores normalizados (ApiError).
│   ├── modules/         Un módulo por dominio del backend: health, zones, voice.
│   └── index.ts         Fachada `clientApi` (clientApi.zones.containing(...)).
├── config/              Configuración por entorno.
├── theme/               Tokens de diseño (colors, fonts). Fuente única de estilos base.
├── types/               Contratos de datos (espejo de backend/app/schemas).
├── hooks/               Hooks reutilizables (useApiHealth).
├── data/                Datos estáticos o mock mientras no vienen de la API.
└── utils/               Funciones puras sin React (geo).
```

### Convenciones
- **Dependencias en un solo sentido:** `app → screens → components → theme`. `api`, `hooks`, `utils`
  y `types` nunca importan pantallas ni componentes.
- **Nueva pantalla:** `src/screens/<feature>/<Feature>Screen.tsx` (export nombrado) y luego
  `src/app/<ruta>.tsx` con `export default`.
- **Nuevo endpoint:** tipo en `types/`, función en `api/modules/<dominio>.ts`, y se consume vía
  `clientApi.<dominio>`. Las pantallas no llaman `fetch` directo.
- **Componentes:** si sirve en más de una feature va en `common/`; si no, en `components/<feature>/`.
  Cada carpeta expone un `index.ts`.
- **Nombres:** `PascalCase.tsx` para componentes y pantallas, `useCamelCase.ts` para hooks,
  `camelCase.ts` para el resto. Imports con alias `@/`.

## Checks
```bash
npm run typecheck
npm run lint
npx expo-doctor
```
