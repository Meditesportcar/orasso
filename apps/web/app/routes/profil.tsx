import { Button, type IconName } from "@orasso/design-system/web";
import {
  CONTACT_MESSAGE_MAX,
  type MyCrew,
  mediaAppLabels,
  messagingLabels,
  type PassportView,
  type PersonaKind,
  passportScreenTexts,
  personaKindLabels,
  type UserProfileView,
} from "@orasso/shared";
import { Form, useNavigation } from "react-router";

import { PublicProfile } from "../components/PublicProfile";
import { api, apiOrThrow, getMe, safeReturn } from "../lib/api.server";
import { followAction, isFollowIntent } from "../lib/follow.server";
import { isMessageIntent, type MessageActionData, messageAction } from "../lib/messaging.server";
import "../styles/passport.css";
import "../styles/network.css";
import "../styles/profile-r5.css";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import type { Route } from "./+types/profil";

// Profil d'un autre (lot 17, ARCHITECTURE-SUITE § 2.2 et 2.5) : complet pour un compte public ou un abonné accepté, réduit
// (pseudo, photo, grade, marque et modèle) pour un compte privé. Jamais la plaque. Réservé aux connectés.
// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
// Lot R4c (maquettes 10.2 et R4.6c) : abonnés, abonnements et sorties sur une ligne (aux audiences qui voient tout), le
// véhicule principal en premier. Lot R6b (D37, maquette R6.1) : un seul bouton « Suivre » (pas d'amitié).
export const handle = ficheHandle;

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `${params.pseudo} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  // Lot M7, tour 2 : le ✕ revient à l'écran d'origine (`?retour=`, chemin interne seulement).
  const back = safeReturn(new URL(request.url).searchParams.get("retour"), "/app");
  const profile = await apiOrThrow<UserProfileView>(request, `/users/${encodeURIComponent(params.pseudo)}`);
  if (profile.audience !== "self") return { back, profile, hub: null };
  // Lot 57 (DA v2, `s-me`) : mon profil devient le hub, comme l'appli : passeport, crew, casquettes avec leur accès.
  const [me, passport, crews] = await Promise.all([
    getMe(request),
    api<PassportView>(request, "/me/passport"),
    api<MyCrew[]>(request, "/me/crews"),
  ]);
  const slugOf = new Map((me?.memberships ?? []).map((m) => [m.structureId, m.structureSlug]));
  const casquettes = (me?.personas ?? [])
    .filter((p) => p.kind !== "fan" && p.kind !== "visitor")
    .map((p) => ({
      kind: p.kind,
      label: p.label,
      href:
        p.kind === "organizer"
          ? `/orga/${slugOf.get(p.id) ?? ""}`
          : p.kind === "pro"
            ? `/pro/${me?.pro?.slug ?? ""}`
            : p.kind === "provider"
              ? "/app/prestataire"
              : "/app/media",
    }));
  return {
    back,
    profile,
    hub: {
      passport: passport.ok ? { total: passport.data.total, rare: passport.data.rare } : null,
      crew: crews.ok ? (crews.data[0] ?? null) : null,
      casquettes,
      kinds: casquettes.map((c) => c.kind),
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  // Message (lot 18) : conversation existante, sinon demande de contact.
  const intent = String(form.get("intent") ?? "");
  if (isMessageIntent(intent)) return messageAction(request, form);
  // Lot R6b : suivre (ou demander à suivre), ne plus suivre, annuler une demande.
  if (isFollowIntent(intent)) return followAction(request, form);
  return { followError: "Action inconnue." };
}

type Hub = NonNullable<Route.ComponentProps["loaderData"]["hub"]>;

/** Lot 57 : le hub de Mon profil (`s-me`) côté site : passeport, crew, casquettes avec leur accès, un seul « Créer ». */
function ProfileHub({ hub }: { hub: Hub }) {
  const has = new Set(hub.kinds);
  const all: { kind: string; href: string; label: string; icon: IconName }[] = [
    { kind: "organizer", href: "/app/structure/nouvelle", label: "Une structure", icon: "flag" },
    { kind: "pro", href: "/app/pro/nouvelle", label: "Une fiche pro", icon: "shop" },
    { kind: "provider", href: "/app/prestataire", label: "Un profil prestataire", icon: "briefcase" },
    { kind: "media", href: "/app/media/nouveau", label: mediaAppLabels.createTitle, icon: "press" },
  ];
  const create = all.filter((c) => !has.has(c.kind as PersonaKind));
  return (
    <section className="s-stack s-stack--tight" aria-label="Mon profil" data-testid="profile-hub">
      <div className="pf-tiles">
        <a className="s-card pf-tile" href="/app/passeport" data-testid="hub-passport">
          <span className="o-t-label">{passportScreenTexts.tileTitle}</span>
          <span>{passportScreenTexts.tile(hub.passport?.total ?? 0, hub.passport?.rare ?? 0)}</span>
        </a>
        <a
          className="s-card pf-tile"
          href={hub.crew ? `/c/${hub.crew.slug}` : "/app/crews/rejoindre"}
          data-testid="hub-crew"
        >
          <span className="o-t-label">Mon crew</span>
          <span className="o-never-truncate">{hub.crew ? hub.crew.name : "Rejoins ou crée un crew"}</span>
        </a>
        <a className="s-card pf-tile" href="/app/sorties">
          <span className="o-t-label">Mes sorties</span>
          <span>Candidatures, billets, missions staff</span>
        </a>
      </div>
      {hub.casquettes.length > 0 && (
        <>
          <h2 className="s-h2">Mes casquettes</h2>
          <ul className="s-stack s-stack--tight pf-list" data-testid="hub-casquettes">
            {hub.casquettes.map((c) => (
              <li key={`${c.kind}-${c.href}`}>
                <Button variant="secondary" icon="next" next href={c.href}>
                  {`${personaKindLabels[c.kind]} · ${c.label}`}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {create.length > 0 && (
        <details>
          <summary className="o-t-label">Créer</summary>
          <div className="s-row">
            {create.map((c) => (
              <Button key={c.href} variant="secondary" icon={c.icon} href={c.href}>
                {c.label}
              </Button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export default function Profil({ loaderData, actionData: rawAction }: Route.ComponentProps) {
  const p = loaderData.profile;
  const actionData = rawAction as ({ followError?: string | null } & Partial<MessageActionData>) | undefined;
  const busy = useNavigation().state !== "idle";
  const isSelf = p.audience === "self";
  // Lot R5b : le profil est le composant commun (comme l'aperçu) ; les coordonnées de l'organisateur et le hub restent ici.
  const notices = (
    <>
      {actionData?.followError && (
        <p className="s-error" role="alert">
          {actionData.followError}
        </p>
      )}
      {actionData?.messageError && (
        <p className="s-error" role="alert">
          {actionData.messageError}
        </p>
      )}
      {actionData?.contactSent && (
        <p className="s-notice s-notice--ok" data-testid="contact-sent">
          {messagingLabels.contactRequestSent(actionData.contactSent)}
        </p>
      )}
      {actionData?.contact && (
        <Form method="post" className="s-form s-card" data-testid="contact-form">
          <h2 className="s-h2">{messagingLabels.contactRequest}</h2>
          <p className="o-t-caption s-muted">{messagingLabels.contactRequestHint}</p>
          <input type="hidden" name="intent" value="contact_request" />
          <input type="hidden" name="pseudo" value={p.pseudo} />
          <label className="s-label o-t-label" htmlFor="contact-message">
            Message
          </label>
          <textarea
            id="contact-message"
            name="message"
            className="s-textarea"
            rows={4}
            maxLength={CONTACT_MESSAGE_MAX}
            placeholder={messagingLabels.contactRequestPlaceholder}
            required
          />
          <Button type="submit" variant="secondary" icon="chat" loading={busy}>
            {messagingLabels.contactRequestSend}
          </Button>
        </Form>
      )}
    </>
  );
  const after = (
    <>
      {isSelf && loaderData.hub && <ProfileHub hub={loaderData.hub} />}
      {p.contact && (
        <section className="s-section" aria-labelledby="contact-titre" data-testid="profil-contact">
          <h2 id="contact-titre" className="s-h2">
            Coordonnées
          </h2>
          <p className="o-t-caption s-muted">Visibles de toi parce qu'il ou elle est inscrit à tes événements.</p>
          <dl className="s-recap">
            <dt>Nom</dt>
            <dd>{[p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || "—"}</dd>
            <dt>Téléphone</dt>
            <dd>{p.contact.phone ?? "—"}</dd>
            <dt>E-mail</dt>
            <dd>{p.contact.email ?? "—"}</dd>
          </dl>
        </section>
      )}
    </>
  );
  return (
    <>
      <FicheBar heading={false} title="Profil" back={loaderData.back} />
      <div data-testid="profil" data-audience={p.audience}>
        <PublicProfile profile={p} mode={isSelf ? "self" : "live"} notices={notices} after={after} />
      </div>
    </>
  );
}
