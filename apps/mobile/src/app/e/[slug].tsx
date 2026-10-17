// Page d'un événement (lien partagé ou depuis Explorer) : la carte affiche, les compteurs, l'admission, le public, le
// règlement. Ouverte sans compte ; « Candidater » demande de se connecter puis revient exactement ici.

import {
  Button,
  Chip,
  ChipRow,
  Counters,
  Plate,
  PosterCard,
  Text,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  applicationStatusLabels,
  crewLabels,
  dayAccessLabels,
  type EventPublic,
  type EventReviews,
  eventAcceptsVendorType,
  eventAdmissionLabels,
  eventDaysLabels,
  eventFormatLabels,
  eventOutlookLabels,
  formatDayDate,
  instagramHandle,
  invitationLabels,
  previewSummary,
  publicAccessText,
  type VendorTypeCode,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { ContactOrganizerButton } from "@/features/boite/MessageButton";
import { EventFeed } from "@/features/communication/EventFeed";
import { ApplySheet } from "@/features/provider/ApplySheet";
import { ReportButton } from "@/features/ReportSheet";
import { WeatherWidget } from "@/features/WeatherWidget";
import { api } from "@/lib/api";
import { breakTitle, formatDay, formatDayHour, formatHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space3 } = tokens.spacing;
const OPEN_STATUSES = ["pending", "accepted", "waitlisted", "offered", "awaiting_member"];

export default function EventPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { status, me, refreshMe } = useSession();
  const event = useApi(() => api.eventBySlug(slug), [slug, status], { enabled: status !== "loading" });
  const categories = useApi(() => api.categories(), [], { cacheKey: "ref.categories", enabled: status === "in" });
  const reviews = useApi(() => api.eventReviews(slug), [slug, status], { enabled: status !== "loading" });
  // Météo à l'approche (lot 28) : seulement dans les 7 jours avant l'événement ; jamais bloquante.
  const weather = useApi(() => api.eventWeather(slug), [slug], { enabled: status !== "loading" });
  // Fil de l'événement (lot 20) : public, enrichi pour les retenus (consignes, annonces réservées).
  const feed = useApi(() => api.eventAnnouncements(slug), [slug, status], { enabled: status !== "loading" });
  const e = event.data;
  const providers = useApi(() => api.eventProviders(slug), [slug, status], { enabled: status !== "loading" });
  const hasPro = me?.personas?.some((p) => p.kind === "pro") ?? false;
  const hasProvider = me?.personas?.some((p) => p.kind === "provider") ?? false;
  const providerProfile = useApi(async () => (await api.providerProfile()).profile, [status, hasPro, hasProvider], {
    enabled: status === "in" && (hasPro || hasProvider),
  });
  // Inscription en crew (lot 19) : proposée au chef d'un crew.
  const crews = useApi(() => api.myCrews(), [status], { enabled: status === "in" });
  const leadsCrew = (crews.data ?? []).some((c) => c.role === "leader");
  const [applying, setApplying] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerSent, setProviderSent] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace(status === "in" ? "/explorer" : "/auth"));

  if (!e) {
    return (
      <FlowScreen title="Événement" onClose={close}>
        {event.error?.code === "invite_only" ? (
          // Événement privé sur invitation (lot 25) : rien de l'événement pour qui n'est pas invité.
          <Plate style={styles.info} testID="private-event">
            <Text variant="title" color={t.color.plateInk}>
              {invitationLabels.privateEvent}
            </Text>
            <Text variant="body" color={t.color.plateMuted}>
              {invitationLabels.privateEventHint}
            </Text>
            <Button variant="plate" icon="entry" onPress={() => router.navigate(status === "in" ? "/acces" : "/auth")}>
              {status === "in" ? invitationLabels.openAccess : invitationLabels.linkSignIn}
            </Button>
          </Plate>
        ) : event.error ? (
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
  // Événement privé (lot 25) : pas de candidature libre, l'invitation se répond dans Accès.
  const inviteOnly = e.admission === "invite_only";
  const canApply =
    !inviteOnly &&
    !cancelled &&
    !e.isLocked &&
    !notYetOpen &&
    (e.remaining === null || e.remaining > 0 || e.admission !== "open");
  const preview = previewSummary(e);
  const wanted = (e.criteria?.categoryIds ?? [])
    .map((id) => categories.data?.find((c) => c.id === id)?.label)
    .filter((l): l is string => Boolean(l));

  // Prestataires (lot 21) : un prestataire candidate avec son profil ; un pro, avec le stand de sa fiche pro.
  const profileData = providerProfile.data;
  const providerOpen = !cancelled && !e.isLocked && new Date(e.endsAt).getTime() > Date.now();
  const providerAccepted = profileData
    ? eventAcceptsVendorType(e.vendorTypes, profileData.type as VendorTypeCode, profileData.customType)
    : hasPro && eventAcceptsVendorType(e.vendorTypes, "stand");
  const showProviderApply =
    status === "in" && (hasPro || hasProvider) && providerOpen && e.admission !== "invite_only" && providerAccepted;

  async function openProviderApply() {
    setProviderError(null);
    try {
      // Pro sans profil prestataire : le stand de sa fiche pro est créé (ou réutilisé), puis la feuille s'ouvre.
      if (!profileData) {
        await api.providerFromPro();
        await Promise.all([providerProfile.reload(), refreshMe()]);
      }
      setApplying(true);
    } catch (error) {
      setProviderError(errorMessage(error));
    }
  }

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
              : inviteOnly && !cancelled
                ? {
                    label: invitationLabels.openAccess,
                    icon: "entry",
                    next: true,
                    onPress: () => router.navigate("/acces"),
                  }
                : undefined
        }
      />

      {mine.length > 0 ? (
        <Notice>
          Tu as candidaté : {mine.map((a) => applicationStatusLabels[a.status].toLowerCase()).join(", ")}.
        </Notice>
      ) : cancelled ? (
        <Notice tone="error">Cet événement est annulé.</Notice>
      ) : inviteOnly ? (
        <Notice>{invitationLabels.invitationRequired}</Notice>
      ) : e.isLocked ? (
        <Notice>Les inscriptions sont verrouillées.</Notice>
      ) : notYetOpen ? (
        <Notice>Les candidatures ouvrent le {formatDayHour(opensAt)}.</Notice>
      ) : null}
      {/* Lot 26 : candidater aussi pour un autre jour (accès par jour ou au choix). */}
      {mine.length > 0 &&
      e.days.length > 1 &&
      e.dayAccess !== "whole" &&
      canApply &&
      !mine.some((a) => a.eventDayId === null) ? (
        <Button variant="secondary" icon="calendar" fullWidth testID="apply-other-day" onPress={apply}>
          Candidater pour un autre jour
        </Button>
      ) : null}
      {leadsCrew && !cancelled && !e.isLocked && !notYetOpen && e.admission !== "invite_only" ? (
        <Button
          variant="secondary"
          icon="crew"
          fullWidth
          testID="register-crew"
          onPress={() => router.push({ pathname: "/crew/inscription", params: { event: e.slug } })}
        >
          {crewLabels.registerCrew}
        </Button>
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

      {/* Page de l'organisateur (lot 29) : fiche, événements, suivre, devenir staff. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Organisateur : ${e.structure.name}`}
        onPress={() => router.push(`/o/${e.structure.slug}`)}
        testID="event-organizer"
      >
        <Plate style={styles.info}>
          <Text variant="label" color={t.color.plateMuted}>
            Organisateur
          </Text>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {e.structure.name}
          </Text>
        </Plate>
      </Pressable>
      {e.days.length > 1 ? (
        <Plate style={styles.info} testID="event-days">
          <Text variant="label" color={t.color.plateMuted}>
            {eventDaysLabels.days} · {dayAccessLabels[e.dayAccess]}
          </Text>
          {e.days.map((d) => (
            <Text key={d.id} variant="body" color={t.color.plateInk}>
              {formatDayDate(d.date)} · {formatHour(d.startsAt)} – {formatHour(d.endsAt)}
              {d.remaining === null
                ? ""
                : d.remaining === 0
                  ? ` · ${eventDaysLabels.dayFull}`
                  : ` · ${d.remaining} places`}
            </Text>
          ))}
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
        {preview ? `\n${preview}` : ""}
      </Info>
      <Info label="Public">{publicAccessText(e.publicAccess, e.externalTicketUrl)}</Info>
      {e.vendorTypes.length > 0 ? <Info label="Prestataires attendus">{e.vendorTypes.join(" · ")}</Info> : null}
      {providers.data && providers.data.length > 0 ? (
        <Plate style={styles.info} testID="providers-present">
          <Text variant="label" color={t.color.plateMuted}>
            Prestataires présents
          </Text>
          {providers.data.map((p) => (
            <View key={p.id} style={styles.provider} testID="provider-present">
              <View style={styles.providerText}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {p.name}
                </Text>
                <Text variant="meta" color={t.color.plateMuted}>
                  {p.typeLabel}
                </Text>
                {p.instagram ? (
                  <Text
                    variant="meta"
                    color={t.color.plateInk}
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(p.instagram as string)}
                  >
                    {instagramHandle(p.instagram) ?? "Instagram"}
                  </Text>
                ) : null}
              </View>
              {p.accreditedMedia ? (
                <Chip surface="plate" variant="accent">
                  Média officiel
                </Chip>
              ) : null}
              {status === "in" ? <ReportButton look="link" onPlate type="provider" id={p.id} /> : null}
            </View>
          ))}
        </Plate>
      ) : null}
      {showProviderApply ? (
        <>
          {providerError ? <Notice tone="error">{providerError}</Notice> : null}
          {providerSent ? (
            <Notice>
              Candidature envoyée : l'organisateur te répondra dans l'onglet Candidatures de ta casquette.
            </Notice>
          ) : (
            <Button variant="secondary" icon="add" next onPress={() => void openProviderApply()} fullWidth>
              {profileData ? "Candidater comme prestataire" : "Candidater pour un stand"}
            </Button>
          )}
        </>
      ) : null}
      {e.description ? <Info label="À propos">{e.description}</Info> : null}
      {feed.data ? <EventFeed items={feed.data.items} reportable={status === "in"} /> : null}
      {e.instructions ? <Info label="Consignes de l'organisateur">{e.instructions}</Info> : null}
      {/* Contacter l'organisateur (lot 18) : toujours possible pour une personne connectée. */}
      {status === "in" ? <ContactOrganizerButton structureId={e.structure.id} /> : null}
      {status === "in" ? <ReportButton look="link" type="event" id={e.id} /> : null}
      {reviews.data && (reviews.data.count > 0 || new Date(e.endsAt).getTime() <= Date.now()) ? (
        <Reviews data={reviews.data} reportable={status === "in"} />
      ) : null}
      <ApplySheet
        eventTitle={applying ? e.title : null}
        onClose={() => setApplying(false)}
        onSend={async (message) => {
          await api.applyAsProvider(e.id, { rulesAccepted: true, message });
          setApplying(false);
          setProviderSent(true);
          void refreshMe();
        }}
      />
    </FlowScreen>
  );
}

function posterStatus(e: EventPublic, retained: boolean) {
  if (e.status === "cancelled") return "cancelled" as const;
  if (e.outlook === "uncertain") return "uncertain" as const;
  return retained ? ("retained" as const) : ("pending" as const);
}

/** Avis des participants pointés : moyenne à partir du minimum d'avis, réponse publique de l'organisateur. */
function Reviews({ data, reportable }: { data: EventReviews; reportable: boolean }) {
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
          {reportable ? <ReportButton look="link" onPlate type="review" id={r.id} /> : null}
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
  provider: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space3 },
  providerText: { flex: 1, gap: space1 },
  reviewHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space3 },
});
