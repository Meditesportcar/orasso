import { Button, TextField } from "@orasso/design-system/web";
import { data, Form, redirect, useNavigation } from "react-router";

import { api, getMe, safeReturn, withCookies } from "../lib/api.server";
import type { Route } from "./+types/connexion";

export function meta() {
  return [{ title: "Connexion · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const retour = safeReturn(new URL(request.url).searchParams.get("retour"));
  if (await getMe(request)) throw redirect(retour);
  return { retour };
}

type SignIn = { twoFactorRedirect?: boolean };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const retour = safeReturn(String(form.get("retour") ?? ""));
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return data({ error: "Renseigne ton e-mail et ton mot de passe." }, { status: 400 });
  const res = await api<SignIn>(request, "/auth/sign-in/email", { method: "POST", json: { email, password } });
  if (!res.ok) {
    const status = res.status === 429 ? 429 : 401;
    return data(
      { error: status === 429 ? "Trop d'essais, réessaie dans un instant." : "E-mail ou mot de passe incorrect." },
      { status },
    );
  }
  const headers = withCookies(res.headers);
  if (res.data?.twoFactorRedirect) {
    return redirect(`/connexion/verification?retour=${encodeURIComponent(retour)}`, { headers });
  }
  return redirect(retour, { headers });
}

export default function Connexion({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const { retour } = loaderData;
  return (
    <div className="s-narrow s-stack">
      <h1 className="s-title">Connexion</h1>
      <Form method="post" className="s-form">
        <input type="hidden" name="retour" value={retour} />
        <TextField label="E-mail" name="email" type="email" autoComplete="email" required />
        <TextField
          label="Mot de passe"
          name="password"
          type="password"
          autoComplete="current-password"
          revealable
          required
        />
        {actionData?.error && (
          <p className="s-error" role="alert">
            {actionData.error}
          </p>
        )}
        <Button type="submit" icon="entry" loading={busy} fullWidth>
          Se connecter
        </Button>
      </Form>
      <p className="s-muted">
        Pas encore de compte ? <a href={`/inscription?retour=${encodeURIComponent(retour)}`}>Créer un compte</a>
      </p>
    </div>
  );
}
