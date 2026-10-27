// Fiche événement v2 (lot 44, prototype DA v2 `s-event`, validé par Damien le 19/10/2026 ; lien partagé ou depuis
// Explorer) : l'affiche générée en vedette, les chips, la description, l'organisateur, Quand / Où (carte stylée) /
// Exposants / Public, les créneaux d'arrivée en deux plaques, l'affiche perso de l'organisateur, le règlement, la météo
// du jour J, les prestataires présents, puis l'action principale selon le profil ; fermé, la raison et quoi faire.
// Ouverte sans compte ; « Candidater » demande de se connecter puis revient exactement ici. Découpée en
// `features/event/*`.
// Lot C2b (artefact `s-event`) : écran à affiche sans barre du haut (`PosterFlow` : pastille O et croix flottantes),
// règlement en texte sous son titre, et la candidature dans une seule feuille (`CandSheet`, `sh-cand`) au lieu du
// flux de trois écrans et de l'écran « Inscrire mon crew » (le mode « Avec <crew> » est dans la feuille).
// Lot M4 (maquettes 4.1 à 4.3, corrections de Damien) : la bande de l'organisateur est l'en-tête fixe de la fiche
// (logo, nom, ✓, abonnés, Suivre, ✉ avec le contexte de l'événement) ; l'affiche porte le pavé J-x ; la fiche compacte
// en lignes (quand, où et mini-plan, places en barre, public), l'admission en étiquettes avec « ? », la météo du jour
// J ; le créneau des exposants est privé (dans « Ta place » et la feuille), aucun horaire « conseillé ». Inscrit :
// « Ta place » en tête et « Mon QR » en bouton principal. « Candidater » seul : le véhicule se choisit dans la feuille.

import { Button, Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  countFr,
  crewLabels,
  dayAccessLabels,
  type EventCard,
  eventAcceptsVendorType,
  eventDaysLabels,
  formatDayDate,
  invitationLabels,
  eventPageLabels as L,
  mediaAppLabels as M,
  type MyApplication,
  nearCountdown,
  registrationBlock,
  type VendorTypeCode,
  withYear,
  wizardEndLabels,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { EventFeed } from "@/features/communication/EventFeed";
import { eventAction, type ProfileKind } from "@/features/event/action";
import { CandSheet } from "@/features/event/CandSheet";
import { CustomPoster } from "@/features/event/CustomPoster";
import { Info, Reviews } from "@/features/event/EventExtras";
import { AdmissionTags, EventRows, EventTitle } from "@/features/event/EventFacts";
import { EventGatePlate } from "@/features/event/EventGate";
import { EventHero } from "@/features/event/EventHero";
import { InvitationMenu, InviteBanner, WhoGoes } from "@/features/event/invite/InviteParts";
import { InviteSheet } from "@/features/event/invite/InviteSheet";
import { LineupBlock } from "@/features/event/Lineup";
import { MediaContents } from "@/features/event/MediaContents";
import { MyPlace } from "@/features/event/MyPlace";
import { OrgBar } from "@/features/event/OrgBar";
import { PosterFlow } from "@/features/event/PosterFlow";
import { orderPlaces, usedNow } from "@/features/event/places";
import { WriteSheet } from "@/features/event/WriteSheet";
import { RequestSheet, type RequestTarget } from "@/features/media/RequestSheet";
import { SmButton } from "@/features/passionne/kit";
import { ApplySheet } from "@/features/provider/ApplySheet";
import { ReportButton } from "@/features/ReportSheet";
import { TicketsBlock } from "@/features/tickets/TicketsBlock";
import { WeatherWidget } from "@/features/WeatherWidget";
import { WithdrawSheet } from "@/features/WithdrawSheet";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { nowMs } from "@/lib/clock";
import { eventPreview, takePosterRect, takePrefetchedEvent } from "@/lib/eventPreview";
import { formatHour } from "@/lib/format";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";
import { DETAIL_BLOCKS, Waiting } from "@/ui/Waiting";

const { space1, space3 } = tokens.spacing;
const OPEN_STATUSES = ["pending", "accepted", "waitlisted", "offered", "awaiting_member"];

/** Lot M4 : le pavé J-x moutarde posé sur l'affiche (`.evcd`) : « J-6 » et « Sam. 24 oct. · 19 h », ou « En cours ». */
function Countdown({ event }: { event: Pick<EventCard, "startsAt" | "endsAt"> }) {
  const { t } = useTheme();
  const now = new Date(nowMs());
  if (now >= new Date(event.endsAt)) return null;
  const live = now >= new Date(event.startsAt);
  const day = withYear(
    new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Europe/Paris",
    }).format(new Date(event.startsAt)),
    event.startsAt,
    now,
  );
  return (
    <View style={[styles.cd, { backgroundColor: t.color.accent }]} testID="event-countdown">
      <View style={styles.cdIn}>
        <Text variant="numberNarrow" color={t.color.accentInk} style={styles.cdBig}>
          {live ? L.live : nearCountdown(event.startsAt, now)}
        </Text>
        <Text variant="label" color={t.color.accentInk} style={styles.cdSmall}>
          {live ? `Jusqu'à ${formatHour(event.endsAt)}` : `${day} · ${formatHour(event.startsAt)}`}
        </Text>
      </View>
    </View>
  );
}

export default function EventPage() {
  const { t } = useTheme();
  const router = useRouter();
  const {
    slug,
    candidater,
    jour,
    crew: crewParam,
  } = useLocalSearchParams<{
    slug: string;
    candidater?: string;
    jour?: string;
    crew?: string;
  }>();
  const { status, me, refreshMe } = useSession();
  const { persona, goTab } = usePersona();
  // Lot M3 : reprend la lecture partie au toucher de la carte (Explorer, carte), sinon la lance.
  const event = useApi(() => takePrefetchedEvent(slug) ?? api.eventBySlug(slug), [slug, status], {
    enabled: status !== "loading",
  });
  const e = event.data;
  // Lot M3 : la carte touchée (aperçu immédiat) et la place de son affiche (transition, une seule fois).
  // Tour 2 : suit le `slug` (fiche réutilisée pour un autre événement).
  const [opened, setOpened] = useState(() => ({ slug, preview: eventPreview(slug), from: takePosterRect(slug) }));
  if (opened.slug !== slug) setOpened({ slug, preview: eventPreview(slug), from: takePosterRect(slug) });
  const cardPreview = opened.preview;
  const posterFrom = opened.from;
  const reviews = useApi(() => api.eventReviews(slug), [slug, status], { enabled: status !== "loading" });
  // Météo du jour J (lot 28) : seulement dans les 7 jours avant l'événement ; jamais bloquante.
  const weather = useApi(() => api.eventWeather(slug), [slug], { enabled: status !== "loading" });
  // Fil de l'événement (lot 20) : public, enrichi pour les retenus (consignes, annonces réservées).
  const feed = useApi(() => api.eventAnnouncements(slug), [slug, status], { enabled: status !== "loading" });
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
  // La feuille de candidature (lot C2b). `?candidater=1` (retour de connexion, ancien lien `/candidater`) ne l'ouvre
  // que si l'action de la fiche le permet (candidater ou liste d'attente) : voir `candOpen` plus bas.
  // `?candidater=crew` l'ouvre en mode crew (page d'un crew, lien du site `/e/<slug>/crew`).
  const [cand, setCand] = useState<"solo" | "crew" | null>(null);
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (candidater && status === "in") setLinked(true);
  }, [candidater, status]);
  // Inscription en crew (lot 19, relecture C2b) : le chef d'un crew garde son entrée, même déjà candidat ou sans
  // véhicule, et le suivi de ses inscriptions (`/crew/inscription`).
  const crews = useApi(() => api.myCrews(), [status], { enabled: status === "in", cacheKey: "my-crews" });
  const leadsCrew = (crews.data ?? []).some((c) => c.role === "leader");
  const crewRegs = useApi(() => api.myCrewRegistrations(event.data?.id ?? ""), [event.data?.id, leadsCrew], {
    enabled: leadsCrew && Boolean(event.data),
  });
  const [applying, setApplying] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerSent, setProviderSent] = useState(false);
  const [booking, setBooking] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  // Lot M4 : « Écrire à » (✉ de la bande) et « Se retirer » (bloc « Ta place »).
  const [writing, setWriting] = useState(false);
  const [withdrawing, setWithdrawing] = useState<MyApplication | null>(null);
  // Tour 2 : la place a changé pendant la confirmation (offre acceptée ou expirée ailleurs).
  const [placeNotice, setPlaceNotice] = useState<string | null>(null);
  // Tour 2 : la place choisie quand il y en a plusieurs (jours, véhicules) ; sinon la plus utile maintenant.
  const [placeId, setPlaceId] = useState<string | null>(null);
  const applications = useApplications();
  // Lot R6c (R6.3, R6.4, R6.6) : « Qui y va », la feuille « Inviter du monde », le bandeau et le menu d'une invitation.
  const [inviting, setInviting] = useState(false);
  const [menuFrom, setMenuFrom] = useState<{ userId: string; pseudo: string }[] | null>(null);
  const shareable = Boolean(
    event.data &&
      status === "in" &&
      event.data.status === "published" &&
      event.data.admission !== "invite_only" &&
      new Date(event.data.endsAt).getTime() > nowMs(),
  );
  const going = useApi(() => api.followingGoing(event.data?.id ?? ""), [event.data?.id, status], {
    enabled: shareable,
  });
  const invited = useApi(() => api.invitationsReceived(event.data?.id ?? ""), [event.data?.id, status], {
    enabled: shareable,
  });

  const close = () => (router.canGoBack() ? router.back() : router.replace(status === "in" ? "/" : "/auth"));
  // Lot M4 : la bande de l'organisateur, en-tête fixe de la fiche (aussi pendant l'aperçu, sans les abonnés).
  const orgBar = (card: Pick<EventCard, "structure">, extra?: { onFollow: () => void; onWrite?: () => void }) => (
    <OrgBar
      name={card.structure.name}
      logoUrl={mediaSource(structure.data?.logoUrl ?? card.structure.logoUrl)?.uri ?? null}
      // Tour 2 (relecture Opus) : pas de ✓ « vérifiée » tant que la structure n'est pas lue (aperçu).
      verified={structure.data?.verified ?? false}
      followers={structure.data?.followersCount ?? null}
      following={following || Boolean(structure.data?.isFollowing)}
      busy={following && !structure.data?.isFollowing}
      onOpen={() => router.push(`/o/${card.structure.slug}`)}
      onFollow={extra?.onFollow ?? (() => undefined)}
      onWrite={extra?.onWrite}
    />
  );

  if (!e) {
    // Lot M3 : en attendant la réponse, la fiche est déjà là avec la carte de la liste (affiche, titre, format), et des
    // squelettes à la place du reste ; jamais d'écran vide. Sans carte connue (lien partagé), la tête en squelette.
    if (!event.error && cardPreview) {
      return (
        <PosterFlow
          hero={<EventHero event={cardPreview.card} from={posterFrom} underHeader />}
          band={orgBar(cardPreview.card)}
          heroFloat={<Countdown event={cardPreview.card} />}
          onClose={close}
          liftHero
          testID="event-page-preview"
        >
          <EventTitle event={cardPreview.card} />
          <Waiting blocks={DETAIL_BLOCKS} label="Chargement de l'événement" />
        </PosterFlow>
      );
    }
    if (!event.error) {
      return (
        <FlowScreen title="Événement" onClose={close}>
          <Waiting blocks={[320, ...DETAIL_BLOCKS]} label="Chargement de l'événement" testID="event-loading" />
        </FlowScreen>
      );
    }
    return (
      <FlowScreen title="Événement" onClose={close}>
        {event.error.code === "invite_only" ? (
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
        ) : (
          <Notice tone="error">
            {event.error.status === 404 ? "Cet événement n'existe pas ou plus." : event.error.message}
          </Notice>
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
  // La candidature personnelle est possible (bouton principal, liste d'attente, autre jour) ; sinon seul le mode crew.
  const otherDay =
    mine.length > 0 &&
    (e.days?.length ?? 0) > 1 &&
    e.dayAccess !== "whole" &&
    canApply &&
    !mine.some((a) => a.eventDayId === null);
  const soloOk = action === "apply" || action === "applyGuest" || gate === "full" || otherDay;
  const crewOk = leadsCrew && !cancelled && !e.isLocked && !notYetOpen && !inviteOnly && e.status !== "draft";
  const linkedMode: "solo" | "crew" | null = linked
    ? candidater === "crew"
      ? crewOk
        ? "crew"
        : null
      : soloOk
        ? "solo"
        : null
    : null;
  const candMode = cand ?? linkedMode;
  const closeCand = () => {
    setCand(null);
    setLinked(false);
  };
  const isFollowing = following || Boolean(structure.data?.isFollowing);
  // Lot M4 : la place de la personne (« Ta place »), d'après ses candidatures (cache d'abord, à jour en direct).
  // Tour 2 (relecture Codex) : l'accès qui sert maintenant d'abord (jour en cours, pas encore pointé), les autres au choix.
  const multiDay = (e.days?.length ?? 0) > 1;
  const placeNow = new Date(nowMs());
  const places = orderPlaces(applications.upcoming ?? [], e.id, placeNow, multiDay);
  const place = places.find((a) => a.id === placeId) ?? places[0] ?? null;
  const placeLabel = (a: MyApplication) =>
    multiDay ? (a.day ? formatDayDate(a.day.date) : eventDaysLabels.wholeEvent) : (a.vehicle?.label ?? L.myPlace);
  const placePhoto = place?.vehicle
    ? ((vehicles.data ?? []).find((v) => v.id === place.vehicle?.id)?.photos[0]?.url ?? null)
    : null;

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
      ? setCand("solo")
      : router.push({ pathname: "/auth", params: { mode: "signup", next: `/e/${e.slug}?candidater=1` } });

  const primary =
    action === "triage"
      ? {
          label: L.triage,
          icon: "cards" as const,
          onPress: () => router.push({ pathname: "/tri", params: { event: e.id } }),
        }
      : action === "apply"
        ? { label: L.apply, icon: "send" as const, onPress: apply }
        : action === "applyGuest"
          ? { label: L.apply, icon: "send" as const, onPress: apply }
          : action === "myApplication"
            ? place?.status === "accepted" && !usedNow(place, placeNow, multiDay)
              ? { label: L.myQr, icon: "qr" as const, onPress: () => router.push(`/jour-j/${place.id}`) }
              : { label: L.myApplication, icon: "ticket" as const, onPress: () => router.navigate("/sorties") }
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
      hero={<EventHero event={e} underHeader />}
      band={orgBar(e, {
        onFollow: () => void toggleFollow(),
        // Tour 2 : sans compte, ✉ mène à la connexion, comme « Suivre » (la feuille « Écrire à » demande un compte).
        onWrite:
          structure.data?.verified === false
            ? undefined
            : status === "in"
              ? () => setWriting(true)
              : () => router.push({ pathname: "/auth", params: { mode: "signup", next: `/e/${e.slug}` } }),
      })}
      heroFloat={<Countdown event={e} />}
      liftHero
      onClose={close}
      onRefresh={event.reload}
      overlays={
        <>
          {status === "in" ? <WriteSheet event={e} visible={writing} onClose={() => setWriting(false)} /> : null}
          <WithdrawSheet
            app={withdrawing}
            now={new Date(nowMs())}
            onClose={() => setWithdrawing(null)}
            onConfirm={async (a) => {
              try {
                // Tour 2 (relecture Codex) : une offre de place se refuse par `declineOffer`, que l'API vérifie sous
                // verrou ; acceptée entre-temps sur un autre appareil, elle n'est jamais désistée (ni malus).
                if (a.status === "offered") await api.declineOffer(a.id);
                else await api.withdraw(a.id);
              } catch (error) {
                // Conflit (offre acceptée ou expirée ailleurs) : la fiche se relit et dit pourquoi, la feuille se ferme.
                if (error instanceof ApiRequestError && error.status === 409) {
                  setWithdrawing(null);
                  setPlaceNotice("Ta place a changé entre-temps : la fiche est à jour, rien n'a été retiré.");
                  await Promise.all([applications.reload(), event.reload()]);
                  return;
                }
                throw error;
              }
              setPlaceNotice(null);
              setWithdrawing(null);
              await Promise.all([applications.reload(), event.reload()]);
            }}
          />
          <CandSheet
            event={e}
            visible={candMode !== null}
            mode={candMode ?? "solo"}
            soloAllowed={soloOk}
            crewSlug={crewParam}
            initialDay={jour}
            alreadyFollowing={isFollowing}
            onClose={closeCand}
            onSent={() => {
              void event.reload();
              void crewRegs.reload();
            }}
            onInvite={shareable ? () => setInviting(true) : undefined}
          />
          {shareable ? (
            <InviteSheet event={{ id: e.id, title: e.title }} visible={inviting} onClose={() => setInviting(false)} />
          ) : null}
          <InvitationMenu from={menuFrom} onClose={() => setMenuFrom(null)} onChanged={() => void invited.reload()} />
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
          <AppSheet visible={booking} onClose={() => setBooking(false)} accessibilityLabel={L.bookEntry}>
            <Text variant="title" color={t.color.ink}>
              {L.bookEntry}
            </Text>
            {booking ? <TicketsBlock slug={e.slug} eventId={e.id} /> : null}
          </AppSheet>
        </>
      }
      footer={footer}
      testID="event-page"
    >
      {e.status === "draft" ? (
        <Notice tone="error" testID="draft-preview">
          {wizardEndLabels.previewBanner}
        </Notice>
      ) : null}
      {shareable && invited.data ? (
        <InviteBanner
          invitation={invited.data}
          onMore={() => {
            // Tour 2 (relecture Opus 5) : le menu propose de couper chacun des auteurs.
            const all = invited.data?.inviters ?? [];
            if (all.length) setMenuFrom(all.map((i) => ({ userId: i.userId, pseudo: i.pseudo })));
          }}
        />
      ) : null}
      <EventTitle event={e} />
      {cancelled ? (
        <Notice tone="error">Cet événement est annulé.</Notice>
      ) : inviteOnly ? (
        <Notice>{invitationLabels.invitationRequired}</Notice>
      ) : null}
      {followError ? <Notice tone="error">{followError}</Notice> : null}
      {placeNotice ? (
        <Notice tone="error" testID="place-notice">
          {placeNotice}
        </Notice>
      ) : null}
      {places.length > 1 ? (
        <ChipRow>
          {places.map((a) => (
            <Chip key={a.id} selected={a.id === place?.id} onPress={() => setPlaceId(a.id)} accessibilityRole="radio">
              {placeLabel(a)}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
      {place ? (
        <MyPlace
          app={place}
          photoUrl={placePhoto}
          pseudo={me?.profile.pseudo ?? ""}
          now={new Date(nowMs())}
          onWithdraw={() => setWithdrawing(place)}
        />
      ) : null}
      <EventRows event={e} />
      {/* Lot R4b (maquette R4.3) : le plateau, sous les lignes Quand / Où / Places ; les prestataires présents l'ont rejoint. */}
      <LineupBlock eventId={e.id} slug={e.slug} />
      {/* Lot R6c (R6.3) : qui y va parmi ceux que je suis, et « Inviter du monde » (tout membre connecté, inscrit ou non). */}
      {shareable ? <WhoGoes going={going.data} onInvite={() => setInviting(true)} /> : null}
      <AdmissionTags event={e} />
      {weather.data ? <WeatherWidget summary={weather.data.summary} attribution={weather.data.attribution} /> : null}
      {e.customPosterUrl ? <CustomPoster url={e.customPosterUrl} structureName={e.structure.name} /> : null}

      {/* Lot 26 : candidater aussi pour un autre jour (accès par jour ou au choix). */}
      {otherDay ? (
        <Button variant="secondary" icon="calendar" fullWidth testID="apply-other-day" onPress={apply}>
          Candidater pour un autre jour
        </Button>
      ) : null}
      {/* Chef d'un crew : inscrire le crew (la feuille en mode crew), puis suivre les confirmations. */}
      {crewOk ? (
        <SmButton kind="s" big wide icon="staff" onPress={() => setCand("crew")} testID="register-crew">
          {crewLabels.registerCrew}
        </SmButton>
      ) : null}
      {leadsCrew && (crewRegs.data?.length ?? 0) > 0 ? (
        <SmButton
          kind="g"
          icon="list"
          onPress={() => router.push({ pathname: "/crew/inscription", params: { event: e.slug } })}
          testID="crew-registrations"
        >
          Suivre les inscriptions du crew
        </SmButton>
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
                  : ` · ${countFr(d.remaining, "place")}`}
            </Text>
          ))}
        </Plate>
      ) : null}
      {e.rulesText ? (
        <>
          <SecHead title={L.rules} />
          <Text variant="body" color={t.color.inkMuted} style={styles.rules} testID="event-rules">
            {e.rulesText}
          </Text>
        </>
      ) : null}
      {/* Lot 34 (parité D20) : billets du public réservés dans l'appli, comme sur la page du site. */}
      {!cancelled ? <TicketsBlock slug={e.slug} eventId={e.id} /> : null}
      {e.vendorTypes.length > 0 ? <Info label="Prestataires attendus">{e.vendorTypes.join(" · ")}</Info> : null}
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
      {/* Lot M4 : écrire à l'organisateur passe par le ✉ de la bande (avec le contexte de l'événement). */}
      {status === "in" ? <ReportButton look="link" type="event" id={e.id} /> : null}
      {reviews.data && (reviews.data.count > 0 || new Date(e.endsAt).getTime() <= nowMs()) ? (
        <Reviews data={reviews.data} reportable={status === "in"} />
      ) : null}
    </PosterFlow>
  );
}

const styles = StyleSheet.create({
  info: { gap: space1, padding: space3 },
  // `.evcd` : pavé moutarde penché de 8°, 42 px de haut, chiffres étroits 24 px.
  cd: { height: 42, paddingHorizontal: 10, borderRadius: 9, justifyContent: "center", transform: [{ skewX: "-8deg" }] },
  cdIn: { transform: [{ skewX: "8deg" }] },
  cdBig: { fontSize: 24, lineHeight: 22 },
  cdSmall: { fontSize: 9.5, lineHeight: 12 },
  rules: { fontSize: 14, lineHeight: 21.7 },
});
