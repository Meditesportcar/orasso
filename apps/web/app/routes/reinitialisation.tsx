import { Button, TextField } from "@orasso/design-system/web";
import { PASSWORD_MIN_LENGTH, passwordHint } from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { api } from "../lib/api.server";
import type { Route } from "./+types/reinitialisation";

// Nouveau mot de passe à partir du lien reçu par e-mail (lot 15). Toutes les sessions du compte sont révoquées et une
// alerte part par e-mail (API).
export function meta() {
  return [{ title: "Nouveau mot de passe · Orasso" }, { name: "robots", content: "noindex" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return { token: url.searchParams.get("token") ?? "", invalid: url.searchParams.get("error") === "INVALID_TOKEN" };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < PASSWORD_MIN_LENGTH) return data({ error: null, password: passwordHint, confirm: null }, 400);
  if (password !== confirm) return data({ error: null, password: null, confirm: "Les deux saisies diffèrent." }, 400);
  const res = await api(request, "/auth/reset-password", { method: "POST", json: { token, newPassword: password } });
  if (!res.ok) {
    return data(
      { error: "Ce lien n'est plus valable : demande-en un nouveau.", password: null, confirm: null },
      { status: 400 },
    );
  }
  return redirect("/connexion?reinitialise=1");
}

export default function Reinitialisation({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const { token, invalid } = loaderData;
  if (!token || invalid) {
    return (
      <div className="s-narrow s-stack">
        <h1 className="s-title">Lien expiré</h1>
        <p className="s-notice s-notice--alert">Ce lien de réinitialisation n'est plus valable.</p>
        <Button href="/mot-de-passe-oublie" icon="next">
          Recevoir un nouveau lien
        </Button>
      </div>
    );
  }
  return (
    <div className="s-narrow s-stack">
      <h1 className="s-title">Nouveau mot de passe</h1>
      <p className="s-lead">Choisis ton nouveau mot de passe. Tes appareils seront déconnectés.</p>
      <Form method="post" className="s-form">
        <input type="hidden" name="token" value={token} />
        <TextField
          label="Nouveau mot de passe"
          name="password"
          type="password"
          autoComplete="new-password"
          revealable
          help={passwordHint}
          error={actionData?.password}
          required
        />
        <TextField
          label="Encore une fois"
          name="confirm"
          type="password"
          autoComplete="new-password"
          revealable
          error={actionData?.confirm}
          required
        />
        {actionData?.error && (
          <p className="s-error" role="alert">
            {actionData.error} <a href="/mot-de-passe-oublie">Mot de passe oublié</a>
          </p>
        )}
        <Button type="submit" icon="check" loading={busy} fullWidth>
          Enregistrer
        </Button>
      </Form>
    </div>
  );
}
