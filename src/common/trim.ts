// src/common/trim.ts
/** Transformation class-transformer : retire les espaces autour d'un texte saisi. */
export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
