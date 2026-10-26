// Lot R5d (maquette R5.11) : « Y aller » sur la fiche de l'événement du site. Google Maps et Waze, par les
// coordonnées, sinon par l'adresse ; ni l'une ni l'autre : rien. Aucune distance ici (le site ne demande pas la position).

export type RouteTarget = {
  lat: number | null;
  lng: number | null;
  addressLine: string | null;
  postalCode?: string | null;
  city: string | null;
};

function where(e: RouteTarget): string | null {
  if (e.lat != null && e.lng != null) return `${e.lat},${e.lng}`;
  const street = e.addressLine?.trim();
  if (!street) return null;
  return [street, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function routeLinks(e: RouteTarget): { maps: string; waze: string } | null {
  const target = where(e);
  if (!target) return null;
  const located = e.lat != null && e.lng != null;
  return {
    maps: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`,
    waze: located
      ? `https://waze.com/ul?ll=${target}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(target)}&navigate=yes`,
  };
}
