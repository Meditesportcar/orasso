// Administration (lot 33) : journal des accès et des actions de l'équipe (docs/01 « un journal enregistre leurs accès »),
// filtré par action, acteur, structure et période, paginé.
import { Button, TextField } from "@orasso/design-system/web";
import { type AdminAuditRow, adminTexts, type Page } from "@orasso/shared";
import { Form } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { apiOrThrow } from "../../lib/api.server";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/journal";

export function meta() {
  return [{ title: "Journal · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

const FIELDS = ["action", "actor", "structure", "target"] as const;

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const url = new URL(request.url);
  const params = new URLSearchParams({ limit: "50" });
  const filters: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = url.searchParams.get(f)?.trim();
    if (v) {
      params.set(f, v);
      filters[f] = v;
    }
  }
  for (const [f, suffix] of [
    ["du", "T00:00:00+02:00"],
    ["au", "T23:59:59+02:00"],
  ] as const) {
    const v = url.searchParams.get(f);
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      params.set(f === "du" ? "from" : "to", `${v}${suffix}`);
      filters[f] = v;
    }
  }
  const cursor = url.searchParams.get("apres");
  if (cursor) params.set("cursor", cursor);
  const page = await apiOrThrow<Page<AdminAuditRow>>(request, `/admin/audit?${params}`);
  return { page, filters };
}

export default function AdminAudit({ loaderData }: Route.ComponentProps) {
  const { page, filters } = loaderData;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">{adminTexts.audit}</h1>
        </div>
      </div>
      <Form method="get" className="orga__panel adm-search" role="search">
        <TextField label="Action (ex. user. ou structure.assist)" name="action" defaultValue={filters.action ?? ""} />
        <TextField label="Acteur (pseudo)" name="actor" defaultValue={filters.actor ?? ""} />
        <TextField label="Cible (identifiant)" name="target" defaultValue={filters.target ?? ""} />
        <TextField label="Du" name="du" type="date" defaultValue={filters.du ?? ""} />
        <TextField label="Au" name="au" type="date" defaultValue={filters.au ?? ""} />
        <Button type="submit" variant="secondary" icon="search">
          Filtrer
        </Button>
      </Form>
      <section className="orga__panel s-stack">
        {page.items.length === 0 ? (
          <p className="s-notice">{adminTexts.noResult}</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table" data-testid="audit-table">
              <thead>
                <tr>
                  <th scope="col">Quand</th>
                  <th scope="col">Qui</th>
                  <th scope="col">Action</th>
                  <th scope="col">Cible</th>
                  <th scope="col">Motif</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((r) => (
                  <tr key={r.id} data-testid="audit-row" data-action={r.action}>
                    <td>{formatDateTime(r.createdAt)}</td>
                    <td>{r.actorPseudo ?? r.actorUserId}</td>
                    <td>
                      {r.action}
                      {r.assistanceRequestId ? " · sur demande d'aide" : ""}
                    </td>
                    <td className="o-t-caption">
                      {r.targetType} · {r.targetId}
                    </td>
                    <td>{r.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page.nextCursor && (
          <a href={`/admin/journal?${new URLSearchParams({ ...filters, apres: page.nextCursor })}`}>Page suivante</a>
        )}
      </section>
    </>
  );
}
