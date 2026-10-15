import { Button, Chip, TextField } from "@orasso/design-system/web";
import { data, Form, useNavigation } from "react-router";

import { Qr } from "../components/Qr";
import { api, requireMe, withCookies } from "../lib/api.server";
import type { Route } from "./+types/securite";

export function meta() {
  return [{ title: "Sécurité · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  return { enabled: me.user.twoFactorEnabled, required: me.twoFactorRequired };
}

type Enabled = { totpURI: string; backupCodes: string[] };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "enable") {
    const password = String(form.get("password") ?? "");
    const res = await api<Enabled>(request, "/auth/two-factor/enable", { method: "POST", json: { password } });
    if (!res.ok) return data({ error: "Mot de passe incorrect.", enable: null, done: false }, { status: 400 });
    return data({ error: null, enable: res.data, done: false }, { headers: withCookies(res.headers) });
  }
  if (intent === "verify") {
    const code = String(form.get("code") ?? "").replace(/\s+/g, "");
    const res = await api(request, "/auth/two-factor/verify-totp", { method: "POST", json: { code } });
    if (!res.ok) return data({ error: "Code incorrect.", enable: null, done: false }, { status: 400 });
    return data({ error: null, enable: null, done: true }, { headers: withCookies(res.headers) });
  }
  return data({ error: "Action inconnue.", enable: null, done: false }, { status: 400 });
}

export default function Securite({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const enable = actionData?.enable;
  const secret = enable ? (new URL(enable.totpURI).searchParams.get("secret") ?? "") : "";
  return (
    <div className="s-narrow s-stack">
      <h1 className="s-title">Sécurité</h1>
      {(loaderData.enabled || actionData?.done) && (
        <p className="s-notice s-notice--ok">
          <Chip variant="accent">Active</Chip> La double authentification est activée sur ton compte.
        </p>
      )}
      {!loaderData.enabled && !actionData?.done && !enable && (
        <>
          <p className="s-lead">
            {loaderData.required
              ? "La double authentification est obligatoire pour les organisateurs."
              : "Protège ton compte avec un code à usage unique."}
          </p>
          <Form method="post" className="s-form">
            <input type="hidden" name="intent" value="enable" />
            <TextField
              label="Ton mot de passe"
              name="password"
              type="password"
              autoComplete="current-password"
              revealable
              error={actionData?.error}
              required
            />
            <Button type="submit" icon="entry" loading={busy} fullWidth>
              Activer
            </Button>
          </Form>
        </>
      )}
      {enable && (
        <div className="s-stack">
          <p className="s-lead">
            Scanne ce QR avec ton application d'authentification, ou saisis la clé à la main, puis entre le code
            affiché.
          </p>
          <div className="acc__qr">
            <Qr payload={enable.totpURI} label="QR de la double authentification" />
          </div>
          <p className="o-t-caption s-muted">Clé : {secret}</p>
          <div className="s-card">
            <div className="s-label o-t-label">Codes de secours (à garder hors de cet appareil)</div>
            <p>{enable.backupCodes.join("  ")}</p>
          </div>
          <Form method="post" className="s-form">
            <input type="hidden" name="intent" value="verify" />
            <TextField
              label="Code à 6 chiffres"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              error={actionData?.error}
              required
            />
            <Button type="submit" icon="check" loading={busy} fullWidth>
              Confirmer
            </Button>
          </Form>
        </div>
      )}
    </div>
  );
}
