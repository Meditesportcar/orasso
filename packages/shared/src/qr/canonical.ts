// Sérialisation JSON canonique (clés triées, sans espaces) : base de la signature de la liste d'accès
// synchronisée par le staff (ARCHITECTURE.md § 3.2). Les `undefined` sont omis comme dans JSON.stringify.

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const s = JSON.stringify(value);
    if (s === undefined) throw new Error("Valeur non sérialisable");
    return s;
  }
  // Dates et objets sérialisables (comme JSON.stringify) : leur forme JSON.
  const toJSON = (value as { toJSON?: () => unknown }).toJSON;
  if (typeof toJSON === "function") return canonicalJson(toJSON.call(value));
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * Message signé d'une réponse de synchronisation : tout le corps sauf `signature` (et `signatureKid`, qui dit
 * quelle clé vérifier). L'appli calcule SHA-256 de ce texte en UTF-8 et vérifie la signature Ed25519.
 */
export function accessListSigningText(body: Record<string, unknown>): string {
  const { signature: _s, signatureKid: _k, ...rest } = body;
  return canonicalJson(rest);
}
