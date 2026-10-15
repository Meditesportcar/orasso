// Curseur opaque (base64url de `createdAt ISO|id`) pour un tri stable (created_at desc, id desc).

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const createdAt = new Date(iso ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

/** Coupe une page lue avec `limit + 1` lignes et calcule le curseur suivant. */
export function toPage<T extends { createdAt: Date; id: string }, U>(rows: T[], limit: number, map: (row: T) => U) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

/** Échappe `%`, `_` et `\` d'une recherche saisie avant un `ilike`. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
