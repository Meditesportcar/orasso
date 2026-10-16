import { Button, TextField } from "@orasso/design-system/web";
import { data, Form, useNavigation } from "react-router";

import { api } from "../lib/api.server";
import type { Route } from "./+types/mot-de-passe-oublie";

// Mot de passe oublié (lot 15, docs/01 « réinitialisation du mot de passe par e-mail pour tous ») : la réponse est la
// même que le compte existe ou non (on ne révèle pas les adresses inscrites).
export function meta() {
  return [{ title: "Mot de passe oublié · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return data({ sent: false, error: "Cette adresse e-mail n'est pas valide." }, 400);
  const res = await api(request, "/auth/request-password-reset", {
    method: "POST",
    json: { email, redirectTo: "/reinitialisation" },
  });
  if (!res.ok && res.status === 429)
    return data({ sent: false, error: "Trop d'essais, réessaie dans un instant." }, 429);
  return data({ sent: true, error: null });
}

export default function MotDePasseOublie({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <div className="s-narrow s-stack">
      <h1 className="s-title">Mot de passe oublié</h1>
      {actionData?.sent ? (
        <p className="s-notice s-notice--ok" data-testid="reset-sent" role="status">
          Si un compte existe avec cette adresse, un e-mail vient de t'être envoyé. Le lien est valable une heure.
        </p>
      ) : (
        <>
          <p className="s-lead">
            Indique l'adresse de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.
          </p>
          <Form method="post" className="s-form">
            <TextField
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
              error={actionData?.error}
              required
            />
            <Button type="submit" icon="next" loading={busy} fullWidth>
              Recevoir le lien
            </Button>
          </Form>
        </>
      )}
      <p className="s-muted">
        <a href="/connexion">Retour à la connexion</a>
      </p>
    </div>
  );
}
