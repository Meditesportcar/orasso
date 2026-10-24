// Le plateau sur le site (lot R4b, maquette R4.7) : la grille des voitures et les pros sur place, partagée par la page
// de l'événement (six vignettes) et la page `/e/:slug/plateau` (la grille entière). Connecté : comme dans l'appli
// (pseudo, cadenas des comptes privés, clic = profil ; compte privé = fiche de sa voiture) ; sans compte : photos et
// modèles seulement, l'API n'envoie ni pseudo ni identifiant. Les règles sont dans l'API.
import { Icon } from "@orasso/design-system/web";
import {
  type Grade,
  isMemberCar,
  lineupLabels as L,
  type LineupCar,
  type LineupPreview,
  type LineupPro,
} from "@orasso/shared";
import "../styles/lineup.css";

/** Où mène une vignette : ma voiture (garage), un compte public (profil), un compte privé (la fiche de sa voiture). */
function carHref(car: LineupCar): string | null {
  if (!isMemberCar(car)) return null;
  if (car.me) return `/app/garage/${car.vehicleId}`;
  if (car.private) return `/v/${car.vehicleId}`;
  return `/u/${encodeURIComponent(car.pseudo)}`;
}

export function CarTile({ car }: { car: LineupCar }) {
  const member = isMemberCar(car) ? car : null;
  const href = carHref(car);
  const body = (
    <>
      <span className="lu-car__photo">
        {car.photoUrl ? <img src={car.photoUrl} alt="" loading="lazy" /> : <Icon name="vehicle" size={28} />}
        {member?.me && <span className="lu-me">{L.me}</span>}
      </span>
      <span className="lu-car__text">
        {/* Nom entier, jamais coupé : il passe à la ligne. */}
        <strong className="lu-car__name o-never-truncate" data-testid="lineup-car-name">
          {car.label}
        </strong>
        {member && (
          <span className="lu-car__who">
            {member.private && (
              <span role="img" aria-label={L.privateLock}>
                <Icon name="lock" size={13} />
              </span>
            )}
            {member.pseudo}
          </span>
        )}
      </span>
    </>
  );
  const className = `lu-car${member?.me ? " is-me" : ""}`;
  const testid = member?.me ? "lineup-car-me" : member?.private ? "lineup-car-private" : "lineup-car";
  return href ? (
    <a className={className} href={href} data-testid={testid}>
      {body}
    </a>
  ) : (
    <div className={className} data-testid={testid}>
      {body}
    </div>
  );
}

export function CarGrid({ cars, wide = false }: { cars: LineupCar[]; wide?: boolean }) {
  return (
    <div className={`lu-grid${wide ? " lu-grid--wide" : ""}`} data-testid="lineup-grid">
      {cars.map((car, i) => (
        <CarTile key={isMemberCar(car) ? car.vehicleId : i} car={car} />
      ))}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** Un pro sur place : logo, nom, métier (« Média officiel »), remise pour mon grade ; lien vers sa vitrine (connecté). */
export function ProItem({ pro, grade, connected }: { pro: LineupPro; grade: Grade | null; connected: boolean }) {
  const body = (
    <>
      <span className="lu-pro__logo">
        {pro.logoUrl ? <img src={pro.logoUrl} alt="" loading="lazy" /> : initials(pro.name)}
      </span>
      <span className="lu-pro__text">
        <strong>{pro.name}</strong>
        <span className="o-t-caption">
          {pro.job}
          {pro.officialMedia && <span className="lu-accent"> · {L.officialMedia}</span>}
        </span>
        {pro.discount && grade && (
          <span className="o-t-caption lu-accent" data-testid="lineup-pro-discount">
            {L.discount(pro.discount, grade)}
          </span>
        )}
      </span>
    </>
  );
  const href = connected ? (pro.kind === "provider" ? `/providers/${pro.id}` : `/m/${pro.id}`) : null;
  return href ? (
    <a className="lu-pro" href={href} data-testid="lineup-pro">
      {body}
    </a>
  ) : (
    <span className="lu-pro" data-testid="lineup-pro">
      {body}
    </span>
  );
}

/** Sans compte : « Qui vient ? Les pseudos et les profils sont réservés aux membres. Connecte-toi… » */
export function VisitorNotice({ retour }: { retour: string }) {
  return (
    <p className="lu-login" data-testid="lineup-login">
      <Icon name="lock" size={16} />
      <span>
        <strong>{L.visitorTitle}</strong> {L.visitorText}{" "}
        <a href={`/connexion?retour=${encodeURIComponent(retour)}`}>{L.visitorLogin}</a> {L.visitorSignup}
      </span>
    </p>
  );
}

/** La ligne « Le plateau » d'une sortie retenue (`/app/sorties`, maquette R4.4) : trois mini-photos et le nombre. */
export function LineupLine({ slug, preview }: { slug: string; preview: LineupPreview | null | undefined }) {
  if (!preview || preview.count === 0) return null;
  return (
    <a className="lu-line" href={`/e/${slug}/plateau`} data-testid="ticket-lineup">
      <span className="lu-line__avatars" aria-hidden="true">
        {preview.photoUrls.map((url) => (
          <img key={url} src={url} alt="" loading="lazy" />
        ))}
      </span>
      <span className="lu-line__text">
        <strong>{L.title}</strong> · {preview.count} {L.sortiesLine(preview.count, preview.phase)}
      </span>
      <Icon name="next" size={16} />
    </a>
  );
}
