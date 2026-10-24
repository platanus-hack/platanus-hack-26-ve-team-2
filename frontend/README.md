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
cp .env.example .env          # pon la IP de tu máquina en EXPO_PUBLIC_API_URL
npm run android               # expo run:android → compila e instala el dev build
npm run ios                   # expo run:ios (macOS)
npm start                     # servidor de Metro para un dev build ya instalado
```

`android/` e `ios/` se generan con prebuild (Continuous Native Generation) y están en `.gitignore`;
la configuración nativa vive en `app.json` (plugins de Viro y expo-location).

## Estructura
- `src/app/` — rutas (expo-router). `index.tsx` monta el `ViroARSceneNavigator`.
- `src/components/hello-ar-scene.tsx` — escena AR mínima (texto flotante).
- `src/lib/api.ts` — cliente del backend (`/health`, `/zones/contains`).
- `src/hooks/` — hooks (estado de la API).

## Checks
```bash
npm run typecheck
npm run lint
npx expo-doctor
```
