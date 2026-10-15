import { randomBytes } from "node:crypto";

/** « Nocturne de Canet » → « nocturne-de-canet ». */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " et ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "x"
  );
}

/** Slug libre : le slug simple, sinon suffixé de quelques caractères aléatoires. */
export async function uniqueSlug(text: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugify(text);
  if (!(await taken(base))) return base;
  for (;;) {
    const candidate = `${base}-${randomBytes(2).toString("hex")}`;
    if (!(await taken(candidate))) return candidate;
  }
}
