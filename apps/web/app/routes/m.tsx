// Fiche d'un média (lot 57) : ce que voient les connectés et les organisations quand ils trient une demande
// d'accréditation (nom, formats, présentation, liens, zone couverte, « Profil vérifié »). `GET /media/:id` est réservé
// aux connectés (lot 45) : la fiche vit dans l'espace connecté, comme les profils (`/u/:pseudo`).
import { Button, Chip, ChipRow, Plate } from "@orasso/design-system/web";
import {
  instagramHandle,
  instagramUrl,
  mediaAppLabels as L,
  type MediaContentView,
  type MediaPublic,
  mediaFormatLabels,
  type Page,
} from "@orasso/shared";

import { api, apiOrThrow, requireMe } from "../lib/api.server";
import "../styles/media.css";
import type { Route } from "./+types/m";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: `${d?.media.name ?? "Média"} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const id = encodeURIComponent(params.id);
  const media = await apiOrThrow<MediaPublic>(request, `/media/${id}`);
  // Contenus publiés (relecture du lot 57) : 20 par page, « Voir la suite » ajoute la page suivante (`pages`).
  const pages = Math.min(10, Math.max(1, Math.floor(Number(new URL(request.url).searchParams.get("pages"))) || 1));
  const contents: MediaContentView[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < pages; i++) {
    const res: Awaited<ReturnType<typeof api<Page<MediaContentView>>>> = await api<Page<MediaContentView>>(
      request,
      `/media/${id}/contents?limit=20${cursor ? `&cursor=${cursor}` : ""}`,
    );
    if (!res.ok) break;
    contents.push(...res.data.items);
    cursor = res.data.nextCursor;
    if (!cursor) break;
  }
  return { media, contents, hasMore: Boolean(cursor), pages };
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
      {loaderData.contents.length > 0 && (
        <section className="s-stack" aria-labelledby="m-contents" data-testid="media-public-contents">
          <h2 id="m-contents" className="s-h2">
            {L.contents} · {loaderData.contents.length}
            {loaderData.hasMore ? "+" : ""}
          </h2>
          {loaderData.contents.map((c) => (
            <article key={c.id} className="s-card s-stack s-stack--tight" data-testid="media-public-content">
              <div className="o-t-label s-label">
                {L.kindOf(c)} · <a href={`/e/${c.event.slug}`}>{c.event.title}</a>
              </div>
              <h3 className="s-h2 o-never-truncate">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.title}
                  </a>
                ) : (
                  c.title
                )}
              </h3>
              {c.kind === "gallery" && c.photos.length > 0 && (
                <>
                  <ul className="md-thumbs">
                    {c.photos.slice(0, 6).map((p) => (
                      <li key={p.key}>
                        <img src={p.url} alt="" loading="lazy" />
                      </li>
                    ))}
                  </ul>
                  <div className="o-t-caption s-muted">{L.galleryStats(c.photos.length)}</div>
                </>
              )}
            </article>
          ))}
          {loaderData.hasMore && (
            <div>
              <Button
                variant="secondary"
                icon="down"
                href={`/m/${m.id}?pages=${loaderData.pages + 1}`}
                data-testid="media-public-more"
              >
                {L.exploreMore}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
