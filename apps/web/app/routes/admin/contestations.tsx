// Administration (lot 33) : contestations de malus transmises à l'équipe (l'organisateur n'a pas répondu en 7 jours,
// ARCHITECTURE.md § 2.6). Accepter annule le malus (et peut pointer la présence) ; refuser le maintient.
import { Button, CheckboxField } from "@orasso/design-system/web";
import { adminTexts, type MalusContestView } from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/contestations";

export function meta() {
  return [{ title: "Contestations · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  return { rows: await apiOrThrow<MalusContestView[]>(request, "/admin/malus-contests?status=escalated") };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const id = String(form.get("contestId") ?? "");
  const res = await api(request, `/admin/malus-contests/${encodeURIComponent(id)}/decide`, {
    method: "POST",
    json: {
      decision: String(form.get("decision")) === "accept" ? "accept" : "reject",
      note: String(form.get("note") ?? "").trim() || null,
      checkin: form.get("checkin") === "on",
    },
  });
  if (!res.ok) return data({ id, error: res.error.message }, { status: res.status });
  return redirect("/admin/contestations");
}

export default function AdminContests({ loaderData, actionData }: Route.ComponentProps) {
  const { rows } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Contestations de malus</h1>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="s-notice" data-testid="contests-empty">
          {adminTexts.overviewEmpty}
        </p>
      ) : (
        rows.map((c) => (
          <Form key={c.id} method="post" className="orga__panel s-stack" data-testid="contest-row">
            <input type="hidden" name="contestId" value={c.id} />
            <h2 className="s-h2 o-never-truncate">
              {c.user.pseudo} · {c.event.title}
            </h2>
            <p>{c.message}</p>
            <p className="o-t-caption">
              Déposée le {formatDateTime(c.createdAt)}
              {c.checkedIn ? " · entrée enregistrée" : ""}
            </p>
            <TextAreaField label="Note (envoyée à la personne en cas de refus)" name="note" rows={2} />
            <CheckboxField name="checkin" label="Pointer aussi la présence (entré sans scan)" />
            {actionData && actionData.id === c.id && (
              <p className="s-error" role="alert">
                {actionData.error}
              </p>
            )}
            <div className="s-row">
              <Button type="submit" name="decision" value="accept" variant="secondary" icon="check" loading={busy}>
                Annuler le malus
              </Button>
              <Button type="submit" name="decision" value="reject" variant="secondary" icon="close" loading={busy}>
                Maintenir le malus
              </Button>
            </div>
          </Form>
        ))
      )}
    </>
  );
}
