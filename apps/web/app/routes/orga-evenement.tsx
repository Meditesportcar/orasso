// Page d'un événement côté organisateur : statut (brouillon, publié, annulé), Maintenu / Incertain, publication,
// duplication en un clic, récurrence créée une seule fois (docs/01 « Organisateurs : créer un événement »).
import {
  Button,
  CheckboxField,
  Chip,
  ChipRow,
  Counters,
  Plate,
  SelectField,
  StatusBadge,
  TextField,
} from "@orasso/design-system/web";
import {
  describeRecurrence,
  type EventOrganizer,
  type EventTicketing,
  type EventWeather,
  eventFormatLabels,
  eventOutlookLabels,
  eventPublicAccessLabels,
  eventStatusLabels,
  isBadWeather,
  RECURRENCE_MAX_COUNT,
  type RecurrenceRule,
  recurrenceOccurrences,
  wallTime,
  weatherTexts,
  weekdayNames,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation, useSearchParams } from "react-router";

import { Weather } from "../components/Weather";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatDay, formatPrice, formatWhen } from "../lib/format";
import type { Route } from "./+types/orga-evenement";

export function meta() {
  return [{ title: "Événement · Orasso" }, { name: "robots", content: "noindex" }];
}

async function organizerOf(request: Request, slug: string) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === slug && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé aux organisateurs de la structure.", { status: 403 });
  }
  return membership;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const membership = await organizerOf(request, params.structure);
  const event = await apiOrThrow<EventOrganizer>(request, `/events/${params.eventId}`);
  if (event.structure.id !== membership.structureId) throw new Response("Événement introuvable.", { status: 404 });
  const structure = await apiOrThrow<{ verified: boolean }>(request, `/structures/by-slug/${params.structure}`);
  const url = new URL(request.url);
  const ticketing = await api<EventTicketing>(request, `/events/${params.eventId}/ticketing`);
  // Météo annoncée (lot 28) : cache de l'API, `null` au-delà de 7 jours ; jamais bloquante.
  const weather =
    event.status === "published"
      ? await api<EventWeather | null>(request, `/events/by-slug/${encodeURIComponent(event.slug)}/weather`)
      : null;
  return {
    event,
    weather: weather?.ok ? weather.data : null,
    ticketing: ticketing.ok ? ticketing.data : null,
    verified: structure.verified,
    created: url.searchParams.get("creee") === "1",
  };
}

type Result = { error?: string; ok?: string; series?: { title: string; startsAt: string }[] };

export async function action({ request, params }: Route.ActionArgs) {
  await organizerOf(request, params.structure);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "");
  const id = params.eventId;
  const back = `/orga/${params.structure}/e/${id}`;
  const fail = (res: { status: number; error: { message: string } }) =>
    data({ error: res.error.message } satisfies Result, { status: res.status });

  switch (text("intent")) {
    case "publish": {
      const res = await api(request, `/events/${id}/publish`, { method: "POST" });
      return res.ok ? redirect(`${back}?publie=1`) : fail(res);
    }
    case "cancel": {
      const res = await api(request, `/events/${id}/cancel`, { method: "POST" });
      return res.ok ? redirect(back) : fail(res);
    }
    case "outlook": {
      const res = await api(request, `/events/${id}/outlook`, { method: "PATCH", json: { outlook: text("outlook") } });
      return res.ok ? redirect(back) : fail(res);
    }
    case "duplicate": {
      const res = await api<EventOrganizer>(request, `/events/${id}/duplicate`, { method: "POST" });
      return res.ok ? redirect(`/orga/${params.structure}/e/${res.data.id}/modifier`) : fail(res);
    }
    case "ticketing": {
      const capacity = text("capacity").trim();
      const price = text("price").trim().replace(",", ".");
      const priceCents = price ? Math.round(Number(price) * 100) : null;
      if (priceCents !== null && !Number.isFinite(priceCents)) {
        return data({ error: "Prix du billet : un montant en euros (ex. 12,50)." } satisfies Result, { status: 400 });
      }
      const res = await api(request, `/events/${id}/ticketing`, {
        method: "PUT",
        json: {
          enabled: form.get("enabled") === "on",
          capacity: capacity ? Number(capacity) : null,
          priceCents,
          name: text("name").trim() || "Entrée",
        },
      });
      return res.ok ? redirect(`${back}?billets=1`) : fail(res);
    }
    case "recurrence": {
      const rule: RecurrenceRule =
        text("kind") === "monthly_nth_weekday"
          ? {
              kind: "monthly_nth_weekday",
              nth: Number(text("nth")),
              weekday: Number(text("weekday")),
              count: Number(text("count")),
            }
          : { kind: "weekly", interval: Number(text("interval")) || 1, count: Number(text("count")) };
      const res = await api<{ title: string; startsAt: string }[]>(request, `/events/${id}/recurrence`, {
        method: "POST",
        json: { rule },
      });
      return res.ok ? redirect(`${back}?serie=${res.data.length}`) : fail(res);
    }
  }
  return data({ error: "Action inconnue." } satisfies Result, { status: 400 });
}

const NTH = [
  [1, "premier"],
  [2, "deuxième"],
  [3, "troisième"],
  [4, "quatrième"],
  [-1, "dernier"],
] as const;

function Recurrence({ event }: { event: EventOrganizer }) {
  const origin = wallTime(new Date(event.startsAt));
  const originWeekday = new Date(Date.UTC(origin.year, origin.month - 1, origin.day)).getUTCDay();
  const [kind, setKind] = useState<"weekly" | "monthly_nth_weekday">("monthly_nth_weekday");
  const [interval, setInterval] = useState("1");
  const [nth, setNth] = useState("1");
  const [weekday, setWeekday] = useState(String(originWeekday));
  const [count, setCount] = useState("5");
  const busy = useNavigation().state !== "idle";
  const rule: RecurrenceRule =
    kind === "weekly"
      ? { kind, interval: Number(interval), count: Number(count) }
      : { kind, nth: Number(nth), weekday: Number(weekday), count: Number(count) };
  const dates = recurrenceOccurrences(new Date(event.startsAt), new Date(event.endsAt), rule);
  return (
    <Form method="post" className="s-stack" data-testid="recurrence-form">
      <input type="hidden" name="intent" value="recurrence" />
      <SelectField
        label="Répétition"
        name="kind"
        value={kind}
        onChange={(e) => setKind(e.currentTarget.value as typeof kind)}
        options={[
          { value: "monthly_nth_weekday", label: "Chaque mois, le même jour de la semaine" },
          { value: "weekly", label: "Toutes les N semaines" },
        ]}
      />
      {kind === "weekly" ? (
        <SelectField
          label="Toutes les"
          name="interval"
          value={interval}
          onChange={(e) => setInterval(e.currentTarget.value)}
          options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 1 ? "semaine" : `${n} semaines` }))}
        />
      ) : (
        <div className="s-two">
          <SelectField
            label="Chaque"
            name="nth"
            value={nth}
            onChange={(e) => setNth(e.currentTarget.value)}
            options={NTH.map(([v, label]) => ({ value: String(v), label }))}
          />
          <SelectField
            label="Jour"
            name="weekday"
            value={weekday}
            onChange={(e) => setWeekday(e.currentTarget.value)}
            options={weekdayNames.map((label, i) => ({ value: String(i), label }))}
          />
        </div>
      )}
      <SelectField
        label="Nombre d'occurrences à créer"
        name="count"
        value={count}
        onChange={(e) => setCount(e.currentTarget.value)}
        options={Array.from({ length: RECURRENCE_MAX_COUNT }, (_, i) => ({
          value: String(i + 1),
          label: String(i + 1),
        }))}
        help="Créées en brouillon, une seule fois. Chacune se modifie ensuite séparément."
      />
      <p className="o-t-caption s-muted" data-testid="recurrence-preview">
        {describeRecurrence(rule)} :{" "}
        {dates.map((o) => formatDay(o.startsAt.toISOString())).join(" · ") || "aucune date"}.
      </p>
      <div>
        <Button type="submit" variant="secondary" icon="calendar" loading={busy} disabled={dates.length === 0}>
          Créer la série
        </Button>
      </div>
    </Form>
  );
}

/** Billetterie des visiteurs : deuxième interrupteur (après le réglage général), places, prix, compte Stripe. */
function Ticketing({ event, ticketing, base }: { event: EventOrganizer; ticketing: EventTicketing; base: string }) {
  const busy = useNavigation().state !== "idle";
  const paid = event.publicAccess === "paid_orasso";
  const ticketed = paid || event.publicAccess === "free_reservation";
  if (!ticketed) {
    return (
      <Plate as="section" className="s-stack s-stack--tight" data-testid="ticketing">
        <h2 className="s-h2">Billetterie des visiteurs</h2>
        <p className="s-muted">
          L'accès du public est « {eventPublicAccessLabels[event.publicAccess]} ». Pour ouvrir la billetterie Orasso,
          choisis « Gratuite sur réservation » ou « Payante · billetterie Orasso » dans <em>Modifier</em>, rubrique
          Public.
        </p>
      </Plate>
    );
  }
  return (
    <section className="orga__panel s-stack" aria-labelledby="billets-title" data-testid="ticketing">
      <div className="s-row s-row--between">
        <h2 id="billets-title" className="s-h2">
          Billetterie des visiteurs
        </h2>
        <Chip variant={ticketing.block === null ? "accent" : undefined} data-testid="ticketing-state">
          {ticketing.block === null ? "Ouverte" : (ticketing.blockLabel ?? "Fermée")}
        </Chip>
      </div>
      <p className="s-muted">
        {paid
          ? "Billets payants en mode présentation : le paiement se fait avec Stripe en mode test, aucun encaissement réel avant le 21 juin 2027."
          : "Billets gratuits sur réservation : chaque visiteur reçoit un billet avec son QR, contrôlé à l'entrée par le staff d'accueil."}
      </p>
      {!paid && !ticketing.generalSwitch && (
        <p className="s-notice s-notice--alert" data-testid="general-off">
          La réservation de billets gratuits est momentanément suspendue par l'administration d'Orasso.
        </p>
      )}
      {paid && !ticketing.stripe.configured && (
        <p className="s-notice" data-testid="stripe-soon">
          La billetterie payante est « bientôt disponible » : les clés Stripe de la plateforme ne sont pas encore
          renseignées.
        </p>
      )}
      {paid && ticketing.stripe.configured && !ticketing.stripe.connected && (
        <p className="s-notice" data-testid="stripe-not-connected">
          Connecte ton compte Stripe pour recevoir les paiements : <a href={`${base}/structure#stripe`}>Structure</a>.
        </p>
      )}
      <Counters
        variant="surface"
        size="site"
        items={[
          { value: ticketing.sold, label: "billets" },
          { value: ticketing.used, label: "entrés" },
        ]}
      />
      <Form method="post" className="s-form" data-testid="ticketing-form">
        <input type="hidden" name="intent" value="ticketing" />
        <CheckboxField
          name="enabled"
          label="Ouvrir la billetterie pour cet événement"
          defaultChecked={ticketing.enabled}
        />
        <div className="s-two">
          <TextField label="Nom du billet" name="name" defaultValue={ticketing.name} />
          <TextField
            label="Places pour les visiteurs"
            name="capacity"
            type="number"
            min={1}
            inputMode="numeric"
            defaultValue={ticketing.capacity ?? ""}
            help="Vide = sans limite."
          />
        </div>
        {paid && (
          <TextField
            label="Prix du billet (€)"
            name="price"
            inputMode="decimal"
            defaultValue={ticketing.priceCents ? (ticketing.priceCents / 100).toString().replace(".", ",") : ""}
            help={`De 1 à 500 €. Commission de la plateforme prélevée sur chaque billet payé.${ticketing.priceCents ? ` Actuellement ${formatPrice(ticketing.priceCents)}.` : ""}`}
          />
        )}
        <div className="s-row">
          <Button type="submit" variant="secondary" icon="check" loading={busy}>
            Enregistrer la billetterie
          </Button>
          <Button variant="secondary" icon="qr" href={`${base}/e/${event.id}/billets`}>
            Contrôle des billets
          </Button>
        </div>
      </Form>
    </section>
  );
}

export default function OrgaEvenement({ loaderData, actionData }: Route.ComponentProps) {
  const { event, weather, ticketing, verified, created } = loaderData;
  const base = `/orga/${event.structure.slug}`;
  const busy = useNavigation().state !== "idle";
  const [confirmCancel, setConfirmCancel] = useState(false);
  const result = actionData as Result | undefined;
  const [search] = useSearchParams();
  const published = event.status === "published";
  const isDraft = event.status === "draft";
  const justPublished = search.get("publie") === "1";
  const serie = search.get("serie");

  return (
    <>
      <div className="orga__head">
        <div className="s-stack s-stack--tight">
          <div className="s-label o-t-label">{eventFormatLabels[event.format]}</div>
          <h1 className="s-title" data-testid="event-title">
            {event.title}
          </h1>
          <div className="o-t-meta">{formatWhen(event.startsAt, event.endsAt)}</div>
        </div>
        <div className="s-row">
          <Chip variant={published ? "accent" : undefined} data-testid="event-status">
            {eventStatusLabels[event.status]}
          </Chip>
          {event.status === "cancelled" && <StatusBadge status="cancelled" />}
          {published && event.outlook === "uncertain" && <StatusBadge status="uncertain" />}
        </div>
      </div>

      {created && (
        <p className="s-notice s-notice--ok" role="status">
          Brouillon enregistré.{" "}
          {verified ? "Publie-le quand il est prêt." : "Fais vérifier ta structure pour pouvoir le publier."}
        </p>
      )}
      {justPublished && (
        <p className="s-notice s-notice--ok" role="status" data-testid="published-note">
          Événement publié : il est visible sur <a href="/evenements">la liste des événements</a>.
        </p>
      )}
      {serie && (
        <p className="s-notice s-notice--ok" role="status">
          {serie} occurrence{Number(serie) > 1 ? "s" : ""} créée{Number(serie) > 1 ? "s" : ""} en brouillon.
        </p>
      )}
      {result?.error && (
        <p className="s-error" role="alert" data-testid="action-error">
          {result.error}
        </p>
      )}

      {published && (
        <section className="orga__panel s-stack">
          <Counters
            variant="surface"
            size="site"
            items={[
              { value: event.counters.remaining ?? "∞", label: "places restantes" },
              { value: event.counters.accepted, label: "retenus" },
              { value: event.counters.pending, label: "à trier" },
              { value: event.counters.waitlisted, label: "liste d'attente" },
            ]}
          />
          <div className="s-row">
            <Button variant="secondary" icon="check" href={`${base}/e/${event.id}/candidatures`}>
              Candidatures
            </Button>
            <Button variant="secondary" icon="live" href={`${base}/e/${event.id}/jour-j`}>
              Jour J et après
            </Button>
            <Button variant="secondary" icon="share" href={`/e/${event.slug}`}>
              Page publique
            </Button>
          </div>
        </section>
      )}

      <section className="orga__panel s-stack" aria-labelledby="gestion-title">
        <h2 id="gestion-title" className="s-h2">
          Gérer
        </h2>
        <div className="s-row">
          {event.status !== "cancelled" && (
            <Button variant="secondary" icon="incident" href={`${base}/e/${event.id}/modifier`}>
              Modifier
            </Button>
          )}
          <Form method="post">
            <input type="hidden" name="intent" value="duplicate" />
            <Button type="submit" variant="secondary" icon="add" loading={busy}>
              Dupliquer
            </Button>
          </Form>
        </div>
        {isDraft && (
          <Form method="post" className="s-stack s-stack--tight">
            <input type="hidden" name="intent" value="publish" />
            {!verified && (
              <p className="s-notice" data-testid="publish-blocked">
                La publication est réservée aux structures vérifiées.{" "}
                <a href={`${base}/structure`}>Faire vérifier ma structure</a>
              </p>
            )}
            <div>
              <Button type="submit" icon="check" disabled={!verified} loading={busy}>
                Publier l'événement
              </Button>
            </div>
          </Form>
        )}
      </section>

      {ticketing && event.status !== "cancelled" && <Ticketing event={event} ticketing={ticketing} base={base} />}

      {published && weather && (
        <section className="orga__panel s-stack" aria-label="Météo annoncée" data-testid="orga-weather">
          <div className="orga__wx">
            <Weather weather={weather} title="Météo annoncée" compact />
            {event.outlook === "maintained" && isBadWeather(weather.summary) && (
              <div className="s-stack s-stack--tight s-grow" data-testid="weather-suggestion">
                <p className="s-notice s-notice--alert" role="status">
                  <strong>{weatherTexts.suggestionTitle}</strong>
                  <br />
                  {weatherTexts.suggestionBody}
                </p>
                <Form method="post">
                  <input type="hidden" name="intent" value="outlook" />
                  <Button type="submit" name="outlook" value="uncertain" variant="secondary" icon="wait" loading={busy}>
                    {weatherTexts.suggestionAction}
                  </Button>
                </Form>
              </div>
            )}
          </div>
        </section>
      )}

      {published && (
        <section className="orga__panel s-stack" aria-labelledby="statut-title">
          <h2 id="statut-title" className="s-h2">
            Statut
          </h2>
          <p className="s-muted">
            « Incertain » affiche un bandeau et prévient tous les inscrits ; « Annulé » est définitif et prévient tout
            le monde.
          </p>
          <Form method="post" className="s-row">
            <input type="hidden" name="intent" value="outlook" />
            <ChipRow>
              {(["maintained", "uncertain"] as const).map((o) => (
                <Button
                  key={o}
                  type="submit"
                  name="outlook"
                  value={o}
                  variant="secondary"
                  aria-pressed={event.outlook === o}
                  icon={o === "maintained" ? "check" : "wait"}
                  disabled={event.outlook === o}
                >
                  {eventOutlookLabels[o]}
                </Button>
              ))}
            </ChipRow>
          </Form>
        </section>
      )}

      {event.status !== "cancelled" && !event.parentEventId && !event.recurrenceRule && (
        <section className="orga__panel s-stack" aria-labelledby="serie-title">
          <h2 id="serie-title" className="s-h2">
            Récurrence
          </h2>
          <p className="s-muted">
            Un événement qui revient (chaque premier dimanche du mois, par exemple) se crée une seule fois : les dates
            suivantes sont générées en brouillon.
          </p>
          <Recurrence event={event} />
        </section>
      )}
      {event.recurrenceRule && (
        <Plate as="section" className="s-stack s-stack--tight">
          <h2 className="s-h2">Récurrence</h2>
          <p>{describeRecurrence(event.recurrenceRule)}.</p>
        </Plate>
      )}

      {event.vendorTypes.length > 0 && (
        <Plate as="section" className="s-stack s-stack--tight">
          <h2 className="s-h2">Prestataires attendus</h2>
          <p>{event.vendorTypes.join(" · ")}</p>
        </Plate>
      )}

      {event.status !== "cancelled" && (
        <section className="orga__panel s-stack" aria-labelledby="annul-title">
          <h2 id="annul-title" className="s-h2">
            Annuler l'événement
          </h2>
          {!confirmCancel ? (
            <div>
              <Button variant="secondary" icon="alert" onClick={() => setConfirmCancel(true)}>
                Annuler l'événement…
              </Button>
            </div>
          ) : (
            <Form method="post" className="s-stack s-stack--tight">
              <input type="hidden" name="intent" value="cancel" />
              <p className="s-notice s-notice--alert">
                L'annulation est définitive : les candidatures sont annulées sans malus et tous les inscrits sont
                prévenus.
              </p>
              <div className="s-row">
                <Button type="submit" variant="alert" icon="alert" loading={busy}>
                  Confirmer l'annulation
                </Button>
                <Button variant="secondary" icon="back" onClick={() => setConfirmCancel(false)}>
                  Garder l'événement
                </Button>
              </div>
            </Form>
          )}
        </section>
      )}
    </>
  );
}
