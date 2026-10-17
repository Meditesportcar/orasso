// Administration : sanctions et contestations (lot 32, § 15.2). Super admin seulement : il revoit le dossier d'une
// contestation (docs/01 : « la personne sanctionnée peut contester une fois ; le super administrateur revoit le
// dossier ») et peut lever une sanction à tout moment.
import { Button, Chip } from "@orasso/design-system/web";
import {
  type AdminSanction,
  contestStateLabels,
  moderationLabels,
  reportReasonLabels,
  sanctionKindLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/sanctions";
import "../../styles/moderation.css";

const FILTERS = [
  ["contested", "Contestations à décider"],
  ["active", "En cours"],
  ["all", "Toutes"],
] as const;
type Filter = (typeof FILTERS)[number][0];

export function meta() {
  return [{ title: "Sanctions · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const raw = new URL(request.url).searchParams.get("filtre");
  const filter: Filter = raw === "active" || raw === "all" ? raw : "contested";
  return { filter, rows: await apiOrThrow<AdminSanction[]>(request, `/admin/sanctions?filter=${filter}`) };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const id = encodeURIComponent(String(form.get("sanctionId") ?? ""));
  const intent = String(form.get("intent") ?? "");
  const note = String(form.get("note") ?? "").trim() || null;
  const filter = String(form.get("filter") ?? "contested");
  const res =
    intent === "lift"
      ? await api(request, `/admin/sanctions/${id}/lift`, { method: "POST", json: { note } })
      : await api(request, `/admin/sanctions/${id}/decide`, {
          method: "POST",
          json: { decision: intent === "contest_lift" ? "lift" : "uphold", note },
        });
  if (!res.ok) return data({ error: res.error.message, id: String(form.get("sanctionId")) }, { status: res.status });
  return redirect(`/admin/sanctions?filtre=${encodeURIComponent(filter)}`);
}

export default function AdminSanctions({ loaderData, actionData }: Route.ComponentProps) {
  const { filter, rows } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Modération</div>
          <h1 className="s-title">{moderationLabels.sanctionsTitle}</h1>
        </div>
      </div>
      <nav className="mod-tabs" aria-label="Filtre des sanctions">
        {FILTERS.map(([f, label]) => (
          <a
            key={f}
            href={`/admin/sanctions?filtre=${f}`}
            className={f === filter ? "orga__link is-on" : "orga__link"}
            aria-current={f === filter ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="s-notice" data-testid="sanctions-empty">
          {moderationLabels.sanctionsEmpty}
        </p>
      ) : (
        <div className="g-queue">
          {rows.map((s) => (
            <section key={s.id} className="orga__panel s-stack" aria-label={s.pseudo} data-testid="sanction">
              <div className="s-row s-row--between">
                <div className="s-stack s-stack--tight">
                  <div className="s-label o-t-label">
                    {moderationLabels.sanctionFrom(formatDateTime(s.startsAt))}
                    {s.endsAt && s.kind !== "warning"
                      ? ` · ${moderationLabels.sanctionUntil(formatDateTime(s.endsAt))}`
                      : ""}
                  </div>
                  <h2 className="s-h2">{s.pseudo}</h2>
                </div>
                <Chip variant={s.active ? "accent" : undefined}>{sanctionKindLabels[s.kind]}</Chip>
              </div>
              <p>
                Motif : {reportReasonLabels[s.reason]}
                {s.auto ? ` · ${moderationLabels.autoSanction}` : s.issuedByPseudo ? ` · par ${s.issuedByPseudo}` : ""}
                {s.liftedAt ? ` · ${moderationLabels.sanctionLifted(formatDateTime(s.liftedAt))}` : ""}
              </p>
              {s.note && <p className="o-t-caption s-prewrap">{s.note}</p>}
              <p className="o-t-caption">{contestStateLabels[s.contestStatus]}</p>
              {s.contestMessage && (
                <blockquote className="s-reply s-prewrap" data-testid="contest-message">
                  {s.contestMessage}
                  {s.contestedAt ? ` (${formatDateTime(s.contestedAt)})` : ""}
                </blockquote>
              )}
              {actionData && "error" in actionData && actionData.id === s.id && (
                <p className="s-error" role="alert">
                  {actionData.error}
                </p>
              )}
              {(s.can.decide || s.can.lift) && (
                <Form method="post" className="s-stack">
                  <input type="hidden" name="sanctionId" value={s.id} />
                  <input type="hidden" name="filter" value={filter} />
                  <TextAreaField label={moderationLabels.decisionNote} name="note" rows={2} />
                  <div className="s-row">
                    {s.can.decide ? (
                      <>
                        <Button
                          type="submit"
                          name="intent"
                          value="contest_uphold"
                          variant="secondary"
                          icon="check"
                          loading={busy}
                        >
                          {moderationLabels.uphold}
                        </Button>
                        <Button
                          type="submit"
                          name="intent"
                          value="contest_lift"
                          variant="secondary"
                          icon="undo"
                          loading={busy}
                        >
                          {moderationLabels.lift}
                        </Button>
                      </>
                    ) : (
                      <Button type="submit" name="intent" value="lift" variant="secondary" icon="undo" loading={busy}>
                        {moderationLabels.lift}
                      </Button>
                    )}
                  </div>
                </Form>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
