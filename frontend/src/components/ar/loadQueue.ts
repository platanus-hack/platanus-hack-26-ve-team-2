/**
 * Lo que ya se puede montar de una lista de modelos: cada uno espera a que carguen las copias anteriores
 * del mismo GLB. En el APK, Viro copia el modelo empaquetado a un archivo de caché por cada
 * Viro3DObject que lo carga, siempre al mismo archivo: varias copias a la vez se pisan el archivo
 * mientras otra lo lee y la app se cae (abort en VROPlatformRunTask). Modelos distintos sí cargan en
 * paralelo. Con Metro no pasa: ahí cada carga baja el modelo por HTTP
 */
export function mountable<T extends { model: number }>(list: T[], isLoaded: (item: T, index: number) => boolean): T[] {
  return list.filter((item, i) => list.slice(0, i).every((prev, j) => prev.model !== item.model || isLoaded(prev, j)));
}
