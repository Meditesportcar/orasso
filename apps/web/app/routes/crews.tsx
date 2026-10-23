import { Button, Chip, SelectField, TextField } from "@orasso/design-system/web";
import { CREW_DESCRIPTION_MAX, type CrewView, crewLabels, departments, type MyCrew } from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { CrewRow } from "../components/Crews";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/crews";

// Mes crews (lot 19) : les crews dont je suis membre, et la création d'un crew (je deviens son chef).
// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${crewLabels.myCrews} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const crews = await apiOrThrow<MyCrew[]>(request, "/me/crews");
  return { crews, defaultDepartment: me.profile.departments?.[0] ?? "66" };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const res = await api<CrewView>(request, "/crews", {
    method: "POST",
    json: {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? "") || null,
      department: String(form.get("department") ?? ""),
    },
  });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  throw redirect(`/c/${res.data.slug}`);
}

export default function Crews({ loaderData, actionData }: Route.ComponentProps) {
  const { crews, defaultDepartment } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <FicheBar title={crewLabels.myCrews} back="/app/moi" />
      <div className="s-narrow s-stack" data-testid="crews">
        {crews.length === 0 ? (
          <p className="s-notice">{crewLabels.noCrews}</p>
        ) : (
          <ul className="s-people">
            {crews.map((c) => (
              <CrewRow
                key={c.id}
                crew={c}
                extra={c.role === "leader" ? <Chip variant="accent">{crewLabels.leader}</Chip> : null}
              />
            ))}
          </ul>
        )}
        <Button variant="secondary" icon="search" href="/app/explorer?segment=personnes">
          {crewLabels.search}
        </Button>

        <section className="s-section" aria-labelledby="creer-titre">
          <h2 id="creer-titre" className="s-h2">
            {crewLabels.createCrew}
          </h2>
          <p className="o-t-caption s-muted">{crewLabels.createCrewHint}</p>
          {actionData?.error && (
            <p className="s-error" role="alert">
              {actionData.error}
            </p>
          )}
          <Form method="post" className="s-form s-card" data-testid="crew-create-form">
            <TextField label={crewLabels.name} name="name" minLength={3} maxLength={40} required />
            <label className="s-label o-t-label" htmlFor="crew-description">
              {crewLabels.description}
            </label>
            <textarea
              id="crew-description"
              name="description"
              className="s-textarea"
              rows={3}
              maxLength={CREW_DESCRIPTION_MAX}
              placeholder={crewLabels.descriptionPlaceholder}
            />
            <SelectField
              label={crewLabels.department}
              name="department"
              defaultValue={defaultDepartment}
              options={departments.map((d) => ({ value: d, label: d }))}
            />
            <Button type="submit" icon="crew" loading={busy} data-testid="crew-create">
              {crewLabels.createCrew}
            </Button>
          </Form>
        </section>
      </div>
    </>
  );
}
