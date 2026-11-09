// Carte « souvenir » du Fil sur le site (lot R7j) : personnelle, visible de moi seul. « Il y a un an, tu étais à … », la
// photo masquée de ma voiture (sinon l'affiche), « Voir » ouvre la page du souvenir.
import { Icon } from "@orasso/design-system/web";
import { memoryLabels } from "@orasso/shared";

import "../../styles/souvenirs.css";
import { PassportStamp } from "../PassportStamp";

import { type CardProps, Shell } from "./Shell";

export function MemoryCard({ card, onMenu, faded }: CardProps<"memory">) {
  const { memory } = card.payload;
  const href = `/app/souvenir/${memory.eventId}`;
  const image = memory.photoUrl ?? memory.posterUrl;
  return (
    <Shell
      card={card}
      head={
        <span className="fil-logo" aria-hidden="true">
          <Icon name="spark" size={20} />
        </span>
      }
      title={memoryLabels.cardTitle(memory.yearsAgo, memory.title)}
      href={href}
      onMenu={onMenu}
      faded={faded}
      actions={
        <>
          <a className="fil-link" href={href} data-testid="feed-memory-open">
            <Icon name="stamp" size={16} /> {memoryLabels.see}
          </a>
          <a className="fil-link" href={`/e/${memory.slug}/plateau`} data-testid="feed-memory-plateau">
            <Icon name="grid" size={16} /> {memoryLabels.seePlateau}
          </a>
        </>
      }
    >
      <a className="fil-media sv-fil-media" href={href} aria-label={memory.title}>
        {image ? <img src={image} alt="" loading="lazy" /> : null}
        <span className="sv-poster__stamp" aria-hidden="true" data-testid="feed-memory-stamp">
          <PassportStamp stamp={memory.stamp} size={64} />
        </span>
      </a>
      <p className="o-t-caption">{memoryLabels.eyebrow(memory.yearsAgo)}</p>
      {memory.car ? (
        <p className="o-t-caption" data-testid="feed-memory-car">
          {memoryLabels.plateauLine(memory.car.label, memory.car.rank, memory.car.total)}
        </p>
      ) : null}
    </Shell>
  );
}
