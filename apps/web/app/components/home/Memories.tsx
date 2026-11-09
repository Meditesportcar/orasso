// Bloc « Souvenirs » de l'Accueil du site (lot R7j, maquette R7.10) : même contenu que l'appli. Les jours où il y a un
// souvenir seulement (`GET /me/home` renvoie `memories: null` sinon). Le bouton « En story » est posé par R7f4 sur la page.
import { Button } from "@orasso/design-system/web";
import { type HomeMemory, memoryLabels } from "@orasso/shared";

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
            </a>
            <div className="sv-poster__body">
              <span className="o-t-label sv-poster__eyebrow">{memoryLabels.eyebrow(m.yearsAgo)}</span>
              <h3 className="o-t-poster-m o-never-truncate">{memoryLabels.headline(m.title)}</h3>
              <div className="sv-actions">
                <Button variant="secondary" icon="stamp" href={`/app/souvenir/${m.eventId}`} data-testid="home-memory-open">
                  {memoryLabels.see}
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
