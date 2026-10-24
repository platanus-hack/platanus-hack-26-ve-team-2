// Frases (sin tildes, en minúsculas) con las que el usuario le pide al anfitrión que lo siga o que
// se quede donde está. Las de "quedarse" se revisan primero: "no me sigas" contiene "me sigas"
const STAY = ["no me sigas", "no me sigan", "quedate", "espera aqui", "esperame aqui", "detente", "no te muevas"];
const FOLLOW = ["sigueme", "me sigas", "ven conmigo", "vente conmigo", "acompaname", "camina conmigo", "ven aca", "ven aqui"];

/** true si la frase pide que lo siga, false si pide que se quede, null si no es un comando. */
export function followCommand(transcript: string | null | undefined): boolean | null {
  if (!transcript) return null;
  const text = transcript
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ");
  if (STAY.some((p) => text.includes(p))) return false;
  if (FOLLOW.some((p) => text.includes(p))) return true;
  return null;
}
