import { Button, Icon, Plate } from "@orasso/design-system/web";
import {
  type EventCard,
  type Page,
  type ProCard,
  type StructureOrganizer,
  type StructurePublic,
  structureKindLabels,
} from "@orasso/shared";
import { Form, redirect } from "react-router";

import { EventTile } from "../components/EventTile";
import { ContactOrganizer } from "../components/Messaging";
import { ProTile } from "../components/ProTile";
import { ShareButtons } from "../components/ShareButtons";
import { Stars } from "../components/Stars";
import { api, apiOrThrow, getMe, loginUrl, originOf } from "../lib/api.server";
import { messageAction } from "../lib/messaging.server";
import type { Route } from "./+types/structure";

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug;
  const structure = await apiOrThrow<StructurePublic>(request, `/structures/by-slug/${encodeURIComponent(slug)}`);
  const [upcoming, past, me, partners] = await Promise.all([
    api<Page<EventCard>>(request, `/events?structureId=${structure.id}&limit=50`),
    api<Page<EventCard>>(request, `/events?structureId=${structure.id}&scope=past&limit=12`),
    getMe(request),
    api<ProCard[]>(request, `/structures/by-slug/${encodeURIComponent(slug)}/pros`),
  ]);
  const organizer = me?.memberships.find(
    (m) => m.structureId === structure.id && m.status === "active" && m.role !== "staff",
  );
  // Lien d'invitation : visible des organisateurs de la structure seulement (c'est leur lien à partager).
  const full = organizer ? await api<StructureOrganizer>(request, `/structures/${structure.id}`) : null;
  return {
    structure,
    upcoming: upcoming.ok ? upcoming.data.items : [],
    past: past.ok ? past.data.items : [],
    partners: partners.ok ? partners.data : [],
    connected: Boolean(me),
    inviteToken: full?.ok ? full.data.inviteToken : null,
    isOrganizer: Boolean(organizer),
    origin: originOf(request),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Structure introuvable · Orasso" }];
  const { structure, origin } = loaderData;
  const where = [structure.city, structure.department].filter(Boolean).join(" ");
  const description =
    structure.description?.slice(0, 160) ||
    `${structureKindLabels[structure.kind]}${where ? ` · ${where}` : ""} · ${structure.followersCount} abonnés. Événements à venir sur Orasso.`;
  const title = `${structure.name} · Orasso`;
  const image = structure.logoUrl ? new URL(structure.logoUrl, origin).toString() : `${origin}/og-image.png`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/o/${structure.slug}` },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary" },
  ];
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const structureId = String(form.get("structureId") ?? "");
  if (!(await getMe(request))) throw redirect(loginUrl(request));
  if (structureId && (intent === "follow" || intent === "unfollow")) {
    await api(request, `/structures/${structureId}/follow`, { method: intent === "follow" ? "POST" : "DELETE" });
  }
  // Contacter l'organisateur (lot 18) : toujours possible, conversation avec la structure.
  if (intent === "contact_organizer") return messageAction(request, form);
  return redirect(`/o/${params.slug}`);
}

export default function StructurePage({ loaderData }: Route.ComponentProps) {
  const { structure, upcoming, past, partners, connected, inviteToken, isOrganizer, origin } = loaderData;
  const where = [structure.postalCode, structure.city].filter(Boolean).join(" ");
  const socials = Object.entries(structure.socials).filter(([, url]) => Boolean(url)) as [string, string][];
  const average = structure.rating.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return (
    <div className="s-stack">
      <Plate as="section" className="so__head" aria-labelledby="so-title">
        <div className="so__logo" aria-hidden={!structure.logoUrl}>
          {structure.logoUrl ? (
            <img src={structure.logoUrl} alt={`Logo de ${structure.name}`} />
          ) : (
            <Icon name="staff" size={36} />
          )}
        </div>
        <div className="s-grow s-stack s-stack--tight">
          <div className="o-t-label s-tile__muted">
            {structureKindLabels[structure.kind]}
            {structure.verified && (
              <>
                {" · "}
                <span className="s-verified" data-testid="verified-badge">
                  Structure vérifiée
                </span>
              </>
            )}
          </div>
          <h1 id="so-title" className="s-title">
            {structure.name}
          </h1>
          {where && <div className="o-t-meta s-tile__muted">{where}</div>}
          <div className="o-t-meta" data-testid="structure-rating">
            {average ? (
              <>
                <Stars rating={Math.round(structure.rating.average ?? 0)} />{" "}
                <strong className="o-t-number">{average}</strong> / 3 · {structure.rating.count} avis
              </>
            ) : (
              <span className="s-tile__muted">
                {structure.rating.count > 0
                  ? `${structure.rating.count} avis · la note s'affiche à partir de 3 avis`
                  : "Pas encore d'avis"}
              </span>
            )}
          </div>
          <div className="o-t-caption s-tile__muted">{structure.followersCount} abonnés</div>
        </div>
        <div className="so__actions">
          {connected ? (
            <Form method="post">
              <input type="hidden" name="structureId" value={structure.id} />
              <Button
                type="submit"
                name="intent"
                value={structure.isFollowing ? "unfollow" : "follow"}
                variant="primary"
                icon="heart"
                fullWidth
              >
                {structure.isFollowing ? "Tu suis cette structure" : "Suivre"}
              </Button>
            </Form>
          ) : (
            <Button
              variant="primary"
              icon="heart"
              href={`/connexion?retour=${encodeURIComponent(`/o/${structure.slug}`)}`}
              fullWidth
            >
              Suivre
            </Button>
          )}
          {structure.verified && !isOrganizer && (
            <ContactOrganizer structureId={structure.id} connected={connected} retour={`/o/${structure.slug}`} />
          )}
          {isOrganizer && (
            <Button variant="secondary" icon="calendar" href={`/orga/${structure.slug}`} fullWidth>
              Espace organisateur
            </Button>
          )}
        </div>
      </Plate>

      {structure.description && (
        <Plate as="section" aria-labelledby="so-about">
          <h2 id="so-about" className="s-h2">
            À propos
          </h2>
          <p className="s-prewrap">{structure.description}</p>
          {(structure.website || socials.length > 0) && (
            <div className="s-row">
              {structure.website && (
                <a href={structure.website} rel="noopener nofollow" target="_blank">
                  Site web
                </a>
              )}
              {socials.map(([name, url]) => (
                <a key={name} href={url} rel="noopener nofollow" target="_blank">
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </a>
              ))}
            </div>
          )}
        </Plate>
      )}

      <section className="s-stack" aria-labelledby="so-next">
        <h2 id="so-next" className="s-h2 s-head">
          Prochains événements
        </h2>
        {upcoming.length === 0 ? (
          <p className="s-notice">Aucun événement à venir pour l'instant. Suis la structure pour être prévenu.</p>
        ) : (
          <div className="s-grid" data-testid="structure-upcoming">
            {upcoming.map((event) => (
              <EventTile key={event.id} event={event} showStructure={false} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="s-stack" aria-labelledby="so-past">
          <h2 id="so-past" className="s-h2 s-head">
            Événements passés
          </h2>
          <div className="s-grid" data-testid="structure-past">
            {past.map((event) => (
              <EventTile key={event.id} event={event} showStructure={false} />
            ))}
          </div>
        </section>
      )}

      {partners.length > 0 && (
        <section className="s-stack" aria-labelledby="so-partners" data-testid="structure-partners">
          <h2 id="so-partners" className="s-h2 s-head">
            Pros partenaires
          </h2>
          <div className="s-grid">
            {partners.map((pro) => (
              <ProTile key={pro.slug} pro={pro} />
            ))}
          </div>
        </section>
      )}

      {inviteToken && (
        <Plate as="section" aria-labelledby="so-invite">
          <h2 id="so-invite" className="s-h2">
            Lien d'invitation
          </h2>
          <p className="s-entry__text">
            Partage ce lien à tes passionnés : en créant leur compte, ils suivent {structure.name} et sont prévenus de
            tes prochains événements en avant-première.
          </p>
          <ShareButtons url={`${origin}/invitation/${inviteToken}`} title={`Rejoins ${structure.name} sur Orasso`} />
        </Plate>
      )}
    </div>
  );
}
