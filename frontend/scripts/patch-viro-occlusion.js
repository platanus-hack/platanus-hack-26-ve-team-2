/**
 * Parche al shader de oclusión de ViroReact (Android).
 *
 * Viro oculta un píxel del modelo si la profundidad real es menor que la virtual + un margen,
 * pero con profundidad "monocular" (ARCore en teléfonos sin sensor ToF) ese margen es 0.
 * Con margen 0 el ruido del mapa de profundidad hace que el piso tape los pies del personaje.
 *
 * Este script cambia el margen a max(15% de la distancia, 30 cm) dentro de libviro_renderer.so
 * (20 cm con sensor de profundidad). Con un margen menor (8% / 12 cm) el personaje se "picaba" al
 * verlo de lejos: a varios metros la profundidad monocular es tan ruidosa que el piso y el fondo lo
 * tapaban a pedazos. Restricciones del reemplazo:
 * - Mismo largo que el original, para no desplazar el binario.
 * - Terminar igual ("r)"): el compilador de C++ copia la línea en bloques de 16 bytes desde el .so
 *   y escribe los últimos bytes como constantes en el código máquina, así que esos no se pueden cambiar.
 * - Seguir usando ar_depth_is_monocular: si GLSL elimina el uniform, Viro aborta al enlazar el shader.
 * Es idempotente y corre en postinstall. Después de aplicarlo hay que recompilar la app.
 */
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const AAR = path.join(
  __dirname,
  "../node_modules/@reactvision/react-viro/android/viro_renderer/viro_renderer-release.aar",
);
const ORIGINAL = "mix(realWorldDepth * 0.08, 0.0, ar_depth_is_monocular)";
const PATCHED = "max(realWorldDepth*.15,  .2+.10*ar_depth_is_monocular)";
// Versiones anteriores de este parche: se reemplazan por la actual
const PREVIOUS = [ORIGINAL, "max(realWorldDepth*.08,  .1+.02*ar_depth_is_monocular)"];

if (PREVIOUS.some((p) => p.length !== PATCHED.length || !PATCHED.endsWith(p.slice(-2)))) {
  throw new Error("El reemplazo debe tener el mismo largo y terminar igual que el original");
}

if (!fs.existsSync(AAR)) {
  console.log("[patch-viro-occlusion] Viro no está instalado, nada que parchear");
  process.exit(0);
}

const zip = new AdmZip(AAR);
let patched = 0;
let alreadyPatched = 0;

for (const entry of zip.getEntries()) {
  if (!entry.entryName.endsWith("/libviro_renderer.so")) continue;
  const data = entry.getData();
  if (data.indexOf(PATCHED) !== -1) {
    alreadyPatched++;
    continue;
  }
  const at = PREVIOUS.map((p) => data.indexOf(p)).find((i) => i !== -1);
  if (at === undefined) continue;
  data.write(PATCHED, at, "latin1");
  zip.updateFile(entry, data);
  patched++;
}

if (patched > 0) {
  zip.writeZip(AAR);
  console.log(`[patch-viro-occlusion] Parcheado en ${patched} arquitectura(s). Recompila la app.`);
} else if (alreadyPatched > 0) {
  console.log("[patch-viro-occlusion] Ya estaba parcheado");
} else {
  // Una versión nueva de Viro pudo cambiar el shader: avisamos sin romper el install
  console.warn("[patch-viro-occlusion] No se encontró el shader esperado; revisa el parche para esta versión de Viro");
}
