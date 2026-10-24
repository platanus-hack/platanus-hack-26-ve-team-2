/** Paleta VISTA. Los componentes consumen estos tokens, nunca hex sueltos nuevos. */
export const colors = {
  ink: "#18211d",
  cream: "#f8f6f0",
  orange: "#e66f3d",
  green: "#1d3a30",
  land: "#e8e6de",
  muted: "#67706b",
  border: "#deddd8",
  blue: "#3b88e8",
  success: "#48a878",
  successHalo: "#d9ecdf",
} as const;

export type ColorToken = keyof typeof colors;
