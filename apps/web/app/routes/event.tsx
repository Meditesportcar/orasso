import {
  Button,
  Chip,
  ChipRow,
  Counters,
  Icon,
  Outlined,
  Reveal,
  SelectField,
  StatusBadge,
} from "@orasso/design-system/web";
import {
  type AnnouncementView,
  type AudiencePrizeBoard,
  applicationStatusLabels,
  arrivalLabel,
  arrivalTexts,
  type Category,
  crewLabels,
  type EventProviderPublic,
  type EventPublic,
  type EventReviews,
  type EventWeather,
  eventAdmissionLabels,
  eventFormatLabels,
  eventOutlookLabels,
  instagramHandle,
  invitationLabels,
  siteLabels as L,
  type MediaContentView,
  type MyCrew,
  type MyTicket,
  mediaContentKindLabels,
  mediaPlatformLabels,
  previewSummary,
  publicAccessText,
  registrationBlock,
  registrationBlockText,
  registrationFullText,
  type StructurePublic,
  type TicketOffer,
  vehicleTypeLabels,
  weatherTexts,
  wizardEndLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";
import { dayLabel, EventDays } from "../components/EventDays";
import { EventFeed } from "../components/EventFeed";
import { EventMap } from "../components/EventMap";
import { PosterFace } from "../components/EventTile";
import { ContactOrganizer } from "../components/Messaging";
import { PhotoGallery } from "../components/PhotoGallery";
import { ReportDialog } from "../components/ReportDialog";
import { ShareButtons } from "../components/ShareButtons";
import { Stars } from "../components/Stars";
import { Weather } from "../components/Weather";
import { api, apiOrThrow, getMe, loginUrl, originOf } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { formatDateTime, formatDateTimeYear, formatPrice, formatWhen } from "../lib/format";
import { messageAction } from "../lib/messaging.server";
import { badgeFor, registrationState } from "../lib/status";
import "../styles/invitations.css";
import "../styles/providers.css";
import type { Route } from "./+types/event";

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug;
  const found = await api<EventPublic>(request, `/events/by-slug/${encodeURIComponent(slug)}`);
  // Événement privé sur invitation (lot 25) : rien de l'événement pour qui n'est pas invité, écran dédié.
  if (!found.ok && found.error.code === "invite_only") {
    return data({ privateEvent: true as const, connected: Boolean(await getMe(request)) }, { status: 403 });
  }
  const event = found.ok
    ? found.data
    : await apiOrThrow<EventPublic>(request, `/events/by-slug/${encodeURIComponent(slug)}`);
  const [structure, categories, me, reviews, tickets, providers, weather, feed, media] = await Promise.all([
    apiOrThrow<StructurePublic>(request, `/structures/by-slug/${encodeURIComponent(event.structure.slug)}`),
    api<Category[]>(request, "/vehicle-reference/categories"),
    getMe(request),
    api<EventReviews>(request, `/events/by-slug/${encodeURIComponent(slug)}/reviews`),
    api<{ offer: TicketOffer | null; mine: MyTicket[] }>(
      request,
      `/events/by-slug/${encodeURIComponent(slug)}/tickets`,
    ),
    api<EventProviderPublic[]>(request, `/events/by-slug/${encodeURIComponent(slug)}/providers`),
    // Météo à l'approche (lot 28) : cache de l'API, `null` au-delà de 7 jours ; jamais bloquante.
    api<EventWeather | null>(request, `/events/by-slug/${encodeURIComponent(slug)}/weather`),
    // Fil de l'événement (lot 20) : public, enrichi pour les retenus et l'organisation.
    api<{ items: AnnouncementView[] }>(request, `/events/by-slug/${encodeURIComponent(slug)}/announcements`),
    // Contenus des médias accrédités (lot 45) : liens et galeries publiés sur l'événement.
    api<MediaContentView[]>(request, `/events/by-slug/${encodeURIComponent(slug)}/media-contents`),
  ]);
  // Inscription en crew (lot 19) : proposée au chef d'un crew, sauf événement sur invitation seulement.
  const crews = me && event.admission !== "invite_only" ? await api<MyCrew[]>(request, "/me/crews") : null;
  // Prix du public (lot 49) : le gagnant, une fois l'événement réglé (connecté seulement : le classement exige un compte).
  const ended = new Date(event.endsAt).getTime() <= nowMs();
  const board = me && ended ? await api<AudiencePrizeBoard>(request, `/events/${event.id}/audience-prize`) : null;
  return {
    event,
    structure,
    leadsCrew: Boolean(crews?.ok && crews.data.some((c) => c.role === "leader")),
    reviews: reviews.ok ? reviews.data : null,
    providers: providers.ok ? providers.data : [],
    weather: weather.ok ? weather.data : null,
    feed: feed.ok ? feed.data.items : [],
    media: media.ok ? media.data : [],
    prize: board?.ok && board.data.settled ? board.data.winner : null,
    offer: tickets.ok ? tickets.data.offer : null,
    myTickets: tickets.ok ? tickets.data.mine : [],
    paymentCancelled: new URL(request.url).searchParams.get("paiement") === "annule",
    ended: new Date(event.endsAt).getTime() <= nowMs(),
    categories: categories.ok ? categories.data : [],
    connected: Boolean(me),
    origin: originOf(request),
    state: registrationState(event, nowMs()),
    block: registrationBlock(event, nowMs()),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Événement introuvable · Orasso" }];
  if ("privateEvent" in loaderData) {
    return [{ title: `${invitationLabels.privateEvent} · Orasso` }, { name: "robots", content: "noindex, nofollow" }];
  }
  const { event, origin } = loaderData;
  const where = [event.city, event.department].filter(Boolean).join(" ");
  const description = `${eventFormatLabels[event.format]} · ${formatWhen(event.startsAt, event.endsAt)}${where ? ` · ${where}` : ""} · ${event.structure.name}`;
  const image = event.posterUrl ? new URL(event.posterUrl, origin).toString() : `${origin}/og-image.png`;
  const title = `${event.title} · Orasso`;
  // Événement privé : jamais référencé, même pour un invité qui partage la page.
  const robots = event.admission === "invite_only" ? [{ name: "robots", content: "noindex, nofollow" }] : [];
  return [
    { title },
    ...robots,
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/e/${event.slug}` },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "Event",
        name: event.title,
        description,
        startDate: event.startsAt,
        endDate: event.endsAt,
        eventStatus:
          event.status === "cancelled"
            ? "https://schema.org/EventCancelled"
            : event.outlook === "uncertain"
              ? "https://schema.org/EventPostponed"
              : "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: event.city ?? undefined,
          address: [event.addressLine, event.postalCode, event.city].filter(Boolean).join(", ") || undefined,
        },
        image: [image],
        organizer: { "@type": "Organization", name: event.structure.name, url: `${origin}/o/${event.structure.slug}` },
      },
    },
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
  // Contacter l'organisateur (lot 18).
  if (intent === "contact_organizer") return messageAction(request, form);
  // Billets : réservation gratuite (billet et QR tout de suite) ou paiement de démonstration (Stripe en mode test).
  if (intent === "reserve" || intent === "checkout") {
    const eventId = String(form.get("eventId") ?? "");
    const quantity = Number(form.get("quantity") ?? 1);
    const res = await api<{ url?: string }>(request, `/events/${encodeURIComponent(eventId)}/tickets/${intent}`, {
      method: "POST",
      json: { quantity },
    });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    if (intent === "checkout" && res.data.url) return redirect(res.data.url);
    return redirect("/app/billets?reserve=ok");
  }
  return redirect(`/e/${params.slug}`);
}

/** Billets des visiteurs : réservation gratuite ou paiement de démonstration, interrupteurs et places restantes. */
function VisitorTickets({
  event,
  offer,
  tickets,
  connected,
  cancelled,
  error,
}: {
  event: EventPublic;
  offer: TicketOffer;
  tickets: MyTicket[];
  connected: boolean;
  cancelled: boolean;
  error?: string;
}) {
  const busy = useNavigation().state !== "idle";
  const paid = offer.kind === "paid";
  const max = Math.max(1, Math.min(offer.maxPerOrder, offer.remaining ?? offer.maxPerOrder));
  const retour = encodeURIComponent(`/e/${event.slug}`);
  return (
    <div className="s-card s-stack s-stack--tight" data-testid="tickets-card">
      <div className="s-label o-t-label">Visiteurs · billets</div>
      <p className="s-row s-row--between">
        <strong>{offer.name}</strong>
        <span className="o-t-number" data-testid="ticket-price">
          {paid && offer.priceCents != null ? formatPrice(offer.priceCents) : "Gratuit"}
        </span>
      </p>
      {offer.remaining !== null && (
        <p className="o-t-caption s-muted">
          {offer.remaining} place{offer.remaining > 1 ? "s" : ""} restante{offer.remaining > 1 ? "s" : ""}
        </p>
      )}
      {tickets.length > 0 && (
        <p className="o-t-caption" data-testid="my-tickets-note">
          Tu as {tickets.length} billet{tickets.length > 1 ? "s" : ""} pour cet événement.
        </p>
      )}
      {cancelled && <p className="s-notice">Paiement annulé : aucun billet n'a été émis.</p>}
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
      {offer.block ? (
        <>
          <Button variant="secondary" icon="calendar" disabled fullWidth data-testid="ticket-blocked">
            {paid ? "Acheter un billet" : "Réserver"}
          </Button>
          <p className="o-t-caption s-muted" data-testid="ticket-block">
            {offer.blockLabel}
            {offer.block === "payments_soon" ? " : les paiements ne sont pas encore ouverts." : "."}
          </p>
        </>
      ) : !connected ? (
        <Button variant="secondary" icon="calendar" href={`/connexion?retour=${retour}`} fullWidth>
          {paid ? "Acheter un billet" : "Réserver"}
        </Button>
      ) : (
        <Form method="post" className="s-stack s-stack--tight" data-testid="ticket-form">
          <input type="hidden" name="eventId" value={event.id} />
          <SelectField
            label="Nombre de billets"
            name="quantity"
            defaultValue="1"
            options={Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          />
          <Button
            type="submit"
            name="intent"
            value={paid ? "checkout" : "reserve"}
            variant="secondary"
            icon="calendar"
            loading={busy}
            fullWidth
          >
            {paid ? "Payer avec une carte de test" : "Réserver gratuitement"}
          </Button>
        </Form>
      )}
      {paid && !offer.block && (
        <p className="o-t-caption s-muted">
          Paiement de démonstration (mode test Stripe) : aucun vrai débit. Carte de test 4242 4242 4242 4242.
        </p>
      )}
      {tickets.length > 0 && (
        <Button variant="secondary" icon="qr" href="/app/billets" fullWidth>
          Voir mes billets
        </Button>
      )}
    </div>
  );
}

/** Avis des participants pointés : moyenne à partir du minimum d'avis, réponse publique de l'organisateur. */
function ReviewsSection({ reviews, connected }: { reviews: EventReviews; connected: boolean }) {
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
                  <span className="s-label o-t-label">Réponse de l'équipe organisatrice</span> {r.reply.text}
                </p>
              )}
              <span className="o-t-caption s-muted">{formatDateTime(r.createdAt)}</span>
              {connected && <ReportDialog look="link" targetType="review" targetId={r.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type EventData = Exclude<Route.ComponentProps["loaderData"], { privateEvent: true }>;

/** Événement privé sur invitation (lot 25) : écran sans rien de l'événement pour qui n'est pas invité. */
function PrivateEvent({ connected }: { connected: boolean }) {
  return (
    <div className="ev-private" data-testid="private-event">
      <div className="s-card s-stack">
        <span className="s-row">
          <Icon name="eyeOff" size={24} />
          <span className="s-label o-t-label">{invitationLabels.privateBadge}</span>
        </span>
        <h1 className="s-title s-title--xl">{invitationLabels.privateEvent}</h1>
        <p className="s-muted">{invitationLabels.privateEventHint}</p>
        {connected ? (
          <Button variant="primary" icon="entry" href="/app/sorties">
            {invitationLabels.openAccess}
          </Button>
        ) : (
          <Button variant="primary" icon="profile" href="/connexion?retour=%2Fapp%2Fsorties">
            {invitationLabels.linkSignIn}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function EventRoute({ loaderData, actionData }: Route.ComponentProps) {
  if ("privateEvent" in loaderData) return <PrivateEvent connected={loaderData.connected} />;
  return <EventPage loaderData={loaderData} actionData={actionData} />;
}

function EventPage({
  loaderData,
  actionData,
}: {
  loaderData: EventData;
  actionData: Route.ComponentProps["actionData"];
}) {
  const {
    event,
    structure,
    categories,
    connected,
    origin,
    state,
    block,
    reviews,
    weather,
    feed,
    ended,
    offer,
    myTickets,
    paymentCancelled,
    providers,
    media,
    prize,
    leadsCrew,
  } = loaderData;
  const mine = event.myApplications ?? [];
  const wanted = (event.criteria?.categoryIds ?? [])
    .map((id) => categories.find((c) => c.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  const wantedTypes = event.admittedVehicleTypes.map((t) => vehicleTypeLabels[t]);
  const publicAccess = publicAccessText(event.publicAccess, event.externalTicketUrl);
  const retour = encodeURIComponent(`/e/${event.slug}`);
  const providerPath = `/app/prestataire?evenement=${event.slug}`;
  const providerHref = connected ? providerPath : `/connexion?retour=${encodeURIComponent(providerPath)}`;
  const candidateHref = connected
    ? `/e/${event.slug}/candidater`
    : `/connexion?retour=${encodeURIComponent(`/e/${event.slug}/candidater`)}`;
  const place = [event.addressLine, [event.postalCode, event.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const bandText =
    ended && state.kind !== "cancelled"
      ? "Événement terminé"
      : state.kind === "open"
        ? "Inscriptions ouvertes"
        : state.kind === "not_open"
          ? `Ouverture le ${formatDateTimeYear(state.opensAt, nowMs())}`
          : state.kind === "locked"
            ? "Inscriptions closes"
            : state.kind === "draft"
              ? "Brouillon"
              : "Annulé";

  return (
    <div className="ev">
      <div className="ev__main s-plated">
        {event.status === "draft" && (
          <p className="s-notice s-notice--alert" role="status" data-testid="draft-preview">
            {wizardEndLabels.previewBanner}
          </p>
        )}
        <Reveal>
          {/* DA v2 (lot 56) : l'affiche générée en vedette, le titre en contour sur le fond ; sans affiche générée,
              le gabarit « Minimal » (jamais l'affiche perso, qui vit plus bas dans le détail). */}
          <section className="ev__feature" aria-labelledby="ev-title" data-testid="event-hero">
            <div className="ev__feature-text">
              <Chip variant="accent">{bandText}</Chip>
              <div className="s-label o-t-label">
                {eventFormatLabels[event.format]} · <a href="#organisateur">{event.structure.name}</a>{" "}
                {structure.verified && <span className="s-verified">Structure vérifiée</span>}
              </div>
              <Outlined on="ground" as="h1" id="ev-title" className="o-t-poster-xl ev__feature-title">
                {event.title}
              </Outlined>
              <div className="o-t-meta">
                {formatWhen(event.startsAt, event.endsAt)}
                {place ? ` · ${place}` : ""}
              </div>
            </div>
            <div className="ev__poster-frame" data-testid="event-poster">
              <PosterFace event={{ ...event, generatedPosterUrl: event.poster?.postUrl ?? null }} />
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
          {previewSummary(event) && (
            <span className="o-t-meta s-muted" data-testid="preview-summary">
              {previewSummary(event)}
            </span>
          )}
        </div>

        {/* Lot 26 : jours d'un événement sur plusieurs jours (date, horaires, places restantes, mode d'accès). */}
        <EventDays
          days={event.days}
          dayAccess={event.dayAccess}
          candidateHref={
            connected && state.kind === "open" && event.admission !== "invite_only" ? candidateHref : undefined
          }
        />

        {/* Créneaux d'arrivée (lot 47) : deux plaques, exposants et public. */}
        {(event.arrivals.exhibitors || event.arrivals.public) && (
          <section className="s-section s-section--first" data-testid="arrivals" aria-labelledby="arrivals-title">
            <h2 className="s-h2" id="arrivals-title">
              {L.event.arrivals}
            </h2>
            <div className="ev__arrivals">
              {(
                [
                  [L.event.arrivalsExhibitors, event.arrivals.exhibitors],
                  [L.event.arrivalsPublic, event.arrivals.public],
                ] as const
              ).map(([label, slot]) =>
                slot ? (
                  <div key={label} className="ev__plaque" data-testid="arrival-plaque">
                    <span className="o-t-label">{label}</span>
                    <strong className="o-t-number-narrow">
                      {arrivalLabel(slot)
                        .replace(/^Arrivée /, "")
                        .replace(/ \(.*\)$/, "")}
                    </strong>
                    <p className="o-t-caption">{slot.strict ? arrivalTexts.strict : arrivalTexts.advised}</p>
                    {slot.note && <p className="o-t-caption">{slot.note}</p>}
                  </div>
                ) : null,
              )}
            </div>
          </section>
        )}

        <section
          className={`s-section${event.arrivals.exhibitors || event.arrivals.public ? "" : " s-section--first"}`}
        >
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

        {event.vendorTypes.length > 0 && (
          <section className="s-section" data-testid="vendors">
            <h2 className="s-h2">Prestataires attendus</h2>
            <ChipRow>
              {event.vendorTypes.map((label) => (
                <Chip key={label}>{label}</Chip>
              ))}
            </ChipRow>
            {!ended && event.status === "published" && !event.isLocked && (
              <p>
                <Button variant="secondary" icon="profile" href={providerHref}>
                  Candidater comme prestataire
                </Button>
              </p>
            )}
          </section>
        )}

        {providers.length > 0 && (
          <section className="s-section" data-testid="providers-present">
            <h2 className="s-h2">Prestataires présents</h2>
            <ul className="prov__present">
              {providers.map((p) => (
                <li key={p.id} className="prov__present-item" data-testid="provider-present">
                  <span className="prov__present-thumb">
                    {p.photoUrl ? <img src={p.photoUrl} alt="" /> : <Icon name="profile" size={20} />}
                  </span>
                  <span className="prov__present-text">
                    <strong className="o-never-truncate">{p.name}</strong>
                    <span className="o-t-caption s-muted">{p.typeLabel}</span>
                    {p.instagram && (
                      <a className="o-t-caption" href={p.instagram} target="_blank" rel="noopener noreferrer">
                        {instagramHandle(p.instagram) ?? "Instagram"}
                      </a>
                    )}
                  </span>
                  {p.accreditedMedia && <Chip variant="accent">Média officiel</Chip>}
                  {connected && <ReportDialog look="link" targetType="provider" targetId={p.id} />}
                </li>
              ))}
            </ul>
          </section>
        )}

        {event.description && (
          <section className="s-section">
            <h2 className="s-h2">Programme et infos</h2>
            <p className="s-muted s-prewrap">{event.description}</p>
          </section>
        )}

        {media.length > 0 && (
          <section className="s-section" data-testid="media-contents" aria-labelledby="media-title">
            <h2 className="s-h2" id="media-title">
              Contenus des médias
            </h2>
            <ul className="prov__present">
              {media.map((c) => (
                <li key={c.id} className="prov__present-item" data-testid="media-content">
                  <span className="prov__present-text">
                    <strong className="o-never-truncate">{c.title}</strong>
                    <span className="o-t-caption s-muted">
                      {c.media.name} · {mediaContentKindLabels[c.kind]} · {mediaPlatformLabels[c.platform]}
                    </span>
                    {c.url && (
                      <a className="o-t-caption" href={c.url} target="_blank" rel="noopener noreferrer">
                        Voir le contenu
                      </a>
                    )}
                    {c.photos.length > 0 && <PhotoGallery contentId={c.id} title={c.title} photos={c.photos} />}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {prize && (
          <section className="s-section" data-testid="audience-prize" aria-labelledby="prize-title">
            <h2 className="s-h2" id="prize-title">
              Prix du public
            </h2>
            <p>
              <strong>{prize.vehicleLabel}</strong> · {prize.pseudo} · {prize.votes} voix
            </p>
          </section>
        )}

        {/* L'affiche de l'organisateur (lot 47) vit ici, dans le détail : la vedette est l'affiche générée. */}
        {event.customPosterUrl && (
          <section className="s-section" data-testid="custom-poster">
            <h2 className="s-h2">{L.event.organizerPoster}</h2>
            <img className="ev__custom-poster" src={event.customPosterUrl} alt="" loading="lazy" />
          </section>
        )}

        {event.rulesText && (
          <section className="s-section" data-testid="event-rules">
            <h2 className="s-h2">{L.event.rules}</h2>
            <p className="s-muted s-prewrap">{event.rulesText}</p>
          </section>
        )}

        <EventFeed items={feed} connected={connected} />

        {event.instructions && (
          <section className="s-section">
            <h2 className="s-h2">Consignes</h2>
            <p className="s-muted s-prewrap">{event.instructions}</p>
          </section>
        )}

        {weather && !ended && (
          <section className="s-section" id="meteo" aria-label={weatherTexts.upcomingTitle} data-testid="event-weather">
            <Weather weather={weather} />
          </section>
        )}

        <section className="s-section">
          <h2 className="s-h2">Accès et adresse</h2>
          {event.lat != null && event.lng != null && (
            <EventMap lat={event.lat} lng={event.lng} label={place} startsAt={event.startsAt} />
          )}
          <p className="s-muted">{place || "Adresse communiquée par l'équipe organisatrice."}</p>
        </section>

        {reviews && (ended || reviews.count > 0) && <ReviewsSection reviews={reviews} connected={connected} />}

        <section className="s-section" id="organisateur">
          <h2 className="s-h2">Organisateur</h2>
          <p>
            <a href={`/o/${structure.slug}`}>
              <strong>{structure.name}</strong>
            </a>{" "}
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
                    {badge ? <StatusBadge status={badge.status} /> : <Chip>{applicationStatusLabels[a.status]}</Chip>}
                    {event.days.length > 1 && (
                      <span className="o-t-caption s-muted">
                        {dayLabel(event.days.find((d) => d.id === a.eventDayId)?.date)}
                      </span>
                    )}
                  </div>
                );
              })}
              <Button variant="primary" icon="qr" href="/app/sorties" fullWidth>
                Voir mon accès
              </Button>
              {/* Lot 26 : candidater aussi pour un autre jour (accès par jour ou au choix). */}
              {event.days.length > 1 &&
                event.dayAccess !== "whole" &&
                state.kind === "open" &&
                event.admission !== "invite_only" &&
                !mine.some(
                  (a) => a.eventDayId === null && ["pending", "accepted", "waitlisted", "offered"].includes(a.status),
                ) && (
                  <Button
                    variant="secondary"
                    icon="calendar"
                    href={candidateHref}
                    fullWidth
                    data-testid="apply-other-day"
                  >
                    Candidater pour un autre jour
                  </Button>
                )}
              {leadsCrew && state.kind === "open" && (
                <Button
                  variant="secondary"
                  icon="crew"
                  href={`/e/${event.slug}/crew`}
                  fullWidth
                  data-testid="register-crew"
                >
                  {crewLabels.myRegistrations}
                </Button>
              )}
            </div>
          ) : event.admission === "invite_only" ? (
            <div className="s-stack s-stack--tight" data-testid="invite-only">
              <p className="o-t-caption s-muted">{invitationLabels.invitationRequired}</p>
              <Button variant="primary" icon="entry" href="/app/sorties" fullWidth>
                {invitationLabels.openAccess}
              </Button>
            </div>
          ) : state.kind === "open" ? (
            <>
              <Button variant="primary" icon="vehicle" href={candidateHref} fullWidth>
                Candidater avec un véhicule
              </Button>
              {leadsCrew && (
                <Button
                  variant="secondary"
                  icon="crew"
                  href={`/e/${event.slug}/crew`}
                  fullWidth
                  data-testid="register-crew"
                >
                  {crewLabels.registerCrew}
                </Button>
              )}
              {!connected && (
                <p className="o-t-caption s-muted s-center">Crée ton compte ou connecte-toi, tu reviendras ici.</p>
              )}
            </>
          ) : ended ? (
            <p className="o-t-caption s-muted">
              Événement terminé. Les participants pointés à l'entrée peuvent laisser leur avis pendant une semaine.
            </p>
          ) : (
            <Button variant="primary" icon="vehicle" disabled fullWidth>
              Candidater avec un véhicule
            </Button>
          )}
          {/* Lot 36 : la raison du blocage, la même que dans l'appli (H-2, avant-première, ouverture…). */}
          {block && (block.code === "locked" || block.code === "preview" || block.code === "not_open") && (
            <p className="o-t-caption s-muted" data-testid="registration-reason">
              {registrationBlockText(block, (iso) => formatDateTimeYear(iso, nowMs()))}
            </p>
          )}
          {!block && event.admission === "open" && event.remaining !== null && event.remaining <= 0 && (
            <p className="o-t-caption s-muted">{registrationFullText}</p>
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
          {structure.verified && (
            <ContactOrganizer structureId={structure.id} connected={connected} retour={`/e/${event.slug}`} />
          )}
          <p className="o-t-caption s-muted">Visiteurs : {publicAccess.toLowerCase()}.</p>
        </div>

        {offer && (
          <VisitorTickets
            event={event}
            offer={offer}
            tickets={myTickets}
            connected={connected}
            cancelled={paymentCancelled}
            error={(actionData as { error?: string } | undefined)?.error}
          />
        )}
        {!offer && event.publicAccess === "paid_external" && !event.externalTicketUrl && (
          <div className="s-card" data-testid="on-site-payment">
            <p className="s-row">
              <Icon name="entry" size={20} />
              <strong>{publicAccess}</strong>
            </p>
            <p className="o-t-caption s-muted">Pas de billetterie en ligne : l'entrée se règle à l'arrivée.</p>
          </div>
        )}
        {!offer && event.publicAccess === "paid_external" && event.externalTicketUrl && (
          <div className="s-card">
            <Button
              variant="secondary"
              icon="calendar"
              href={event.externalTicketUrl}
              target="_blank"
              rel="noopener"
              fullWidth
            >
              Billetterie en ligne
            </Button>
          </div>
        )}

        {event.admission !== "invite_only" && (
          <div className="s-card">
            <div className="s-label o-t-label">Partager</div>
            <ShareButtons url={`${origin}/e/${event.slug}`} title={event.title} />
          </div>
        )}
        {/* Signaler (lot 32) : aussi sur un événement privé, que l'on ne partage pas. */}
        {connected && <ReportDialog look="link" targetType="event" targetId={event.id} />}

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
