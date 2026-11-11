import { AvatarRing, Button, CheckboxField, Chip, Icon, type IconName, TextField } from "@orasso/design-system/web";
import {
  type AccountSettings,
  accountAppLabels,
  authorKeyOf,
  explicitProfileTab,
  feedScreenLabels,
  gradeLabels,
  type MyPartnerships,
  moderationLabels,
  mutableTypesByFamily,
  networkLabels as N,
  type NetworkCounts,
  type NotificationFamily,
  newsDigestType,
  notificationFamilies,
  notificationFamilyLabels,
  notificationTypeLabels,
  type PersonaKind,
  profileTabsLabels as PT,
  partnershipLabels as PTN,
  personaKindLabels,
  preferencesLabels,
  profileOpenTab,
  profilePhotoLabels,
  profileVisibilities,
  profileVisibilityAlways,
  profileVisibilityLabels,
  profileVisibilityRules,
  settingsHubLabels as S,
  type UserProfileView,
  type VehicleFull,
  type WithPublications,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";
import { LeftCrewsSection } from "../components/crew-feed/LeftCrewsSection"; // R5c1, tour 2
import { EventNotificationsFieldset } from "../components/event/NotifySignup";
import { GarageTab } from "../components/profile/GarageTab";
import { type GarageActionData, garageAction, loadGarage } from "../components/profile/garage.server";
import { PanelDown } from "../components/profile/PanelDown";
import { PartnersPanel, partnersBandCell } from "../components/profile/PartnersLine";
import { type BandCell, CounterBand, ProfileHead, SideIcon } from "../components/profile/ProfileHead";
import { ProfileTabs } from "../components/profile/ProfileTabs";
import { isPanelFailure, panelRetryHref } from "../components/profile/panel";
import { loadSorties } from "../components/profile/passport.server";
import { SortiesTab } from "../components/profile/SortiesTab";
import { PublicationsTab } from "../components/publications/PublicationsTab";
import { ThemeSwitch } from "../components/SiteChrome";
import { api, apiOrThrow, requireMe, withCookies } from "../lib/api.server";
import type { Route } from "./+types/moi";
import "../styles/network.css";
import "../styles/profile-r5.css";
import "../styles/profile.css";

// Mon compte sur le site (lot 15, ARCHITECTURE-SUITE § 1.6) : notifications par type, compte public ou privé,
// apparence (thème ; le coin, la distance et les centres d'intérêt sont dans « Tes préférences », `/app/preferences`),
// sécurité, suppression du compte. Lot R5b (maquette R5.4) : la carte du profil en tête avec sa roue dentée, puis la
// liste « Réglages » comme l'appli ; le pseudo, la description, la photo et les réseaux sont dans « Modifier mon profil ».
// Lot R7b1 (D38, maquette R7.12) : le Profil porte le Garage. En-tête (photo dans son anneau, nombres, « Partenaires »), puis
// deux onglets internes, Garage (par défaut) et Sorties (le passeport), lus dans `?onglet=` ; les casquettes et les réglages
// suivent. `/app/garage` et `/app/passeport` redirigent ici.
// Lot R8b1 (D40, maquette R8.1 `pr-profil`, option A « Compact ») : le haut du Profil est repris comme dans l'appli (photo de 72 px,
// pseudo, grade et département, bio sur une ligne avec « plus », QR et Réglages en icônes, bande de compteurs avec « partenaires »
// en 4e compteur) ; « Profil public » devient la première ligne de Réglages (« Voir mon profil comme les autres ») ; les onglets
// sont soulignés et collants (« Garage · N », « Sorties »). Le site garde l'onglet « Garage » pour tout le monde (y compris
// un visiteur sans véhicule : il porte mon QR de compte et l'ajout d'un premier véhicule).
export function meta() {
  return [{ title: "Mon compte · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const url = new URL(request.url);
  // Lot R7b1 : l'onglet interne ; seule sa lecture est faite. Lot R8b2 : « Publications » s'ouvre par défaut, le mien compris.
  const onglet =
    explicitProfileTab(url.searchParams.get("onglet")) ??
    profileOpenTab({ mine: true, hasGarage: true, publications: undefined });
  const [settings, network, garage, sorties, partnerships, vehicleList, selfProfile] = await Promise.all([
    apiOrThrow<AccountSettings>(request, "/me/settings"),
    // Lot R4c : abonnés, abonnements, sorties (R6b).
    api<NetworkCounts>(request, "/me/network"),
    onglet === "garage" ? loadGarage(request) : Promise.resolve(null),
    onglet === "sorties" ? loadSorties(request) : Promise.resolve(null),
    // Lot R7m1 : mes partenaires (la ligne « Partenaires », « Mettre fin »).
    api<MyPartnerships>(request, "/me/partnerships"),
    // Lot R8b1 : le nombre de « Garage · N » vient du Garage quand il est ouvert ; sur « Sorties », une lecture légère.
    onglet !== "garage" ? api<VehicleFull[]>(request, "/me/vehicles") : Promise.resolve(null),
    // Lot R8b2 : mon nombre de publications (la ligne « N publications » de l'onglet) : mon profil public le porte.
    onglet === "publications"
      ? api<WithPublications<UserProfileView>>(request, `/users/${encodeURIComponent(me.profile.pseudo)}`)
      : Promise.resolve(null),
  ]);
  const garageCount =
    garage && !isPanelFailure(garage)
      ? garage.vehicles.length
      : vehicleList?.ok
        ? vehicleList.data.filter((v) => v.status === "active").length
        : null;
  return {
    me,
    settings,
    network: network.ok ? network.data : null,
    partnerships: partnerships.ok ? partnerships.data.items : null,
    // Tour 2 : une panne de cette lecture ne ressemble jamais à « aucun partenaire » (message + « Réessayer »).
    partnershipsDown: !partnerships.ok,
    onglet,
    garageCount,
    publicationsCount: selfProfile?.ok ? (selfProfile.data.publications?.count ?? null) : null,
    // Tour 4 : « Réessayer » garde l'onglet et la saison de la page.
    retryHref: panelRetryHref(url.searchParams),
    garage,
    sorties,
    saved: url.searchParams.get("fait"),
  };
}

// La page porte le secret du QR de compte (onglet Garage) : ni le navigateur ni un relais ne la gardent. On part des
// en-têtes du parent (`root.tsx` : X-Frame-Options, frame-ancestors, Referrer-Policy du lot 12).
export const headers: Route.HeadersFunction = ({ parentHeaders }) => {
  const h = new Headers(parentHeaders);
  h.set("cache-control", "private, no-store");
  return h;
};

const MUTABLE = mutableTypesByFamily();
// Lot R8n2 : « Nouveautés de mes sorties » a sa propre ligne (réglage `eventNews`), pas une case de plus dans la famille.
const typesOf = (f: NotificationFamily) => (MUTABLE[f] ?? []).filter((t) => !(f === "event" && t === newsDigestType));
const FAMILIES = notificationFamilies.filter((f) => f === "event" || MUTABLE[f]?.length) as NotificationFamily[];

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  // Lot R7b1 : les actions de l'onglet Garage (mettre en avant, transferts de plaque).
  if (intent === "feature" || intent === "transfer-accept" || intent === "transfer-decline") {
    return garageAction(request, form, intent);
  }
  // Lot R7m1 : mettre fin à un partenariat (le pro est prévenu ; les contenus déjà publiés gardent leur mention).
  if (intent === "partnership_end") {
    const res = await api(request, `/me/partnerships/${encodeURIComponent(String(form.get("id") ?? ""))}/end`, {
      method: "POST",
    });
    if (!res.ok) return data({ scope: "partnership", error: res.error.message }, { status: res.status });
    return redirect("/app/moi?fait=partenariat");
  }
  if (intent === "settings") {
    const prefs = Object.fromEntries(
      (["application", "event", "social", "grade"] as const).map((f) => [f, form.get(`fam_${f}`) === "on"]),
    ) as Record<"application" | "event" | "social" | "grade", boolean>;
    const mutedTypes = FAMILIES.flatMap(typesOf).filter((t) => form.get(`type_${t}`) !== "on");
    const res = await api(request, "/me/settings", {
      method: "PATCH",
      json: {
        notificationPrefs: { ...prefs, eventNews: form.get("eventNews") === "on" },
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
  partenariat: "Partenariat terminé : le pro est prévenu.",
};

export default function Moi({ loaderData, actionData }: Route.ComponentProps) {
  const { me, settings, saved } = loaderData;
  const busy = useNavigation().state !== "idle";
  const err = (scope: string) => (actionData?.scope === scope ? actionData.error : null);
  // Lot R8b1 : la bande de compteurs. Un nombre inconnu (lecture en panne) dit « – ». « partenaires » seulement quand il y en a.
  const partnersCell = partnersBandCell({ mine: loaderData.partnerships, down: loaderData.partnershipsDown });
  const bandCells: BandCell[] = [
    ...(
      [
        ["abonnes", loaderData.network?.followers, N.followers, "/app/reseau?liste=abonnes"],
        ["abonnements", loaderData.network?.following, N.following, "/app/reseau?liste=abonnements"],
        // Lot R6b (D37) : plus d'amis ; le troisième nombre est celui de mes sorties (l'onglet Sorties du Profil).
        ["sorties", loaderData.network?.outings, N.outings, "/app/moi?onglet=sorties"],
      ] as const
    ).map(([tab, n, label, href]) => ({
      key: tab,
      value: n ?? null,
      label: label(n ?? 2),
      href,
      testId: `profil-count-${tab}`,
    })),
    ...(partnersCell ? [partnersCell] : []),
  ];
  // Mes casquettes (lot C5, artefact `s-profil`) : le seul endroit du site d'où l'on passe à une autre casquette.
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
  const hubRows: { key: string; href: string; icon: IconName; title: string; caption?: string; testId?: string }[] = [
    // Lot R8b1 (D40) : « Profil public » a quitté le haut du Profil ; l'aperçu est la première ligne des réglages.
    {
      key: "profil-public",
      href: "/app/profil-public",
      icon: "eye",
      title: PT.seeAsOthers,
      testId: "reglage-profil-public",
    },
    {
      key: "profil",
      href: "/app/profil/modifier",
      icon: "edit",
      title: S.editProfile,
      caption: S.editProfileCaption,
      testId: "reglage-profil",
    },
    {
      key: "mes-publications",
      href: "/app/fil/mes-publications",
      icon: "gallery",
      title: feedScreenLabels.mineTitle,
      caption: feedScreenLabels.mineSettingCaption,
      testId: "reglage-mes-publications",
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
      {/* Lot R8b1 (maquette R8.1, option A « Compact ») : la grille d'identité (photo de 72 px dans son anneau, sans story pour
          l'instant : `ring = null` ; pseudo, grade et département, bio sur une ligne ; QR et Réglages en icônes) puis la bande de
          compteurs : abonnés, abonnements, sorties (chacun ouvre sa liste) et « partenaires » quand il y en a (la liste est
          dessous, visée par la case). */}
      <section className="pt-top" data-testid="profil-card" aria-label="Mon profil">
        <ProfileHead
          testId="profil-head"
          avatar={
            <>
              <AvatarRing ring={null} size="profile" src={me.profile.avatarUrl} name={me.profile.pseudo} />
              <a
                className="pt-head__cam"
                href="/app/profil/modifier"
                aria-label={profilePhotoLabels.change}
                data-testid="profil-photo"
              >
                <Icon name="camera" size={12} />
              </a>
            </>
          }
          name={me.profile.pseudo}
          line={
            <>
              <Chip variant="accent">{gradeLabels[me.profile.grade]}</Chip>
              {me.profile.departments[0] && (
                <span className="pt-dept" data-testid="profil-department">
                  <Icon name="place" size={14} />
                  {me.profile.departments[0]}
                </span>
              )}
            </>
          }
          bio={me.profile.bio}
          bioTestId="profil-bio"
          side={
            <>
              <SideIcon icon="qr" label={PT.qrOpen} href="/app/moi?onglet=garage#qr" testId="profil-account-qr" />
              <SideIcon icon="gear" label={PT.settingsOpen} href="#reglages" testId="profil-settings" />
            </>
          }
        />
        <CounterBand label={N.countsGroup} testId="profil-counters" cells={bandCells} />
        <PartnersPanel
          mine={loaderData.partnerships}
          busy={busy}
          failure={
            loaderData.partnershipsDown ? (
              <PanelDown message={PTN.partnersLoadError} href={loaderData.retryHref} />
            ) : null
          }
        />
        {err("partnership") && (
          <p className="s-error" role="alert">
            {err("partnership")}
          </p>
        )}
      </section>
      {saved && SAVED[saved] && (
        <p className="s-notice s-notice--ok" role="status">
          {SAVED[saved]}
        </p>
      )}

      {/* Lot R7b1 : les deux onglets internes, Garage par défaut ; chaque onglet n'est lu que quand il est ouvert. */}
      <ProfileTabs
        value={loaderData.onglet}
        hrefOf={(tab) => `/app/moi?${PT.param}=${tab}`}
        garageCount={loaderData.garageCount}
      />
      <div className="pt-panel" data-testid="profil-panel">
        {/* Tour 2 : une panne du garage ou du passeport n'emporte que son panneau (message + « Réessayer »). */}
        {loaderData.onglet === "garage" && loaderData.garage ? (
          isPanelFailure(loaderData.garage) ? (
            <PanelDown message={PT.garageDown} href={loaderData.retryHref} />
          ) : (
            <GarageTab
              data={loaderData.garage}
              actionData={(actionData?.scope === "garage" ? actionData : undefined) as GarageActionData | undefined}
            />
          )
        ) : null}
        {loaderData.onglet === "publications" ? (
          <PublicationsTab
            authorKey={authorKeyOf("user", loaderData.me.user.id)}
            pseudo={loaderData.me.profile.pseudo}
            mine
            total={loaderData.publicationsCount}
          />
        ) : null}
        {loaderData.onglet === "sorties" && loaderData.sorties ? (
          isPanelFailure(loaderData.sorties) ? (
            <PanelDown message={PT.outingsDown} href={loaderData.retryHref} />
          ) : (
            <>
              <SortiesTab data={loaderData.sorties} />
              <Button variant="secondary" icon="ticket" href="/app/sorties" data-testid="profil-places">
                {PT.seePlaces}
              </Button>
            </>
          )
        ) : null}
      </div>

      {hats.length > 0 && (
        <section className="s-section" aria-labelledby="casquettes-titre" data-testid="hats">
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

      {/* Lot R5b (maquette R5.4) : « Réglages », une liste de lignes comme l'appli ; les sections détaillées suivent. */}
      <section className="s-section" id="reglages" aria-labelledby="reglages-titre" data-testid="settings-hub">
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
                  {r.caption && <small>{r.caption}</small>}
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
          {FAMILIES.map((family) =>
            family === "event" ? (
              <EventNotificationsFieldset
                key={family}
                familyOn={settings.notificationPrefs.event !== false}
                eventNews={
                  settings.notificationPrefs.eventNews !== false && !settings.mutedTypes.includes(newsDigestType)
                }
                types={typesOf("event")}
                mutedTypes={settings.mutedTypes}
              />
            ) : (
              <fieldset key={family} className="s-fieldset s-stack s-stack--tight">
                <legend className="s-label o-t-label">{notificationFamilyLabels[family]}</legend>
                <CheckboxField
                  name={`fam_${family}`}
                  label={`Recevoir les notifications « ${notificationFamilyLabels[family]} »`}
                  defaultChecked={settings.notificationPrefs[family] !== false}
                />
                <div className="s-checklist">
                  {typesOf(family).map((type) => (
                    <CheckboxField
                      key={type}
                      name={`type_${type}`}
                      label={notificationTypeLabels[type]}
                      defaultChecked={!settings.mutedTypes.includes(type)}
                    />
                  ))}
                </div>
              </fieldset>
            ),
          )}
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
        {/* Lot R7b1 : le bouton principal de la page est « Ajouter un véhicule » (onglet Garage) ; l'enregistrement des réglages est secondaire. */}
        <Button type="submit" variant="secondary" icon="check" loading={busy}>
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
