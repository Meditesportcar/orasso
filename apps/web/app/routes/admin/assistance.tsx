// Administration (lot 33, S41) : demandes d'aide des structures. Tant qu'une demande est ouverte (7 jours au plus),
// l'équipe peut intervenir dans l'espace de la structure ; chaque intervention est tracée avec la demande.
import { Button, Chip } from "@orasso/design-system/web";
import {
  type AssistanceRequestView,
  adminTexts,
  assistanceCloseReasonLabels,
  assistanceStatusLabels,
  assistanceTexts,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDateTime, formatDay } from "../../lib/format";
import type { Route } from "./+types/assistance";

export function meta() {
  return [{ title: "Assistance · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const status = new URL(request.url).searchParams.get("statut") === "closed" ? "closed" : "open";
  const rows = await apiOrThrow<AssistanceRequestView[]>(request, `/admin/assistance-requests?status=${status}`);
  return { status, rows };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const id = String((await request.formData()).get("requestId") ?? "");
  const res = await api(request, `/admin/assistance-requests/${encodeURIComponent(id)}/close`, { method: "POST" });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return redirect("/admin/assistance");
}

export default function AdminAssistance({ loaderData, actionData }: Route.ComponentProps) {
  const { status, rows } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Demandes d'aide</h1>
          <p className="s-muted">{assistanceTexts.askHint}</p>
        </div>
        <nav className="s-row" aria-label="Filtre">
          <a href="/admin/assistance" aria-current={status === "open" ? "page" : undefined}>
            <Chip selected={status === "open"}>{assistanceStatusLabels.open}</Chip>
          </a>
          <a href="/admin/assistance?statut=closed" aria-current={status === "closed" ? "page" : undefined}>
            <Chip selected={status === "closed"}>{assistanceStatusLabels.closed}</Chip>
          </a>
        </nav>
      </div>
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="s-notice" data-testid="assistance-empty">
          {adminTexts.overviewEmpty}
        </p>
      ) : (
        rows.map((r) => (
          <section
            key={r.id}
            className="orga__panel s-stack"
            data-testid="assistance-row"
            aria-label={r.structure.name}
          >
            <div className="s-row s-row--between">
              <h2 className="s-h2 o-never-truncate">
                <a href={`/admin/structures/${r.structure.id}`}>{r.structure.name}</a>
              </h2>
              <Chip>
                {r.closeReason ? assistanceCloseReasonLabels[r.closeReason] : assistanceStatusLabels[r.status]}
              </Chip>
            </div>
            <p>{r.message}</p>
            <p className="o-t-caption">
              {r.requestedBy?.pseudo ?? "—"} · {formatDateTime(r.createdAt)} · jusqu'au {formatDay(r.expiresAt)} ·{" "}
              {r.interventions} intervention(s)
            </p>
            <div className="s-row">
              <a href={`/orga/${r.structure.slug}`}>{assistanceTexts.survey}</a>
              {r.status === "open" && (
                <Form method="post">
                  <input type="hidden" name="requestId" value={r.id} />
                  <Button type="submit" variant="secondary" icon="close" loading={busy}>
                    {assistanceTexts.close}
                  </Button>
                </Form>
              )}
            </div>
          </section>
        ))
      )}
    </>
  );
}
