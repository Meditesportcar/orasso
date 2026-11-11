// Mentions d'une publication (vague R8, lot R8a2, ARCHITECTURE-R8 § 1.1) : les cibles qu'une publication crée (l'événement
// et sa structure par le rattachement, les `@mot` de la légende, la « Collaboration commerciale ») et qui les voit.
// Règles pures, communes à l'API et aux écrans ; `now` est toujours passé. La base lit les faits, ces fonctions décident.
import type { StoryPersona } from "./audience";
import { authorKeyOf, type MentionSource, type MentionTargetKind } from "./authors";
import type { FeedEventRole } from "./feedAttach";

/** Nombre de mots `@` lus dans une légende (la légende d'une casquette tient 2 000 caractères : on borne le travail). */
export const MENTION_WORDS_MAX = 20;

const MENTION = /@([\p{L}\p{N}_.-]+)/gu;
const WORD_CHAR = /[\p{L}\p{N}_@]/u;

/**
 * Les mots cités, avec leurs candidats : le mot **complet** d'abord (un pseudo peut finir par un point : `jean.`), puis,
 * retirée une à une, la ponctuation finale d'une phrase (`jean.` → `jean`). La résolution en base prend le premier
 * candidat qui existe (un pseudo ou un slug entier, jamais un préfixe). Un mot par mention, sans doublon, au plus
 * `MENTION_WORDS_MAX`.
 */
export function mentionedCandidates(caption: string | null | undefined): string[][] {
  if (!caption) return [];
  const out: string[][] = [];
  const seen = new Set<string>();
  for (const m of caption.matchAll(MENTION)) {
    const at = m.index ?? 0;
    const before = at > 0 ? caption.charAt(at - 1) : "";
    const prev = at > 1 && /[\uDC00-\uDFFF]/.test(before) ? caption.slice(at - 2, at) : before;
    if (prev && WORD_CHAR.test(prev)) continue;
    let word = (m[1] ?? "").toLowerCase();
    const candidates: string[] = [];
    while (word) {
      candidates.push(word);
      if (!/[.-]$/.test(word)) break;
      word = word.slice(0, -1);
    }
    const first = candidates[0];
    // Un mot fait de ponctuation seule (`@-`, `@.`) n'est pas une mention.
    if (!first || /^[.-]+$/.test(first) || seen.has(first)) continue;
    seen.add(first);
    out.push(candidates);
    if (out.length >= MENTION_WORDS_MAX) break;
  }
  return out;
}

/** Ce que la base répond pour un mot de la légende : une fiche pro publiée, une structure, une personne (au plus un par sorte). */
export type CaptionWord = { word: string; proId?: string | null; structureId?: string | null; userId?: string | null };

export type MentionTarget = { kind: MentionTargetKind; id: string; source: MentionSource };

export type MentionPostFacts = {
  /** Clé de l'auteur (`u:<compte>` ou la page) : on ne se cite pas soi-même. */
  authorKey: string;
  eventId: string | null;
  eventRole: FeedEventRole | null;
  /** La structure de l'événement rattaché (lue en base). */
  eventStructureId: string | null;
  commercialPartnerId: string | null;
  /** Les mots de la légende, déjà résolus par la base, dans l'ordre de la légende. */
  words: readonly CaptionWord[];
};

const keyOf = (t: { kind: MentionTargetKind; id: string }) => `${t.kind}:${t.id}`;

/**
 * Les cibles d'une publication, sans doublon (la première source garde la cible) :
 * 1. rattachement par un auteur qui n'est pas l'organisateur (`on_site`, `attendee`) → l'événement **et** sa structure ;
 * 2. `@mot` de la légende → au plus une cible par mot : fiche pro publiée, puis structure, puis personne ;
 * 3. `commercial_partner_id` → la fiche pro.
 * Jamais l'auteur lui-même.
 */
export function mentionsOf(post: MentionPostFacts): MentionTarget[] {
  const out: MentionTarget[] = [];
  const seen = new Set<string>();
  const add = (kind: MentionTargetKind, id: string | null | undefined, source: MentionSource) => {
    if (!id) return;
    const t = { kind, id: kind === "user" ? id : id.toLowerCase(), source };
    if (authorKeyOf(kind, t.id) === post.authorKey || seen.has(keyOf(t))) return;
    seen.add(keyOf(t));
    out.push(t);
  };
  if (post.eventId && (post.eventRole === "on_site" || post.eventRole === "attendee")) {
    add("event", post.eventId, "attach");
    add("structure", post.eventStructureId, "attach");
  }
  for (const w of post.words) {
    if (w.proId) add("pro", w.proId, "caption");
    else if (w.structureId) add("structure", w.structureId, "caption");
    else if (w.userId) add("user", w.userId, "caption");
  }
  add("pro", post.commercialPartnerId, "commercial");
  return out;
}

/** Les rubriques d'une liste de mentions : « Sur place » (`on_site`), « Passionnés » (`fans`), ou toutes (`all`, pages). */
export type MentionSection = "on_site" | "fans" | "all";

/** Les faits qui décident de la visibilité d'une mention (lus en base, jamais reçus du client). */
export type MentionFacts = {
  source: MentionSource;
  /** `fan` : une personne ; sinon une page (sa confidentialité ne compte pas : la page est publique). */
  persona: StoryPersona;
  /** Le compte de qui a publié est privé (ne compte que pour `fan`). */
  authorPrivate: boolean;
  eventRole: FeedEventRole | null;
  eventEndsAt: Date | null;
  presenceValidated: boolean;
};

/**
 * Une mention se montre-t-elle sur la fiche, dans cette rubrique ? Jamais une publication d'un compte privé, quel que
 * soit le lecteur. « Sur place » : le rôle `on_site`. « Passionnés » : `attendee`, et **après la fin** de l'événement,
 * présence validée seulement (sinon l'absence se déduirait de la liste). Une citation (`caption`, `commercial`) n'a pas de
 * rôle : elle vaut dans `all` seulement.
 */
export function mentionVisible(section: MentionSection, f: MentionFacts, now: Date): boolean {
  if (f.persona === "fan" && f.authorPrivate) return false;
  if (f.source !== "attach") return section === "all";
  if (f.eventRole === "on_site") return section === "on_site" || section === "all";
  if (f.eventRole === "attendee") {
    if (section === "on_site") return false;
    const over = f.eventEndsAt !== null && now.getTime() >= f.eventEndsAt.getTime();
    return !over || f.presenceValidated;
  }
  return false;
}
