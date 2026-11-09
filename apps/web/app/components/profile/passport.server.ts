import type { MyApplication, MyStaffEvent, MyTicket, PassportView, RecapListItem } from "@orasso/shared";

import { api } from "../../lib/api.server";
import { nowMs } from "../../lib/clock";
import type { PanelFailure } from "./panel";
import { mainOrFailure } from "./panel.server";

// Lot R7b1 : lecture de l'onglet « Sorties » du Profil (avant : la page `/app/passeport`, lots 57 et suivants).

/** Événements en cours où je peux voter : véhicule pointé, billet contrôlé, staff présent (l'API tranche). */
function votable(apps: MyApplication[], tickets: MyTicket[], staff: MyStaffEvent[], now: number) {
  const found = new Map<string, { slug: string; title: string }>();
  const open = (e: { endsAt: string }) => now < Date.parse(e.endsAt);
  for (const a of apps) if (a.status === "accepted" && a.checkedInAt && open(a.event)) found.set(a.event.id, a.event);
  for (const t of tickets) if (t.status === "used" && open(t.event)) found.set(t.event.id, t.event);
  for (const s of staff) {
    const from = Date.parse(s.event.startsAt) - 3 * 3_600_000;
    if (s.presence === "present" && from <= now && open(s.event)) found.set(s.event.id, s.event);
  }
  return [...found.entries()].map(([id, e]) => ({ id, slug: e.slug, title: e.title }));
}

export type SortiesData = {
  view: PassportView;
  votes: { id: string; slug: string; title: string }[];
  recaps: RecapListItem[];
};

/** Ce que l'onglet « Sorties » lit : le passeport de la saison, les votes ouverts pour moi, les récaps prêts. */
export async function loadSorties(request: Request): Promise<SortiesData | PanelFailure> {
  const season = new URL(request.url).searchParams.get("saison");
  const [view, recaps, apps, tickets, staff] = await Promise.all([
    api<PassportView>(request, `/me/passport${season ? `?season=${encodeURIComponent(season)}` : ""}`),
    api<RecapListItem[]>(request, "/me/recaps"),
    api<MyApplication[]>(request, "/me/applications?scope=upcoming"),
    api<MyTicket[]>(request, "/me/tickets"),
    api<MyStaffEvent[]>(request, "/me/staff-events"),
  ]);
  // Tour 2 : sans le passeport, le panneau tombe seul (message + « Réessayer »), jamais tout Mon compte.
  const main = mainOrFailure(request, view);
  if ("failed" in main) return main;
  const now = nowMs();
  return {
    view: main.data,
    votes: votable(apps.ok ? apps.data : [], tickets.ok ? tickets.data : [], staff.ok ? staff.data : [], now),
    recaps: (recaps.ok ? recaps.data : [])
      .filter((r) => Date.parse(r.readyAt) <= now)
      .sort((a, b) => b.endsAt.localeCompare(a.endsAt)),
  };
}
