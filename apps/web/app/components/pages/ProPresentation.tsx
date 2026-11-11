// L'onglet « Présentation » de la fiche d'un pro, sur le site (lot R8g, maquette R8.6 : « Présentation · Publications · Mentions ») :
// tout le contenu de la fiche d'hier au même endroit pour que rien ne disparaisse : métiers, adresse ou zone, raison sociale du
// registre, présentation, Appeler et Itinéraire, remises par grade, « Ses partenaires » (R7m1), réalisations, horaires, contact,
// organisateurs partenaires, « Offres et actualités » (jusqu'à R9c, qui en fera des publications « Offre »), Partager.
import { Button, Chip, ChipRow, Plate } from "@orasso/design-system/web";
import { gradeLabels, grades, type ProPublic, proActivityLabels, weekdayLabels, weekdays } from "@orasso/shared";

import { formatDateTime } from "../../lib/format";
import { PartnersOfPro } from "../partnerships/PartnersOfPro";
import { ShareButtons } from "../ShareButtons";

export function ProPresentation({
  pro,
  origin,
  onTrack,
}: {
  pro: ProPublic;
  origin: string;
  /** Un compteur de la fiche (appel, itinéraire) : silencieux, jamais bloquant. */
  onTrack: (kind: "call" | "route") => void;
}) {
  const where = [pro.addressLine, [pro.postalCode, pro.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const socials = Object.entries(pro.socials).filter(([, url]) => Boolean(url)) as [string, string][];
  const discounts = grades.filter((g) => pro.discounts[g]);
  const hours = weekdays.filter((d) => pro.hours[d]);
  const route =
    pro.lat != null && pro.lng != null
      ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${pro.lat}%2C${pro.lng}`
      : null;
  return (
    <div className="s-stack" data-testid="pro-presentation">
      <Plate as="section" aria-labelledby="pro-about">
        <h2 id="pro-about" className="s-h2">
          À propos
        </h2>
        <ChipRow>
          {pro.activities.map((a) => (
            <Chip key={a}>{proActivityLabels[a]}</Chip>
          ))}
        </ChipRow>
        {pro.registryName && (
          <p className="o-t-meta s-tile__muted" data-testid="registry-name">
            {pro.registryName}
          </p>
        )}
        {where ? (
          <p className="o-t-meta s-tile__muted">{where}</p>
        ) : (
          pro.interventionDepartments.length > 0 && (
            <p className="o-t-meta s-tile__muted" data-testid="pro-zone">
              Intervient dans les départements : {pro.interventionDepartments.join(", ")}
            </p>
          )
        )}
        {pro.description && <p className="s-prewrap">{pro.description}</p>}
        {(pro.phone || route) && (
          <div className="s-row">
            {pro.phone && (
              <Button
                variant="secondary"
                icon="phone"
                href={`tel:${pro.phone.replace(/[^+\d]/g, "")}`}
                onClick={() => onTrack("call")}
                data-testid="call"
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
                onClick={() => onTrack("route")}
                data-testid="route"
              >
                Itinéraire
              </Button>
            )}
          </div>
        )}
      </Plate>

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

      {/* Lot R7m1 : « Ses partenaires » (passionnés à partenariat actif ; l'API ne sert rien sans compte connecté). */}
      <PartnersOfPro items={pro.memberPartners ?? []} total={pro.memberPartnersTotal} slug={pro.slug} />

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
      </Plate>
    </div>
  );
}
