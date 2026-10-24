import { Button, Chip, Icon, Plate, VehicleCard } from "@orasso/design-system/web";
import {
  gradeLabels,
  mainVehicleLabels,
  networkLabels as N,
  publicPreviewLabels as P,
  type PreviewAs,
  type PublicPreview,
} from "@orasso/shared";

import { PersonAvatar } from "../components/People";
import { apiOrThrow } from "../lib/api.server";
import type { Route } from "./+types/profil-public";
import "../styles/network.css";

// Lot R4c (maquette R4.6c) : « Mon profil public », en aperçu, comme l'appli : mon profil vu par un membre connecté
// (`?vu=ami` : par un ami), calculé par l'API (`/me/public-preview?as=`). Boutons inertes, le principal en premier.
export function meta() {
  return [{ title: "Mon profil public · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const as: PreviewAs = new URL(request.url).searchParams.get("vu") === "ami" ? "friend" : "member";
  const preview = await apiOrThrow<PublicPreview>(request, `/me/public-preview?as=${as}`);
  return { as, preview };
}

export default function ProfilPublic({ loaderData }: Route.ComponentProps) {
  const { as, preview: p } = loaderData;
  const limited = p.audience === "public_limited";
  const banner = as === "friend" ? P.bannerFriend : limited ? P.bannerMemberPrivate : P.bannerMemberPublic;
  const counts = [
    [p.followersCount, N.followers],
    [p.followingCount, N.following],
    [p.friendsCount, N.friends],
  ] as const;
  return (
    <div className="s-narrow s-stack" data-testid="profil-public">
      <div className="s-stack s-stack--tight">
        <h1 className="s-title">{P.title}</h1>
        <p className="o-t-caption s-muted">{P.subtitle}</p>
      </div>
      <nav className="n-tabs n-tabs--two" aria-label="Regard" data-testid="preview-as">
        <a
          href="/app/profil-public"
          aria-current={as === "member" ? "page" : undefined}
          data-testid="preview-as-member"
        >
          {P.asMember}
        </a>
        <a
          href="/app/profil-public?vu=ami"
          aria-current={as === "friend" ? "page" : undefined}
          data-testid="preview-as-friend"
        >
          {P.asFriend}
        </a>
      </nav>
      <p className="n-preview-banner" data-testid="preview-banner">
        <Icon name="eye" size={16} />
        <span>{banner}</span>
      </p>

      <section className="n-pub" data-testid="public-head">
        <div className="n-pub__top">
          <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={64} />
          <div className="s-stack s-stack--tight">
            <h2 className="s-title">{p.pseudo}</h2>
            <div className="n-pub__tags">
              <Chip variant="accent">{gradeLabels[p.grade]}</Chip>
              {limited ? (
                <span className="o-t-caption s-muted">
                  <Icon name="lock" size={13} /> {P.privateAccount}
                </span>
              ) : (
                p.departments?.[0] && <span className="o-t-caption s-muted">{p.departments.join(", ")}</span>
              )}
            </div>
          </div>
        </div>
        {!limited && (
          <p className="n-pub__counts" data-testid="public-counts">
            {counts.map(([n, label]) =>
              n === null ? null : (
                <span key={label(2)}>
                  <b>{n}</b> {label(n)}
                </span>
              ),
            )}
          </p>
        )}
        {/* Les boutons ne font rien dans l'aperçu : c'est ce que voient les autres. */}
        <div className="n-pub__actions n-pub__actions--inert" aria-hidden="true" data-testid="preview-actions">
          <Button variant="primary" icon={as === "friend" ? "check" : "add"} tabIndex={-1}>
            {as === "friend" ? "Ami" : "Ajouter en ami"}
          </Button>
          {p.follow.canFollow && (
            <Button variant="secondary" icon="add" tabIndex={-1}>
              {N.follow}
            </Button>
          )}
          <Button variant="secondary" icon="chat" tabIndex={-1}>
            Message
          </Button>
        </div>
        <p className="o-t-caption s-muted">{P.inert}</p>
      </section>

      {limited ? (
        <section className="s-stack s-stack--tight">
          <div className="n-group__head">
            <h2 className="s-h2">{P.vehiclesPrivate}</h2>
            <span className="o-t-caption">{P.vehiclesPrivateHint}</span>
          </div>
          <div className="n-plist" data-testid="preview-vehicles">
            {p.vehicles.map((v) => (
              <span key={v.id}>
                <Icon name="vehicle" size={16} /> {v.label}
              </span>
            ))}
          </div>
          <p className="n-note">
            <Icon name="lock" size={16} />
            <span>{P.privateRest}</span>
          </p>
        </section>
      ) : (
        <section className="s-stack s-stack--tight">
          <div className="n-group__head">
            <h2 className="s-h2">{P.garage}</h2>
            <span className="o-t-caption">{`${p.vehicles.length} véhicule${p.vehicles.length > 1 ? "s" : ""}`}</span>
          </div>
          <div className="s-grid" data-testid="preview-vehicles">
            {p.vehicles.map((v) =>
              v.photoUrl ? (
                <VehicleCard
                  key={v.id}
                  first
                  name={v.label}
                  photo={<img src={v.photoUrl} alt="" loading="lazy" />}
                  facts={v.main ? `★ ${mainVehicleLabels.tag}` : undefined}
                />
              ) : (
                <Plate key={v.id} as="article" className="s-vrow">
                  <span className="o-t-poster-m o-never-truncate">{v.label}</span>
                  {v.main && <span className="o-t-caption">★ {mainVehicleLabels.tag}</span>}
                </Plate>
              ),
            )}
          </div>
        </section>
      )}

      <div className="s-row">
        <Button variant="secondary" icon="lock" href="/app/moi#visibilite-titre" data-testid="preview-privacy">
          {P.privacy}
        </Button>
        <Button variant="secondary" icon="edit" href="/app/moi#profil-titre" data-testid="preview-edit">
          Modifier mon profil
        </Button>
      </div>
    </div>
  );
}
