import type { MyApplication, MyStaffEvent, MyTicket, PassportView, RecapListItem } from "@orasso/shared";

import { api, apiOrThrow } from "../../lib/api.server";
import { nowMs } from "../../lib/clock";

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

/** Ce que l'onglet « Sorties » lit : le passeport de la saison, les votes ouverts pour moi, les récaps prêts. */
export async function loadSorties(request: Request) {
  const season = new URL(request.url).searchParams.get("saison");
  const [view, recaps, apps, tickets, staff] = await Promise.all([
    apiOrThrow<PassportView>(request, `/me/passport${season ? `?season=${encodeURIComponent(season)}` : ""}`),
    api<RecapListItem[]>(request, "/me/recaps"),
    api<MyApplication[]>(request, "/me/applications?scope=upcoming"),
    api<MyTicket[]>(request, "/me/tickets"),
    api<MyStaffEvent[]>(request, "/me/staff-events"),
  ]);
  const now = nowMs();
  return {
    view,
    votes: votable(apps.ok ? apps.data : [], tickets.ok ? tickets.data : [], staff.ok ? staff.data : [], now),
    recaps: (recaps.ok ? recaps.data : [])
      .filter((r) => Date.parse(r.readyAt) <= now)
      .sort((a, b) => b.endsAt.localeCompare(a.endsAt)),
  };
}

export type SortiesData = Awaited<ReturnType<typeof loadSorties>>;
