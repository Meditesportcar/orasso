import { Button, CheckboxField, Chip, Icon, TextField } from "@orasso/design-system/web";
import {
  type AccountSettings,
  departments as allDepartments,
  type Category,
  gradeLabels,
  mutableTypesByFamily,
  type NotificationFamily,
  notificationFamilies,
  notificationFamilyLabels,
  notificationTypeLabels,
  type PublicPreview,
  profileVisibilities,
  profileVisibilityAlways,
  profileVisibilityLabels,
  profileVisibilityRules,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../components/Fields";
import { api, apiOrThrow, requireMe, withCookies } from "../lib/api.server";
import type { Route } from "./+types/moi";

// Mon compte sur le site (lot 15, ARCHITECTURE-SUITE § 1.6) : profil, aperçu public, notifications par type, compte
// public ou privé, secteur, centres d'intérêt, rayon, sécurité, suppression du compte.
export function meta() {
  return [{ title: "Mon compte · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const [settings, preview, categories] = await Promise.all([
    apiOrThrow<AccountSettings>(request, "/me/settings"),
    apiOrThrow<PublicPreview>(request, "/me/public-preview"),
    apiOrThrow<Category[]>(request, "/vehicle-reference/categories"),
  ]);
  const url = new URL(request.url);
  return { me, settings, preview, categories, saved: url.searchParams.get("fait") };
}

const MUTABLE = mutableTypesByFamily();
const FAMILIES = notificationFamilies.filter((f) => MUTABLE[f]?.length) as NotificationFamily[];

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "profile") {
    const res = await api(request, "/me/profile", {
      method: "PATCH",
      json: { pseudo: String(form.get("pseudo") ?? "").trim(), bio: String(form.get("bio") ?? "") },
    });
    if (!res.ok) return data({ scope: "profile", error: res.error.message }, { status: res.status });
    return redirect("/app/moi?fait=profil");
  }
  if (intent === "settings") {
    const depts = String(form.get("departments") ?? "")
      .split(/[\s,;]+/)
      .map((d) => d.trim().toUpperCase())
      .filter(Boolean);
    const unknown = depts.filter((d) => !(allDepartments as readonly string[]).includes(d));
    if (unknown.length) {
      return data({ scope: "settings", error: `Département inconnu : ${unknown.join(", ")}` }, { status: 400 });
    }
    const prefs = Object.fromEntries(
      (["application", "event", "social", "grade"] as const).map((f) => [f, form.get(`fam_${f}`) === "on"]),
    ) as Record<"application" | "event" | "social" | "grade", boolean>;
    const mutedTypes = FAMILIES.flatMap((f) => MUTABLE[f] ?? []).filter((t) => form.get(`type_${t}`) !== "on");
    const res = await api(request, "/me/settings", {
      method: "PATCH",
      json: {
        notificationPrefs: prefs,
        mutedTypes,
        visibility: String(form.get("visibility") ?? "public"),
        departments: [...new Set(depts)],
        radiusKm: Number(form.get("radiusKm") ?? 50),
        interests: form.getAll("interests").map(String),
      },
    });
    if (!res.ok) return data({ scope: "settings", error: res.error.message }, { status: res.status });
    return redirect("/app/moi?fait=reglages");
  }
  if (intent === "resend") {
    const res = await api(request, "/me/email/resend-verification", { method: "POST" });
    if (!res.ok) return data({ scope: "email", error: res.error.message }, { status: res.status });
    return redirect("/app/moi?fait=email");
  }
  if (intent === "delete") {
    if (form.get("confirm") !== "on") {
      return data({ scope: "delete", error: "Coche la case pour confirmer la suppression." }, { status: 400 });
    }
    const totp = String(form.get("totpCode") ?? "").replace(/\s+/g, "");
    const res = await api(request, "/me", {
      method: "DELETE",
      json: { password: String(form.get("password") ?? ""), totpCode: totp || null },
    });
    if (!res.ok) return data({ scope: "delete", error: res.error.message }, { status: res.status });
    return redirect("/?compte=supprime", { headers: withCookies(res.headers) });
  }
  return data({ scope: "", error: "Action inconnue." }, { status: 400 });
}

const SAVED: Record<string, string> = {
  profil: "Profil enregistré.",
  reglages: "Réglages enregistrés.",
  email: "E-mail de confirmation renvoyé.",
};

export default function Moi({ loaderData, actionData }: Route.ComponentProps) {
  const { me, settings, preview, categories, saved } = loaderData;
  const busy = useNavigation().state !== "idle";
  const err = (scope: string) => (actionData?.scope === scope ? actionData.error : null);
  return (
    <div className="s-narrow s-stack" data-testid="moi">
      <div className="s-row s-row--between">
        <h1 className="s-title">Mon compte</h1>
        <Chip>
          {gradeLabels[me.profile.grade]} · {me.profile.pointsSeason} pts
        </Chip>
      </div>
      {saved && SAVED[saved] && (
        <p className="s-notice s-notice--ok" role="status">
          {SAVED[saved]}
        </p>
      )}

      <section className="s-section s-section--first" aria-labelledby="profil-titre">
        <h2 id="profil-titre" className="s-h2">
          Profil
        </h2>
        <Form method="post" className="s-form">
          <input type="hidden" name="intent" value="profile" />
          <TextField label="Pseudo" name="pseudo" defaultValue={me.profile.pseudo} autoComplete="username" required />
          <TextAreaField label="Description" name="bio" defaultValue={me.profile.bio ?? ""} maxLength={500} rows={3} />
          {err("profile") && (
            <p className="s-error" role="alert">
              {err("profile")}
            </p>
          )}
          <Button type="submit" variant="secondary" icon="check" loading={busy}>
            Enregistrer le profil
          </Button>
        </Form>
        <div className="s-card s-stack s-stack--tight" data-testid="public-preview">
          <div className="s-label o-t-label">Ce que voient les autres</div>
          <strong>
            {preview.pseudo} · {gradeLabels[preview.grade]}
          </strong>
          {preview.bio && <p>{preview.bio}</p>}
          {preview.departments && preview.departments.length > 0 && (
            <p className="o-t-caption s-muted">Secteur : {preview.departments.join(", ")}</p>
          )}
          {preview.vehicles.length > 0 ? (
            <ul className="s-docs">
              {preview.vehicles.map((v) => (
                <li key={v.id}>{v.label}</li>
              ))}
            </ul>
          ) : (
            <p className="o-t-caption s-muted">Aucun véhicule.</p>
          )}
        </div>
      </section>

      <section className="s-section" aria-labelledby="email-titre">
        <h2 id="email-titre" className="s-h2">
          Adresse e-mail
        </h2>
        <p>
          {me.user.email} · {me.user.emailVerified ? <Chip variant="accent">Confirmée</Chip> : <Chip>À confirmer</Chip>}
        </p>
        {!me.user.emailVerified && (
          <Form method="post">
            <input type="hidden" name="intent" value="resend" />
            <Button type="submit" variant="secondary" icon="next" loading={busy}>
              Renvoyer l'e-mail de confirmation
            </Button>
            {err("email") && (
              <p className="s-error" role="alert">
                {err("email")}
              </p>
            )}
          </Form>
        )}
      </section>

      <Form method="post" className="s-stack">
        <input type="hidden" name="intent" value="settings" />
        <section className="s-section" aria-labelledby="notif-titre" data-testid="notification-settings">
          <h2 id="notif-titre" className="s-h2">
            Notifications
          </h2>
          <p className="s-muted">
            Les relances du staff et les alertes de sécurité du compte arrivent toujours. Tout reste visible dans ton
            Journal.
          </p>
          {FAMILIES.map((family) => (
            <fieldset key={family} className="s-fieldset s-stack s-stack--tight">
              <legend className="s-label o-t-label">{notificationFamilyLabels[family]}</legend>
              <CheckboxField
                name={`fam_${family}`}
                label={`Recevoir les notifications « ${notificationFamilyLabels[family]} »`}
                defaultChecked={settings.notificationPrefs[family] !== false}
              />
              <div className="s-checklist">
                {(MUTABLE[family] ?? []).map((type) => (
                  <CheckboxField
                    key={type}
                    name={`type_${type}`}
                    label={notificationTypeLabels[type]}
                    defaultChecked={!settings.mutedTypes.includes(type)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </section>

        <section className="s-section" aria-labelledby="visibilite-titre">
          <h2 id="visibilite-titre" className="s-h2">
            Compte public ou privé
          </h2>
          {profileVisibilities.map((v) => (
            <label key={v} className="o-check">
              <input
                type="radio"
                name="visibility"
                value={v}
                className="o-check__input"
                defaultChecked={settings.visibility === v}
              />
              <span className="o-check__box" aria-hidden="true">
                <Icon name="check" size={16} strokeWidth={3} />
              </span>
              <span className="o-check__label o-t-body">
                <strong>{profileVisibilityLabels[v]}</strong> · {profileVisibilityRules[v]}
              </span>
            </label>
          ))}
          <p className="o-t-caption s-muted">{profileVisibilityAlways}</p>
        </section>

        <section className="s-section" aria-labelledby="secteur-titre">
          <h2 id="secteur-titre" className="s-h2">
            Secteur et centres d'intérêt
          </h2>
          <TextField
            label="Départements"
            name="departments"
            defaultValue={settings.departments.join(", ")}
            help="Numéros séparés par des virgules (ex. 66, 11). Le premier sert à mesurer la distance."
          />
          <label className="o-field">
            <span className="o-field__label o-t-label">Rayon des notifications</span>
            <input
              type="range"
              name="radiusKm"
              min={10}
              max={300}
              step={10}
              defaultValue={settings.radiusKm}
              aria-describedby="rayon-aide"
            />
            <span className="o-field__help o-t-caption" id="rayon-aide">
              {settings.radiusKm} km autour du centre de ton premier département (10 à 300 km)
            </span>
          </label>
          <fieldset className="s-fieldset">
            <legend className="s-label o-t-label">Centres d'intérêt</legend>
            <div className="s-checklist">
              {categories.map((c) => (
                <CheckboxField
                  key={c.id}
                  name="interests"
                  value={c.id}
                  label={c.label}
                  defaultChecked={settings.interests.includes(c.id)}
                />
              ))}
            </div>
          </fieldset>
        </section>
        {err("settings") && (
          <p className="s-error" role="alert">
            {err("settings")}
          </p>
        )}
        <Button type="submit" icon="check" loading={busy}>
          Enregistrer les réglages
        </Button>
      </Form>

      <section className="s-section" aria-labelledby="securite-titre">
        <h2 id="securite-titre" className="s-h2">
          Sécurité
        </h2>
        <p className="s-muted">Double authentification, clés d'accès, appareils connectés.</p>
        <Button href="/app/securite" variant="secondary" icon="eye">
          Ouvrir la sécurité
        </Button>
      </section>

      <section className="s-section" aria-labelledby="suppression-titre" data-testid="delete-account">
        <h2 id="suppression-titre" className="s-h2">
          Supprimer mon compte
        </h2>
        <p className="s-muted">
          Ton pseudo, ton adresse, tes coordonnées, tes véhicules et leurs photos sont effacés. L'historique des
          événements reste chez les organisateurs, au nom de « Compte supprimé ». C'est définitif.
        </p>
        <Form method="post" className="s-form">
          <input type="hidden" name="intent" value="delete" />
          <TextField
            label="Ton mot de passe"
            name="password"
            type="password"
            autoComplete="current-password"
            revealable
            required
          />
          {me.user.twoFactorEnabled && (
            <TextField
              label="Code de ton application d'authentification"
              name="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          )}
          <CheckboxField name="confirm" label="Je comprends que la suppression est définitive." />
          {err("delete") && (
            <p className="s-error" role="alert">
              {err("delete")}
            </p>
          )}
          <Button type="submit" variant="alert" icon="close" loading={busy}>
            Supprimer mon compte
          </Button>
        </Form>
      </section>
    </div>
  );
}
