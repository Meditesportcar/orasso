/** Assemble des noms de classes en ignorant tout ce qui n'est pas une chaîne non vide (false, null, undefined). */
export function cx(...parts: unknown[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
}
