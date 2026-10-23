// Profil média, création et modification (lot 57, parité de l'appli du lot 55 : `media/nouveau`, `media/modifier`) :
// un nom, ce que le média produit, un lien vers son travail, sa zone et son logo. Pas de numéro de carte de presse
// (D26) : l'administration vérifie le profil (liens, formats).
import { Button, CheckboxField, TextField } from "@orasso/design-system/web";
import {
  departmentSchema,
  mediaAppLabels as L,
  type MediaProfileView,
  mediaFormatLabels,
  mediaFormats,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { FileField, TextAreaField } from "../components/Fields";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import "../styles/media.css";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import type { Route } from "./+types/media-nouveau";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${L.profileTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const { profile } = await apiOrThrow<{ profile: MediaProfileView | null }>(request, "/me/media-profile");
  return { profile };
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const link = (value: string): string | null =>
  value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null;

export async function action({ request }: Route.ActionArgs) {
  await requireMe(request);
  const form = await request.formData();
  if (text(form, "intent") === "logo-remove") {
    const res = await api(request, "/me/media-profile/logo", { method: "DELETE" });
    return res.ok
      ? data({ error: null, ok: true })
      : data({ error: res.error.message, ok: false }, { status: res.status });
  }
  const departments = text(form, "departments")
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (departments.some((d) => !departmentSchema.safeParse(d).success)) {
    return data(
      { error: "Zone couverte : codes de département séparés par des virgules (ex. 66, 11).", ok: false },
      { status: 400 },
    );
  }
  const res = await api(request, "/me/media-profile", {
    method: "PUT",
    json: {
      name: text(form, "name"),
      formats: form.getAll("formats").map(String),
      description: text(form, "description") || null,
      website: link(text(form, "website")),
      instagram: text(form, "instagram") || null,
      youtube: link(text(form, "youtube")),
      departments,
    },
  });
  if (!res.ok) return data({ error: res.error.message, ok: false }, { status: res.status });
  // Logo facultatif : envoyé (`purpose = media_logo`), puis rattaché au profil.
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const upload = new FormData();
    upload.set("purpose", "media_logo");
    upload.set("file", logo);
    const sent = await api<{ key: string }>(request, "/me/uploads", { method: "POST", body: upload });
    if (!sent.ok) return data({ error: sent.error.message, ok: false }, { status: sent.status });
    const set = await api(request, "/me/media-profile/logo", { method: "POST", json: { key: sent.data.key } });
    if (!set.ok) return data({ error: set.error.message, ok: false }, { status: set.status });
  }
  return redirect("/app/media?fait=profil");
}

export default function MediaNouveau({ loaderData, actionData }: Route.ComponentProps) {
  const { profile } = loaderData;
  const busy = useNavigation().state !== "idle";
  const chosen = new Set(profile?.formats ?? []);
  return (
    <>
      <FicheBar title={profile ? L.casquetteEdit : L.createTitle} facts="Casquette Média" back="/app/moi" />
      <div className="s-narrow s-stack" data-testid="media-profile-page">
        <p className="s-lead">{L.profileCreateIntro}</p>
        {actionData?.error && (
          <p className="s-error" role="alert" data-testid="media-profile-error">
            {actionData.error}
          </p>
        )}
        <Form method="post" encType="multipart/form-data" className="s-form" data-testid="media-profile-form">
          <TextField label={L.profileName} name="name" defaultValue={profile?.name ?? ""} required maxLength={60} />
          <fieldset className="s-stack s-stack--tight">
            <legend className="o-t-label">{L.profileFormats}</legend>
            {mediaFormats.map((f) => (
              <CheckboxField
                key={f}
                name="formats"
                value={f}
                label={mediaFormatLabels[f]}
                defaultChecked={chosen.has(f)}
              />
            ))}
          </fieldset>
          <TextAreaField
            label={L.profileDescription}
            name="description"
            defaultValue={profile?.description ?? ""}
            maxLength={800}
          />
          <p className="o-t-caption">{L.profileLinkHelp}</p>
          <TextField label={L.profileWebsite} name="website" defaultValue={profile?.website ?? ""} />
          <TextField label={L.profileInstagram} name="instagram" defaultValue={profile?.instagram ?? ""} />
          <TextField label={L.profileYoutube} name="youtube" defaultValue={profile?.youtube ?? ""} />
          <TextField
            label={L.profileCover}
            name="departments"
            defaultValue={profile?.departments.join(", ") ?? ""}
            help={L.profileCoverHelp}
          />
          {profile?.logoUrl && <img className="md-logo" src={profile.logoUrl} alt={L.profileLogo} />}
          <FileField
            label={profile?.logoUrl ? L.profileLogoChange : L.profileLogoPick}
            name="logo"
            accept="image/jpeg,image/png,image/webp"
          />
          <p className="o-t-caption s-muted">{profile ? L.profileReverifyNote : L.profileVerifyNote}</p>
          <div>
            <Button type="submit" icon="check" loading={busy}>
              {profile ? L.profileSave : L.profileCreate}
            </Button>
          </div>
        </Form>
        {profile?.logoUrl && (
          <Form method="post">
            <input type="hidden" name="intent" value="logo-remove" />
            <Button type="submit" variant="secondary" icon="close" loading={busy}>
              {L.profileLogoRemove}
            </Button>
          </Form>
        )}
        {profile && (
          <Button variant="secondary" icon="back" href="/app/media">
            {L.casquettePress}
          </Button>
        )}
      </div>
    </>
  );
}
