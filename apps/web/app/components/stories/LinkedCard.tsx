// Carte liée d'une story (lot R7f4) : la carte posée sur le fond fait partie de l'image ; ce bouton la rend touchable (« Voir
// l'événement », « Voir la voiture », « Voir le classement »…). `story.linked` est refiltré par l'API à chaque lecture : un
// contenu supprimé ou devenu privé donne `null`, la carte est alors inerte et rien ne s'affiche ici.
import { Icon } from "@orasso/design-system/web";
import type { StoryView } from "@orasso/shared";

const ICON = {
  event: "ticket",
  vehicle: "vehicle",
  feed_post: "feed",
  memory: "stamp",
  vote_result: "trophy",
} as const;

/** L'adresse de la page du contenu lié, selon son genre. */
export function linkedHref(story: StoryView): string | null {
  const l = story.linked;
  if (!l) return null;
  const mine = story.viewsCount !== null;
  switch (l.type) {
    case "event":
      return l.slug ? `/e/${l.slug}` : null;
    case "vehicle":
      return mine ? `/app/garage/${l.id}` : `/v/${l.id}`;
    case "vote_result":
      return l.slug ? `/app/vote/${l.slug}` : null;
    case "memory":
      return l.eventId ? `/app/souvenir/${l.eventId}` : null;
    default:
      return "/app/fil";
  }
}

export function LinkedCard({ story }: { story: StoryView }) {
  const l = story.linked;
  const href = linkedHref(story);
  if (!l || !href) return null;
  return (
    <a className="story-linked" href={href} data-testid="story-linked">
      <Icon name={ICON[l.type]} size={16} />
      <span>{l.label}</span>
    </a>
  );
}
