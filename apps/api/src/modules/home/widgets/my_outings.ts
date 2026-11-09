// Bloc « Mes sorties » de l'Accueil (lot R7a2, maquette R7.4) : mes 3 prochaines places (retenue, en attente, liste d'attente,
// billet), de la plus proche à la plus lointaine ; « Tout voir » mène à Sorties. Une place en cours (événement commencé et
// pas fini) compte et passe en tête de fait. Un billet n'est montré que si aucune place retenue ne donne déjà l'accès au
// même événement (c'est la même règle que le glissement de l'Accueil).
import { HOME_OUTINGS_LIMIT, type HomeMyOutings, type HomeOuting, type MyApplication } from "@orasso/shared";

import { now } from "../../../lib/deps";
import type { Viewer } from "../../../lib/session";
import { ticketsService } from "../../tickets/service";

const APPLICATION_STATUSES: readonly MyApplication["status"][] = ["accepted", "pending", "waitlisted", "offered"];

export async function myOutingsWidget(v: Viewer, upcoming: MyApplication[]): Promise<HomeMyOutings | null> {
  const t = now();
  const live = (endsAt: string) => new Date(endsAt).getTime() > t.getTime();
  const ongoing = (startsAt: string, endsAt: string) => new Date(startsAt) <= t && live(endsAt);

  const apps = upcoming.filter(
    (a) => APPLICATION_STATUSES.includes(a.status) && a.event.status === "published" && live(a.event.endsAt),
  );
  const accessSlugs = new Set(apps.filter((a) => a.status === "accepted").map((a) => a.event.slug));
  const tickets = (await ticketsService.mine(v)).filter(
    (x) => x.status === "valid" && live(x.event.endsAt) && !accessSlugs.has(x.event.slug),
  );

  const outings: HomeOuting[] = [
    ...apps.map(
      (a): HomeOuting => ({
        key: `app-${a.id}`,
        kind: "application",
        id: a.id,
        slug: a.event.slug,
        title: a.event.title,
        startsAt: a.event.startsAt,
        endsAt: a.event.endsAt,
        city: a.event.city,
        status: a.status,
        waitlistRank: a.status === "waitlisted" ? a.waitlistRank : null,
        checkedIn: a.checkedInAt !== null,
        ongoing: ongoing(a.event.startsAt, a.event.endsAt),
      }),
    ),
    ...tickets.map(
      (x): HomeOuting => ({
        key: `ticket-${x.id}`,
        kind: "ticket",
        id: x.id,
        slug: x.event.slug,
        title: x.event.title,
        startsAt: x.event.startsAt,
        endsAt: x.event.endsAt,
        city: x.event.city,
        status: "ticket",
        waitlistRank: null,
        checkedIn: x.usedAt !== null,
        ongoing: ongoing(x.event.startsAt, x.event.endsAt),
      }),
    ),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  if (!outings.length) return null;
  return { items: outings.slice(0, HOME_OUTINGS_LIMIT), total: outings.length };
}
