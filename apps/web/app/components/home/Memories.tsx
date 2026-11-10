// Bloc « Souvenirs » de l'Accueil du site (lot R7j, maquette R7.10) : même contenu que l'appli. Les jours où il y a un
// souvenir seulement (`GET /me/home` renvoie `memories: null` sinon). Le bouton « En story » (R7f4) ouvre la feuille « Partager ».
import { Button } from "@orasso/design-system/web";
import { type HomeMemory, memoryLabels, shareLabels, widestWordEm } from "@orasso/shared";
import type { CSSProperties } from "react";

import { PassportStamp } from "../PassportStamp";
import { ShareDialog } from "../ShareSheet";

import "../../styles/souvenirs.css";

export function MemoriesBlock({ data }: { data: HomeMemory }) {
  return (
    <section className="s-stack" data-testid="widget-memories" aria-labelledby="hm-memories">
      <h2 className="o-t-label hm-block__title" id="hm-memories">
        {memoryLabels.title}
      </h2>
      {data.items.map((m) => {
        const image = m.photoUrl ?? m.posterUrl;
        return (
          <article className="sv-poster" key={m.eventId} data-testid={`home-memory-${m.eventId}`}>
            <a
              className="sv-poster__photo"
              href={`/app/souvenir/${m.eventId}`}
              aria-label={memoryLabels.cardTitle(m.yearsAgo, m.title)}
            >
              {image ? <img src={image} alt="" loading="lazy" /> : null}
              <span className="sv-poster__stamp" aria-hidden="true" data-testid="home-memory-stamp">
                <PassportStamp stamp={m.stamp} size={72} />
              </span>
            </a>
            <div className="sv-poster__body">
              <span className="o-t-label sv-poster__eyebrow">{memoryLabels.eyebrow(m.yearsAgo)}</span>
              <h3
                className="o-t-poster-m o-never-truncate sv-poster__title"
                style={{ "--em": widestWordEm(memoryLabels.headline(m.title)) } as CSSProperties}
                data-testid="home-memory-title"
              >
                {memoryLabels.headline(m.title)}
              </h3>
              {m.car ? (
                <p className="o-t-caption sv-poster__muted" data-testid="home-memory-car">
                  {memoryLabels.plateauLine(m.car.label, m.car.rank, m.car.total)}
                </p>
              ) : null}
              <div className="sv-actions">
                <Button
                  variant="secondary"
                  icon="stamp"
                  href={`/app/souvenir/${m.eventId}`}
                  data-testid="home-memory-open"
                >
                  {memoryLabels.see}
                </Button>
                <Button variant="secondary" icon="grid" href={`/e/${m.slug}/plateau`} data-testid="home-memory-plateau">
                  {memoryLabels.seePlateau}
                </Button>
                <ShareDialog
                  target={{ type: "memory", id: m.eventId }}
                  label={shareLabels.story}
                  testId="memory-share"
                />
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
