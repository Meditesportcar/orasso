import { Button, Icon, TextField } from "@orasso/design-system/web";
import {
  editProfileLabels as E,
  profilePhotoLabels as PH,
  socialsLabels as S,
  type SocialNetwork,
  socialHandle,
  socialLabel,
  socialNetworks,
  socialPrefix,
} from "@orasso/shared";
import { useRef, useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { TextAreaField } from "../components/Fields";
import { PersonAvatar } from "../components/People";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/profil-modifier";
import "../styles/profile-r5.css";

// Lot R5b (maquette R5.5) : « Modifier mon profil », comme l'appli : photo, pseudo, description et réseaux (un pseudo
// par réseau, jamais une adresse : Orasso fabrique le lien). Mode B (fiche), retour sur « Mon compte ».
export const handle = ficheHandle;

const BIO_MAX = 500;
const PSEUDO_MAX = 24;
const BACK = "/app/moi";
const HERE = "/app/profil/modifier";

export function meta() {
  return [{ title: `${E.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  return {
    pseudo: me.profile.pseudo,
    bio: me.profile.bio ?? "",
    avatarUrl: me.profile.avatarUrl,
    socials: me.profile.socials ?? {},
    saved: new URL(request.url).searchParams.get("fait"),
  };
}

type Failure = {
  scope: "photo" | "profile";
  error: string | null;
  /** Erreur par champ : `pseudo`, `bio` ou le nom du réseau. */
  fields: Record<string, string>;
  /** Ce qui a été saisi, pour ne rien perdre au refus. */
  values: { pseudo: string; bio: string; socials: Record<string, string> } | null;
};

const SAVED: Record<string, string> = { "1": E.saved, photo: PH.saved, retiree: PH.removed };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const fail = (f: Partial<Failure> & Pick<Failure, "scope">, status = 400) =>
    data<Failure>({ error: null, fields: {}, values: null, ...f }, { status });

  if (intent === "avatar") {
    const file = form.get("avatar");
    if (!(file instanceof File) || file.size === 0) return fail({ scope: "photo", error: "Choisis une photo." });
    const upload = new FormData();
    upload.set("avatar", file);
    const res = await api(request, "/me/avatar", { method: "POST", body: upload });
    if (!res.ok) return fail({ scope: "photo", error: res.error.message }, res.status);
    return redirect(`${HERE}?fait=photo`);
  }
  if (intent === "avatar_remove") {
    const res = await api(request, "/me/avatar", { method: "DELETE" });
    if (!res.ok) return fail({ scope: "photo", error: res.error.message }, res.status);
    return redirect(`${HERE}?fait=retiree`);
  }
  if (intent !== "profile") return fail({ scope: "profile", error: "Action inconnue." });

  const pseudo = String(form.get("pseudo") ?? "").trim();
  const bio = String(form.get("bio") ?? "");
  const raw: Record<string, string> = {};
  const socials: Record<string, string> = {};
  const fields: Record<string, string> = {};
  for (const network of socialNetworks) {
    const value = String(form.get(`social_${network}`) ?? "");
    raw[network] = value;
    const checked = socialHandle(network, value);
    if (checked.ok) socials[network] = checked.handle ?? "";
    else fields[network] = checked.reason;
  }
  const values = { pseudo, bio, socials: raw };
  if (Object.keys(fields).length > 0) return fail({ scope: "profile", fields, values });

  const res = await api(request, "/me/profile", { method: "PATCH", json: { pseudo, bio, socials } });
  if (!res.ok) {
    // L'API répond par champ (`socials.<réseau>`, `pseudo`, `bio`) ; sans champ connu, la phrase générale.
    const apiFields = (res.error.details?.fields ?? {}) as Record<string, unknown>;
    const byField: Record<string, string> = {};
    for (const [key, value] of Object.entries(apiFields)) {
      const text = Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
      if (text) byField[key.replace(/^socials\./, "")] = text;
    }
    const known = Object.keys(byField).length > 0;
    return fail({ scope: "profile", fields: byField, values, error: known ? null : res.error.message }, res.status);
  }
  return redirect(`${HERE}?fait=1`);
}

export default function ProfilModifier({ loaderData, actionData: rawAction }: Route.ComponentProps) {
  const failure = rawAction as Failure | undefined;
  const busy = useNavigation().state !== "idle";
  const photoForm = useRef<HTMLFormElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const values = failure?.scope === "profile" ? failure.values : null;
  const fields = failure?.scope === "profile" ? failure.fields : {};
  const [bioLength, setBioLength] = useState((values?.bio ?? loaderData.bio).length);
  const { saved } = loaderData;

  return (
    <>
      <FicheBar title={E.title} back={BACK} />
      <div className="s-narrow s-stack pr5-edit" data-testid="edit-profile">
        <p className="o-t-caption s-muted">{E.subtitle}</p>
        {saved && SAVED[saved] && (
          <p className="s-notice s-notice--ok" role="status" data-testid="edit-saved">
            {SAVED[saved]}
          </p>
        )}

        <section className="pr5-block" aria-label="Photo">
          <div className="pr5-photo">
            <PersonAvatar url={loaderData.avatarUrl} pseudo={loaderData.pseudo} size={96} />
            <div className="pr5-photo__btns">
              <Form method="post" encType="multipart/form-data" ref={photoForm}>
                <input type="hidden" name="intent" value="avatar" />
                <input
                  ref={photoInput}
                  type="file"
                  name="avatar"
                  accept="image/*"
                  aria-label={PH.changeButton}
                  tabIndex={-1}
                  data-testid="avatar-file"
                  onChange={(e) => {
                    if (e.currentTarget.files?.length) photoForm.current?.requestSubmit();
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  icon="camera"
                  loading={busy}
                  onClick={() => photoInput.current?.click()}
                  data-testid="avatar-change"
                >
                  {PH.changeButton}
                </Button>
              </Form>
              {loaderData.avatarUrl && (
                <Form method="post">
                  <input type="hidden" name="intent" value="avatar_remove" />
                  <Button type="submit" variant="secondary" icon="trash" loading={busy} data-testid="avatar-remove">
                    {PH.removeButton}
                  </Button>
                </Form>
              )}
            </div>
          </div>
          {failure?.scope === "photo" && failure.error && (
            <p className="s-error" role="alert">
              {failure.error}
            </p>
          )}
        </section>

        <Form method="post" className="pr5-edit">
          <input type="hidden" name="intent" value="profile" />
          <TextField
            label={E.pseudo}
            name="pseudo"
            defaultValue={values?.pseudo ?? loaderData.pseudo}
            autoComplete="username"
            maxLength={PSEUDO_MAX}
            help={E.pseudoHelp}
            error={fields.pseudo}
            required
          />
          <div className="s-stack s-stack--tight">
            <TextAreaField
              label={E.description}
              name="bio"
              defaultValue={values?.bio ?? loaderData.bio}
              maxLength={BIO_MAX}
              rows={3}
              error={fields.bio}
              onChange={(e) => setBioLength(e.currentTarget.value.length)}
            />
            <span className="pr5-count" data-testid="bio-count">
              {bioLength} / {BIO_MAX}
            </span>
          </div>

          <section className="pr5-block" aria-labelledby="pr5-socials-t">
            <div className="pr5-sh">
              <h2 id="pr5-socials-t" className="s-h2">
                {S.title}
              </h2>
              <small>{S.optional}</small>
            </div>
            <p className="o-t-caption s-muted">{S.hint}</p>
            <div className="pr5-socf">
              {socialNetworks.map((network: SocialNetwork) => {
                const error = fields[network];
                return (
                  <div key={network} className="pr5-block">
                    <div className={error ? "pr5-sf is-bad" : "pr5-sf"}>
                      <Icon name={network} size={20} />
                      <span className="pr5-sf__name">{socialLabel(network)}</span>
                      <span className="pr5-sf__pre" aria-hidden="true">
                        {socialPrefix(network)}
                      </span>
                      <input
                        name={`social_${network}`}
                        defaultValue={values?.socials[network] ?? loaderData.socials[network] ?? ""}
                        placeholder={S.placeholder[network]}
                        aria-label={S.field(network)}
                        aria-invalid={error ? true : undefined}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        data-testid={`social-${network}`}
                      />
                    </div>
                    {error && (
                      <p className="pr5-err" role="alert" data-testid={`social-error-${network}`}>
                        <Icon name="help" size={14} />
                        <span>{error}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="pr5-note">
              <Icon name="lock" size={16} />
              <span>
                <strong>{S.visibilityStrong}</strong>
                {S.visibilityRest}
              </span>
            </p>
          </section>

          {failure?.scope === "profile" && failure.error && (
            <p className="s-error" role="alert">
              {failure.error}
            </p>
          )}
          <div className="pr5-btns">
            <Button type="submit" icon="check" loading={busy} data-testid="edit-save">
              {E.save}
            </Button>
            <Button variant="secondary" icon="eye" href="/app/profil-public" data-testid="edit-see-public">
              {E.seePublic}
            </Button>
          </div>
        </Form>
      </div>
    </>
  );
}
