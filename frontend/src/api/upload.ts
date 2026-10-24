import { File } from "expo-file-system";

import type { AudioFile, ImageFile } from "@/types/voice";

/**
 * Archivo local → parte de FormData.
 *
 * Expo SDK 57 reemplaza el `fetch` global por `expo/fetch`, que NO soporta el formato
 * propietario de React Native `{ uri, name, type }` en FormData (lanza "Unsupported
 * FormDataPart implementation"). El `File` de expo-file-system implementa `Blob` y sí funciona.
 */
export function toFormDataFile(file: AudioFile | ImageFile): Blob {
  return new File(file.uri);
}
