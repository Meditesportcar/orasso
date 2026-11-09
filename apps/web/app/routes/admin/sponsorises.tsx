// Administration (lot 33, lot R7k1) : emplacements sponsorisés de l'Accueil et du Fil (routes du lot 30). Annonceur (un
// pro d'Orasso ou un annonceur externe, ce dernier derrière `sponsored.external_enabled`), endroits (Accueil, Le Fil),
// mention libre, création, période, ciblage par département, plafond quotidien, statut (brouillon, actif, en pause,
// terminé), image, affichages et clics par endroit, aperçu de la carte 4:5. Tarif informatif seulement (aucune
// facturation avant juin 2027).
import { Button, CheckboxField, Chip, SelectField, TextField } from "@orasso/design-system/web";
import {
  type AdminProRow,
  type AdminSettingEntry,
  adminTexts,
  displayDomain,
  adminAppLabels as L,
  placementStatuses,
  placementStatusLabels,
  placementSurfaceLabels,
  type SponsoredPlacementAdmin,
  type SponsoredSurface,
  sponsoredSurfaces,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { FileField } from "../../components/Fields";
import { SponsoredPreview } from "../../components/SponsoredPreview";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDay } from "../../lib/format";
import type { Route } from "./+types/sponsorises";

export function meta() {
  return [{ title: "Sponsorisés · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const [placements, pros, settings] = await Promise.all([
    apiOrThrow<SponsoredPlacementAdmin[]>(request, "/admin/sponsored-placements"),
    apiOrThrow<AdminProRow[]>(request, "/admin/pros?filter=all"),
    apiOrThrow<{ entries: AdminSettingEntry[] }>(request, "/admin/settings"),
  ]);
  return {
    placements,
    pros: pros.filter((p) => p.published),
    // Réglage `sponsored.external_enabled` : tant qu'il est coupé, aucun annonceur externe n'est diffusé.
    externalEnabled: settings.entries.find((e) => e.key === "sponsored.external_enabled")?.value === true,
    done: new URL(request.url).searchParams.get("fait"),
  };
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
    const external = text("advertiserKind") === "external";
    const surfaces = form.getAll("surfaces").map(String);
    const res = await api(request, "/admin/sponsored-placements", {
      method: "POST",
      json: {
        advertiserKind: external ? "external" : "pro",
        ...(external ? { advertiserName: text("advertiserName") } : { proProfileId: text("proProfileId") }),
        disclosure: text("disclosure") || null,
        surfaces: external ? ["feed"] : surfaces,
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
  if (intent === "update") {
    const external = text("advertiserKind") === "external";
    const res = await api(request, `/admin/sponsored-placements/${encodeURIComponent(id)}`, {
      method: "PATCH",
      json: {
        ...(external ? { advertiserName: text("advertiserName") } : {}),
        disclosure: text("disclosure") || null,
        surfaces: external ? ["feed"] : form.getAll("surfaces").map(String),
        departments: departmentsOf(text("departments")),
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

/** Modification d'un emplacement existant : annonceur (nom d'un annonceur externe), endroits, mention, départements. */
function EditPanel({ p, busy, onClose }: { p: SponsoredPlacementAdmin; busy: boolean; onClose: () => void }) {
  const [edit, setEdit] = useState({
    advertiserName: p.advertiserName,
    disclosure: p.disclosure ?? "",
    departments: p.departments.join(", "),
    surfaces: p.surfaces as SponsoredSurface[],
  });
  const set = (patch: Partial<typeof edit>) => setEdit((e) => ({ ...e, ...patch }));
  const external = p.advertiserKind === "external";
  return (
    <Form method="post" className="s-stack" data-testid="placement-edit" aria-label={L.sponsoredEditTitle}>
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="advertiserKind" value={p.advertiserKind} />
      <h3 className="s-h2">{L.sponsoredEditTitle}</h3>
      <div className="adm-form-split">
        <div className="s-stack">
          {external ? (
            <TextField
              label={L.sponsoredAdvertiserName}
              name="advertiserName"
              maxLength={80}
              required
              value={edit.advertiserName}
              onChange={(e) => set({ advertiserName: e.target.value })}
            />
          ) : (
            <p className="s-muted">
              {p.advertiserName} · {L.sponsoredProNameFixed}
            </p>
          )}
          <fieldset className="s-stack s-stack--tight adm-fieldset">
            <legend className="o-t-label">{L.sponsoredSurfacesField}</legend>
            {sponsoredSurfaces.map((x) => (
              <CheckboxField
                key={x}
                name="surfaces"
                value={x}
                label={placementSurfaceLabels[x]}
                checked={edit.surfaces.includes(x)}
                disabled={external}
                onChange={(e) =>
                  set({ surfaces: e.target.checked ? [...edit.surfaces, x] : edit.surfaces.filter((y) => y !== x) })
                }
              />
            ))}
          </fieldset>
          <TextField
            label={L.sponsoredDisclosureField}
            name="disclosure"
            maxLength={40}
            placeholder="Publicité"
            value={edit.disclosure}
            onChange={(e) => set({ disclosure: e.target.value })}
          />
          <TextField
            label={L.sponsoredDepartments}
            name="departments"
            placeholder="66, 11"
            value={edit.departments}
            onChange={(e) => set({ departments: e.target.value })}
          />
        </div>
        <SponsoredPreview
          advertiserName={external ? edit.advertiserName : p.advertiserName}
          title={p.title}
          body={p.body}
          imageUrl={p.imageUrl}
          disclosure={edit.disclosure.trim() || null}
          domain={external ? p.externalUrlDomain : null}
        />
      </div>
      <div className="s-row">
        <Button type="submit" variant="secondary" icon="check" loading={busy}>
          {L.sponsoredSave}
        </Button>
        <Button type="button" variant="secondary" icon="close" onClick={onClose}>
          {L.sponsoredCancel}
        </Button>
      </div>
    </Form>
  );
}

export default function AdminSponsored({ loaderData, actionData }: Route.ComponentProps) {
  const { placements, pros, externalEnabled, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  const [editing, setEditing] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState({
    kind: "pro",
    proProfileId: "",
    advertiserName: "",
    disclosure: "",
    title: "",
    body: "",
    linkUrl: "",
    surfaces: ["home"] as SponsoredSurface[],
  });
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));
  const external = draft.kind === "external";
  const draftName = external ? draft.advertiserName : (pros.find((p) => p.id === draft.proProfileId)?.name ?? "");
  const hasExternal = placements.some((p) => p.advertiserKind === "external");
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Emplacements sponsorisés</h1>
          <p className="s-muted">{L.sponsoredHint}</p>
        </div>
      </div>
      {!externalEnabled && (hasExternal || external) && (
        <p className="s-notice" role="status" data-testid="external-warning">
          {L.sponsoredExternalWarning}
        </p>
      )}
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
                  {p.advertiserName}
                  {p.advertiserKind === "external" ? ` · ${L.sponsoredAdvertiserExternal.toLowerCase()}` : ""}
                  {` · ${p.surfaces.map((x) => placementSurfaceLabels[x]).join(" + ")}`}
                  {` · du ${formatDay(p.startsOn)} au ${formatDay(p.endsOn)}`}
                  {p.departments.length ? ` · ${p.departments.join(", ")}` : " · toute la France"}
                  {p.dailyCap ? ` · ${p.dailyCap} par jour au plus` : ""}
                </span>
              </div>
              <div className="s-row">
                {p.advertiserKind === "external" && !externalEnabled && <Chip>{L.sponsoredExternalCut}</Chip>}
                <Chip>{placementStatusLabels[p.status]}</Chip>
              </div>
            </div>
            <div className="adm-sponso">
              <div className="adm-sponso__text s-stack">
                <p>{p.body}</p>
                <p className="o-t-caption">
                  {p.impressions} affichages · {p.clicks} clics
                </p>
                {sponsoredSurfaces
                  .filter((x) => p.surfaces.includes(x))
                  .map((x) => (
                    <p key={x} className="o-t-caption" data-testid={`placement-stats-${x}`}>
                      {L.sponsoredSurfaceStats(
                        placementSurfaceLabels[x],
                        p.bySurface[x].impressions,
                        p.bySurface[x].clicks,
                      )}
                    </p>
                  ))}
              </div>
              <div className="adm-sponso__preview">
                <SponsoredPreview
                  advertiserName={p.advertiserName}
                  title={p.title}
                  body={p.body}
                  imageUrl={p.imageUrl}
                  disclosure={p.disclosure}
                  domain={p.advertiserKind === "external" ? p.externalUrlDomain : null}
                />
              </div>
            </div>
            {editing === p.id && <EditPanel p={p} busy={busy} onClose={() => setEditing(null)} />}
            <div className="s-row">
              {editing !== p.id && (
                <Button
                  type="button"
                  variant="secondary"
                  icon="edit"
                  onClick={() => setEditing(p.id)}
                  data-testid="placement-edit-open"
                >
                  {L.sponsoredEdit}
                </Button>
              )}
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
        <h2 className="s-h2">{L.sponsoredNew}</h2>
        <div className="adm-form-split">
          <div className="s-stack">
            <SelectField
              label={L.sponsoredAdvertiser}
              name="advertiserKind"
              value={draft.kind}
              onChange={(e) => {
                const kind = e.target.value;
                set({ kind, surfaces: kind === "external" ? ["feed"] : ["home"] });
              }}
              options={[
                { value: "pro", label: L.sponsoredAdvertiserPro },
                { value: "external", label: L.sponsoredAdvertiserExternal },
              ]}
            />
            {external ? (
              <>
                <TextField
                  label={L.sponsoredAdvertiserName}
                  name="advertiserName"
                  maxLength={80}
                  required
                  value={draft.advertiserName}
                  onChange={(e) => set({ advertiserName: e.target.value })}
                />
                <p className="s-muted">{L.sponsoredExternalOnly}</p>
              </>
            ) : (
              <SelectField
                label={L.sponsoredPro}
                name="proProfileId"
                options={pros.map((p) => ({ value: p.id, label: p.name }))}
                placeholder={L.sponsoredProPlaceholder}
                value={draft.proProfileId}
                onChange={(e) => set({ proProfileId: e.target.value })}
              />
            )}
            <fieldset className="s-stack s-stack--tight adm-fieldset">
              <legend className="o-t-label">{L.sponsoredSurfacesField}</legend>
              {sponsoredSurfaces.map((x) => (
                <CheckboxField
                  key={x}
                  name="surfaces"
                  value={x}
                  label={placementSurfaceLabels[x]}
                  checked={draft.surfaces.includes(x)}
                  disabled={external}
                  onChange={(e) =>
                    set({
                      surfaces: e.target.checked ? [...draft.surfaces, x] : draft.surfaces.filter((y) => y !== x),
                    })
                  }
                />
              ))}
            </fieldset>
            <TextField
              label={L.sponsoredDisclosureField}
              name="disclosure"
              maxLength={40}
              placeholder="Publicité"
              value={draft.disclosure}
              onChange={(e) => set({ disclosure: e.target.value })}
            />
            <TextField
              label={L.sponsoredTitleField}
              name="title"
              maxLength={60}
              required
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
            />
            <TextField
              label={L.sponsoredBodyField}
              name="body"
              maxLength={160}
              required
              value={draft.body}
              onChange={(e) => set({ body: e.target.value })}
            />
            <TextField
              label={L.sponsoredLinkField}
              name="linkUrl"
              type="url"
              required
              value={draft.linkUrl}
              onChange={(e) => set({ linkUrl: e.target.value })}
            />
            <TextField label={L.sponsoredDepartments} name="departments" placeholder="66, 11" />
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
          </div>
          <SponsoredPreview
            advertiserName={draftName}
            title={draft.title}
            body={draft.body}
            imageUrl={null}
            disclosure={draft.disclosure.trim() || null}
            domain={external ? displayDomain(draft.linkUrl) : null}
            isNew
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
