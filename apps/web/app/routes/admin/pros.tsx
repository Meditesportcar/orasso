// Administration (lot 33) : registre des pros. « À vérifier » = fiches publiées sans badge « pro vérifié » (SIRET non
// trouvé automatiquement) ; l'équipe peut poser ou retirer le badge à la main, avec un motif gardé au journal.
import { Button, Chip, TextField } from "@orasso/design-system/web";
import {
  type AdminProRow,
  adminTexts,
  type ProActivity,
  proActivityLabels,
  registryStatusLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import type { Route } from "./+types/pros";

export function meta() {
  return [{ title: "Pros · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const url = new URL(request.url);
  const filter = url.searchParams.get("filtre") === "all" ? "all" : "to_verify";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const rows = await apiOrThrow<AdminProRow[]>(
    request,
    `/admin/pros?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  );
  return { filter, q, rows, done: url.searchParams.get("fait") };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const id = String(form.get("proId") ?? "");
  const res = await api(request, `/admin/pros/${encodeURIComponent(id)}/verify`, {
    method: "POST",
    json: { verified: String(form.get("verified")) === "true", note: String(form.get("note") ?? "").trim() },
  });
  if (!res.ok) return data({ id, error: res.error.message }, { status: res.status });
  return redirect(`/admin/pros?filtre=${String(form.get("filter") ?? "to_verify")}&fait=1`);
}

export default function AdminPros({ loaderData, actionData }: Route.ComponentProps) {
  const { filter, q, rows, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Pros</h1>
        </div>
        <nav className="s-row" aria-label="Filtre">
          <a href="/admin/pros" aria-current={filter === "to_verify" ? "page" : undefined}>
            <Chip selected={filter === "to_verify"}>À vérifier</Chip>
          </a>
          <a href="/admin/pros?filtre=all" aria-current={filter === "all" ? "page" : undefined}>
            <Chip selected={filter === "all"}>Tous</Chip>
          </a>
        </nav>
      </div>
      {done && (
        <p className="s-notice s-notice--ok" role="status">
          C'est fait. L'action est écrite au journal d'administration.
        </p>
      )}
      <Form method="get" className="orga__panel adm-search" role="search">
        <input type="hidden" name="filtre" value={filter} />
        <TextField label="Nom de la fiche" name="q" defaultValue={q} />
        <Button type="submit" variant="secondary" icon="search">
          Chercher
        </Button>
      </Form>
      {rows.length === 0 ? (
        <p className="s-notice">{adminTexts.noResult}</p>
      ) : (
        rows.map((p) => (
          <section key={p.id} className="orga__panel s-stack" data-testid="pro-row" aria-label={p.name}>
            <div className="s-row s-row--between">
              <div className="s-stack s-stack--tight">
                <h2 className="s-h2 o-never-truncate">
                  <a href={`/p/${p.slug}`}>{p.name}</a>
                </h2>
                <span className="o-t-caption">
                  {p.activities.map((a) => proActivityLabels[a as ProActivity] ?? a).join(" · ")}
                  {p.city ? ` · ${p.city}` : ""}
                  {p.owner ? " · " : ""}
                  {p.owner && <a href={`/admin/utilisateurs/${p.owner.id}`}>{p.owner.pseudo}</a>}
                </span>
              </div>
              <div className="s-row">
                <Chip>{p.verified ? "Pro vérifié" : "Sans badge"}</Chip>
                {!p.published && <Chip>Non publiée</Chip>}
              </div>
            </div>
            <p className="o-t-caption">
              {p.siret ? `SIRET ${p.siret}` : "Pas de SIRET"}
              {p.registryStatus
                ? ` · ${registryStatusLabels[p.registryStatus as keyof typeof registryStatusLabels] ?? p.registryStatus}`
                : ""}
            </p>
            <Form method="post" className="adm-search">
              <input type="hidden" name="proId" value={p.id} />
              <input type="hidden" name="filter" value={filter} />
              <input type="hidden" name="verified" value={p.verified ? "false" : "true"} />
              <TextField label={adminTexts.reasonLabel} name="note" required minLength={5} />
              <Button type="submit" variant="secondary" icon={p.verified ? "close" : "check"} loading={busy}>
                {p.verified ? "Retirer le badge" : "Vérifier à la main"}
              </Button>
            </Form>
            {actionData && "id" in actionData && actionData.id === p.id && (
              <p className="s-error" role="alert">
                {actionData.error}
              </p>
            )}
          </section>
        ))
      )}
    </>
  );
}
