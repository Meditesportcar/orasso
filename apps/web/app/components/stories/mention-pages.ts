import type { StoryMentionItem, StoryMentions } from "@orasso/shared";

// Les pages « Voir plus » des mentions (lot R7h, tour 4) : à chaque revalidation de la page, les pages déjà chargées sont
// relues à la même profondeur (une mention repartagée ailleurs ne propose plus « Ajouter »), sans vider ce qui est affiché
// pendant la lecture.

export type PageResult = { ok: true; data: StoryMentions } | { ok: false; error: { message: string } };
export type FetchPage = (cursor: string) => Promise<PageResult>;

export type Reread =
  | { ok: true; items: StoryMentionItem[]; next: string | null; depth: number }
  | { ok: false; error: string };

/**
 * Relit `depth` pages à la suite de la première (dont le curseur suivant est `firstNext`). S'arrête avant si l'API n'a plus
 * de suite. `current()` dit si la lecture est encore la dernière demandée : sinon `null` (rien n'est appliqué). Une mention
 * déjà vue sur une page précédente n'est jamais rendue deux fois.
 */
export async function rereadPages(
  fetchPage: FetchPage,
  firstNext: string | null,
  depth: number,
  current: () => boolean,
): Promise<Reread | null> {
  const items: StoryMentionItem[] = [];
  const seen = new Set<string>();
  let next = firstNext;
  let read = 0;
  while (read < depth && next) {
    const res = await fetchPage(next);
    if (!current()) return null;
    if (!res.ok) return { ok: false, error: res.error.message };
    for (const m of res.data.items) {
      if (seen.has(m.storyId)) continue;
      seen.add(m.storyId);
      items.push(m);
    }
    next = res.data.nextCursor;
    read++;
  }
  return { ok: true, items, next, depth: read };
}

export type PagerState = {
  items: StoryMentionItem[];
  /** Curseur suivant des pages lues ici (valable seulement quand `depth` > 0). */
  next: string | null;
  depth: number;
  /** Une relecture ou un « Voir plus » est en cours : l'autre geste attend. */
  busy: boolean;
  error: string | null;
};

/** Ce qui fait changer les pages d'après : le curseur et les mentions de la première page, copie liée comprise. */
const firstKeyOf = (first: StoryMentions | null) =>
  first ? `${first.nextCursor ?? ""}|${first.items.map((m) => `${m.storyId}:${m.copyId ?? ""}`).join(",")}` : "";

/**
 * Lot R7h, tour 5 : les pages « Voir plus » et leur relecture, sérialisées. Le hook React n'est qu'une enveloppe.
 * - Une relecture (nouvelle première page, profondeur > 0) pose `busy` : « Voir plus » attend qu'elle soit appliquée (un clic
 *   ne la fait plus rejeter, donc plus de bouton « Ajouter » périmé).
 * - Une lecture « Voir plus » est rattachée à la première page qui l'a lancée : si cette première page change (même à
 *   profondeur zéro), la réponse est jetée et le bouton redevient actif, avec le nouveau curseur.
 */
export class MentionPager {
  state: PagerState = { items: [], next: null, depth: 0, busy: false, error: null };
  private generation = 0;
  private key = "";
  private firstNext: string | null = null;
  private rereading = false;
  private rereadKey = "";
  private pending: StoryMentions | null = null;

  constructor(
    private readonly fetchPage: FetchPage,
    private readonly onChange: (s: PagerState) => void,
  ) {}

  private set(s: PagerState) {
    this.state = s;
    this.onChange(s);
  }

  /** Le curseur de la prochaine page à lire. */
  get next(): string | null {
    return this.state.depth > 0 ? this.state.next : this.firstNext;
  }

  /**
   * À appeler à chaque nouvelle première page (chargement, revalidation, geste). Lot R7h, tour 6 : une première page identique
   * à celle déjà relue ne relance rien ; pendant une relecture, les revalidations se regroupent (une seule relecture de plus,
   * sur la dernière première page) au lieu de redémarrer celle en cours.
   */
  sync(first: StoryMentions | null): void {
    const key = firstKeyOf(first);
    const changed = key !== this.key;
    this.key = key;
    this.firstNext = first?.nextCursor ?? null;
    if (!first) return;
    if (this.state.depth > 0) {
      if (this.rereading) {
        this.pending = first;
        return;
      }
      if (key === this.rereadKey && !this.state.error) return;
      this.reread(first);
    } else if (changed && this.state.busy) {
      // Une lecture rattachée à l'ancienne première page : jetée, elle repartira du nouveau curseur.
      this.generation++;
      this.set({ ...this.state, busy: false });
    }
  }

  private reread(first: StoryMentions): void {
    const mine = ++this.generation;
    this.rereading = true;
    this.pending = null;
    this.rereadKey = firstKeyOf(first);
    this.set({ ...this.state, busy: true });
    void rereadPages(this.fetchPage, first.nextCursor, this.state.depth, () => this.generation === mine).then((out) => {
      if (!out) {
        this.rereading = false;
        return;
      }
      this.set(
        out.ok
          ? { items: out.items, next: out.next, depth: out.depth, busy: false, error: null }
          : { ...this.state, busy: false, error: out.error },
      );
      this.rereading = false;
      const later = this.pending;
      this.pending = null;
      if (later && this.state.depth > 0 && firstKeyOf(later) !== this.rereadKey) this.reread(later);
    });
  }

  async more(): Promise<void> {
    const cursor = this.next;
    if (!cursor || this.state.busy) return;
    const mine = ++this.generation;
    this.rereadKey = this.key;
    const before = this.state;
    this.set({ ...before, busy: true, error: null });
    const res = await this.fetchPage(cursor);
    if (this.generation !== mine) return;
    this.set(
      res.ok
        ? {
            items: [
              ...before.items,
              ...res.data.items.filter((m) => !before.items.some((o) => o.storyId === m.storyId)),
            ],
            next: res.data.nextCursor,
            depth: before.depth + 1,
            busy: false,
            error: null,
          }
        : { ...before, busy: false, error: res.error.message },
    );
  }
}
