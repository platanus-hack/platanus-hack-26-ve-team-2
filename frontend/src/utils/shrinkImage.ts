import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

// "¿Qué es esto?": al modelo de visión le alcanza con este ancho para reconocer un cuaderno, un
// cañón o un fuerte, y la captura pasa de 1–2 MB a ~100 KB (subirla tardaba 3–5 s)
const MAX_WIDTH = 720;
const JPEG_QUALITY = 0.6;

/**
 * Copia más chica (JPEG) de una imagen local; devuelve su URI. Necesita el módulo nativo
 * expo-image-manipulator: se importa de forma diferida para que una build vieja sin él no falle.
 */
export async function shrinkImage(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  try {
    // La captura de la vista RA siempre es más ancha (el ancho de la pantalla en píxeles)
    context.resize({ width: MAX_WIDTH });
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
      return result.uri;
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
