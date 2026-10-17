// Administration (lot 33) : emplacements sponsorisés de l'Accueil (routes du lot 30). Création, période, ciblage par
// département, plafond quotidien, statut (brouillon, actif, en pause, terminé), image, affichages et clics. Tarif
// informatif seulement (aucune facturation avant juin 2027).
import { Button, Chip, SelectField, TextField } from "@orasso/design-system/web";
import {
  type AdminProRow,
  adminTexts,
  placementStatuses,
  placementStatusLabels,
  type SponsoredPlacementAdmin,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { FileField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDay } from "../../lib/format";
import type { Route } from "./+types/sponsorises";

export function meta() {
  return [{ title: "Sponsorisés · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const [placements, pros] = await Promise.all([
    apiOrThrow<SponsoredPlacementAdmin[]>(request, "/admin/sponsored-placements"),
    apiOrThrow<AdminProRow[]>(request, "/admin/pros?filter=all"),
  ]);
  return { placements, pros: pros.filter((p) => p.published), done: new URL(request.url).searchParams.get("fait") };
}

const departmentsOf = (raw: string) =>
  raw
    .split(/[\s,;]+/)
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");
  const id = text("id");
  const fail = (res: { status: number; error: { message: string } }) =>
    data({ id, error: res.error.message }, { status: res.status });
  if (intent === "create") {
    const res = await api(request, "/admin/sponsored-placements", {
      method: "POST",
      json: {
        proProfileId: text("proProfileId"),
        title: text("title"),
        body: text("body"),
        linkUrl: text("linkUrl"),
        departments: departmentsOf(text("departments")),
        startsOn: text("startsOn"),
        endsOn: text("endsOn"),
        dailyCap: text("dailyCap") ? Number(text("dailyCap")) : null,
        status: text("status") || "draft",
      },
    });
    return res.ok ? redirect("/admin/sponsorises?fait=1") : fail(res);
  }
  if (intent === "status") {
    const res = await api(request, `/admin/sponsored-placements/${encodeURIComponent(id)}`, {
      method: "PATCH",
      json: { status: text("status") },
    });
    return res.ok ? redirect("/admin/sponsorises?fait=1") : fail(res);
  }
  if (intent === "image") {
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0) return data({ id, error: "Choisis une image." }, { status: 400 });
    const upload = new FormData();
    upload.set("image", file);
    const res = await api(request, `/admin/sponsored-placements/${encodeURIComponent(id)}/image`, {
      method: "POST",
      body: upload,
    });
    return res.ok ? redirect("/admin/sponsorises?fait=1") : fail(res);
  }
  if (intent === "delete") {
    const res = await api(request, `/admin/sponsored-placements/${encodeURIComponent(id)}`, { method: "DELETE" });
    return res.ok ? redirect("/admin/sponsorises?fait=1") : fail(res);
  }
  return data({ id, error: "Action inconnue." }, { status: 400 });
}

export default function AdminSponsored({ loaderData, actionData }: Route.ComponentProps) {
  const { placements, pros, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Emplacements sponsorisés</h1>
          <p className="s-muted">Une carte « Sponsorisé » sur l'Accueil, ciblée par département. Aucune facturation.</p>
        </div>
      </div>
      {done && (
        <p className="s-notice s-notice--ok" role="status">
          {adminTexts.saved}
        </p>
      )}
      {placements.length === 0 ? (
        <p className="s-notice">{adminTexts.overviewEmpty}</p>
      ) : (
        placements.map((p) => (
          <section key={p.id} className="orga__panel s-stack" data-testid="placement-row" aria-label={p.title}>
            <div className="s-row s-row--between">
              <div className="s-stack s-stack--tight">
                <h2 className="s-h2 o-never-truncate">{p.title}</h2>
                <span className="o-t-caption">
                  {p.proName} · du {formatDay(p.startsOn)} au {formatDay(p.endsOn)}
                  {p.departments.length ? ` · ${p.departments.join(", ")}` : " · toute la France"}
                  {p.dailyCap ? ` · ${p.dailyCap} par jour au plus` : ""}
                </span>
              </div>
              <Chip>{placementStatusLabels[p.status]}</Chip>
            </div>
            <p>{p.body}</p>
            <p className="o-t-caption">
              {p.impressions} affichages · {p.clicks} clics
            </p>
            <div className="s-row">
              <Form method="post" className="s-row">
                <input type="hidden" name="intent" value="status" />
                <input type="hidden" name="id" value={p.id} />
                {p.status !== "active" && p.status !== "ended" && (
                  <Button type="submit" name="status" value="active" variant="secondary" icon="check" loading={busy}>
                    Activer
                  </Button>
                )}
                {p.status === "active" && (
                  <Button type="submit" name="status" value="paused" variant="secondary" icon="wait" loading={busy}>
                    Mettre en pause
                  </Button>
                )}
                {p.status !== "ended" && (
                  <Button type="submit" name="status" value="ended" variant="secondary" icon="close" loading={busy}>
                    Terminer
                  </Button>
                )}
              </Form>
              <Form method="post" encType="multipart/form-data" className="adm-search">
                <input type="hidden" name="intent" value="image" />
                <input type="hidden" name="id" value={p.id} />
                <FileField label="Image" name="image" accept="image/*" />
                <Button type="submit" variant="secondary" icon="add" loading={busy}>
                  Envoyer l'image
                </Button>
              </Form>
            </div>
            {actionData && actionData.id === p.id && (
              <p className="s-error" role="alert">
                {actionData.error}
              </p>
            )}
          </section>
        ))
      )}

      <Form method="post" className="orga__panel s-stack" data-testid="placement-form">
        <input type="hidden" name="intent" value="create" />
        <h2 className="s-h2">Nouvel emplacement</h2>
        <SelectField
          label="Pro"
          name="proProfileId"
          options={pros.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Choisir une fiche publiée"
        />
        <TextField label="Titre (60 caractères)" name="title" maxLength={60} required />
        <TextField label="Texte (160 caractères)" name="body" maxLength={160} required />
        <TextField label="Lien (https://…)" name="linkUrl" type="url" required />
        <TextField label="Départements (vide = partout)" name="departments" placeholder="66, 11" />
        <div className="adm-grid">
          <TextField label="Du" name="startsOn" type="date" defaultValue={today} required />
          <TextField label="Au" name="endsOn" type="date" defaultValue={today} required />
          <TextField label="Affichages par jour au plus" name="dailyCap" type="number" min={1} />
          <SelectField
            label="Statut"
            name="status"
            options={placementStatuses
              .filter((s) => s !== "ended")
              .map((s) => ({ value: s, label: placementStatusLabels[s] }))}
          />
        </div>
        {actionData && !actionData.id && (
          <p className="s-error" role="alert">
            {actionData.error}
          </p>
        )}
        <div className="s-row">
          <Button type="submit" variant="secondary" icon="add" loading={busy}>
            Créer l'emplacement
          </Button>
        </div>
      </Form>
    </>
  );
}
