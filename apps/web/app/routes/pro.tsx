// Fiche publique d'un pro (`/p/<slug>`, docs/01 « Professionnels » : logo, activités, adresse ou zone d'intervention,
// horaires, photos de réalisations, contact, réseaux, remises par grade, organisateurs partenaires).
import { Button, Chip, ChipRow, Icon, Plate } from "@orasso/design-system/web";
import {
  countFr,
  gradeLabels,
  grades,
  type ProPublic,
  proActivityLabels,
  weekdayLabels,
  weekdays,
  widestWordEm,
} from "@orasso/shared";
import { type CSSProperties, useEffect } from "react";
import { Form, redirect } from "react-router";

import { ReportDialog } from "../components/ReportDialog";
import { ShareButtons } from "../components/ShareButtons";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, getMe, loginUrl, originOf } from "../lib/api.server";
import { formatDateTime } from "../lib/format";
import type { Route } from "./+types/pro";

export async function loader({ request, params }: Route.LoaderArgs) {
  const pro = await apiOrThrow<ProPublic>(request, `/pros/by-slug/${encodeURIComponent(params.slug)}`);
  return { pro, connected: Boolean(await getMe(request)), origin: originOf(request) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Pro introuvable · Orasso" }];
  const { pro, origin } = loaderData;
  const where = [pro.city, pro.department].filter(Boolean).join(" ");
  const description =
    pro.description?.slice(0, 160) ||
    `${pro.activities.map((a) => proActivityLabels[a]).join(", ")}${where ? ` · ${where}` : ""} · Pro sur Orasso.`;
  const title = `${pro.name} · Orasso`;
  const image = pro.logoUrl ? new URL(pro.logoUrl, origin).toString() : `${origin}/og-image.png`;
  return [
    { title },
    { name: "description", content: description },
    // Une fiche en brouillon (vue de son propriétaire) ne doit pas être indexée.
    ...(pro.published ? [] : [{ name: "robots", content: "noindex" }]),
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/p/${pro.slug}` },
    { property: "og:image", content: image },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "AutoRepair",
        name: pro.name,
        description,
        image,
        telephone: pro.phone ?? undefined,
        url: pro.website ?? `${origin}/p/${pro.slug}`,
        address:
          pro.city || pro.addressLine
            ? {
                "@type": "PostalAddress",
                streetAddress: pro.addressLine ?? undefined,
                postalCode: pro.postalCode ?? undefined,
                addressLocality: pro.city ?? undefined,
                addressCountry: "FR",
              }
            : undefined,
        geo:
          pro.lat != null && pro.lng != null
            ? { "@type": "GeoCoordinates", latitude: pro.lat, longitude: pro.lng }
            : undefined,
      },
    },
  ];
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const proId = String(form.get("proId") ?? "");
  if (!(await getMe(request))) throw redirect(loginUrl(request));
  if (proId && (intent === "follow" || intent === "unfollow")) {
    await api(request, `/pros/${proId}/follow`, { method: intent === "follow" ? "POST" : "DELETE" });
  }
  return redirect(`/p/${params.slug}`);
}

/** Un compteur de la fiche (vue, appel, itinéraire) : silencieux, jamais bloquant. */
function track(slug: string, kind: "view" | "call" | "route") {
  void apiFetch(`/pros/by-slug/${encodeURIComponent(slug)}/track`, { method: "POST", json: { kind } });
}

export default function ProPage({ loaderData }: Route.ComponentProps) {
  const { pro, connected, origin } = loaderData;
  const where = [pro.addressLine, [pro.postalCode, pro.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const socials = Object.entries(pro.socials).filter(([, url]) => Boolean(url)) as [string, string][];
  const discounts = grades.filter((g) => pro.discounts[g]);
  const hours = weekdays.filter((d) => pro.hours[d]);
  const route =
    pro.lat != null && pro.lng != null
      ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${pro.lat}%2C${pro.lng}`
      : null;

  // Une vue par fiche et par session de navigation (les rechargements ne gonflent pas le compteur).
  useEffect(() => {
    try {
      const key = `orasso:pro-view:${pro.slug}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Stockage indisponible : on compte quand même une fois par chargement.
    }
    track(pro.slug, "view");
  }, [pro.slug]);

  return (
    <div className="s-stack">
      <Plate as="section" className="so__head" aria-labelledby="pro-title">
        <div className="so__logo" aria-hidden={!pro.logoUrl}>
          {pro.logoUrl ? <img src={pro.logoUrl} alt={`Logo de ${pro.name}`} /> : <Icon name="vehicle" size={36} />}
        </div>
        <div className="s-grow s-stack s-stack--tight s-fit">
          <div className="o-t-label s-tile__muted">
            {pro.activities.map((a) => proActivityLabels[a]).join(" · ")}
            {pro.verified && (
              <>
                {" · "}
                <span className="s-verified" data-testid="verified-badge">
                  Pro vérifié
                </span>
                {pro.registryName && <span data-testid="registry-name"> · {pro.registryName}</span>}
              </>
            )}
          </div>
          <h1
            id="pro-title"
            className="s-title s-title--fit"
            style={{ "--em": widestWordEm(pro.name) } as CSSProperties}
          >
            {pro.name}
          </h1>
          {where ? (
            <div className="o-t-meta s-tile__muted">{where}</div>
          ) : (
            pro.interventionDepartments.length > 0 && (
              <div className="o-t-meta s-tile__muted" data-testid="pro-zone">
                Intervient dans les départements : {pro.interventionDepartments.join(", ")}
              </div>
            )
          )}
          <div className="o-t-caption s-tile__muted">{countFr(pro.followersCount, "abonné")}</div>
        </div>
        <div className="so__actions">
          {connected ? (
            <Form method="post">
              <input type="hidden" name="proId" value={pro.id} />
              <Button
                type="submit"
                name="intent"
                value={pro.isFollowing ? "unfollow" : "follow"}
                variant="primary"
                icon="heart"
                fullWidth
                disabled={pro.isOwner}
              >
                {pro.isFollowing ? "Tu suis ce pro" : "Suivre"}
              </Button>
            </Form>
          ) : (
            <Button
              variant="primary"
              icon="heart"
              href={`/connexion?retour=${encodeURIComponent(`/p/${pro.slug}`)}`}
              fullWidth
            >
              Suivre
            </Button>
          )}
          {pro.phone && (
            <Button
              variant="secondary"
              icon="phone"
              href={`tel:${pro.phone.replace(/[^+\d]/g, "")}`}
              onClick={() => track(pro.slug, "call")}
              data-testid="call"
              fullWidth
            >
              Appeler
            </Button>
          )}
          {route && (
            <Button
              variant="secondary"
              icon="place"
              href={route}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track(pro.slug, "route")}
              data-testid="route"
              fullWidth
            >
              Itinéraire
            </Button>
          )}
          {pro.isOwner && (
            <Button variant="secondary" icon="list" href={`/pro/${pro.slug}`} fullWidth>
              Mon espace pro
            </Button>
          )}
        </div>
      </Plate>

      {pro.description && (
        <Plate as="section" aria-labelledby="pro-about">
          <h2 id="pro-about" className="s-h2">
            À propos
          </h2>
          <p className="s-prewrap">{pro.description}</p>
        </Plate>
      )}

      {discounts.length > 0 && (
        <Plate as="section" aria-labelledby="pro-discounts" data-testid="pro-discounts">
          <h2 id="pro-discounts" className="s-h2">
            Remises selon ton grade
          </h2>
          <p className="s-muted">
            Présente le QR de ton compte (onglet Garage de l'appli) : le pro lit ton pseudo, ton grade et ta remise,
            rien d'autre.
          </p>
          <ul className="s-discounts">
            {grades.map((g) => (
              <li key={g} className={pro.discounts[g] ? "s-discounts__on" : "s-discounts__off"}>
                <span className="o-t-label">{gradeLabels[g]}</span>
                <strong className="o-t-number">{pro.discounts[g] ? `−${pro.discounts[g]} %` : "—"}</strong>
              </li>
            ))}
          </ul>
        </Plate>
      )}

      {pro.photos.length > 0 && (
        <section className="s-stack" aria-labelledby="pro-photos">
          <h2 id="pro-photos" className="s-h2">
            Réalisations
          </h2>
          <div className="s-photos" data-testid="pro-photos">
            {pro.photos.map((p) => (
              <img key={p.id} src={p.url} alt={`Réalisation de ${pro.name}`} loading="lazy" />
            ))}
          </div>
        </section>
      )}

      <div className="s-two">
        {hours.length > 0 && (
          <Plate as="section" aria-labelledby="pro-hours">
            <h2 id="pro-hours" className="s-h2">
              Horaires
            </h2>
            <dl className="s-hours">
              {weekdays.map((d) => (
                <div key={d}>
                  <dt className="o-t-label">{weekdayLabels[d]}</dt>
                  <dd>{pro.hours[d] || "Fermé"}</dd>
                </div>
              ))}
            </dl>
          </Plate>
        )}
        {(pro.email || pro.website || pro.phone || socials.length > 0) && (
          <Plate as="section" aria-labelledby="pro-contact">
            <h2 id="pro-contact" className="s-h2">
              Contact
            </h2>
            <div className="s-stack s-stack--tight">
              {pro.phone && <a href={`tel:${pro.phone.replace(/[^+\d]/g, "")}`}>{pro.phone}</a>}
              {pro.email && <a href={`mailto:${pro.email}`}>{pro.email}</a>}
              {pro.website && (
                <a href={pro.website} rel="noopener nofollow" target="_blank">
                  Site web
                </a>
              )}
              {socials.map(([name, url]) => (
                <a key={name} href={url} rel="noopener nofollow" target="_blank">
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </a>
              ))}
            </div>
          </Plate>
        )}
      </div>

      {pro.partners.length > 0 && (
        <section className="s-stack" aria-labelledby="pro-partners" data-testid="pro-partners">
          <h2 id="pro-partners" className="s-h2">
            Partenaire des organisateurs
          </h2>
          <ChipRow>
            {pro.partners.map((s) => (
              <a key={s.slug} href={`/o/${s.slug}`} className="s-chip-link">
                <Chip>{s.name}</Chip>
              </a>
            ))}
          </ChipRow>
        </section>
      )}

      <section className="s-stack" aria-labelledby="pro-posts" data-testid="pro-posts">
        <h2 id="pro-posts" className="s-h2">
          Offres et actualités
        </h2>
        {pro.posts === null ? (
          <p className="s-notice">
            {pro.postsCount > 0
              ? `${pro.postsCount} publication${pro.postsCount > 1 ? "s" : ""} réservée${pro.postsCount > 1 ? "s" : ""} aux abonnés : suis ce pro pour les lire.`
              : "Suis ce pro pour recevoir ses offres et ses actualités."}
          </p>
        ) : pro.posts.length === 0 ? (
          <p className="s-notice">Aucune publication pour l'instant.</p>
        ) : (
          <ul className="s-reviews">
            {pro.posts.map((post) => (
              <li key={post.id} className="s-card" data-testid="pro-post">
                <strong>{post.title}</strong>
                <p className="s-prewrap">{post.body}</p>
                <span className="o-t-caption s-muted">{formatDateTime(post.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Plate as="section" aria-labelledby="pro-share">
        <h2 id="pro-share" className="s-h2">
          Partager
        </h2>
        <ShareButtons url={`${origin}/p/${pro.slug}`} title={`${pro.name} sur Orasso`} />
        {connected && !pro.isOwner && <ReportDialog look="link" targetType="pro" targetId={pro.id} />}
      </Plate>
    </div>
  );
}
