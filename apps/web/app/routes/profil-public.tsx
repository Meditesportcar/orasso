import { Button, Icon } from "@orasso/design-system/web";
import { publicProfileLabels as L, publicPreviewLabels as P, type PreviewAs, type PublicPreview } from "@orasso/shared";

import { PublicProfile } from "../components/PublicProfile";
import { apiOrThrow } from "../lib/api.server";
import type { Route } from "./+types/profil-public";
import "../styles/network.css";
import "../styles/profile-r5.css";

// Lot R4c (maquette R4.6c) : « Mon profil public », en aperçu, comme l'appli : mon profil vu par un membre connecté
// (`?vu=ami` : par un ami), calculé par l'API (`/me/public-preview?as=`). Boutons inertes, le principal en premier.
// Lot R5b (maquette R5.6) : le même composant que le profil d'un membre (`PublicProfile`), « Modifier » en haut.
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
  return (
    <div className="s-stack" data-testid="profil-public">
      <div className="pr5-top pr5-narrow">
        <div className="s-stack s-stack--tight">
          <h1 className="s-title">{P.title}</h1>
          <p className="o-t-caption s-muted">{P.subtitle}</p>
        </div>
        <Button variant="secondary" icon="edit" href="/app/profil/modifier" data-testid="preview-edit">
          {L.edit}
        </Button>
      </div>
      <nav className="n-tabs n-tabs--two pr5-narrow" aria-label="Regard" data-testid="preview-as">
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
      <p className="n-preview-banner pr5-narrow" data-testid="preview-banner">
        <Icon name="eye" size={16} />
        <span>{banner}</span>
      </p>

      <PublicProfile profile={p} mode="preview" previewAs={as} />

      <div className="pr5-btns">
        <Button variant="secondary" icon="lock" href="/app/moi#confidentialite" data-testid="preview-privacy">
          {P.privacy}
        </Button>
      </div>
    </div>
  );
}
