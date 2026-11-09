// Bloc « Mes sorties » de l'Accueil (lot R7a2, maquette R7.4) : mes 3 prochains événements où j'ai une place (retenue, en
// attente, liste d'attente, billet), du plus proche au plus lointain ; « Tout voir » mène à Sorties. Une place en cours
// (commencée et pas finie) compte et passe en tête de fait.
// Tour 2 :
//  - une ligne par événement : plusieurs candidatures au même événement (deux véhicules, deux journées) ou une candidature
//    et un billet se regroupent en une ligne qui garde les véhicules et les journées ;
//  - une inscription à une journée est datée, triée et « en cours » selon cette journée (`day`), pas selon l'événement
//    entier ; une journée passée n'est plus une sortie à venir ;
//  - un billet contrôlé (`used`) reste jusqu'à la fin de l'événement (règle partagée `ticketIsUpcoming`) ; un billet
//    n'est montré que si aucune place retenue ne donne déjà l'accès au même événement.
import {
  HOME_OUTINGS_LIMIT,
  type HomeMyOutings,
  type HomeOuting,
  type MyApplication,
  ticketIsUpcoming,
} from "@orasso/shared";

import { now } from "../../../lib/deps";
import type { Viewer } from "../../../lib/session";
import { ticketsService } from "../../tickets/service";

const APPLICATION_STATUSES: readonly MyApplication["status"][] = ["accepted", "pending", "waitlisted", "offered"];
/** La place qui représente l'événement quand il y en a plusieurs : celle qui donne l'accès d'abord. */
const RANK: Partial<Record<HomeOuting["status"], number>> = {
  accepted: 0,
  ticket: 1,
  offered: 2,
  pending: 3,
  waitlisted: 4,
};
const rankOf = (o: HomeOuting) => RANK[o.status] ?? 9;

type Candidate = { outing: HomeOuting; vehicle: string | null };

export async function myOutingsWidget(v: Viewer, upcoming: MyApplication[]): Promise<HomeMyOutings | null> {
  const t = now();
  const live = (endsAt: string) => new Date(endsAt).getTime() > t.getTime();
  const ongoing = (startsAt: string, endsAt: string) => new Date(startsAt) <= t && live(endsAt);

  // Une candidature à une journée se juge sur cette journée ; sans journée, sur l'événement entier.
  const apps = upcoming
    .filter((a) => APPLICATION_STATUSES.includes(a.status) && a.event.status === "published")
    .filter((a) => live(a.day?.endsAt ?? a.event.endsAt));
  const accessSlugs = new Set(apps.filter((a) => a.status === "accepted").map((a) => a.event.slug));
  const tickets = (await ticketsService.mine(v)).filter(
    (x) => ticketIsUpcoming(x, t.getTime()) && !accessSlugs.has(x.event.slug),
  );

  const candidates: Candidate[] = [
    ...apps.map((a): Candidate => {
      const startsAt = a.day?.startsAt ?? a.event.startsAt;
      const endsAt = a.day?.endsAt ?? a.event.endsAt;
      return {
        vehicle: a.vehicle?.label ?? null,
        outing: {
          key: `app-${a.id}`,
          kind: "application",
          id: a.id,
          slug: a.event.slug,
          title: a.event.title,
          startsAt,
          endsAt,
          city: a.event.city,
          status: a.status,
          waitlistRank: a.status === "waitlisted" ? a.waitlistRank : null,
          checkedIn: a.checkedInAt !== null,
          ongoing: ongoing(startsAt, endsAt),
          vehicles: [],
          days: a.day ? [{ date: a.day.date, startsAt: a.day.startsAt, endsAt: a.day.endsAt }] : [],
        },
      };
    }),
    ...tickets.map(
      (x): Candidate => ({
        vehicle: null,
        outing: {
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
          checkedIn: x.status === "used" || x.usedAt !== null,
          ongoing: ongoing(x.event.startsAt, x.event.endsAt),
          vehicles: [],
          days: [],
        },
      }),
    ),
  ];

  // Une ligne par événement.
  const bySlug = new Map<string, Candidate[]>();
  for (const c of candidates) bySlug.set(c.outing.slug, [...(bySlug.get(c.outing.slug) ?? []), c]);
  const byStart = (a: HomeOuting, b: HomeOuting) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  const outings: HomeOuting[] = [...bySlug.values()].map((group) => {
    // La place qui représente l'événement : la plus « ouverte » (retenue, billet, …), puis la plus proche dans le temps.
    const sorted = [...group].sort((a, b) => rankOf(a.outing) - rankOf(b.outing) || byStart(a.outing, b.outing));
    const main = sorted[0]!.outing;
    const days = group
      .flatMap((c) => c.outing.days)
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((d, i, all) => all.findIndex((x) => x.date === d.date) === i);
    const vehicles = [...new Set(group.flatMap((c) => (c.vehicle ? [c.vehicle] : [])))];
    return {
      ...main,
      // Plusieurs journées : l'événement est daté de la première journée à venir, « en cours » si l'une l'est.
      startsAt: [...group].map((c) => c.outing).sort(byStart)[0]!.startsAt,
      ongoing: group.some((c) => c.outing.ongoing),
      vehicles,
      days,
    };
  });
  outings.sort(byStart);

  if (!outings.length) return null;
  return { items: outings.slice(0, HOME_OUTINGS_LIMIT), total: outings.length };
}
