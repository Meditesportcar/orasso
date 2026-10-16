// Page d'un événement (lien partagé ou depuis Explorer) : la carte affiche, les compteurs, l'admission, le public, le
// règlement. Ouverte sans compte ; « Candidater » demande de se connecter puis revient exactement ici.

import { Chip, ChipRow, Counters, Plate, PosterCard, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  applicationStatusLabels,
  type EventPublic,
  type EventReviews,
  eventAdmissionLabels,
  eventFormatLabels,
  eventOutlookLabels,
  eventPublicAccessLabels,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { WeatherWidget } from "@/features/WeatherWidget";
import { api } from "@/lib/api";
import { breakTitle, formatDay, formatDayHour, formatHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space3 } = tokens.spacing;
const OPEN_STATUSES = ["pending", "accepted", "waitlisted", "offered"];

export default function EventPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { status } = useSession();
  const event = useApi(() => api.eventBySlug(slug), [slug, status], { enabled: status !== "loading" });
  const categories = useApi(() => api.categories(), [], { cacheKey: "ref.categories", enabled: status === "in" });
  const reviews = useApi(() => api.eventReviews(slug), [slug, status], { enabled: status !== "loading" });
  // Météo à l'approche (lot 28) : seulement dans les 7 jours avant l'événement ; jamais bloquante.
  const weather = useApi(() => api.eventWeather(slug), [slug], { enabled: status !== "loading" });
  const e = event.data;

  const close = () => (router.canGoBack() ? router.back() : router.replace(status === "in" ? "/explorer" : "/auth"));

  if (!e) {
    return (
      <FlowScreen title="Événement" onClose={close}>
        {event.error ? (
          <Notice tone="error">
            {event.error.status === 404 ? "Cet événement n'existe pas ou plus." : event.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  const mine = e.myApplications?.filter((a) => OPEN_STATUSES.includes(a.status)) ?? [];
  const opensAt = new Date(e.registrationOpensAtForMe ?? e.registrationsOpenAt);
  const notYetOpen = Date.now() < opensAt.getTime();
  const cancelled = e.status === "cancelled";
  const canApply =
    !cancelled && !e.isLocked && !notYetOpen && (e.remaining === null || e.remaining > 0 || e.admission !== "open");
  const wanted = (e.criteria?.categoryIds ?? [])
    .map((id) => categories.data?.find((c) => c.id === id)?.label)
    .filter((l): l is string => Boolean(l));

  const apply = () =>
    status === "in"
      ? router.push(`/candidater/${e.slug}`)
      : router.push({ pathname: "/auth", params: { mode: "signup", next: `/candidater/${e.slug}` } });

  return (
    <FlowScreen title={eventFormatLabels[e.format]} onClose={close} onRefresh={event.reload}>
      <PosterCard
        label={`${eventFormatLabels[e.format]} · ${e.structure.name}`}
        title={breakTitle(e.title)}
        facts={`${formatDay(e.startsAt)} · ${formatHour(e.startsAt)} – ${formatHour(e.endsAt)}${e.city ? ` · ${e.city}` : ""}`}
        photo={{
          source: mediaSource(e.posterUrl),
          placeholder: `linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`,
        }}
        status={posterStatus(
          e,
          mine.some((a) => a.status === "accepted"),
        )}
        action={
          mine.length > 0
            ? { label: "Voir mes accès", icon: "qr", next: true, onPress: () => router.navigate("/acces") }
            : canApply
              ? { label: "Candidater avec un véhicule", icon: "add", next: true, onPress: apply }
              : undefined
        }
      />

      {mine.length > 0 ? (
        <Notice>
          Tu as candidaté : {mine.map((a) => applicationStatusLabels[a.status].toLowerCase()).join(", ")}.
        </Notice>
      ) : cancelled ? (
        <Notice tone="error">Cet événement est annulé.</Notice>
      ) : e.isLocked ? (
        <Notice>Les inscriptions sont verrouillées.</Notice>
      ) : notYetOpen ? (
        <Notice>Les candidatures ouvrent le {formatDayHour(opensAt)}.</Notice>
      ) : null}

      <Counters
        items={[
          { value: e.remaining ?? "∞", label: "places" },
          { value: e.acceptedCount, label: "retenus" },
          { value: eventOutlookLabels[e.outlook], label: "statut" },
        ]}
        active={0}
      />

      {weather.data ? <WeatherWidget summary={weather.data.summary} attribution={weather.data.attribution} /> : null}

      {wanted.length > 0 ? (
        <Plate style={styles.info}>
          <Text variant="label" color={t.color.plateMuted}>
            Recherché
          </Text>
          <ChipRow>
            {wanted.map((label) => (
              <Chip key={label} variant="accent" surface="plate">
                {label}
              </Chip>
            ))}
          </ChipRow>
        </Plate>
      ) : null}

      <Info label="Quand et où">
        {formatDayHour(e.startsAt)} → {formatDayHour(e.endsAt)}
        {e.addressLine || e.city
          ? `\n${[e.addressLine, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}`
          : ""}
      </Info>
      <Info label="Admission">
        {eventAdmissionLabels[e.admission]}
        {e.maxVehiclesPerUser > 1 ? ` · ${e.maxVehiclesPerUser} véhicules par personne au plus` : ""}
      </Info>
      <Info label="Public">{eventPublicAccessLabels[e.publicAccess]}</Info>
      {e.description ? <Info label="À propos">{e.description}</Info> : null}
      {e.instructions ? <Info label="Consignes de l'organisateur">{e.instructions}</Info> : null}
      {reviews.data && (reviews.data.count > 0 || new Date(e.endsAt).getTime() <= Date.now()) ? (
        <Reviews data={reviews.data} />
      ) : null}
    </FlowScreen>
  );
}

function posterStatus(e: EventPublic, retained: boolean) {
  if (e.status === "cancelled") return "cancelled" as const;
  if (e.outlook === "uncertain") return "uncertain" as const;
  return retained ? ("retained" as const) : ("pending" as const);
}

/** Avis des participants pointés : moyenne à partir du minimum d'avis, réponse publique de l'organisateur. */
function Reviews({ data }: { data: EventReviews }) {
  const { t } = useTheme();
  const c = t.color;
  const average = data.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return (
    <Plate style={styles.info}>
      <Text variant="label" color={c.plateMuted}>
        Avis des participants
      </Text>
      <Text variant="body" color={c.plateInk}>
        {data.count === 0
          ? "Pas encore d'avis. Seuls les participants pointés à l'entrée peuvent noter, pendant la semaine qui suit."
          : average
            ? `${average} / 3 · ${data.count} avis`
            : `${data.count} avis · la moyenne s'affiche à partir de ${data.minForAverage} avis.`}
      </Text>
      {data.items.map((r) => (
        <View key={r.id} style={[styles.review, { borderTopColor: c.plateLine }]}>
          <View style={styles.reviewHead}>
            <Text variant="bodyStrong" color={c.plateInk}>
              {r.pseudo}
            </Text>
            <Text
              variant="bodyStrong"
              color={c.accent}
              accessibilityLabel={`${r.rating} étoile${r.rating > 1 ? "s" : ""} sur 3`}
            >
              {"★".repeat(r.rating)}
            </Text>
          </View>
          <Text variant="body" color={c.plateInk}>
            {r.comment}
          </Text>
          {r.reply ? (
            <Text variant="meta" color={c.plateMuted}>
              Réponse de l'organisateur : {r.reply.text}
            </Text>
          ) : null}
        </View>
      ))}
    </Plate>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <Plate style={styles.info}>
      <Text variant="label" color={t.color.plateMuted}>
        {label}
      </Text>
      <Text variant="body" color={t.color.plateInk}>
        {children}
      </Text>
    </Plate>
  );
}

const styles = StyleSheet.create({
  info: { gap: space1, padding: space3 },
  review: { gap: space1, paddingTop: space3, marginTop: space1, borderTopWidth: 1 },
  reviewHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space3 },
});
