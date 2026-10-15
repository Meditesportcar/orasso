import { Button, TextField } from "@orasso/design-system/web";
import { data, Form, redirect, useNavigation } from "react-router";

import { api, safeReturn, withCookies } from "../lib/api.server";
import type { Route } from "./+types/verification";

export function meta() {
  return [{ title: "Vérification · Orasso" }, { name: "robots", content: "noindex" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return { retour: safeReturn(new URL(request.url).searchParams.get("retour")) };
}

// Deuxième étape de la connexion quand la double authentification est activée.
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const retour = safeReturn(String(form.get("retour") ?? ""));
  const code = String(form.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return data({ error: "Le code compte 6 chiffres." }, { status: 400 });
  const res = await api(request, "/auth/two-factor/verify-totp", { method: "POST", json: { code } });
  if (!res.ok) return data({ error: "Code incorrect ou expiré." }, { status: 401 });
  return redirect(retour, { headers: withCookies(res.headers) });
}

export default function Verification({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <div className="s-narrow s-stack">
      <h1 className="s-title">Double authentification</h1>
      <p className="s-lead">Saisis le code à 6 chiffres de ton application d'authentification.</p>
      <Form method="post" className="s-form">
        <input type="hidden" name="retour" value={loaderData.retour} />
        <TextField
          label="Code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          error={actionData?.error}
          required
        />
        <Button type="submit" icon="check" loading={busy} fullWidth>
          Valider
        </Button>
      </Form>
    </div>
  );
}
