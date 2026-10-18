import { Button, Plate, TextField } from "@orasso/design-system/web";
import { passwordHint, pseudoSchema, type StructurePublic, structureKindLabels } from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { TermsField } from "../components/Fields";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, getMe, loginUrl, withCookies } from "../lib/api.server";
import { signUpFromForm } from "../lib/signup.server";
import type { Route } from "./+types/invitation";

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData?.structure.name;
  return [{ title: name ? `Rejoins ${name} · Orasso` : "Invitation · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const structure = await apiOrThrow<StructurePublic>(request, `/invitations/${encodeURIComponent(params.jeton)}`);
  const me = await getMe(request);
  return { structure, connected: Boolean(me), token: params.jeton };
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const token = encodeURIComponent(params.jeton);
  const structure = await apiOrThrow<StructurePublic>(request, `/invitations/${token}`);
  const back = `/o/${structure.slug}`;

  if (String(form.get("intent")) === "follow") {
    if (!(await getMe(request))) throw redirect(loginUrl(request));
    await api(request, `/invitations/${token}/accept`, { method: "POST" });
    return redirect(back);
  }

  // Création de compte : le compte suit aussitôt la structure (source « lien d'invitation »).
  const result = await signUpFromForm(request, form);
  if (!result.ok) return data({ errors: result.errors, values: result.values }, { status: result.status });
  await api(request, `/invitations/${token}/accept`, { method: "POST", cookie: result.cookie });
  return redirect(back, { headers: withCookies(result.headers) });
}

export default function Invitation({ loaderData, actionData }: Route.ComponentProps) {
  const { structure, connected, token } = loaderData;
  const busy = useNavigation().state !== "idle";
  const errors = actionData?.errors ?? {};
  const [pseudoHint, setPseudoHint] = useState<string | undefined>();

  async function checkPseudo(value: string) {
    if (!value) return setPseudoHint(undefined);
    const parsed = pseudoSchema.safeParse(value.trim());
    if (!parsed.success) return setPseudoHint(parsed.error.issues[0]?.message);
    const res = await apiFetch<{ available: boolean }>(`/pseudo-available?pseudo=${encodeURIComponent(value.trim())}`);
    setPseudoHint(res.ok && !res.data.available ? "Ce pseudo est déjà pris." : undefined);
  }

  return (
    <div className="s-narrow s-stack">
      <div className="o-t-label s-label">Invitation</div>
      <h1 className="s-title">{structure.name}</h1>
      <p className="s-lead">
        {structureKindLabels[structure.kind]}
        {structure.city ? ` · ${structure.city}` : ""}. Suis cette structure sur Orasso : tu es prévenu de ses prochains
        événements, en avant-première.
      </p>
      {structure.description && (
        <Plate>
          <p className="s-prewrap">{structure.description}</p>
        </Plate>
      )}
      {connected ? (
        <Form method="post" className="s-form">
          <input type="hidden" name="intent" value="follow" />
          <Button type="submit" icon="heart" loading={busy} fullWidth>
            Suivre {structure.name}
          </Button>
        </Form>
      ) : (
        <>
          <Form method="post" className="s-form">
            <input type="hidden" name="intent" value="signup" />
            <TextField
              label="Pseudo"
              name="pseudo"
              autoComplete="username"
              defaultValue={actionData?.values.pseudo}
              help="3 à 24 caractères : lettres, chiffres, « _ » ou « . »"
              error={errors.pseudo ?? pseudoHint}
              onBlur={(e) => checkPseudo(e.currentTarget.value)}
              required
            />
            <TextField
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={actionData?.values.email}
              error={errors.email}
              required
            />
            <TextField
              label="Mot de passe"
              name="password"
              type="password"
              autoComplete="new-password"
              revealable
              help={passwordHint}
              error={errors.password}
              required
            />
            <TermsField error={errors.terms} />
            {errors.form && (
              <p className="s-error" role="alert">
                {errors.form}
              </p>
            )}
            <Button type="submit" icon="add" loading={busy} fullWidth>
              Créer mon compte et suivre
            </Button>
          </Form>
          <p className="s-muted">
            Déjà un compte ?{" "}
            <a href={`/connexion?retour=${encodeURIComponent(`/invitation/${token}`)}`}>Se connecter</a>
          </p>
        </>
      )}
    </div>
  );
}
