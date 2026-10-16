// Annuaire des pros (docs/02 : `/pros`, même principe que `/evenements`) : liste, carte, filtres activité /
// département / texte.
import { Button, Plate, SelectField, TextField } from "@orasso/design-system/web";
import { departments, type Page, type ProCard, proActivities, proActivityLabels } from "@orasso/shared";
import { Form } from "react-router";

import { ProsMap } from "../components/ProsMap";
import { ProTile } from "../components/ProTile";
import { api, originOf } from "../lib/api.server";
import type { Route } from "./+types/pros";

const PAGE = 60;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const get = (name: string) => url.searchParams.get(name) ?? "";
  const filters = {
    activity: (proActivities as readonly string[]).includes(get("activite")) ? get("activite") : "",
    department: (departments as readonly string[]).includes(get("departement")) ? get("departement") : "",
    q: get("q").slice(0, 80),
  };
  const params = new URLSearchParams({ limit: String(PAGE) });
  if (filters.activity) params.set("activity", filters.activity);
  if (filters.department) params.set("department", filters.department);
  if (filters.q) params.set("q", filters.q);
  const cursor = get("suite");
  if (cursor) params.set("cursor", cursor);
  const pros = await api<Page<ProCard>>(request, `/pros?${params}`);
  return {
    pros: pros.ok ? pros.data : { items: [], nextCursor: null },
    filters,
    unavailable: !pros.ok,
    origin: originOf(request),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const origin = loaderData?.origin ?? "";
  const description =
    "Annuaire des professionnels de l'automobile passion : garages, préparateurs, detailing, covering, pièces. Liste, carte et filtres par activité et département.";
  return [
    { title: "Annuaire des pros · Orasso" },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: "Annuaire des pros · Orasso" },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/pros` },
    { property: "og:image", content: `${origin}/og-image.png` },
  ];
}

export default function Pros({ loaderData }: Route.ComponentProps) {
  const { pros, filters, unavailable } = loaderData;
  const active = Object.values(filters).some(Boolean);
  const nextHref = (() => {
    if (!pros.nextCursor) return null;
    const params = new URLSearchParams();
    if (filters.activity) params.set("activite", filters.activity);
    if (filters.department) params.set("departement", filters.department);
    if (filters.q) params.set("q", filters.q);
    params.set("suite", pros.nextCursor);
    return `/pros?${params}`;
  })();

  return (
    <div className="s-stack">
      <div className="s-head">
        <div className="o-t-label s-label">Découvrir</div>
        <h1 className="s-title">Professionnels</h1>
        <p className="s-lead">
          Garages, préparateurs, detailing, covering, pièces : les pros qui connaissent les passionnés. Certains offrent
          une remise selon ton grade Orasso.
        </p>
      </div>

      <Plate as="section" aria-label="Filtres">
        <Form method="get" className="s-filters" data-testid="pros-filters">
          <TextField label="Recherche" name="q" defaultValue={filters.q} placeholder="Nom ou ville" />
          <SelectField
            label="Activité"
            name="activite"
            defaultValue={filters.activity}
            options={[
              { value: "", label: "Toutes" },
              ...proActivities.map((a) => ({ value: a, label: proActivityLabels[a] })),
            ]}
          />
          <SelectField
            label="Département"
            name="departement"
            defaultValue={filters.department}
            options={[{ value: "", label: "Tous" }, ...departments.map((d) => ({ value: d, label: d }))]}
          />
          <Button type="submit" variant="secondary" icon="search">
            Filtrer
          </Button>
          {active && (
            <Button href="/pros" variant="secondary" icon="undo">
              Réinitialiser
            </Button>
          )}
        </Form>
      </Plate>

      {unavailable ? (
        <p className="s-notice s-notice--alert">L'annuaire est momentanément indisponible. Réessaie dans un instant.</p>
      ) : pros.items.length === 0 ? (
        <p className="s-notice" data-testid="pros-empty">
          Aucun pro ne correspond à ces filtres pour l'instant.
        </p>
      ) : (
        <div className="evs">
          <ProsMap pros={pros.items} />
          <div className="s-grid s-grid--list" data-testid="pros-list">
            {pros.items.map((pro) => (
              <ProTile key={pro.slug} pro={pro} />
            ))}
          </div>
        </div>
      )}
      {nextHref && (
        <p className="s-center">
          <Button href={nextHref} variant="secondary" icon="add">
            Voir plus de pros
          </Button>
        </p>
      )}
      <p className="s-center o-t-caption s-muted">
        Tu es professionnel ? <a href="/professionnels">Découvre l'offre et crée ta fiche</a>.
      </p>
    </div>
  );
}
