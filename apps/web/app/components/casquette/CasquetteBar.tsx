// La barre du haut d'un espace de casquette (lot R9h, T53, maquette R9 `appbar2` et `clocheH`) : le logotype, la pastille de la
// casquette (le logo seul, qui mène à sa Page), la loupe, la cloche et la bulle, chacune avec sa pastille. Même geste que la barre de
// l'appli ; les compteurs se relisent à l'arrivée d'un message ou d'une notification (`user:<id>`, comme `layouts/app.tsx`) et
// toutes les 60 s, onglet affiché. Jetons seulement (styles de la barre du kit + `styles/casquette.css`).
import { AppBarAction, initialsOf, Logo } from "@orasso/design-system/web";
import { casquettesLabels as C, navLabels } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import "../../styles/casquette.css";
import { apiFetch } from "../../lib/api.client";
import { useChannel } from "../../lib/useChannel";

export type BarCounts = { activity: number; messages: number };

/** Les compteurs de la cloche et de la bulle, relus au fil de l'eau : `load` rend les nouveaux compteurs, `null` si la lecture échoue. */
export function useLiveCounts(
  userId: string,
  initial: BarCounts,
  load: () => Promise<BarCounts | null>,
  /** Se relit aussi quand cette valeur change (l'espace d'une autre structure). */
  scope: string,
): BarCounts {
  const [counts, setCounts] = useState<BarCounts>(initial);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);
  // Le compteur du serveur à l'arrivée sur la page est celui du moment : on le reprend à chaque navigation (loader relancé).
  useEffect(
    () => setCounts({ activity: initial.activity, messages: initial.messages }),
    [initial.activity, initial.messages],
  );
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const next = await loadRef.current();
    if (next && mine === seq.current) setCounts(next);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `scope` relance la lecture pour un autre espace
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh, scope]);
  useChannel(`user:${userId}`, (m) => {
    if (m.type === "inbox.changed" || m.type === "conversation.updated" || m.type === "notification") void refresh();
  });
  return counts;
}

/** Lit un résumé de la boîte et le met en pastilles ; une panne est « inconnu » (`null`), jamais un zéro. */
export async function loadCounts<T>(path: string, toCounts: (summary: T) => BarCounts): Promise<BarCounts | null> {
  const res = await apiFetch<T>(path);
  return res.ok ? toCounts(res.data) : null;
}

export function CasquetteBar({
  name,
  logoUrl,
  pageHref,
  counts,
  activityHref,
  messagesHref,
  activityOn,
  messagesOn,
  searchHref = "/app/explorer?segment=resultats",
}: {
  name: string;
  logoUrl: string | null;
  /** La Page de la casquette : la pastille y mène. */
  pageHref: string;
  counts: BarCounts;
  activityHref: string;
  messagesHref: string;
  activityOn: boolean;
  messagesOn: boolean;
  searchHref?: string;
}) {
  return (
    <header className="o-appbar o-appbar--tab cas-bar" data-testid="casquette-bar">
      <Logo width={118} className="o-appbar__logo" />
      <a
        className="o-appbar__persona is-round cas-bar__chip"
        href={pageHref}
        aria-label={C.siteChipOpen(name)}
        title={name}
        data-testid="casquette-chip"
      >
        <span className="o-appbar__persona-logo">
          {logoUrl ? (
            <img src={logoUrl} alt="" />
          ) : (
            <span role="img" aria-label={name}>
              {initialsOf(name)}
            </span>
          )}
        </span>
      </a>
      <span className="o-appbar__spacer" />
      <AppBarAction icon="search" label={navLabels.top.search} href={searchHref} />
      <AppBarAction
        icon="bell"
        label={navLabels.topCounted.activity(activityOn ? 0 : counts.activity)}
        href={activityHref}
        on={activityOn}
        count={activityOn ? undefined : counts.activity}
      />
      <AppBarAction
        icon="bubble"
        label={navLabels.topCounted.messages(messagesOn ? 0 : counts.messages)}
        href={messagesHref}
        on={messagesOn}
        count={messagesOn ? undefined : counts.messages}
      />
    </header>
  );
}
