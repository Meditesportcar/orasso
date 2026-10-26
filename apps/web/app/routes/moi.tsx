import { Button, CheckboxField, Chip, Icon, type IconName, TextField } from "@orasso/design-system/web";
import {
  type AccountSettings,
  accountAppLabels,
  gradeLabels,
  type MyCrew,
  moderationLabels,
  mutableTypesByFamily,
  networkLabels as N,
  type NetworkCounts,
  type NotificationFamily,
  notificationFamilies,
  notificationFamilyLabels,
  notificationTypeLabels,
  type PersonaKind,
  personaKindLabels,
  preferencesLabels,
  profilePhotoLabels,
  profileVisibilities,
  profileVisibilityAlways,
  profileVisibilityLabels,
  profileVisibilityRules,
  settingsHubLabels as S,
  wideWordEm,
} from "@orasso/shared";
import type { CSSProperties } from "react";
import { data, Form, redirect, useNavigation } from "react-router";
import { LeftCrewsSection } from "../components/crew-feed/LeftCrewsSection"; // R5c1, tour 2
import { PersonAvatar } from "../components/People";
import { ThemeSwitch } from "../components/SiteChrome";
import { api, apiOrThrow, requireMe, withCookies } from "../lib/api.server";
import type { Route } from "./+types/moi";
import "../styles/network.css";
import "../styles/profile-r5.css";

// Mon compte sur le site (lot 15, ARCHITECTURE-SUITE § 1.6) : notifications par type, compte public ou privé,
// apparence (thème ; le coin, la distance et les centres d'intérêt sont dans « Tes préférences », `/app/preferences`),
// sécurité, suppression du compte. Lot R5b (maquette R5.4) : la carte du profil en tête avec sa roue dentée, puis la
// liste « Réglages » comme l'appli ; le pseudo, la description, la photo et les réseaux sont dans « Modifier mon profil ».
export function meta() {
  return [{ title: "Mon compte · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const [settings, network, crews] = await Promise.all([
    apiOrThrow<AccountSettings>(request, "/me/settings"),
    // Lot R4c : abonnés, abonnements, amis ; le crew à côté de « Mon profil public ».
    api<NetworkCounts>(request, "/me/network"),
    api<MyCrew[]>(request, "/me/crews"),
  ]);
  const url = new URL(request.url);
  return {
    me,
    settings,
    network: network.ok ? network.data : null,
    crew: crews.ok ? (crews.data[0] ?? null) : null,
    saved: url.searchParams.get("fait"),
  };
}

const MUTABLE = mutableTypesByFamily();
const FAMILIES = notificationFamilies.filter((f) => MUTABLE[f]?.length) as NotificationFamily[];

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "settings") {
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
    // Le compte n'a plus de session : on efface aussi les cookies de session du navigateur.
    const headers = withCookies(res.headers);
    for (const name of [
      "better-auth.session_token",
      "better-auth.session_data",
      "__Secure-better-auth.session_token",
      "__Secure-better-auth.session_data",
    ]) {
      headers.append(
        "set-cookie",
        `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${name.startsWith("__Secure") ? "; Secure" : ""}`,
      );
    }
    return redirect("/?compte=supprime", { headers });
  }
  return data({ scope: "", error: "Action inconnue." }, { status: 400 });
}

const SAVED: Record<string, string> = {
  reglages: "Réglages enregistrés.",
  email: "E-mail de confirmation renvoyé.",
};

export default function Moi({ loaderData, actionData }: Route.ComponentProps) {
  const { me, settings, saved } = loaderData;
  const busy = useNavigation().state !== "idle";
  const err = (scope: string) => (actionData?.scope === scope ? actionData.error : null);
  // Mes casquettes (lot C5, artefact `s-profil`) : le seul endroit du site d'où l'on passe à une autre casquette.
  const isVisitor = me.personas.some((p) => p.kind === "visitor");
  const hats = [
    ...me.memberships
      .filter((m) => m.status === "active")
      .map((m) => ({
        key: `orga-${m.structureSlug}`,
        href: `/orga/${m.structureSlug}`,
        kind: "organizer",
        label: m.structureName,
      })),
    ...(me.pro ? [{ key: "pro", href: `/pro/${me.pro.slug}`, kind: "pro", label: me.pro.name }] : []),
    ...me.personas
      .filter((p) => p.kind === "provider" || p.kind === "media")
      .map((p) => ({
        key: `${p.kind}-${p.id}`,
        href: p.kind === "provider" ? "/app/prestataire" : "/app/media",
        kind: p.kind,
        label: p.label,
      })),
  ];
  const hubRows: { key: string; href: string; icon: IconName; title: string; caption: string; testId?: string }[] = [
    {
      key: "profil",
      href: "/app/profil/modifier",
      icon: "edit",
      title: S.editProfile,
      caption: S.editProfileCaption,
      testId: "reglage-profil",
    },
    { key: "compte", href: "#compte", icon: "profile", title: S.account, caption: S.accountCaption },
    {
      key: "notifications",
      href: "#notifications",
      icon: "bell",
      title: S.notifications,
      caption: S.notificationsCaption,
    },
    {
      key: "confidentialite",
      href: "#confidentialite",
      icon: "lock",
      title: S.privacy,
      caption: S.privacyCaption(settings.visibility === "private"),
    },
    {
      key: "preferences",
      href: "/app/preferences",
      icon: "explore",
      title: preferencesLabels.settingsRow,
      caption: preferencesLabels.settingsRowCaption,
      testId: "reglage-preferences",
    },
    { key: "apparence", href: "#apparence", icon: "gear", title: S.appearance, caption: "Béton sombre ou Sable clair" },
    { key: "aide", href: "/app/aide", icon: "help", title: S.help, caption: S.helpCaption, testId: "help-link" },
  ];
  return (
    <div className="s-narrow s-stack" data-testid="moi">
      <div className="s-row s-row--between">
        <h1 className="s-title">Mon compte</h1>
        <Chip>
          {gradeLabels[me.profile.grade]} · {me.profile.pointsSeason} pts
        </Chip>
      </div>
      {/* Lot R5b (maquette R5.4) : la carte du profil (photo, nom, grade, secteur, description, roue dentée), puis, comme
          au lot R4c, trois compteurs (chacun ouvre sa liste), « Mon profil public » et le crew. */}
      <div className="n-me" data-testid="profil-card">
        <div className="pr5-me">
          <div className="pr5-me__av">
            <PersonAvatar url={me.profile.avatarUrl} pseudo={me.profile.pseudo} size={76} />
            <a
              className="pr5-me__cam"
              href="/app/profil/modifier"
              aria-label={profilePhotoLabels.change}
              data-testid="profil-photo"
            >
              <Icon name="camera" size={14} />
            </a>
          </div>
          <div className="pr5-me__id">
            <p className="pr5-me__name" style={{ "--em": wideWordEm(me.profile.pseudo) } as CSSProperties}>
              {me.profile.pseudo}
            </p>
            <div className="pr5-me__tags">
              <Chip variant="accent">{gradeLabels[me.profile.grade]}</Chip>
              {me.profile.departments.length > 0 && (
                <span className="o-t-caption s-muted">{me.profile.departments.join(", ")}</span>
              )}
            </div>
          </div>
          <a className="pr5-me__gear" href="#reglages" aria-label={S.open} data-testid="profil-settings">
            <Icon name="gear" size={22} />
          </a>
          {me.profile.bio && <p className="pr5-bio pr5-me__bio">{me.profile.bio}</p>}
        </div>
        <nav className="n-counts" aria-label={N.countsGroup} data-testid="profil-counters">
          {(
            [
              ["abonnes", loaderData.network?.followers, N.followers],
              ["abonnements", loaderData.network?.following, N.following],
              ["amis", loaderData.network?.friends, N.friends],
            ] as const
          ).map(([tab, n, label]) => (
            <a key={tab} href={`/app/reseau?onglet=${tab}`} data-testid={`profil-count-${tab}`}>
              <strong>{n ?? "—"}</strong>
              <small>{label(n ?? 2)}</small>
            </a>
          ))}
        </nav>
        <div className="n-links">
          <a href="/app/profil-public" data-testid="profil-public">
            <span className="n-ico">
              <Icon name="eye" size={18} />
            </span>
            <span>
              <b>Mon profil public</b>
              <small>Comme te voient les autres</small>
            </span>
          </a>
          <a href={loaderData.crew ? `/c/${loaderData.crew.slug}` : "/app/crews/rejoindre"} data-testid="profil-crew">
            <span className="n-ico n-ico--crew">
              {loaderData.crew ? loaderData.crew.name.slice(0, 2).toUpperCase() : "+"}
            </span>
            <span>
              <b>{loaderData.crew ? loaderData.crew.name : "Un crew ?"}</b>
              <small>{loaderData.crew ? "Ton crew" : "Rejoins ou crée un crew"}</small>
            </span>
          </a>
        </div>
      </div>
      <Button variant="secondary" icon="crew" href="/app/amis">
        Mes amis
      </Button>
      {saved && SAVED[saved] && (
        <p className="s-notice s-notice--ok" role="status">
          {SAVED[saved]}
        </p>
      )}

      {hats.length > 0 && (
        <section className="s-section s-section--first" aria-labelledby="casquettes-titre" data-testid="hats">
          <h2 id="casquettes-titre" className="s-h2">
            Mes casquettes
          </h2>
          <div className="s-stack">
            {hats.map((h) => (
              <Button key={h.key} href={h.href} variant="secondary" icon="next">
                {personaKindLabels[h.kind as PersonaKind]} · {h.label}
              </Button>
            ))}
          </div>
        </section>
      )}

      {isVisitor && (
        <section
          className={hats.length ? "s-section" : "s-section s-section--first"}
          aria-labelledby="garage-titre"
          data-testid="garage-link"
        >
          <h2 id="garage-titre" className="s-h2">
            Mon garage
          </h2>
          <p className="s-muted">Tes véhicules archivés, l'ajout d'un véhicule et ton QR de compte.</p>
          <Button href="/app/garage" variant="secondary" icon="vehicle">
            Ouvrir mon garage
          </Button>
        </section>
      )}

      {/* Lot R5b (maquette R5.4) : « Réglages », une liste de lignes comme l'appli ; les sections détaillées suivent. */}
      <section
        className={hats.length || isVisitor ? "s-section" : "s-section s-section--first"}
        id="reglages"
        aria-labelledby="reglages-titre"
        data-testid="settings-hub"
      >
        <h2 id="reglages-titre" className="s-h2">
          {S.title}
        </h2>
        <ul className="pr5-hub">
          {hubRows.map((r) => (
            <li key={r.key}>
              <a className="pr5-hub__row" href={r.href} data-testid={r.testId}>
                <span className="pr5-hub__ico">
                  <Icon name={r.icon} size={18} />
                </span>
                <span>
                  <b>{r.title}</b>
                  <small>{r.caption}</small>
                </span>
                <Icon name="next" size={16} />
              </a>
            </li>
          ))}
          <li>
            <Form method="post" action="/deconnexion" className="pr5-hub__form">
              <button type="submit" className="pr5-hub__row pr5-hub__row--out" data-testid="reglage-deconnexion">
                <span className="pr5-hub__ico">
                  <Icon name="logout" size={18} />
                </span>
                <span>
                  <b>{S.signOut}</b>
                </span>
                <Icon name="next" size={16} />
              </button>
            </Form>
          </li>
        </ul>
      </section>

      {/* Lot M5 (parité de la maquette 7.2) : « Compte » réunit l'e-mail, la sécurité et mes sanctions. */}
      <section className="s-section" id="compte" aria-labelledby="email-titre" data-testid="account-section">
        <h2 id="email-titre" className="s-h2">
          Compte
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
        <p className="s-muted">Mot de passe, double authentification, clés d'accès, appareils connectés.</p>
        <Button href="/app/securite" variant="secondary" icon="eye">
          Ouvrir la sécurité
        </Button>
        {/* Lot 32 : sanctions de la modération et contestation. */}
        <Button href="/app/sanctions" variant="secondary" icon="list" data-testid="my-sanctions-link">
          {moderationLabels.mySanctions}
        </Button>
      </section>

      <Form method="post" className="s-stack">
        <input type="hidden" name="intent" value="settings" />
        <section
          className="s-section"
          id="notifications"
          aria-labelledby="notif-titre"
          data-testid="notification-settings"
        >
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

        {/* Lot M5 (parité de la maquette 7.2) : « Confidentialité » = compte public ou privé, export des données. */}
        <section
          className="s-section"
          id="confidentialite"
          aria-labelledby="visibilite-titre"
          data-testid="privacy-section"
        >
          <h2 id="visibilite-titre" className="s-h2">
            Confidentialité
          </h2>
          <p className="s-label o-t-label">Compte public ou privé</p>
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
          <p className="s-label o-t-label">{accountAppLabels.dataTitle}</p>
          <p className="o-t-caption s-muted">{accountAppLabels.exportHelp}</p>
          <Button href="/app/mes-donnees" variant="secondary" icon="export" data-testid="export-data">
            {accountAppLabels.export}
          </Button>
          {/* R5c1, tour 2 : retirer mes publications des crews que j'ai quittés. */}
          <LeftCrewsSection />
        </section>

        <section className="s-section" id="apparence" aria-labelledby="apparence-titre" data-testid="appearance">
          <h2 id="apparence-titre" className="s-h2">
            Apparence
          </h2>
          <ThemeSwitch />
          <Button href="/app/preferences" variant="secondary" icon="next" data-testid="preferences-link">
            {preferencesLabels.settingsRow}
          </Button>
          <p className="o-t-caption s-muted">{preferencesLabels.settingsRowCaption}</p>
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
              label="Code de ton application d'authentification (ou code de secours)"
              name="totpCode"
              autoComplete="one-time-code"
              help="Inutile si tu t'es connecté avec une clé d'accès."
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
