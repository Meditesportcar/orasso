// Fiche événement v2 (lot 44, prototype DA v2 `s-event`, validé par Damien le 19/10/2026 ; lien partagé ou depuis
// Explorer) : l'affiche générée en vedette, les chips, la description, l'organisateur, Quand / Où (carte stylée) /
// Exposants / Public, les créneaux d'arrivée en deux plaques, l'affiche perso de l'organisateur, le règlement, la météo
// du jour J, les prestataires présents, puis l'action principale selon le profil ; fermé, la raison et quoi faire.
// Ouverte sans compte ; « Candidater » demande de se connecter puis revient exactement ici. Découpée en
// `features/event/*`.
// Lot C2b (artefact `s-event`) : écran à affiche sans barre du haut (`PosterFlow` : pastille O et croix flottantes),
// règlement en texte sous son titre, et la candidature dans une seule feuille (`CandSheet`, `sh-cand`) au lieu du
// flux de trois écrans et de l'écran « Inscrire mon crew » (le mode « Avec <crew> » est dans la feuille).

import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  dayAccessLabels,
  eventAcceptsVendorType,
  eventAdmissionLabels,
  eventDaysLabels,
  formatDayDate,
  invitationLabels,
  eventPageLabels as L,
  mediaAppLabels as M,
  previewSummary,
  registrationBlock,
  type VendorTypeCode,
  wizardEndLabels,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { ContactOrganizerButton } from "@/features/boite/MessageButton";
import { EventFeed } from "@/features/communication/EventFeed";
import { ArrivalSlots } from "@/features/event/ArrivalSlots";
import { eventAction, type ProfileKind } from "@/features/event/action";
import { CandSheet } from "@/features/event/CandSheet";
import { CustomPoster } from "@/features/event/CustomPoster";
import { Info, ProvidersPresent, Reviews } from "@/features/event/EventExtras";
import { EventFactsGrid, EventTitle, OrganizerRow } from "@/features/event/EventFacts";
import { EventGatePlate } from "@/features/event/EventGate";
import { EventHero } from "@/features/event/EventHero";
import { MediaContents } from "@/features/event/MediaContents";
import { PosterFlow } from "@/features/event/PosterFlow";
import { RequestSheet, type RequestTarget } from "@/features/media/RequestSheet";
import { ApplySheet } from "@/features/provider/ApplySheet";
import { ReportButton } from "@/features/ReportSheet";
import { TicketsBlock } from "@/features/tickets/TicketsBlock";
import { WeatherWidget } from "@/features/WeatherWidget";
import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { formatHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";

const { space1, space3 } = tokens.spacing;
const OPEN_STATUSES = ["pending", "accepted", "waitlisted", "offered", "awaiting_member"];

export default function EventPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { slug, candidater } = useLocalSearchParams<{ slug: string; candidater?: string }>();
  const { status, me, refreshMe } = useSession();
  const { persona, goTab } = usePersona();
  const event = useApi(() => api.eventBySlug(slug), [slug, status], { enabled: status !== "loading" });
  const e = event.data;
  const reviews = useApi(() => api.eventReviews(slug), [slug, status], { enabled: status !== "loading" });
  // Météo du jour J (lot 28) : seulement dans les 7 jours avant l'événement ; jamais bloquante.
  const weather = useApi(() => api.eventWeather(slug), [slug], { enabled: status !== "loading" });
  // Fil de l'événement (lot 20) : public, enrichi pour les retenus (consignes, annonces réservées).
  const feed = useApi(() => api.eventAnnouncements(slug), [slug, status], { enabled: status !== "loading" });
  const providers = useApi(() => api.eventProviders(slug), [slug, status], { enabled: status !== "loading" });
  const structure = useApi(() => api.structureBySlug(e?.structure.slug ?? ""), [e?.structure.slug, status], {
    enabled: Boolean(e) && status !== "loading",
  });
  const offer = useApi(() => api.ticketOffer(slug), [slug, status], { enabled: status !== "loading" });
  // Prestataire (lot 21) : a-t-il déjà candidaté ? Alors « Voir ma candidature », comme le prototype.
  const providerApps = useApi(() => api.providerApplications("upcoming"), [status, persona.kind], {
    enabled: status === "in" && persona.kind === "provider",
  });
  const kind: ProfileKind = status !== "in" ? "guest" : persona.kind;
  // Le véhicule « de couverture » : le premier du garage actif (« Candidater avec ma Supra »).
  const vehicles = useApi(() => api.vehicles(), [status], { enabled: status === "in" && kind === "fan" });
  // Média (lot 55) : les formats du profil pour la demande ; l'état de l'accréditation vient de la fiche (`e.accreditation`).
  const mediaProfile = useApi(async () => (await api.myMediaProfile()).profile, [status, kind], {
    enabled: status === "in" && kind === "media",
    cacheKey: "media-profile",
  });
  const [mediaTarget, setMediaTarget] = useState<RequestTarget | null>(null);
  const hasPro = me?.personas?.some((p) => p.kind === "pro") ?? false;
  const hasProvider = me?.personas?.some((p) => p.kind === "provider") ?? false;
  const providerProfile = useApi(async () => (await api.providerProfile()).profile, [status, hasPro, hasProvider], {
    enabled: status === "in" && (hasPro || hasProvider),
  });
  // La feuille de candidature (lot C2b) ; `?candidater=1` l'ouvre (retour de connexion, ancien lien `/candidater`).
  const [cand, setCand] = useState(false);
  useEffect(() => {
    if (candidater && status === "in") setCand(true);
  }, [candidater, status]);
  const [applying, setApplying] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerSent, setProviderSent] = useState(false);
  const [booking, setBooking] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace(status === "in" ? "/" : "/auth"));

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
  const notYetOpen = nowMs() < opensAt.getTime();
  const cancelled = e.status === "cancelled";
  // Événement privé (lot 25) : pas de candidature libre, l'invitation se répond dans Sorties.
  const inviteOnly = e.admission === "invite_only";
  // Lot 36 : la raison d'un blocage, la même que sur le site ; complet ne bloque plus (liste d'attente, comme le site).
  const block = registrationBlock(e, nowMs());
  const canApply = !inviteOnly && !cancelled && !e.isLocked && !notYetOpen && e.status !== "draft";
  const full = canApply && e.admission === "open" && e.remaining !== null && e.remaining <= 0;
  const preview = previewSummary(e);

  // Prestataires (lot 21) : un prestataire candidate avec son profil ; un pro, avec le stand de sa fiche pro.
  const profileData = providerProfile.data;
  const providerOpen = !cancelled && !e.isLocked && new Date(e.endsAt).getTime() > nowMs();
  const providerAccepted = profileData
    ? eventAcceptsVendorType(e.vendorTypes, profileData.type as VendorTypeCode, profileData.customType)
    : hasPro && eventAcceptsVendorType(e.vendorTypes, "stand");
  const showProviderApply =
    status === "in" && (hasPro || hasProvider) && providerOpen && e.admission !== "invite_only" && providerAccepted;

  const ownStructure = persona.kind === "organizer" && persona.structureId === e.structure.id;
  const { action, gate } = eventAction({
    kind,
    ownStructure,
    hasApplication: mine.length > 0,
    canApply,
    full,
    block,
    hasTicketOffer: Boolean(offer.data?.offer),
    providerApplied: providerSent || (providerApps.data ?? []).some((a) => a.event.id === e.id),
    providerCanApply: showProviderApply && !providerSent,
    cancelled,
    accreditation: e.accreditation ?? null,
  });
  const isFollowing = following || Boolean(structure.data?.isFollowing);
  const cover = (vehicles.data ?? []).find((v) => v.status === "active");

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

  async function toggleFollow() {
    if (!e) return;
    if (status !== "in") {
      router.push({ pathname: "/auth", params: { mode: "signup", next: `/e/${e.slug}` } });
      return;
    }
    setFollowError(null);
    setFollowing(true);
    try {
      if (structure.data?.isFollowing) {
        await api.unfollowStructure(e.structure.id);
        setFollowing(false);
      } else await api.followStructure(e.structure.id);
      await structure.reload();
    } catch (error) {
      setFollowing(false);
      setFollowError(errorMessage(error));
    }
  }

  const apply = () =>
    status === "in"
      ? setCand(true)
      : router.push({ pathname: "/auth", params: { mode: "signup", next: `/e/${e.slug}?candidater=1` } });

  const primary =
    action === "triage"
      ? {
          label: L.triage,
          icon: "cards" as const,
          onPress: () => router.push({ pathname: "/tri", params: { event: e.id } }),
        }
      : action === "apply"
        ? { label: cover ? L.applyWith(cover.modelName) : L.applyNoVehicle, icon: "send" as const, onPress: apply }
        : action === "applyGuest"
          ? { label: L.applyNoVehicle, icon: "send" as const, onPress: apply }
          : action === "myApplication"
            ? { label: L.myApplication, icon: "qr" as const, onPress: () => router.navigate("/sorties") }
            : action === "myProviderApplication"
              ? {
                  label: L.myApplication,
                  icon: "briefcase" as const,
                  onPress: () =>
                    router.navigate({
                      pathname: "/candidatures",
                      params: { open: (providerApps.data ?? []).find((a) => a.event.id === e.id)?.id ?? "" },
                    }),
                }
              : action === "book"
                ? { label: L.bookEntry, icon: "ticket" as const, onPress: () => setBooking(true) }
                : action === "requestAccreditation"
                  ? {
                      label: M.eventRequest,
                      icon: "send" as const,
                      onPress: () => setMediaTarget({ id: e.id, slug: e.slug, title: e.title }),
                    }
                  : action === "myAccreditation"
                    ? { label: M.eventMine, icon: "press" as const, onPress: () => goTab("presse") }
                    : action === "providerApply"
                      ? {
                          label: profileData ? "Candidater comme prestataire" : "Candidater pour un stand",
                          icon: "add" as const,
                          onPress: () => void openProviderApply(),
                        }
                      : action === "followOrganizer"
                        ? {
                            label: isFollowing ? L.followingOrganizer : L.followOrganizer,
                            icon: isFollowing ? ("check" as const) : ("add" as const),
                            onPress: () => void toggleFollow(),
                          }
                        : null;

  const footer = gate ? (
    <EventGatePlate
      gate={gate}
      event={e}
      block={block}
      following={isFollowing}
      busy={following && !structure.data?.isFollowing}
      onWaitlist={apply}
      onFollow={() => void toggleFollow()}
    />
  ) : primary ? (
    <Button variant="primary" icon={primary.icon} next onPress={primary.onPress} fullWidth testID="event-primary">
      {primary.label}
    </Button>
  ) : null;

  return (
    <PosterFlow
      hero={<EventHero event={e} />}
      onClose={close}
      onRefresh={event.reload}
      footer={footer}
      testID="event-page"
    >
      {e.status === "draft" ? (
        <Notice tone="error" testID="draft-preview">
          {wizardEndLabels.previewBanner}
        </Notice>
      ) : null}
      <EventTitle event={e} />
      {cancelled ? (
        <Notice tone="error">Cet événement est annulé.</Notice>
      ) : inviteOnly ? (
        <Notice>{invitationLabels.invitationRequired}</Notice>
      ) : null}
      <OrganizerRow
        event={e}
        structure={structure.data ?? null}
        busy={following && !structure.data?.isFollowing}
        onFollow={() => void toggleFollow()}
      />
      {followError ? <Notice tone="error">{followError}</Notice> : null}
      <EventFactsGrid event={e} />
      <ArrivalSlots arrivals={e.arrivals} entranceNote={e.entranceNote} />
      {e.customPosterUrl ? <CustomPoster url={e.customPosterUrl} structureName={e.structure.name} /> : null}

      {/* Lot 26 : candidater aussi pour un autre jour (accès par jour ou au choix). */}
      {mine.length > 0 &&
      (e.days?.length ?? 0) > 1 &&
      e.dayAccess !== "whole" &&
      canApply &&
      !mine.some((a) => a.eventDayId === null) ? (
        <Button variant="secondary" icon="calendar" fullWidth testID="apply-other-day" onPress={apply}>
          Candidater pour un autre jour
        </Button>
      ) : null}

      {(e.days?.length ?? 0) > 1 ? (
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
      <Info label="Admission">
        {eventAdmissionLabels[e.admission]}
        {e.maxVehiclesPerUser > 1 ? ` · ${e.maxVehiclesPerUser} véhicules par personne au plus` : ""}
        {preview ? `\n${preview}` : ""}
      </Info>
      {e.rulesText ? (
        <>
          <SecHead title={L.rules} />
          <Text variant="body" color={t.color.inkMuted} style={styles.rules} testID="event-rules">
            {e.rulesText}
          </Text>
        </>
      ) : null}
      {weather.data ? <WeatherWidget summary={weather.data.summary} attribution={weather.data.attribution} /> : null}
      {/* Lot 34 (parité D20) : billets du public réservés dans l'appli, comme sur la page du site. */}
      {!cancelled ? <TicketsBlock slug={e.slug} eventId={e.id} /> : null}
      {e.vendorTypes.length > 0 ? <Info label="Prestataires attendus">{e.vendorTypes.join(" · ")}</Info> : null}
      {providers.data && providers.data.length > 0 ? (
        <ProvidersPresent providers={providers.data} reportable={status === "in"} />
      ) : null}
      {/* Lot 55 : contenus des médias accrédités (mis en avant d'abord), et pour un média l'état de l'accréditation. */}
      {!cancelled ? <MediaContents slug={e.slug} /> : null}
      {kind === "media" && !cancelled && e.accreditation && !e.accreditation.open && !e.accreditation.mine ? (
        <Notice testID="media-closed">{M.eventClosedText}</Notice>
      ) : null}
      {showProviderApply && action !== "providerApply" ? (
        <>
          {providerError ? <Notice tone="error">{providerError}</Notice> : null}
          {providerSent ? (
            <Notice>
              Candidature envoyée : l'équipe organisatrice te répondra dans l'onglet Candidatures de ta casquette.
            </Notice>
          ) : (
            <Button variant="secondary" icon="add" next onPress={() => void openProviderApply()} fullWidth>
              {profileData ? "Candidater comme prestataire" : "Candidater pour un stand"}
            </Button>
          )}
        </>
      ) : null}
      {action === "providerApply" && providerError ? <Notice tone="error">{providerError}</Notice> : null}
      {feed.data ? <EventFeed items={feed.data.items} reportable={status === "in"} /> : null}
      {e.instructions ? <Info label="Consignes de l'équipe organisatrice">{e.instructions}</Info> : null}
      {/* Contacter l'organisateur (lot 18) : toujours possible pour une personne connectée. */}
      {status === "in" ? <ContactOrganizerButton structureId={e.structure.id} /> : null}
      {status === "in" ? <ReportButton look="link" type="event" id={e.id} /> : null}
      {reviews.data && (reviews.data.count > 0 || new Date(e.endsAt).getTime() <= nowMs()) ? (
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
      <RequestSheet
        target={mediaTarget}
        defaultFormats={mediaProfile.data?.formats ?? []}
        onClose={() => setMediaTarget(null)}
        onSent={() => void event.reload()}
      />
      <CandSheet event={e} visible={cand} onClose={() => setCand(false)} onSent={() => void event.reload()} />
      <AppSheet visible={booking} onClose={() => setBooking(false)} accessibilityLabel={L.bookEntry}>
        <Text variant="title" color={t.color.ink}>
          {L.bookEntry}
        </Text>
        {booking ? <TicketsBlock slug={e.slug} eventId={e.id} /> : null}
      </AppSheet>
    </PosterFlow>
  );
}

const styles = StyleSheet.create({
  info: { gap: space1, padding: space3 },
  rules: { fontSize: 14, lineHeight: 21.7 },
});
