// Administration : badges des structures (lot 27, docs/01 « la structure »). Le badge vaut un an ; la structure est
// prévenue un mois, une semaine et la veille avant l'échéance, puis suspendue sans rien perdre. L'équipe renouvelle,
// suspend ou lève depuis cette page (chaque action est écrite au journal d'administration).
import { Button, Chip, Plate, TextField } from "@orasso/design-system/web";
import {
  type AdminBadgeCounts,
  type AdminBadgeRow,
  afterEventLabels as L,
  structureVerificationLabels,
  suspensionReasonLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDay } from "../../lib/format";
import type { Route } from "./+types/badges";
import "../../styles/after-event.css";

export function meta() {
  return [{ title: "Badges · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

const FILTERS = [
  { id: "expiring", label: L.adminFilterExpiring },
  { id: "suspended", label: L.adminFilterSuspended },
  { id: "all", label: L.adminFilterAll },
] as const;

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const url = new URL(request.url);
  const asked = url.searchParams.get("filtre");
  const filter = FILTERS.find((f) => f.id === asked)?.id ?? "expiring";
  const list = await apiOrThrow<{ items: AdminBadgeRow[]; counts: AdminBadgeCounts }>(
    request,
    `/admin/structures?badge=${filter}`,
  );
  return { filter, ...list, done: url.searchParams.get("fait") };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const id = String(form.get("structureId") ?? "");
  const intent = String(form.get("intent") ?? "");
  const text = String(form.get("text") ?? "").trim();
  const path = intent === "renew" ? "renew-badge" : intent === "suspend" ? "suspend" : "lift";
  const res = await api(request, `/admin/structures/${encodeURIComponent(id)}/${path}`, {
    method: "POST",
    json: intent === "renew" ? { note: text || null } : { reason: text },
  });
  if (!res.ok) return data({ error: res.error.message, id }, { status: res.status });
  return redirect(`/admin/badges?filtre=${String(form.get("filter") ?? "expiring")}&fait=${intent}`);
}

export default function AdminBadges({ loaderData, actionData }: Route.ComponentProps) {
  const { filter, items, counts, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">{L.adminBadgesTitle}</h1>
          <p className="s-muted">{L.adminBadgesIntro}</p>
        </div>
      </div>
      <nav className="s-row" aria-label="Filtre">
        {FILTERS.map((f) => (
          <a key={f.id} href={`/admin/badges?filtre=${f.id}`} aria-current={f.id === filter ? "page" : undefined}>
            <Chip selected={f.id === filter}>
              {f.label}
              {f.id === "expiring" ? ` · ${counts.expiring}` : f.id === "suspended" ? ` · ${counts.suspended}` : ""}
            </Chip>
          </a>
        ))}
      </nav>
      {done && (
        <p className="s-notice s-notice--ok" role="status" data-testid="badges-done">
          {L.adminDone}
        </p>
      )}
      {items.length === 0 ? (
        <p className="s-notice" data-testid="badges-empty">
          {L.adminEmpty}
        </p>
      ) : (
        <div className="s-stack" data-testid="badges-list">
          {items.map((s) => (
            <section
              key={s.id}
              className="orga__panel s-stack"
              aria-label={s.name}
              data-testid="badge-row"
              data-slug={s.slug}
            >
              <div className="s-row s-row--between">
                <div className="s-stack s-stack--tight">
                  <h2 className="s-h2 o-never-truncate">{s.name}</h2>
                  <span className="o-t-caption s-muted">
                    {s.owner ? `${s.owner.pseudo} · ${s.owner.email}` : "Pas de propriétaire actif"}
                  </span>
                </div>
                <div className="s-row">
                  <Chip variant={s.verification === "suspended" ? "accent" : undefined}>
                    {s.verification === "suspended" && s.suspendedReason
                      ? suspensionReasonLabels[s.suspendedReason]
                      : structureVerificationLabels[s.verification]}
                  </Chip>
                </div>
              </div>
              <Plate className="s-stack s-stack--tight">
                <p>
                  <strong>{L.adminDaysLeft(s.daysLeft)}</strong>
                  {s.badgeExpiresAt ? ` · ${L.adminExpiresOn(formatDay(s.badgeExpiresAt))}` : ""}
                </p>
                <p className="o-t-caption">
                  {L.adminReminded} :{" "}
                  {(["30", "7", "1"] as const)
                    .map((d) => (s.reminded[d] ? `J−${d} (${formatDay(s.reminded[d])})` : `J−${d} non envoyé`))
                    .join(" · ")}
                </p>
              </Plate>
              <Form method="post" className="s-stack">
                <input type="hidden" name="structureId" value={s.id} />
                <input type="hidden" name="filter" value={filter} />
                <TextField
                  label={s.verification === "suspended" ? L.adminReason : `${L.adminRenewNote} / ${L.adminReason}`}
                  name="text"
                  help={L.adminReasonHint}
                  maxLength={500}
                  autoComplete="off"
                />
                {actionData && "error" in actionData && actionData.id === s.id && (
                  <p className="s-error" role="alert">
                    {actionData.error}
                  </p>
                )}
                <div className="s-row">
                  {s.verification === "suspended" ? (
                    <>
                      {s.suspendedReason !== "moderation" && (
                        <Button
                          type="submit"
                          name="intent"
                          value="renew"
                          variant="secondary"
                          icon="check"
                          loading={busy}
                        >
                          {L.adminRenew}
                        </Button>
                      )}
                      <Button type="submit" name="intent" value="lift" variant="secondary" icon="undo" loading={busy}>
                        {L.adminLift}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="submit" name="intent" value="renew" variant="secondary" icon="check" loading={busy}>
                        {L.adminRenew}
                      </Button>
                      <Button
                        type="submit"
                        name="intent"
                        value="suspend"
                        variant="secondary"
                        icon="close"
                        loading={busy}
                      >
                        {L.adminSuspend}
                      </Button>
                    </>
                  )}
                  <Button variant="secondary" icon="next" href={`/admin/structures/${s.id}`}>
                    {L.adminOpen}
                  </Button>
                </div>
              </Form>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
