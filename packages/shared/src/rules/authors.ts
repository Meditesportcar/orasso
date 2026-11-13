// Clé d'auteur (vague R8, ARCHITECTURE-R8 § 1) : une seule écriture partout pour dire « qui parle » ou « qui est cité ».
// `u:<compte>`, `s:<structure>`, `p:<fiche pro>`, `v:<prestataire>`, `m:<média>` ; la cible d'une mention ajoute
// `e:<événement>`. Les clés `u: s: p:` sont identiques à `storyAuthorKeyOf` (schemas/stories.ts), qui ne change pas.

export const authorKinds = ["user", "structure", "pro", "provider", "media"] as const;
export type AuthorKind = (typeof authorKinds)[number];

/** Cible d'une mention : un auteur possible, ou un événement. */
export const mentionTargetKinds = ["user", "structure", "pro", "provider", "media", "event"] as const;
export type MentionTargetKind = (typeof mentionTargetKinds)[number];

/** D'où vient une mention : le rattachement, une `@` de la légende, la « Collaboration commerciale ». */
export const mentionSources = ["attach", "caption", "commercial"] as const;
export type MentionSource = (typeof mentionSources)[number];

const LETTER = { user: "u", structure: "s", pro: "p", provider: "v", media: "m", event: "e" } as const satisfies Record<
  MentionTargetKind,
  string
>;
const KIND_OF: Record<string, MentionTargetKind> = {
  u: "user",
  s: "structure",
  p: "pro",
  v: "provider",
  m: "media",
  e: "event",
};

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const KEY_RE = new RegExp(`^(?:(u):([A-Za-z0-9_-]{1,64})|([spvme]):(${UUID}))$`);

export type AuthorKey = { kind: AuthorKind; id: string; key: string };
export type MentionTargetKey = { kind: MentionTargetKind; id: string; key: string };

/** `u:<compte>`, `s:<uuid>`… Les UUID sont écrits en minuscules ; l'identifiant d'un compte est gardé tel quel. */
export const authorKeyOf = (kind: AuthorKind | MentionTargetKind, id: string): string =>
  `${LETTER[kind]}:${kind === "user" ? id : id.toLowerCase()}`;

function parse(raw: unknown): MentionTargetKey | null {
  if (typeof raw !== "string") return null;
  const m = KEY_RE.exec(raw);
  if (!m) return null;
  const kind = KIND_OF[m[1] ?? m[3] ?? ""];
  if (!kind) return null;
  const id = kind === "user" ? (m[2] ?? "") : (m[4] ?? "").toLowerCase();
  return { kind, id, key: authorKeyOf(kind, id) };
}

/** Lit une clé d'auteur ; `null` si elle est mal formée ou si c'est une clé d'événement. */
export function parseAuthorKey(raw: unknown): AuthorKey | null {
  const p = parse(raw);
  if (!p || p.kind === "event") return null;
  return { kind: p.kind, id: p.id, key: p.key };
}

/** Lit la cible d'une mention : une clé d'auteur ou `e:<événement>`. */
export function parseMentionTargetKey(raw: unknown): MentionTargetKey | null {
  return parse(raw);
}

const PERSONA_AUTHOR_KIND: Record<string, AuthorKind> = {
  organizer: "structure",
  pro: "pro",
  provider: "provider",
  media: "media",
};

/**
 * La clé d'auteur d'une casquette de `GET /me` (`PersonaEntry { kind, id }`, `id` = l'identifiant de la page) : c'est la
 * valeur de l'en-tête `X-Orasso-Actor` (lot R9a). `fan` et `visitor` n'ont pas de page : `null` (l'en-tête est omis).
 */
export function authorKeyOfPersona(persona: { kind: string; id: string }): string | null {
  const kind = PERSONA_AUTHOR_KIND[persona.kind];
  return kind ? authorKeyOf(kind, persona.id) : null;
}
