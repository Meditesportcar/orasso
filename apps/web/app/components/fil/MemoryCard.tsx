// Carte « souvenir » du Fil sur le site (lot R7j) : personnelle, visible de moi seul. « Il y a un an, tu étais à … », la
// photo masquée de ma voiture (sinon l'affiche), « Voir » ouvre la page du souvenir.
import { Icon } from "@orasso/design-system/web";
import { memoryLabels } from "@orasso/shared";

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
        <a className="fil-link" href={href} data-testid="feed-memory-open">
          <Icon name="stamp" size={16} /> {memoryLabels.see}
        </a>
      }
    >
      {image ? (
        <a className="fil-media" href={href} aria-label={memory.title}>
          <img src={image} alt="" loading="lazy" />
        </a>
      ) : null}
      <p className="o-t-caption">{memoryLabels.eyebrow(memory.yearsAgo)}</p>
    </Shell>
  );
}
