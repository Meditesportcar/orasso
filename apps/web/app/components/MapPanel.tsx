// Carte d'`/evenements` (lot 56) : à droite sur un bureau, repliée sur un téléphone (bouton « Carte »). Le conteneur
// est monté seulement quand la carte est ouverte : MapLibre ne charge rien pour qui ne la regarde pas.
import { Button } from "@orasso/design-system/web";
import { type EventCard, siteLabels as L } from "@orasso/shared";
import { useEffect, useState } from "react";

import { EventsMap } from "./EventsMap";

export function MapPanel({ events }: { events: EventCard[] }) {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1000px)");
    const sync = () => {
      setWide(query.matches);
      if (query.matches) setOpen(true);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return (
    <div className="w-split__map">
      {!wide && (
        <Button variant="secondary" icon="place" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? L.events.hideMap : L.events.map}
        </Button>
      )}
      {open && <EventsMap events={events} />}
    </div>
  );
}
