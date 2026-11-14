// Les événements d'une Page (« Voir plus » au-delà des 50 à venir et des 12 passés), lot B2b tour 1 : la logique commune du site
// et de l'appli, sans React. Chaque génération de données (une structure, une liste, son curseur de départ) a une clé ; une
// réponse arrivée après un changement de génération est écartée (succès comme échec). Tour 2 : chaque relecture de la première
// page ouvre une nouvelle génération ; la liste n'est remise à zéro que si la structure, la liste ou le curseur de départ
// change ; sinon les pages ajoutées sont relues en arrière-plan (10 au plus) et remplacées d'un coup, l'ancienne liste restant
// affichée, et une relecture qui échoue la laisse telle quelle.

export type EventsPage<T> = { items: T[]; nextCursor: string | null };
export type EventsPageResult<T> = { ok: true; data: EventsPage<T> } | { ok: false };

export type EventsPagerState<T> = {
  /** Ce qui remet la liste à zéro : structure, liste (à venir ou passés) et curseur de départ de la page lue. */
  key: string;
  /** Les événements des pages d'après la première, sans doublon. */
  extra: T[];
  next: string | null;
  /** Le nombre de pages ajoutées après la première (relues à la relecture de la page, 10 au plus). */
  pages: number;
  /** La dernière lecture de « Voir plus » a échoué : « Réessayer » relit la même suite. */
  failed: boolean;
  busy: boolean;
};

/** La plus grande profondeur relue en arrière-plan après une relecture de la page. */
export const EVENTS_REREAD_MAX_PAGES = 10;

/** Ce qui remet la liste à zéro : la structure, la liste et le curseur de départ de la page lue (pas sa suite). */
export const eventsPagerKey = (structureId: string, scope: "upcoming" | "past", start: string | null): string =>
  [structureId, scope, start ?? ""].join("|");

export const freshEventsPagerState = <T>(key: string, firstNext: string | null): EventsPagerState<T> => ({
  key,
  extra: [],
  next: firstNext,
  pages: 0,
  failed: false,
  busy: false,
});

/** La première page puis les suivantes, un événement une seule fois (la première occurrence garde sa place). */
export function mergeEvents<T extends { id: string }>(base: readonly T[], extra: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of [...base, ...extra]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export class EventsPager<T extends { id: string }> {
  private generation = 0;
  private state: EventsPagerState<T>;

  constructor(
    private readonly fetchPage: (cursor: string) => Promise<EventsPageResult<T>>,
    private readonly onChange: (state: EventsPagerState<T>) => void,
    key: string,
    firstNext: string | null,
  ) {
    this.state = freshEventsPagerState<T>(key, firstNext);
  }

  get current(): EventsPagerState<T> {
    return this.state;
  }

  private set(state: EventsPagerState<T>) {
    this.state = state;
    this.onChange(state);
  }

  /**
   * Une nouvelle lecture de la première page (chaque relecture, même identique) : nouvelle génération, donc toute réponse en
   * cours est écartée. Autre clé : la liste repart de zéro. Même clé : les pages ajoutées sont relues depuis le nouveau
   * curseur suivant et remplacées d'un coup ; en attendant, l'ancienne liste reste ; en cas d'échec elle reste aussi.
   */
  sync(key: string, firstNext: string | null): void {
    const generation = ++this.generation;
    const st = this.state;
    if (key !== st.key) {
      this.set(freshEventsPagerState<T>(key, firstNext));
      return;
    }
    if (st.pages === 0) {
      if (st.next !== firstNext || st.failed || st.busy)
        this.set({ ...st, next: firstNext, failed: false, busy: false });
      return;
    }
    void this.reread(generation, firstNext, Math.min(st.pages, EVENTS_REREAD_MAX_PAGES));
  }

  /**
   * La lecture de la première page par l'écran : réussie, c'est un `sync` ; en panne (`ok` faux), rien ne change quand la clé est
   * la même (les pages ajoutées restent, aucune génération n'est ouverte), sinon la liste repart de zéro.
   */
  onRead(key: string, firstNext: string | null, ok: boolean): void {
    if (ok || key !== this.state.key) this.sync(key, firstNext);
  }

  private async reread(generation: number, firstNext: string | null, depth: number): Promise<void> {
    this.set({ ...this.state, busy: true });
    let cursor = firstNext;
    let merged: T[] = [];
    let read = 0;
    while (read < depth && cursor !== null) {
      let res: EventsPageResult<T>;
      try {
        res = await this.fetchPage(cursor);
      } catch {
        res = { ok: false };
      }
      if (generation !== this.generation) return;
      if (!res.ok) {
        // L'ancienne liste reste, « Voir plus » reste possible, sans message.
        this.set({ ...this.state, busy: false });
        return;
      }
      merged = mergeEvents(merged, res.data.items);
      cursor = res.data.nextCursor;
      read++;
    }
    this.set({ ...this.state, extra: merged, next: cursor, pages: read, failed: false, busy: false });
  }

  /** « Voir plus » (ou « Réessayer » après un échec) : la page suivante, au curseur du moment. */
  async more(): Promise<void> {
    const { next, busy } = this.state;
    if (busy || next === null) return;
    const generation = this.generation;
    this.set({ ...this.state, busy: true });
    let res: EventsPageResult<T>;
    try {
      res = await this.fetchPage(next);
    } catch {
      res = { ok: false };
    }
    // Une réponse d'une génération dépassée n'applique rien, ni liste ni échec.
    if (generation !== this.generation) return;
    if (!res.ok) {
      this.set({ ...this.state, failed: true, busy: false });
      return;
    }
    this.set({
      ...this.state,
      extra: mergeEvents([], [...this.state.extra, ...res.data.items]),
      next: res.data.nextCursor,
      pages: this.state.pages + 1,
      failed: false,
      busy: false,
    });
  }
}

/**
 * Sans JavaScript, « Voir plus » est un lien vers la page avec le curseur de la suite dans ces paramètres : la page lit alors la
 * liste à partir de ce curseur (avec JavaScript, le bouton lit la suite sans quitter la page).
 */
export const EVENTS_CURSOR_PARAM = { upcoming: "a-venir", past: "passes" } as const;

/** Le chemin de lecture des événements d'une structure, depuis un curseur de départ éventuel (`null` : le début). */
export function structureEventsPath(
  structureId: string,
  scope: "upcoming" | "past",
  limit: number,
  cursor: string | null,
): string {
  return `/events?structureId=${encodeURIComponent(structureId)}${scope === "past" ? "&scope=past" : ""}&limit=${limit}${
    cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
  }`;
}
