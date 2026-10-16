import { Button, Chip, TextField } from "@orasso/design-system/web";
import type { SessionView } from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { AddPasskey } from "../components/Passkeys";
import { Qr } from "../components/Qr";
import { api, requireMe, withCookies } from "../lib/api.server";
import { formatDateTime } from "../lib/format";
import type { Route } from "./+types/securite";

export function meta() {
  return [{ title: "Sécurité · Orasso" }, { name: "robots", content: "noindex" }];
}

type PasskeyRow = { id: string; name?: string | null; createdAt: string; deviceType: string };

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const [passkeys, sessions] = await Promise.all([
    api<PasskeyRow[]>(request, "/auth/passkey/list-user-passkeys"),
    api<SessionView[]>(request, "/me/sessions"),
  ]);
  return {
    enabled: me.user.twoFactorEnabled,
    required: me.twoFactorRequired,
    hint: me.twoFactorHint,
    passkeys: passkeys.ok ? passkeys.data : [],
    sessions: sessions.ok ? sessions.data : [],
  };
}

type Enabled = { totpURI: string; backupCodes: string[] };
type ActionResult = { error: string | null; enable: Enabled | null; done: boolean; scope?: string };

const result = (r: Partial<ActionResult>, init?: number | ResponseInit) =>
  data<ActionResult>({ error: null, enable: null, done: false, ...r }, init);

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "enable") {
    const password = String(form.get("password") ?? "");
    const res = await api<Enabled>(request, "/auth/two-factor/enable", { method: "POST", json: { password } });
    if (!res.ok && res.status === 403)
      return result(
        {
          error:
            "Cette session ne prouve pas ta double authentification : reconnecte-toi avec ta clé d'accès ou ton code, puis recommence.",
          scope: "totp",
        },
        403,
      );
    if (!res.ok) return result({ error: "Mot de passe incorrect.", scope: "totp" }, 400);
    return result({ enable: res.data }, { headers: withCookies(res.headers) });
  }
  if (intent === "verify") {
    const code = String(form.get("code") ?? "").replace(/\s+/g, "");
    const res = await api(request, "/auth/two-factor/verify-totp", { method: "POST", json: { code } });
    if (!res.ok) return result({ error: "Code incorrect.", scope: "totp" }, 400);
    return result({ done: true }, { headers: withCookies(res.headers) });
  }
  if (intent === "rename-passkey") {
    const name = String(form.get("name") ?? "").trim();
    if (!name) return result({ error: "Donne un nom à la clé.", scope: "passkey" }, 400);
    const res = await api(request, "/auth/passkey/update-passkey", {
      method: "POST",
      json: { id: String(form.get("id") ?? ""), name: name.slice(0, 60) },
    });
    if (!res.ok) return result({ error: "Clé introuvable.", scope: "passkey" }, 400);
    return result({});
  }
  if (intent === "delete-passkey") {
    const res = await api(request, "/auth/passkey/delete-passkey", {
      method: "POST",
      json: { id: String(form.get("id") ?? "") },
    });
    if (!res.ok && res.status === 403)
      return result(
        {
          error:
            "Cette session ne prouve pas ta double authentification : reconnecte-toi avec ta clé d'accès ou ton code, puis recommence.",
          scope: "passkey",
        },
        403,
      );
    if (!res.ok) return result({ error: "Clé introuvable.", scope: "passkey" }, 400);
    return result({});
  }
  if (intent === "revoke-session") {
    const res = await api(request, `/me/sessions/${encodeURIComponent(String(form.get("id") ?? ""))}`, {
      method: "DELETE",
    });
    if (!res.ok) return result({ error: "Session introuvable.", scope: "session" }, 400);
    return result({});
  }
  return result({ error: "Action inconnue." }, 400);
}

export default function Securite({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const enable = actionData?.enable;
  const secret = enable ? (new URL(enable.totpURI).searchParams.get("secret") ?? "") : "";
  const totpOn = loaderData.enabled || actionData?.done;
  const scoped = (scope: string) => (actionData?.scope === scope ? actionData.error : null);
  return (
    <div className="s-narrow s-stack">
      <h1 className="s-title">Sécurité</h1>
      <p className="s-muted">
        <a href="/app/moi">← Mon compte</a>
      </p>
      {(loaderData.hint === "passkey_sign_in" || loaderData.hint === "totp_sign_in") && (
        <p className="s-notice s-notice--alert" data-testid="passkey-sign-in-needed">
          Cette session ne prouve pas ta double authentification : pour l'espace organisateur et pour changer tes clés
          ou ton code, reconnecte-toi avec ta clé d'accès ou ton code.
        </p>
      )}

      <section className="s-section s-section--first" aria-labelledby="totp-titre">
        <h2 id="totp-titre" className="s-h2">
          Application d'authentification
        </h2>
        {totpOn && (
          <p className="s-notice s-notice--ok">
            <Chip variant="accent">Active</Chip> La double authentification est activée sur ton compte.
          </p>
        )}
        {!totpOn && !enable && (
          <>
            <p className="s-lead">
              {loaderData.required
                ? "La double authentification est obligatoire pour les organisateurs : application d'authentification, ou connexion avec une clé d'accès."
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
                error={scoped("totp")}
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
                error={scoped("totp")}
                required
              />
              <Button type="submit" icon="check" loading={busy} fullWidth>
                Confirmer
              </Button>
            </Form>
          </div>
        )}
      </section>

      <section className="s-section" aria-labelledby="passkeys-titre" data-testid="passkeys">
        <h2 id="passkeys-titre" className="s-h2">
          Clés d'accès
        </h2>
        <p className="s-muted">
          Face ID, empreinte ou code de l'appareil : se connecter sur ce site avec une clé d'accès vaut double
          authentification pour cette session. Une connexion par mot de passe, elle, demande l'application
          d'authentification si elle est activée. Dans l'appli, la double authentification se fait par code.
        </p>
        {loaderData.passkeys.length === 0 ? (
          <p className="s-notice">Aucune clé d'accès.</p>
        ) : (
          loaderData.passkeys.map((k) => (
            <div key={k.id} className="s-card s-stack s-stack--tight" data-testid="passkey-row">
              <div className="s-row s-row--between">
                <strong>{k.name || "Clé d'accès"}</strong>
                <span className="o-t-caption s-muted">Créée le {formatDateTime(k.createdAt)}</span>
              </div>
              <Form method="post" className="s-row">
                <input type="hidden" name="id" value={k.id} />
                <TextField label="Renommer" name="name" defaultValue={k.name ?? ""} maxLength={60} />
                <Button type="submit" name="intent" value="rename-passkey" variant="secondary" icon="check">
                  Renommer
                </Button>
                <Button type="submit" name="intent" value="delete-passkey" variant="secondary" icon="close">
                  Supprimer
                </Button>
              </Form>
            </div>
          ))
        )}
        {scoped("passkey") && (
          <p className="s-error" role="alert">
            {scoped("passkey")}
          </p>
        )}
        <AddPasskey busy={busy} />
      </section>

      <section className="s-section" aria-labelledby="sessions-titre" data-testid="sessions">
        <h2 id="sessions-titre" className="s-h2">
          Appareils connectés
        </h2>
        {loaderData.sessions.map((s) => (
          <div key={s.id} className="s-row s-row--between s-card" data-testid="session-row">
            <div className="s-stack s-stack--tight">
              <strong>
                {s.device}
                {s.current ? " · cet appareil" : ""}
              </strong>
              <span className="o-t-caption s-muted">Dernière activité le {formatDateTime(s.lastActiveAt)}</span>
            </div>
            {!s.current && (
              <Form method="post">
                <input type="hidden" name="id" value={s.id} />
                <Button type="submit" name="intent" value="revoke-session" variant="secondary" icon="close">
                  Déconnecter
                </Button>
              </Form>
            )}
          </div>
        ))}
        {scoped("session") && (
          <p className="s-error" role="alert">
            {scoped("session")}
          </p>
        )}
        <p className="s-muted">
          Mot de passe perdu ou compromis ? <a href="/mot-de-passe-oublie">Réinitialise-le</a> : tous tes appareils
          seront déconnectés.
        </p>
      </section>
    </div>
  );
}
