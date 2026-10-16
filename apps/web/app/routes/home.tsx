import { Button, Icon, Plate, Reveal, SelectField } from "@orasso/design-system/web";
import { departments, type EventCard, type Page } from "@orasso/shared";
import { Form } from "react-router";

import { EventTile } from "../components/EventTile";
import { api, getMe, originOf } from "../lib/api.server";
import type { Route } from "./+types/home";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const asked = url.searchParams.get("departement");
  const me = await getMe(request);
  // « Près de chez toi » : le département choisi, sinon le premier département du secteur du compte connecté.
  const raw = asked ?? me?.profile.departments[0] ?? "";
  const department = (departments as readonly string[]).includes(raw) ? raw : "";
  const near = department ? await api<Page<EventCard>>(request, `/events?limit=6&department=${department}`) : null;
  const all = !near?.ok || near.data.items.length === 0 ? await api<Page<EventCard>>(request, "/events?limit=6") : null;
  const items = (near?.ok && near.data.items.length > 0 ? near.data.items : all?.ok ? all.data.items : []).slice(0, 6);
  return {
    department,
    nearFound: Boolean(near?.ok && near.data.items.length > 0),
    items,
    origin: originOf(request),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const origin = loaderData?.origin ?? "";
  const description =
    "Orasso relie les organisateurs d'événements automobiles et les passionnés : trouve un rassemblement près de chez toi, candidate avec ton véhicule, entre avec ton QR.";
  return [
    { title: "Orasso · Événements automobiles, de l'inscription à l'entrée" },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: "Orasso · Événements automobiles" },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/` },
    { property: "og:image", content: `${origin}/og-image.png` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

const ENTRIES = [
  {
    icon: "vehicle",
    title: "Passionné",
    text: "Ton garage, tes candidatures, ton QR d'accès. Trouve un rassemblement, candidate avec ta voiture, entre sans file d'attente.",
    label: "Trouver un événement",
    href: "/evenements",
  },
  {
    icon: "calendar",
    title: "Organisateur",
    text: "Crée ton événement, trie les candidatures, accueille les véhicules à l'entrée. Gratuit pour les associations, clubs et circuits.",
    label: "Découvrir l'outil",
    href: "/organisateurs",
  },
  {
    icon: "place",
    title: "Professionnel",
    text: "Garages, préparateurs, detailing : sois visible auprès des passionnés de ta région et offre une remise à tes clients.",
    label: "Voir la présentation",
    href: "/professionnels",
  },
] as const;

export default function Home({ loaderData }: Route.ComponentProps) {
  const { department, items, nearFound } = loaderData;
  return (
    <div className="s-stack s-home">
      <Reveal>
        <Plate as="section" className="s-hero" aria-labelledby="home-title">
          <div className="o-t-label s-label">Événements automobiles</div>
          <h1 id="home-title" className="s-title s-title--xl">
            Du rassemblement à l'entrée, sans stress.
          </h1>
          <p className="s-lead s-hero__lead">
            Orasso relie les organisateurs d'événements automobiles et les passionnés : candidatures, tri des véhicules,
            QR d'accès et accueil sur le terrain, même sans réseau.
          </p>
          <div className="s-row">
            <Button variant="primary" icon="explore" href="/evenements">
              Voir les événements
            </Button>
          </div>
        </Plate>
      </Reveal>

      <section className="s-stack" aria-labelledby="next-title">
        <div className="s-row s-row--between">
          <h2 id="next-title" className="s-h2 s-head">
            {department && nearFound ? "Prochains événements près de chez toi" : "Prochains événements"}
          </h2>
          <Form method="get" className="s-filters" aria-label="Choisir un département">
            <SelectField
              label="Département"
              name="departement"
              defaultValue={department}
              options={[{ value: "", label: "Tous" }, ...departments.map((d) => ({ value: d, label: d }))]}
            />
            <Button type="submit" variant="secondary" icon="search">
              Filtrer
            </Button>
          </Form>
        </div>
        {department && !nearFound && (
          <p className="s-notice">Aucun événement à venir dans le {department} : voici les prochains en France.</p>
        )}
        {items.length === 0 ? (
          <p className="s-notice">Aucun événement publié pour l'instant.</p>
        ) : (
          <div className="s-grid" data-testid="home-events">
            {items.map((event) => (
              <EventTile key={event.id} event={event} />
            ))}
          </div>
        )}
        <p>
          <a href="/evenements">Tous les événements, avec la carte et les filtres</a>
        </p>
      </section>

      <section className="s-stack" aria-labelledby="entries-title">
        <h2 id="entries-title" className="s-h2 s-head">
          Pour qui ?
        </h2>
        <div className="s-grid s-grid--3">
          {ENTRIES.map((entry) => (
            <Plate key={entry.title} as="article" className="s-entry">
              <Icon name={entry.icon} size={28} />
              <h3 className="s-tile__title">{entry.title}</h3>
              <p className="s-entry__text">{entry.text}</p>
              <Button variant="secondary" icon="next" href={entry.href}>
                {entry.label}
              </Button>
            </Plate>
          ))}
        </div>
      </section>

      <Plate as="section" className="s-download" aria-labelledby="app-title">
        <Icon name="qr" size={32} />
        <div className="s-grow s-stack s-stack--tight">
          <h2 id="app-title" className="s-h2">
            L'appli Orasso
          </h2>
          <p className="s-entry__text">
            Ton QR d'accès, le mode jour J et les notifications, même hors ligne. En attendant les boutiques, tout
            marche déjà sur le site.
          </p>
        </div>
        <Button variant="secondary" icon="phone" disabled>
          Bientôt sur Android et iPhone
        </Button>
      </Plate>
    </div>
  );
}
