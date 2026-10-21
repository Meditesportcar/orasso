// Fiche d'un média (lot 57) : ce que voient les connectés et les organisations quand ils trient une demande
// d'accréditation (nom, formats, présentation, liens, zone couverte, « Profil vérifié »). `GET /media/:id` est réservé
// aux connectés (lot 45) : la fiche vit dans l'espace connecté, comme les profils (`/u/:pseudo`).
import { Button, Chip, ChipRow, Plate } from "@orasso/design-system/web";
import {
  instagramHandle,
  instagramUrl,
  mediaAppLabels as L,
  type MediaPublic,
  mediaFormatLabels,
} from "@orasso/shared";

import { apiOrThrow, requireMe } from "../lib/api.server";
import "../styles/media.css";
import type { Route } from "./+types/m";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: `${d?.media.name ?? "Média"} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  return { media: await apiOrThrow<MediaPublic>(request, `/media/${encodeURIComponent(params.id)}`) };
}

export default function MediaPage({ loaderData }: Route.ComponentProps) {
  const m = loaderData.media;
  const ig = instagramUrl(m.instagram);
  return (
    <div className="s-narrow s-stack" data-testid="media-public">
      <div className="s-row">
        {m.logoUrl && <img className="md-logo" src={m.logoUrl} alt="" />}
        <div className="s-stack s-stack--tight">
          <div className="o-t-label s-label">Média</div>
          <h1 className="s-title o-never-truncate">{m.name}</h1>
          <ChipRow className="s-chips-wrap">
            {m.verified && <Chip variant="verified">{L.profileVerified}</Chip>}
            {m.formats.map((f) => (
              <Chip key={f}>{mediaFormatLabels[f]}</Chip>
            ))}
          </ChipRow>
        </div>
      </div>
      {m.description && <p className="s-prewrap">{m.description}</p>}
      <Plate className="s-stack s-stack--tight">
        <div className="o-t-label">{L.profileCover}</div>
        <p>{m.departments.length ? m.departments.join(", ") : L.profileCoverAll}</p>
      </Plate>
      <div className="s-row">
        {m.website && (
          <Button variant="secondary" icon="explore" href={m.website} target="_blank" rel="noreferrer">
            {L.profileWebsite}
          </Button>
        )}
        {ig && (
          <Button variant="secondary" icon="instagram" href={ig} target="_blank" rel="noreferrer">
            {instagramHandle(m.instagram) ?? L.profileInstagram}
          </Button>
        )}
        {m.youtube && (
          <Button variant="secondary" icon="live" href={m.youtube} target="_blank" rel="noreferrer">
            {L.profileYoutube}
          </Button>
        )}
      </div>
    </div>
  );
}
