// Les événements d'une Page (« Voir plus » au-delà des 50 à venir et des 12 passés), lot B2b tour 1 : la logique commune du site
// et de l'appli, sans React. Chaque génération de données (une structure, une liste, son curseur de départ) a une clé ; une
// réponse arrivée après un changement de génération est écartée (succès comme échec), et la liste n'est remise à zéro que si
// la clé change, jamais parce qu'un tableau a été relu à l'identique.

export type EventsPage<T> = { items: T[]; nextCursor: string | null };
export type EventsPageResult<T> = { ok: true; data: EventsPage<T> } | { ok: false };

export type EventsPagerState<T> = {
  /** La génération : structure, liste, curseur de départ et curseur suivant de la première page. */
  key: string;
  /** Les événements des pages d'après la première, sans doublon. */
  extra: T[];
  next: string | null;
  /** La dernière lecture de « Voir plus » a échoué : « Réessayer » relit la même suite. */
  failed: boolean;
  busy: boolean;
};

/** Ce qui fait changer de génération : la structure, la liste, le curseur de départ de la page lue et sa suite. */
export const eventsPagerKey = (
  structureId: string,
  scope: "upcoming" | "past",
  start: string | null,
  firstNext: string | null,
): string => [structureId, scope, start ?? "", firstNext ?? ""].join("|");

export const freshEventsPagerState = <T>(key: string, firstNext: string | null): EventsPagerState<T> => ({
  key,
  extra: [],
  next: firstNext,
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

  /** Une nouvelle lecture de la page : la liste repart de zéro seulement si la génération (la clé) a changé. */
  sync(key: string, firstNext: string | null): void {
    if (key === this.state.key) return;
    this.generation++;
    this.set(freshEventsPagerState<T>(key, firstNext));
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
