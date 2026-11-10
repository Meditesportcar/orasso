// Accueil de l'exposant et du visiteur (lot 43 ; lot C2a : reconstruit d'après l'artefact DA v2 `s-home` ; lot M5 :
// haut fixe de la maquette 6.1). Pas de grand titre : la salutation en tient lieu. Puis, dans cet ordre et seulement :
// « Ta prochaine sortie » (les tickets qui glissent au doigt, avec leurs points : chaque sortie a son affiche en portrait,
// toucher = fiche de l'événement ; « Mon accès » et « Sur la carte » côte à côte ; ni Maps ni Waze ici, correction de
// Damien), la météo du jour J (`.wx`, carte à part), le rappel « Tu es staff » (exposant), « Autour du <département> ce
// mois-ci » en rail d'affiches avec une seule affiche sponsorisée en tête, l'incitation Passeport avec ses tampons.
// Retirés : « Tes autres sorties » (elles sont dans le glissement, lot M5), les blocs réglables et « Réorganiser »
// (l'accueil en widgets est gardé pour une mise à jour future), la tuile tuto, la carte « Termine ta fiche » (Mon profil).
// Les sorties viennent des candidatures gardées sur le téléphone (lisibles hors ligne) et des billets ; le reste vient de
// `GET /me/home?persona=`.

import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  defaultHomeWidgets,
  eventCountdownParts,
  type HomeData,
  type HomeFriendNews,
  type HomeNudgeKind,
  type HomeOuting,
  type HomeSponsored,
  type HomeSpotMeetup,
  type HomeWidgetId,
  homeBlockLabels,
  homeLabels,
  homeProfileLabels,
  homeWidgetOffered,
  type MyApplication,
  normalizeHomeWidgets,
  pickNextOutings,
  visibleHomeWidgets,
} from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { useMyPosition } from "@/features/explorer/useMyPosition";
import { AgendaWidget, FavoriteGarageWidget, NudgeCard, PendingWidget } from "@/features/home/HomeWidgets";
import { Stamp } from "@/features/passport/Stamp";
import { ApplicationTag, SkewTag } from "@/features/sorties/bits";
import { arrivalPhrase, liveApplications } from "@/features/sorties/model";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { formatDay, formatHour } from "@/lib/format";
import { cacheScope, cacheSetJson, kvGet, kvSet } from "@/lib/kv";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { SmButton } from "@/ui/Kit";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { autoOpenKey, isDayJ } from "./autoOpen";
import { Greet, Nudge, PosterRail, SecH, WeatherCard, WeatherPendingCard } from "./fanBlocks";
import { liveAccessHref, showsLocalCopy } from "./liveAccess";
import { NextOutings, type Outing } from "./NextOutings";
import { homeRail, scrubSpot, splitSponsored } from "./rail";
import { todayLine } from "./today";
import { WhatsNewBanner } from "./WhatsNewBanner";
import { FriendsNews } from "./widgets/FriendsNews";
import { LiveBlock, LiveLine } from "./widgets/Live";
import { Memories } from "./widgets/Memories";
import { MyCrew } from "./widgets/MyCrew";
import { MyOutings, outingsAt } from "./widgets/MyOutings";
import { SpotMeetup } from "./widgets/SpotMeetup";

const { space2, space3 } = tokens.spacing;
const fileUrl = (url: string | null | undefined) => mediaSource(url)?.uri ?? null;
/** Pendant un événement, l'Accueil relit ses chiffres (sur place, votes) à ce rythme, et au retour au premier plan. */
const LIVE_REFRESH_MS = 180_000;
/** Lot R8r : délai avant l'unique relecture de l'Accueil quand la météo du département se charge (premier chargement). */
const WEATHER_RETRY_MS = 5000;
const upper = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export function FanHome({ variant }: { variant: "exhibitor" | "visitor" }) {
  const { t } = useTheme();
  const router = useRouter();
  const { goTab } = usePersona();
  const now = useNow();
  const { me } = useSession();
  const { upcoming, offline, reload } = useApplications();
  const position = useMyPosition();
  const exhibitor = variant === "exhibitor";

  // Le sponsorisé ne vient que de la réponse fraîche de l'API (celle qui l'a compté) ; la réponse gardée dans le cache
  // n'en porte jamais (`splitSponsored`).
  const [sponsored, setSponsored] = useState<HomeSponsored | null>(null);
  // Lot R7i, tour 2 : idem pour le bloc « Au spot » (son lieu n'est jamais écrit dans le cache du téléphone).
  const [spot, setSpot] = useState<HomeSpotMeetup | null>(null);
  const [liveOn, setLiveOn] = useState(false);
  const home = useApi(
    () =>
      api.homeData({
        lat: position.position?.lat,
        lng: position.position?.lng,
        persona: exhibitor ? "fan" : "visitor",
        // Lot R7a2 : l'Accueil selon le réglage de la personne (blocs choisis, ordonnés, masqués ; un bloc masqué n'est pas
        // calculé par l'API ; le sponsorisé reste dans « Autour de moi »).
        blocks: "app",
      }),
    [position.position?.lat, position.position?.lng, variant],
    // Tour 3 : tant que « En cours » est affiché, l'Accueil se rafraîchit lui-même (option de `useApi` : suit l'écran affiché).
    {
      cacheKey: `home-${variant}`,
      refreshMs: liveOn ? LIVE_REFRESH_MS : undefined,
      // R7i, tour 4 : le sponsorisé et le lieu passent par les mêmes contrôles que `home.data` (écran vivant, même compte,
      // dernière lecture) : une ancienne réponse ne réaffiche jamais un lieu après une relecture plus récente.
      onFresh: (fresh) => {
        const parts = splitSponsored(fresh);
        setSponsored(parts.sponsored);
        setSpot(parts.spotMeetup);
      },
      keep: (fresh) => splitSponsored(fresh).cacheable,
    },
  );
  // Changement de compte, écran resté monté : ni sponsorisé ni lieu de l'ancien compte.
  const homeAccount = cacheScope();
  const previousHomeAccount = useRef(homeAccount);
  useEffect(() => {
    if (previousHomeAccount.current && previousHomeAccount.current !== homeAccount) {
      setSponsored(null);
      setSpot(null);
    }
    previousHomeAccount.current = homeAccount;
  }, [homeAccount]);
  // Une copie enregistrée avant le correctif peut porter un lieu : jamais affichée, et réécrite sans lui.
  const scrubbed = useMemo(() => (home.data ? scrubSpot(home.data) : null), [home.data]);
  const data: HomeData | null = scrubbed ?? home.data;
  const cacheKeyNow = `home-${variant}`;
  useEffect(() => {
    if (!scrubbed) return;
    void cacheSetJson(cacheKeyNow, scrubbed);
  }, [scrubbed, cacheKeyNow]);
  const staff = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });
  const passport = useApi(() => api.passport(), [], { cacheKey: "passport-home" });

  const live = liveApplications(upcoming);
  const myTickets = useApi(() => api.myTickets(), [], { cacheKey: "tickets-home" });
  // Exposant : la place retenue d'abord, sinon la candidature en cours (copie du téléphone si l'API n'a pas répondu).
  const localNext: MyApplication | undefined =
    live.find((a) => a.status === "accepted") ??
    live.find((a) => a.status === "pending" || a.status === "waitlisted" || a.status === "offered");
  const next = exhibitor ? (data?.nextAccess ?? localNext ?? null) : null;
  const ticket = exhibitor ? null : (data?.nextTicket ?? null);
  const nudge: HomeNudgeKind | null = data?.nudge ?? null;
  const profile = me?.profile;
  const name = profile?.firstName ?? profile?.pseudo ?? "";
  const department = profile?.departments[0];
  const staffNext = (staff.data ?? []).find((s) => new Date(s.event.endsAt) > now && s.presence !== "absent");
  const heroEvent = next?.event ?? ticket?.event ?? null;
  // Rail « Autour du 66 ce mois-ci » : les événements proches du mois qui vient, sans celui du premier ticket.
  const rail = homeRail(data?.nearby?.events ?? [], sponsored, heroEvent?.slug, now);
  const stamps = (passport.data?.pages ?? []).flatMap((p) => p.stamps).slice(-3);

  // D34 : le jour J, le QR d'accès (ou le billet) s'affiche d'office à l'ouverture de l'Accueil, une fois par jour et par
  // place (fermé, il ne revient pas en boucle ; il reste à un geste par le ticket).
  const todayTarget =
    next && next.status === "accepted" && !next.checkedInAt && isDayJ(next.event, next.day, now)
      ? { key: next.id, href: `/jour-j/${next.id}` }
      : ticket && isDayJ(ticket.event, null, now)
        ? { key: ticket.id, href: `/billet/${ticket.id}` }
        : null;
  const todayKey = todayTarget ? autoOpenKey(todayTarget.key, now) : null;
  const todayHref = todayTarget?.href ?? null;
  useFocusEffect(
    useCallback(() => {
      if (!todayKey || !todayHref) return;
      let cancelled = false;
      void kvGet(todayKey).then((seen) => {
        if (cancelled || seen) return;
        void kvSet(todayKey, "1");
        router.push(todayHref as never);
      });
      return () => {
        cancelled = true;
      };
    }, [todayKey, todayHref, router]),
  );

  function nudgeAction(kind: HomeNudgeKind) {
    if (kind === "add_vehicle") router.push("/vehicule/nouveau");
    else if (kind === "create_crew") router.push("/crew/nouveau");
    else goTab("profil");
  }

  const openEvent = (slug: string) => router.push(`/e/${slug}`);
  // « Sur la carte » = le plan (vocabulaire de Damien), sur cet événement précis (par son adresse, jamais par son titre :
  // homonymes possibles, et l'Explorer ne liste pas les événements sur invitation). L'API dit s'il est visible.
  const onMap = (slug: string) => () => router.push({ pathname: "/carte", params: { event: slug } } as never);

  // Lot R8e1 : la météo de chaque sortie est une ligne de sa carte ; « Météo de l'événement » masqué : aucune ligne.
  const outingWeather = (eventId: string | undefined) =>
    eventId && visibleHomeWidgets(normalizeHomeWidgets(data?.widgets ?? defaultHomeWidgets)).includes("event_weather")
      ? (data?.outingsWeather?.[eventId] ?? null)
      : null;

  /** Une candidature en ticket : son affiche, son statut, son arrivée, son geste. */
  const appOuting = (a: MyApplication): Outing => {
    const fromApi = data?.nextAccess?.id === a.id ? data.nextAccess : null;
    const arrival = arrivalPhrase(fromApi?.arrival ?? a.arrival ?? null);
    const accepted = a.status === "accepted";
    return {
      key: `app-${a.id}`,
      title: a.event.title,
      startsAt: a.event.startsAt,
      countdown: eventCountdownParts(a.event, now).lead,
      countdownDetail: eventCountdownParts(a.event, now).detail,
      posterUrl: fileUrl(fromApi?.posterUrl ?? a.event.posterUrl ?? null),
      tags: (
        <>
          <ApplicationTag app={a} onPoster />
          {a.zone ? <SkewTag onPoster>{`Zone ${a.zone.code}`}</SkewTag> : null}
        </>
      ),
      lines: [
        ...(arrival ? [{ icon: "wait" as const, text: upper(arrival) }] : []),
        ...(a.status === "waitlisted" ? [{ icon: "bell" as const, text: homeProfileLabels.waitlistLine }] : []),
        ...(a.event.city ? [{ icon: "place" as const, text: a.event.city }] : []),
      ],
      // D34 : le QR se consulte dès la validation ; une candidature pas encore retenue renvoie à son ticket de Sorties.
      action: accepted
        ? {
            kind: "access",
            label: homeProfileLabels.myAccess,
            icon: "qr",
            onPress: () => router.push(`/jour-j/${a.id}`),
            testID: "home-hero-action",
          }
        : a.status === "waitlisted"
          ? null
          : {
              kind: "secondary",
              label: homeProfileLabels.myApplication,
              icon: "ticket",
              onPress: () => goTab("sorties"),
              testID: "home-outing-application",
            },
      weather: accepted ? outingWeather(a.event.id) : null,
      onMap: accepted ? onMap(a.event.slug) : null,
      onOpen: () => openEvent(a.event.slug),
    };
  };

  // Les cartes du glissement : la règle commune `pickNextOutings` (la même que l'API pour savoir de quels événements envoyer la
  // météo) ; ici on y met les données de chaque carte. Un billet n'est caché que si une place retenue donne déjà un accès au
  // même événement ; en attente ou en liste d'attente, le billet reste, c'est lui qui fait entrer.
  const apps = next ? [next, ...live.filter((a) => a.id !== next.id)] : live;
  const ticketOuting = (x: {
    id: string;
    priceCents: number | null;
    event: {
      id?: string;
      slug: string;
      title: string;
      startsAt: string;
      endsAt: string;
      city: string | null;
      posterUrl?: string | null;
    };
    posterUrl?: string | null;
    arrivalText?: string | null;
  }): Outing => ({
    key: `ticket-${x.id}`,
    title: x.event.title,
    startsAt: x.event.startsAt,
    countdown: eventCountdownParts(x.event, now).lead,
    countdownDetail: eventCountdownParts(x.event, now).detail,
    posterUrl: fileUrl(x.posterUrl ?? x.event.posterUrl ?? null),
    tags: (
      <>
        <SkewTag tone="acc" onPoster>
          Billet
        </SkewTag>
        <SkewTag onPoster>{x.priceCents == null ? "Entrée gratuite" : "Entrée payante"}</SkewTag>
      </>
    ),
    lines: [
      ...(x.arrivalText ? [{ icon: "wait" as const, text: x.arrivalText }] : []),
      ...(x.event.city ? [{ icon: "place" as const, text: x.event.city }] : []),
    ],
    action: {
      kind: "access",
      label: homeProfileLabels.myTicket,
      icon: "qr",
      onPress: () => router.push(`/billet/${x.id}`),
      testID: "home-hero-action",
    },
    weather: outingWeather(x.event.id),
    onMap: onMap(x.event.slug),
    onOpen: () => openEvent(x.event.slug),
  });
  const myTicketList = myTickets.data ?? [];
  const ticketInputs = [
    ...myTicketList,
    // Le billet de l'API (visiteur) compte même avant la liste de mes billets (copie du téléphone, première lecture).
    ...(ticket && !myTicketList.some((x) => x.id === ticket.id)
      ? [{ id: ticket.id, status: "valid", event: { ...ticket.event, id: ticket.event.id ?? ticket.event.slug } }]
      : []),
  ];
  const picked = pickNextOutings({
    applications: upcoming ?? [],
    tickets: ticketInputs,
    exhibitor,
    now,
  });
  const appById = new Map(apps.map((a) => [a.id, a]));
  const ticketById = new Map(myTicketList.map((x) => [x.id, x]));
  const shown: Outing[] = picked.flatMap((card): Outing[] => {
    if (card.kind === "application") {
      const a = appById.get(card.id);
      return a ? [appOuting(a)] : [];
    }
    if (ticket?.id === card.id) {
      return [
        ticketOuting({
          ...ticket,
          arrivalText: ticket.arrival
            ? upper(arrivalPhrase(ticket.arrival) ?? "")
            : homeProfileLabels.publicOpening(formatHour(ticket.event.startsAt)),
        }),
      ];
    }
    const x = ticketById.get(card.id);
    return x ? [ticketOuting(x)] : [];
  });

  // Météo : celle du département (« Chez toi, aujourd'hui »). Celle de l'événement est une ligne de sa carte (lot R8e1) ; une
  // copie gardée avant ce lot peut porter l'ancienne météo « jour J » : jamais affichée ici.
  const weather = data?.weather?.kind === "place" ? data.weather : null;
  const weatherPlace = department ? `Dép. ${department}` : null;
  // Lot R8r : premier chargement (stock vide, rafraîchissement en cours) : « Météo en cours de chargement », puis une seule
  // relecture de l'Accueil quelques secondes plus tard, sans bloquer l'écran ; sans météo à ce moment-là, le bloc s'efface.
  const weatherPending = !weather && data?.weatherPending === true;
  const [weatherRetried, setWeatherRetried] = useState(false);

  // --- Lot R7a2 : l'Accueil « tableau de bord » : les blocs dans l'ordre réglé par la personne -------------------------------
  const widgets = normalizeHomeWidgets(data?.widgets ?? defaultHomeWidgets);
  const order = visibleHomeWidgets(widgets).filter((id) => id !== "next_access" && homeWidgetOffered(id));
  // Tour 2 : « En cours » s'arrête à la fin de l'événement sur l'horloge de l'appareil, même si la dernière réponse (ou le cache
  // du téléphone) l'annonce encore ; et il se rafraîchit tant qu'il est affiché.
  const liveNow = data?.live && new Date(data.live.event.endsAt) > now ? data.live : null;
  const myOutings = data?.myOutings ? outingsAt(data.myOutings, now) : null;
  const reloadHome = useRef(home.reload);
  reloadHome.current = home.reload;
  useEffect(() => {
    if (!weatherPending || weatherRetried) return undefined;
    const timer = setTimeout(() => {
      setWeatherRetried(true);
      void reloadHome.current();
    }, WEATHER_RETRY_MS);
    return () => clearTimeout(timer);
  }, [weatherPending, weatherRetried]);
  const liveShown = liveNow !== null;
  useEffect(() => {
    setLiveOn(liveShown);
    if (!liveShown) return undefined;
    // Retour de l'appli au premier plan : relecture tout de suite (le minuteur, lui, est celui de `useApi`).
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reloadHome.current();
    });
    return () => sub.remove();
  }, [liveShown]);
  // La copie du téléphone est montrée avant la première réponse et après une lecture ratée (réseau ou serveur).
  const homeCopy = showsLocalCopy({
    hasData: home.data !== null,
    loading: home.loading,
    failed: home.error !== null,
    offline: home.offline,
  });
  const openPersonalize = () => router.push("/accueil-personnaliser" as never);

  // « Mon accès » de l'événement en cours : ma place retenue (QR), sinon mon billet (même contrôlé), sinon mes sorties ; rien si je
  // ne suis là que par présence (`hasPlace`, comme sur le site).
  const liveAccess = liveAccessHref(liveNow, live, myTickets.data ?? []);
  const openOuting = (o: HomeOuting) => openEvent(o.slug);
  const openNews = (n: HomeFriendNews) => {
    if (n.target?.type === "event") openEvent(n.target.slug);
    else if (n.target?.type === "vehicle") router.push(`/v/${n.target.id}` as never);
    else goTab("fil");
  };

  /** « Prochaine sortie » : les tickets, ou la ligne « En cours » pendant l'événement, ou l'invitation à en trouver une. */
  const nextBlock: ReactNode =
    liveNow && order.includes("live") ? (
      <LiveLine
        live={liveNow}
        onAccess={liveAccess ? () => router.push(liveAccess as never) : null}
        onSheet={() => openEvent(liveNow.event.slug)}
        weather={outingWeather(liveNow.event.id)}
      />
    ) : shown.length > 0 ? (
      <NextOutings
        outings={shown}
        header={(page, count) => (
          <SecH
            title={homeProfileLabels.nextOuting}
            meta={count > 1 ? homeProfileLabels.outingOf(page + 1, count) : undefined}
            testID="home-next-head"
          />
        )}
      />
    ) : exhibitor && nudge === "add_vehicle" ? (
      <NudgeCard kind={nudge} primary onAction={() => nudgeAction(nudge)} />
    ) : (
      <Plate style={styles.lead} testID="home-lead">
        <Text variant="posterM" color={t.color.plateInk}>
          Trouve ton prochain événement
        </Text>
        <Text variant="body" color={t.color.plateMuted}>
          {exhibitor
            ? "Rassemblements, expositions, cars & coffee : candidate avec l'un de tes véhicules."
            : "Réserve ton entrée gratuite à un événement : ton billet apparaîtra ici."}
        </Text>
        <Button variant="primary" icon="explore" onPress={() => goTab("explorer")} fullWidth>
          {homeLabels.explore}
        </Button>
      </Plate>
    );

  const widgetBlocks: Partial<Record<HomeWidgetId, ReactNode>> = {
    live: liveNow ? (
      <LiveBlock
        live={liveNow}
        offline={homeCopy}
        onVote={() =>
          router.push(`/votes/${liveNow.event.id}?titre=${encodeURIComponent(liveNow.event.title)}` as never)
        }
      />
    ) : null,
    my_outings: myOutings ? (
      <MyOutings data={myOutings} onOpen={openOuting} onAll={() => router.push("/sorties" as never)} />
    ) : null,
    my_crew: data?.myCrew ? (
      <MyCrew
        data={data.myCrew}
        now={now}
        onOpenTab={() => goTab("crew")}
        onDiscussion={(id) => router.push(`/boite/${id}` as never)}
      />
    ) : null,
    friends_news: data?.friendsNews ? (
      <FriendsNews data={data.friendsNews} now={now} onOpen={openNews} onFeed={() => goTab("fil")} />
    ) : null,
    spot_meetup: spot ? <SpotMeetup data={spot} onOthers={() => goTab("fil")} /> : null,
    memories: data?.memories ? <Memories data={data.memories} /> : null,
    nearby: rail.visible ? (
      <>
        <SecH
          title={department ? homeProfileLabels.aroundThisMonth(department) : homeProfileLabels.aroundThisMonthNoPlace}
          link={homeProfileLabels.exploreLink}
          onLink={() => goTab("explorer")}
        />
        <PosterRail
          events={rail.events}
          onOpen={openEvent}
          sponsored={rail.sponsored}
          onSponsored={(s) => {
            void api.sponsoredClick(s.id, "home").catch(() => undefined);
            if (/^https?:\/\//i.test(s.linkUrl)) void Linking.openURL(s.linkUrl).catch(() => undefined);
          }}
        />
      </>
    ) : null,
    weather: weather ? (
      <WeatherCard weather={weather} place={weatherPlace} />
    ) : weatherPending && !weatherRetried ? (
      <WeatherPendingCard place={weatherPlace} />
    ) : null,
    agenda: data && data.agenda.length > 0 ? <AgendaWidget items={data.agenda} /> : null,
    favorite_garage: data?.favoriteGarage ? <FavoriteGarageWidget garage={data.favoriteGarage} /> : null,
    pending: data && data.pendingStatuses.length > 0 ? <PendingWidget items={data.pendingStatuses} /> : null,
  };

  return (
    <TabScreen
      onRefresh={async () => {
        await Promise.all([reload(), home.reload(), staff.reload(), passport.reload(), myTickets.reload()]);
      }}
    >
      {offline ? <Notice>Hors ligne : voici ce que ton téléphone a gardé.</Notice> : null}

      <Greet
        line={todayLine(now, department ? `Dép. ${department}` : null)}
        name={name}
        onPersonalize={openPersonalize}
      />

      {/* Lot R7a1 : « où sont passées les choses », une seule fois après la mise à jour, sous le bonjour (maquette R7.1). */}
      <WhatsNewBanner variant={variant} />

      {nextBlock}

      {home.error && !data ? <Notice>{homeLabels.loadFailed}</Notice> : null}

      {exhibitor && staffNext ? (
        <Nudge
          label={homeProfileLabels.staffNudge}
          text={staffNext.event.title}
          caption={`${formatDay(staffNext.event.startsAt)} · ${homeProfileLabels.staffModeEve}`}
          icon="staff"
          testID="home-staff-nudge"
          onPress={() => goTab("sorties")}
        />
      ) : null}

      {order.map((id) => {
        const block = widgetBlocks[id];
        // Les blocs sont des enfants directs de l'écran : l'écart entre sections est celui de l'écran (comme avant).
        return block ? <Fragment key={id}>{block}</Fragment> : null;
      })}

      {data?.stampsThisSeason !== null && data?.stampsThisSeason !== undefined ? (
        <Nudge
          label={homeProfileLabels.passportTitle}
          text={`${homeProfileLabels.passportTile(data.stampsThisSeason)}. ${homeProfileLabels.passportNext}`}
          trailing={
            stamps.length > 0 ? (
              <View style={styles.stamps}>
                {stamps.map((s, i) => (
                  <View key={s.id} style={i > 0 ? styles.stampOver : null}>
                    <Stamp stamp={s} size={58} paper={t.color.surface} />
                  </View>
                ))}
              </View>
            ) : undefined
          }
          testID="home-passport"
          // Lot R7b1 : le passeport est l'onglet Sorties du Profil.
          onPress={() => goTab("passeport")}
        />
      ) : null}

      {/* « Personnaliser » aussi en bas (maquette R7.4) : un bouton au trait, jamais le bouton principal. */}
      <SmButton kind="s" icon="edit" wide onPress={openPersonalize} testID="home-personalize-bottom">
        {homeBlockLabels.personalize}
      </SmButton>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  lead: { gap: space2, padding: space3 },
  stamps: { flexDirection: "row" },
  stampOver: { marginLeft: -14 },
});
