import { Button, Chip, Plate } from "@orasso/design-system/web";
import { passportScreenTexts, passportTexts } from "@orasso/shared";

import { formatDay } from "../../lib/format";
import { withRetour } from "../../lib/retour";
import { PassportPage } from "../PassportStamp";
import type { SortiesData } from "./passport.server";
import "../../styles/passport.css";

// Lot R7b1 (D38) : l'onglet « Sorties » du Profil (`/app/moi?onglet=sorties`), le contenu de l'ancienne page `/app/passeport` :
// les pages de tampons de la saison, la légende, « Prix du public » et « Récaps ». Mes places (candidatures, billets) sont
// dans la page Sorties : « Voir mes places ».

const LEGEND = [
  { lead: "La forme", text: passportTexts.legendShape },
  { lead: "L'encre", text: passportTexts.legendInk },
  { lead: "L'usure", text: passportTexts.legendWear },
  { lead: "Les rares", text: passportTexts.legendRare },
];

export function SortiesTab({ data }: { data: SortiesData }) {
  const { view, votes, recaps } = data;
  const pages = view.pages.filter((p, i) => p.stamps.length > 0 || i === 0);
  return (
    <div className="s-stack" data-testid="passport">
      <div className="s-head">
        <div className="o-t-label s-label">{view.season.name}</div>
        <h2 className="s-h2">{passportTexts.title}</h2>
      </div>
      <p className="s-lead" data-testid="passport-summary">
        {view.total === 0 ? passportScreenTexts.emptyTitle : passportTexts.summary(view.total, view.rare)}
      </p>
      {view.seasons.length > 1 && (
        <nav className="s-row" aria-label="Saisons">
          {view.seasons.map((s) => (
            <a
              key={s.year}
              href={`/app/moi?onglet=sorties&saison=${s.year}`}
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
              href={withRetour(`/app/votes/${e.slug}`, "/app/moi?onglet=sorties")}
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
