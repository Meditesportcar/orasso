// Lot R5b (maquettes R5.6 et R5.6b) : le profil d'un membre, en UN composant pour `/u/:pseudo` et pour l'aperçu
// `/app/profil-public`. Même contenu et même ordre que l'appli : la personne (photo, nom, réseaux, nombres, boutons),
// sa voiture en carré, sa prochaine sortie en ticket, son garage, ses sorties, « Vu à ». Une colonne sur téléphone, deux
// en bureau (la carte de la personne reste visible en défilant). Compte privé : tête, nombres, véhicules en lignes.
import { Button, Chip, Icon, type IconName } from "@orasso/design-system/web";
import {
  filledSocials,
  gradeLabels,
  publicProfileLabels as L,
  networkLabels,
  type ProfileEvent,
  type ProfileVehicle,
  publicPreviewLabels as PV,
  socialsLabels,
  socialUrl,
  type UserProfileView,
} from "@orasso/shared";
import type { CSSProperties, ReactNode } from "react";
import { Form, useNavigation } from "react-router";

import { now } from "../lib/clock";
import { formatDay, formatTime } from "../lib/format";
import { withRetour } from "../lib/retour";
import { PassportStamp } from "./PassportStamp";
import { FriendAction } from "./People";
import { ReportDialog } from "./ReportDialog";
import "../styles/passport.css";
import "../styles/profile-r5.css";

const TZ = "Europe/Paris";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const stubWeekday = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short" });
const stubDay = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric" });
const stubMonth = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, month: "short" });

/** Jours entiers du calendrier de Paris entre aujourd'hui et le jour de la sortie. */
function daysUntil(iso: string): number {
  const day = (d: Date) => Date.parse(`${dayKey.format(d)}T00:00:00Z`);
  return Math.round((day(new Date(iso)) - day(now())) / 86_400_000);
}

const typeIcon = (v: ProfileVehicle): IconName =>
  v.vehicleType === "moto" ? "moto" : v.vehicleType === "truck" ? "truck" : "vehicle";

export type PublicProfileMode = "live" | "self" | "preview";

type Props = {
  profile: UserProfileView;
  /** `live` : le profil d'un autre ; `self` : le mien sur `/u/:pseudo` ; `preview` : l'aperçu (boutons inertes). */
  mode: PublicProfileMode;
  /** Aperçu seulement : le regard choisi. */
  previewAs?: "member" | "friend";
  /** Dans la carte, sous les boutons : erreurs, formulaire de demande de contact. */
  notices?: ReactNode;
  /** Sous « Vu à » : coordonnées de l'organisateur, hub de mon profil. */
  after?: ReactNode;
};

function Photo({ v, big }: { v: ProfileVehicle; big?: boolean }) {
  return v.photoUrl ? (
    <img src={v.photoUrl} alt="" loading="lazy" />
  ) : (
    <span className={big ? "pr5-hero__none" : "pr5-sq__none"} aria-hidden="true">
      <Icon name={typeIcon(v)} size={big ? 64 : 40} />
    </span>
  );
}

export function PublicProfile({ profile: p, mode, previewAs = "member", notices, after }: Props) {
  const busy = useNavigation().state !== "idle";
  const preview = mode === "preview";
  const live = mode === "live";
  const limited = p.audience === "public_limited";
  const here = `/u/${encodeURIComponent(p.pseudo)}`;
  const crew = p.crews?.[0] ?? null;
  const socials = filledSocials(p.socials);
  const counts = [
    [p.followersCount, networkLabels.followers],
    [p.followingCount, networkLabels.following],
    [p.friendsCount, networkLabels.friends],
    [p.outingsCount, networkLabels.outings],
  ].filter((c): c is [number, (n: number) => string] => c[0] !== null);
  const Title = preview ? "h2" : "h1";

  const car = p.vehicles.find((v) => v.main) ?? p.vehicles[0] ?? null;
  const others = p.vehicles.filter((v) => v !== car);
  const next = p.nextOuting;
  const nextDays = next ? daysUntil(next.event.startsAt) : 0;
  const outings: ProfileEvent[] = (p.upcomingEvents ?? []).filter((e) => e.slug !== next?.event.slug);
  const stamps = p.seenAt?.stamps.slice(0, 6) ?? [];

  const link = (v: ProfileVehicle, className: string, children: ReactNode) =>
    live || mode === "self" ? (
      <a className={className} href={withRetour(`/v/${v.id}`, here)} data-testid="profil-vehicle">
        {children}
      </a>
    ) : (
      <div className={className}>{children}</div>
    );

  return (
    <div className={limited ? "pr5 pr5--limited" : "pr5"}>
      <aside className="pr5-card" data-testid="public-head">
        <div className="pr5-hd">
          {/* Retour 6 de Damien : la même tête que l'appli (la photo, sinon l'initiale sur le rouge du grade). */}
          <span className="pr5-face" aria-hidden="true">
            {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : p.pseudo.charAt(0).toUpperCase()}
          </span>
          <div className="pr5-hd__id">
            <Title style={{ "--len": p.pseudo.length } as CSSProperties}>{p.pseudo}</Title>
            <div className="pr5-tags">
              <Chip variant="accent">{gradeLabels[p.grade]}</Chip>
              {limited ? (
                <span className="pr5-lock">
                  <Icon name="lock" size={14} /> {L.privateAccount}
                </span>
              ) : (
                p.departments &&
                p.departments.length > 0 && <span className="o-t-caption s-muted">{p.departments.join(", ")}</span>
              )}
            </div>
            {crew && (
              <a
                className="pr5-crew"
                href={`/c/${crew.slug}`}
                aria-label={L.openCrew(crew.name)}
                data-testid="profile-crew"
              >
                <i aria-hidden="true">{crew.name.slice(0, 2).toUpperCase()}</i>
                <span>{crew.name}</span>
              </a>
            )}
          </div>
        </div>

        {p.bio && <p className="s-prewrap o-t-caption s-muted">{p.bio}</p>}

        {socials.length > 0 && (
          <ul className="pr5-socs" aria-label={socialsLabels.group} data-testid="profile-socials">
            {socials.map(({ network, handle }) => {
              const href = socialUrl(network, handle);
              if (!href) return null;
              return (
                <li key={network}>
                  <a
                    className="pr5-soc"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    aria-label={socialsLabels.link(network, handle)}
                  >
                    <Icon name={network} size={16} />
                    {handle}
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {counts.length > 0 && (
          <p
            className="pr5-n4"
            style={{ gridTemplateColumns: `repeat(${counts.length}, minmax(0, 1fr))` }}
            data-testid="public-counts"
          >
            {counts.map(([n, label]) => (
              <span key={label(2)}>
                <b>{n}</b>
                <small>{label(n)}</small>
              </span>
            ))}
          </p>
        )}

        {mode === "self" && (
          <Button variant="secondary" icon="edit" href="/app/profil/modifier">
            Modifier mon profil
          </Button>
        )}

        {live && (
          <>
            <div className="pr5-acts">
              <FriendAction
                state={p.friendship.state}
                pseudo={p.pseudo}
                userId={p.userId}
                requestId={p.friendship.id}
                primary
                busy={busy}
              />
              {/* Compte privé : pas de « Suivre », seulement « Ajouter en ami ». */}
              {!limited && (p.follow.canFollow || p.follow.following) && (
                <Form method="post">
                  <input type="hidden" name="pseudo" value={p.pseudo} />
                  <Button
                    type="submit"
                    name="intent"
                    value={p.follow.following ? "unfollow" : "follow"}
                    variant="secondary"
                    icon={p.follow.following ? "check" : "add"}
                    loading={busy}
                    data-testid={p.follow.following ? "profile-followed" : "profile-follow"}
                  >
                    {p.follow.following ? networkLabels.followed : networkLabels.follow}
                  </Button>
                </Form>
              )}
            </div>
            <div className="pr5-write">
              {/* Messagerie (lot 18) : ami → conversation ; sinon demande de contact. Signaler : lot 32. */}
              <Form method="post">
                <input type="hidden" name="intent" value="message_open" />
                <input type="hidden" name="userId" value={p.userId} />
                <Button type="submit" variant="secondary" icon="chat" loading={busy} data-testid="message-open">
                  {L.writeTo(p.pseudo)}
                </Button>
              </Form>
              <ReportDialog targetType="profile" targetId={p.userId} />
            </div>
          </>
        )}

        {preview && (
          <>
            {/* Les boutons ne font rien dans l'aperçu : c'est ce que voient les autres. */}
            <div className="pr5-acts pr5-acts--inert" aria-hidden="true" data-testid="preview-actions">
              <Button variant="primary" icon={previewAs === "friend" ? "check" : "add"} tabIndex={-1}>
                {previewAs === "friend" ? "Ami" : "Ajouter en ami"}
              </Button>
              {!limited && p.follow.canFollow && (
                <Button variant="secondary" icon="add" tabIndex={-1}>
                  {networkLabels.follow}
                </Button>
              )}
              {!limited && (
                <Button variant="secondary" icon="chat" tabIndex={-1}>
                  {L.writeTo(p.pseudo)}
                </Button>
              )}
            </div>
            <p className="o-t-caption s-muted">{PV.inert}</p>
          </>
        )}

        {notices}
      </aside>

      {limited ? (
        <section className="pr5-block pr5-priv" aria-labelledby="pr5-priv-t">
          <div className="pr5-sh">
            <h2 id="pr5-priv-t" className="s-h2">
              {L.vehiclesPrivate}
            </h2>
            <small>{L.vehiclesPrivateHint}</small>
          </div>
          <div className="pr5-plist" data-testid={preview ? "preview-vehicles" : "profile-vehicles-private"}>
            {p.vehicles.map((v) => (
              <span key={v.id} className="o-never-truncate">
                <Icon name={typeIcon(v)} size={16} /> {v.label}
              </span>
            ))}
          </div>
          <p className="pr5-note" data-testid="profile-private-note">
            <Icon name="lock" size={16} />
            <span>
              <strong>{L.privateRestStrong}</strong>
              {L.privateRest}
            </span>
          </p>
        </section>
      ) : (
        <>
          <section
            className="pr5-block pr5-car"
            aria-labelledby="pr5-car-t"
            data-testid={preview ? "preview-vehicles" : "profile-car"}
          >
            <div className="pr5-sh">
              <h2 id="pr5-car-t" className="s-h2">
                {L.car}
              </h2>
              <small>{L.carHint}</small>
            </div>
            {car ? (
              link(
                car,
                "pr5-hero",
                <>
                  <Photo v={car} big />
                  <span className="pr5-hero__fav">
                    <Icon name="star" size={13} /> {L.mainTag}
                  </span>
                  <span className="pr5-hero__cap">
                    {/* Texte posé sur la photo : le contour couleur du fond (écart 1 de la DA v2). */}
                    <b className="o-never-truncate o-onphoto">{car.label}</b>
                    {car.year && <small className="o-onphoto">{car.year}</small>}
                    {car.categories.length > 0 && (
                      <span className="pr5-cats">
                        {car.categories.map((c) => (
                          <span key={c}>{c}</span>
                        ))}
                      </span>
                    )}
                  </span>
                </>,
              )
            ) : (
              <p className="s-muted">{L.noVehicle}</p>
            )}
          </section>

          {next && (
            <section
              className="pr5-block pr5-next"
              aria-labelledby="pr5-next-t"
              data-testid={preview ? "preview-upcoming" : "profile-next"}
            >
              <div className="pr5-sh">
                <h2 id="pr5-next-t" className="s-h2">
                  {L.next}
                </h2>
                <small>{L.nextIn(nextDays)}</small>
              </div>
              <a className="pr5-nx" href={`/e/${next.event.slug}`}>
                <span className="pr5-nx__stub" aria-hidden="true">
                  <small>{stubWeekday.format(new Date(next.event.startsAt))}</small>
                  <b>{stubDay.format(new Date(next.event.startsAt))}</b>
                  <small>{stubMonth.format(new Date(next.event.startsAt))}</small>
                </span>
                <span className="pr5-nx__main">
                  <span className="pr5-nx__tag">{nextDays <= 0 ? "Jour J" : `J-${nextDays}`}</span>
                  <h3>{next.event.title}</h3>
                  <small>
                    {[formatTime(next.event.startsAt), next.event.city, next.event.structureName]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {next.together && (
                    <span className="pr5-both" data-testid="profile-together">
                      <Icon name="check" size={15} />
                      {L.together}
                    </span>
                  )}
                </span>
              </a>
            </section>
          )}
          {/* Ses sorties sont visibles mais aucune n'est à venir : on le dit, comme l'appli. */}
          {!next && p.upcomingEvents && (
            <section
              className="pr5-block pr5-next"
              aria-labelledby="pr5-next-t"
              data-testid={preview ? "preview-upcoming" : "profile-next-none"}
            >
              <div className="pr5-sh">
                <h2 id="pr5-next-t" className="s-h2">
                  {L.next}
                </h2>
              </div>
              <p className="s-muted">{L.noOuting}</p>
            </section>
          )}

          {outings.length > 0 && (
            <section
              className="pr5-block pr5-outings"
              aria-labelledby="pr5-out-t"
              data-testid={preview && !next ? "preview-upcoming" : "profile-outings"}
            >
              <div className="pr5-sh">
                <h2 id="pr5-out-t" className="s-h2">
                  {L.outings}
                </h2>
                <small>{L.outingsHint(outings.length)}</small>
              </div>
              <ul className="pr5-ups">
                {outings.slice(0, 5).map((e) => (
                  <li key={e.slug}>
                    <a className="pr5-up" href={`/e/${e.slug}`}>
                      <Icon name="calendar" size={17} />
                      <b>{e.title}</b>
                      <small>{formatDay(e.startsAt)}</small>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {others.length > 0 && (
            <section className="pr5-block pr5-garage" aria-labelledby="pr5-gar-t" data-testid="profile-garage">
              <div className="pr5-sh">
                <h2 id="pr5-gar-t" className="s-h2">
                  {L.garage}
                </h2>
                <small>{L.garageOthers(others.length)}</small>
              </div>
              <div className="pr5-grid">
                {others.map((v) => (
                  <div key={v.id}>
                    {link(
                      v,
                      "pr5-sq",
                      <>
                        <span className="pr5-sq__p">
                          <Photo v={v} />
                        </span>
                        <b className="o-never-truncate">{v.label}</b>
                        {v.year && <small>{v.year}</small>}
                      </>,
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {p.seenAt && stamps.length > 0 && (
            <section className="pr5-block pr5-seenat" aria-labelledby="pr5-seen-t" data-testid="profile-seen">
              <div className="pr5-sh">
                <h2 id="pr5-seen-t" className="s-h2">
                  {L.seenAt}
                </h2>
                <small>{L.seenAtHint(p.seenAt.events)}</small>
              </div>
              <div className="pr5-seen">
                {stamps.map((s) => (
                  <a key={s.id} href={`/e/${s.event.slug}`}>
                    <PassportStamp stamp={s} size={120} />
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {after && <div className="pr5-after">{after}</div>}
    </div>
  );
}
