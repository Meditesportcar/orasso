import { Button, SelectField, TextField } from "@orasso/design-system/web";
import { CREW_DESCRIPTION_MAX, type CrewView, crewLabels, departments } from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/crews-nouveau";

// Créer un crew (lot 19 ; lot R7b2 : l'ancien « Mes crews » vit dans l'onglet Crew, `/app/crews` y renvoie) : la création d'un
// crew, dont je deviens le chef. Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${crewLabels.createCrew} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  return { defaultDepartment: me.profile.departments?.[0] ?? "66" };
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
  throw redirect(`/app/crew?crew=${encodeURIComponent(res.data.slug)}`);
}

export default function NewCrew({ loaderData, actionData }: Route.ComponentProps) {
  const { defaultDepartment } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <FicheBar title={crewLabels.createCrew} back="/app/crew" />
      <div className="s-narrow s-stack" data-testid="crews">
        <section className="s-section" aria-label={crewLabels.createCrew}>
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
