// Passeport (lot 57, parité de l'appli du lot 50, prototype DA v2 `s-passport`) : les pages de tampons de la saison
// (même dessin que l'appli : `stampArt` de shared), la légende, puis « Prix du public » (votes ouverts pour moi) et
// « Récaps » (prêts à partir du lendemain, 10 h), comme l'onglet Passeport du visiteur. Cible des notifications
// `stamp_received` (`/app/passeport`).
import { Button, Chip, Plate } from "@orasso/design-system/web";
import {
  type MyApplication,
  type MyStaffEvent,
  type MyTicket,
  type PassportView,
  passportScreenTexts,
  passportTexts,
  type RecapListItem,
} from "@orasso/shared";

import { PassportPage } from "../components/PassportStamp";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { formatDay } from "../lib/format";
import { withRetour } from "../lib/retour";
import "../styles/passport.css";
import type { Route } from "./+types/passeport";

export function meta() {
  return [{ title: "Passeport · Orasso" }, { name: "robots", content: "noindex" }];
}

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

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
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

const LEGEND = [
  { lead: "La forme", text: passportTexts.legendShape },
  { lead: "L'encre", text: passportTexts.legendInk },
  { lead: "L'usure", text: passportTexts.legendWear },
  { lead: "Les rares", text: passportTexts.legendRare },
];

export default function Passeport({ loaderData }: Route.ComponentProps) {
  const { view, votes, recaps } = loaderData;
  const pages = view.pages.filter((p, i) => p.stamps.length > 0 || i === 0);
  return (
    <div className="s-stack" data-testid="passport">
      <div className="s-head">
        <div className="o-t-label s-label">{view.season.name}</div>
        <h1 className="s-title">{passportTexts.title}</h1>
      </div>
      <p className="s-lead" data-testid="passport-summary">
        {view.total === 0 ? passportScreenTexts.emptyTitle : passportTexts.summary(view.total, view.rare)}
      </p>
      {view.seasons.length > 1 && (
        <nav className="s-row" aria-label="Saisons">
          {view.seasons.map((s) => (
            <a
              key={s.year}
              href={`/app/passeport?saison=${s.year}`}
              aria-current={s.year === view.season.year ? "page" : undefined}
            >
              <Chip selected={s.year === view.season.year}>
                {s.name} · {s.total}
              </Chip>
            </a>
          ))}
        </nav>
      )}

      {view.total === 0 ? (
        <Plate className="s-stack s-stack--tight" data-testid="passport-empty">
          <strong>{passportScreenTexts.emptyTitle}</strong>
          <p>{passportTexts.empty}</p>
        </Plate>
      ) : (
        <div className="pp-pages">
          {pages.map((p, i) => (
            <PassportPage
              key={p.stamps[0]?.id ?? i}
              stamps={p.stamps}
              label={passportTexts.page(i + 1, pages.length)}
            />
          ))}
        </div>
      )}

      <section className="pp-legend" aria-label="Légende" data-testid="passport-legend">
        {LEGEND.map((l) => (
          <p key={l.lead} className="o-t-caption">
            <strong>{l.lead}</strong> · {l.text}
          </p>
        ))}
      </section>

      <section className="s-stack s-stack--tight" aria-labelledby="pp-votes" data-testid="passport-votes">
        <h2 id="pp-votes" className="s-h2">
          {passportScreenTexts.votesTitle}
        </h2>
        {votes.length === 0 ? (
          <p className="s-muted">{passportScreenTexts.votesNone}</p>
        ) : (
          votes.map((e) => (
            <Button
              key={e.id}
              variant="secondary"
              icon="badge"
              next
              href={withRetour(`/app/vote/${e.slug}`, "/app/passeport")}
            >
              {`${passportScreenTexts.votesTitle} · ${e.title}`}
            </Button>
          ))
        )}
      </section>

      <section className="s-stack s-stack--tight" aria-labelledby="pp-recaps" data-testid="passport-recaps">
        <h2 id="pp-recaps" className="s-h2">
          {passportScreenTexts.recapsTitle}
        </h2>
        {recaps.length === 0 ? (
          <p className="s-muted">{passportScreenTexts.recapsNone}</p>
        ) : (
          recaps.map((r) => (
            <Button key={r.eventId} variant="secondary" icon="list" next href={`/app/recap/${r.eventId}`}>
              {`${r.title} · ${formatDay(r.startsAt)}`}
            </Button>
          ))
        )}
      </section>
    </div>
  );
}
