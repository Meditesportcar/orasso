import type { HomeLive } from "@orasso/shared";

type Place = { id: string; status: string; event: { slug: string } };
type Pass = { id: string; status: string; event: { slug: string } };

/**
 * « Mon accès » de l'événement en cours (lot R7a2, tour 3) : l'API dit si la personne a une place (`hasPlace` : place retenue
 * ou billet `valid` OU `used`, un billet contrôlé reste une place le jour J, comme sur le site). Le lien vise ma place retenue
 * (QR), sinon mon billet, sinon la liste de mes sorties ; `null` sans place (présence seule).
 */
export function liveAccessHref(
  live: Pick<HomeLive, "hasPlace" | "event"> | null,
  places: Place[],
  passes: Pass[],
): string | null {
  if (!live?.hasPlace) return null;
  const slug = live.event.slug;
  const place = places.find((a) => a.status === "accepted" && a.event.slug === slug);
  if (place) return `/jour-j/${place.id}`;
  const pass = passes.find((x) => (x.status === "valid" || x.status === "used") && x.event.slug === slug);
  return pass ? `/billet/${pass.id}` : "/sorties";
}

/** L'écran montre la copie gardée sur le téléphone : avant la première réponse, ou la dernière lecture a échoué (réseau ou serveur). */
export function showsLocalCopy(s: { hasData: boolean; loading: boolean; failed: boolean; offline: boolean }): boolean {
  return s.offline || (s.hasData && (s.loading || s.failed));
}
