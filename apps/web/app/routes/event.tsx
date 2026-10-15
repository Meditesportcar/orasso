import { Button, Chip, ChipRow, Counters, Icon, Reveal, StatusBadge } from "@orasso/design-system/web";
import {
  type Category,
  type EventPublic,
  type EventReviews,
  eventAdmissionLabels,
  eventFormatLabels,
  eventOutlookLabels,
  eventPublicAccessLabels,
  type StructurePublic,
  vehicleTypeLabels,
} from "@orasso/shared";
import { Form, redirect } from "react-router";

import { EventMap } from "../components/EventMap";
import { ShareButtons } from "../components/ShareButtons";
import { Stars } from "../components/Stars";
import { api, apiOrThrow, getMe, loginUrl, originOf } from "../lib/api.server";
import { formatDateTime, formatWhen } from "../lib/format";
import { badgeFor, registrationState } from "../lib/status";
import type { Route } from "./+types/event";

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug;
  const event = await apiOrThrow<EventPublic>(request, `/events/by-slug/${encodeURIComponent(slug)}`);
  const [structure, categories, me, reviews] = await Promise.all([
    apiOrThrow<StructurePublic>(request, `/structures/by-slug/${encodeURIComponent(event.structure.slug)}`),
    api<Category[]>(request, "/vehicle-reference/categories"),
    getMe(request),
    api<EventReviews>(request, `/events/by-slug/${encodeURIComponent(slug)}/reviews`),
  ]);
  return {
    event,
    structure,
    reviews: reviews.ok ? reviews.data : null,
    ended: new Date(event.endsAt).getTime() <= Date.now(),
    categories: categories.ok ? categories.data : [],
    connected: Boolean(me),
    origin: originOf(request),
    state: registrationState(event, Date.now()),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Événement introuvable · Orasso" }];
  const { event, origin } = loaderData;
  const where = [event.city, event.department].filter(Boolean).join(" ");
  const description = `${eventFormatLabels[event.format]} · ${formatWhen(event.startsAt, event.endsAt)}${where ? ` · ${where}` : ""} · ${event.structure.name}`;
  const image = event.posterUrl ? new URL(event.posterUrl, origin).toString() : `${origin}/og-image.png`;
  const title = `${event.title} · Orasso`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/e/${event.slug}` },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
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
  return redirect(`/e/${params.slug}`);
}

/** Avis des participants pointés : moyenne à partir du minimum d'avis, réponse publique de l'organisateur. */
function ReviewsSection({ reviews }: { reviews: EventReviews }) {
  const average = reviews.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return (
    <section className="s-section" id="avis" aria-labelledby="avis-titre" data-testid="reviews">
      <h2 className="s-h2" id="avis-titre">
        Avis des participants
      </h2>
      {reviews.count === 0 ? (
        <p className="s-muted">
          Pas encore d'avis. Seuls les participants pointés à l'entrée peuvent noter, pendant la semaine qui suit.
        </p>
      ) : average ? (
        <p data-testid="reviews-average">
          <strong className="o-t-number">{average}</strong> / 3 · {reviews.count} avis
        </p>
      ) : (
        <p className="s-muted" data-testid="reviews-average">
          {reviews.count} avis · la moyenne s'affiche à partir de {reviews.minForAverage} avis.
        </p>
      )}
      {reviews.items.length > 0 && (
        <ul className="s-reviews">
          {reviews.items.map((r) => (
            <li key={r.id} className="s-card" data-testid="review">
              <div className="s-row s-row--between">
                <strong>{r.pseudo}</strong>
                <Stars rating={r.rating} />
              </div>
              <p className="s-prewrap">{r.comment}</p>
              {r.reply && (
                <p className="s-reply s-prewrap">
                  <span className="s-label o-t-label">Réponse de l'organisateur</span> {r.reply.text}
                </p>
              )}
              <span className="o-t-caption s-muted">{formatDateTime(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function EventPage({ loaderData }: Route.ComponentProps) {
  const { event, structure, categories, connected, origin, state, reviews, ended } = loaderData;
  const mine = event.myApplications ?? [];
  const wanted = (event.criteria?.categoryIds ?? [])
    .map((id) => categories.find((c) => c.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  const wantedTypes = event.admittedVehicleTypes.map((t) => vehicleTypeLabels[t]);
  const publicAccess = eventPublicAccessLabels[event.publicAccess];
  const reservable = event.publicAccess === "free_reservation" || event.publicAccess === "paid_orasso";
  const retour = encodeURIComponent(`/e/${event.slug}`);
  const candidateHref = connected
    ? `/e/${event.slug}/candidater`
    : `/connexion?retour=${encodeURIComponent(`/e/${event.slug}/candidater`)}`;
  const place = [event.addressLine, [event.postalCode, event.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const bandText =
    state.kind === "open"
      ? "Inscriptions ouvertes"
      : state.kind === "not_open"
        ? `Ouverture le ${formatDateTime(state.opensAt)}`
        : state.kind === "locked"
          ? "Inscriptions closes"
          : "Annulé";

  return (
    <div className="ev">
      <div className="ev__main">
        <Reveal>
          <section className="ev__hero" aria-labelledby="ev-title">
            {event.posterUrl && <img className="ev__hero-photo" src={event.posterUrl} alt="" />}
            <div className="ev__hero-fade" />
            <div className="ev__band">
              <Chip variant="accent">{bandText}</Chip>
            </div>
            <div className="ev__hero-text">
              <div className="s-label o-t-label">
                {eventFormatLabels[event.format]} · <a href="#organisateur">{event.structure.name}</a>{" "}
                {structure.verified && <span className="s-verified">Structure vérifiée</span>}
              </div>
              <h1 id="ev-title" className="s-title s-title--xl">
                {event.title}
              </h1>
              <div className="o-t-meta">
                {formatWhen(event.startsAt, event.endsAt)}
                {place ? ` · ${place}` : ""}
              </div>
            </div>
          </section>
        </Reveal>

        <div className="ev__status">
          {event.status === "cancelled" ? (
            <StatusBadge status="cancelled" />
          ) : event.outlook === "uncertain" ? (
            <StatusBadge status="uncertain" />
          ) : (
            <span className="o-t-label" data-testid="outlook">
              {eventOutlookLabels.maintained}
            </span>
          )}
          <span className="o-t-meta s-muted">{eventAdmissionLabels[event.admission]}</span>
        </div>

        <section className="s-section s-section--first">
          <h2 className="s-h2">Véhicules recherchés</h2>
          <ChipRow>
            {wanted.map((label) => (
              <Chip key={label} variant="accent">
                {label}
              </Chip>
            ))}
            {wantedTypes.map((label) => (
              <Chip key={label}>{label}</Chip>
            ))}
          </ChipRow>
          {event.criteria?.text && <p className="s-muted">{event.criteria.text}</p>}
          <p className="s-muted">
            {eventAdmissionLabels[event.admission]}.
            {event.admission === "filtered" && " Les décisions sont annoncées au fil des candidatures."}
          </p>
        </section>

        {event.description && (
          <section className="s-section">
            <h2 className="s-h2">Programme et infos</h2>
            <p className="s-muted s-prewrap">{event.description}</p>
          </section>
        )}

        {event.instructions && (
          <section className="s-section">
            <h2 className="s-h2">Consignes</h2>
            <p className="s-muted s-prewrap">{event.instructions}</p>
          </section>
        )}

        <section className="s-section">
          <h2 className="s-h2">Accès et adresse</h2>
          {event.lat != null && event.lng != null && <EventMap lat={event.lat} lng={event.lng} label={place} />}
          <p className="s-muted">{place || "Adresse communiquée par l'organisateur."}</p>
        </section>

        {reviews && (ended || reviews.count > 0) && <ReviewsSection reviews={reviews} />}

        <section className="s-section" id="organisateur">
          <h2 className="s-h2">Organisateur</h2>
          <p>
            <strong>{structure.name}</strong>{" "}
            {structure.verified && <span className="s-verified o-t-label">Vérifié</span>}
          </p>
          {structure.description && <p className="s-muted">{structure.description}</p>}
          <p className="o-t-caption s-muted">{structure.followersCount} abonnés</p>
        </section>
      </div>

      <aside className="ev__aside">
        <div className="s-card">
          <Counters
            className="ev__counts"
            variant="surface"
            size="site"
            items={[
              { value: event.remaining ?? "∞", label: "places" },
              { value: event.acceptedCount, label: "retenus" },
            ]}
          />
          {mine.length > 0 ? (
            <div className="s-stack s-stack--tight">
              {mine.map((a) => {
                const badge = badgeFor({ status: a.status });
                return (
                  <div key={a.id} className="s-row">
                    {badge ? (
                      <StatusBadge status={badge.status} />
                    ) : (
                      <Chip>{a.status === "withdrawn" ? "Désistée" : "Offre expirée"}</Chip>
                    )}
                  </div>
                );
              })}
              <Button variant="primary" icon="qr" href="/app/acces" fullWidth>
                Voir mon accès
              </Button>
            </div>
          ) : state.kind === "open" ? (
            <>
              <Button variant="primary" icon="vehicle" href={candidateHref} fullWidth>
                Candidater avec un véhicule
              </Button>
              {!connected && (
                <p className="o-t-caption s-muted s-center">Crée ton compte ou connecte-toi, tu reviendras ici.</p>
              )}
            </>
          ) : (
            <Button variant="primary" icon="vehicle" disabled fullWidth>
              Candidater avec un véhicule
            </Button>
          )}
          {state.kind === "not_open" && (
            <p className="o-t-caption s-muted">Les inscriptions ouvrent le {formatDateTime(state.opensAt)}.</p>
          )}
          {state.kind === "locked" && (
            <p className="o-t-caption s-muted">Les inscriptions sont closes (verrouillage).</p>
          )}

          {connected ? (
            <Form method="post">
              <input type="hidden" name="structureId" value={structure.id} />
              <Button
                type="submit"
                name="intent"
                value={structure.isFollowing ? "unfollow" : "follow"}
                variant="secondary"
                icon="heart"
                fullWidth
              >
                {structure.isFollowing ? `Tu suis ${structure.name}` : `Suivre ${structure.name}`}
              </Button>
            </Form>
          ) : (
            <Button variant="secondary" icon="heart" href={`/connexion?retour=${retour}`} fullWidth>
              Suivre {structure.name}
            </Button>
          )}
          {reservable && (
            <Button variant="secondary" icon="calendar" disabled fullWidth>
              Réserver
            </Button>
          )}
          <p className="o-t-caption s-muted">
            Visiteurs : {publicAccess.toLowerCase()}
            {reservable ? " (réservation bientôt disponible)" : ""}.
          </p>
        </div>

        <div className="s-card">
          <div className="s-label o-t-label">Partager</div>
          <ShareButtons url={`${origin}/e/${event.slug}`} title={event.title} />
        </div>

        {mine.length > 0 && (
          <div className="ev__download">
            <Icon name="qr" size={28} />
            <span className="o-t-caption">
              L'appli Orasso arrive : ton QR d'accès, le mode jour J et les notifications y seront.
            </span>
          </div>
        )}
      </aside>
    </div>
  );
}
