import { Button, TextField } from "@orasso/design-system/web";
import { passwordHint, pseudoSchema } from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";
import { apiFetch } from "../lib/api.client";
import { getMe, safeReturn, withCookies } from "../lib/api.server";
import { type SignupErrors, signUpFromForm } from "../lib/signup.server";
import type { Route } from "./+types/inscription";

export function meta() {
  return [{ title: "Créer un compte · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const retour = safeReturn(new URL(request.url).searchParams.get("retour"));
  if (await getMe(request)) throw redirect(retour);
  return { retour };
}

type Errors = SignupErrors;

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const retour = safeReturn(String(form.get("retour") ?? ""));
  const result = await signUpFromForm(request, form);
  if (!result.ok) return data({ errors: result.errors, values: result.values }, { status: result.status });
  return redirect(retour, { headers: withCookies(result.headers) });
}

export default function Inscription({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const { retour } = loaderData;
  const errors: Errors = actionData?.errors ?? {};
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
      <h1 className="s-title">Créer un compte</h1>
      <p className="s-lead">Un pseudo, un e-mail, un mot de passe. Tu reviens ensuite exactement là où tu étais.</p>
      <Form method="post" className="s-form">
        <input type="hidden" name="retour" value={retour} />
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
        {errors.form && (
          <p className="s-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button type="submit" icon="add" loading={busy} fullWidth>
          Créer mon compte
        </Button>
      </Form>
      <p className="s-muted">
        Déjà un compte ? <a href={`/connexion?retour=${encodeURIComponent(retour)}`}>Se connecter</a>
      </p>
    </div>
  );
}
