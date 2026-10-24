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
  type HomeData,
  type HomeNudgeKind,
  type HomeSponsored,
  homeLabels,
  homeProfileLabels,
  type MyApplication,
  withYear,
} from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useMyPosition } from "@/features/explorer/useMyPosition";
import { NudgeCard } from "@/features/home/HomeWidgets";
import { Stamp } from "@/features/passport/Stamp";
import { ApplicationTag, SkewTag } from "@/features/sorties/bits";
import { arrivalPhrase, liveApplications, ticketsUpcoming } from "@/features/sorties/model";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { dayCountdown, formatDay, formatHour } from "@/lib/format";
import { kvGet, kvSet } from "@/lib/kv";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { autoOpenKey, isDayJ } from "./autoOpen";
import { Greet, Nudge, PosterRail, SecH, WeatherCard } from "./fanBlocks";
import { NextOutings, type Outing } from "./NextOutings";
import { homeRail, splitSponsored } from "./rail";
import { todayLine } from "./today";

const { space2, space3 } = tokens.spacing;
const fileUrl = (url: string | null | undefined) => mediaSource(url)?.uri ?? null;
const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});
const HOUR_FMT = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", timeZone: "Europe/Paris" });
/** « samedi 17 octobre à 19 h » ; lot R3b, tour 2 : « … 17 octobre 2027 à 19 h » hors de l'année en cours. */
const weatherDay = (iso: string) => {
  const at = new Date(iso);
  return `${withYear(DAY_FMT.format(at), at)} à ${HOUR_FMT.format(at).replace(/\s*h$/, "")} h`;
};
/** Tickets dans le glissement, au plus. */
const MAX_OUTINGS = 6;
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
  const home = useApi(
    async () => {
      const fresh = await api.homeData({
        lat: position.position?.lat,
        lng: position.position?.lng,
        persona: exhibitor ? "fan" : "visitor",
        // Lot C2a : l'Accueil v2 (météo et rail toujours ; ni lavage ni carburant ; le sponsorisé dans le rail).
        blocks: "v2",
      });
      const parts = splitSponsored(fresh);
      setSponsored(parts.sponsored);
      return parts.cacheable;
    },
    [position.position?.lat, position.position?.lng, variant],
    { cacheKey: `home-${variant}` },
  );
  const data: HomeData | null = home.data;
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

  /** Une candidature en ticket : son affiche, son statut, son arrivée, son geste. */
  const appOuting = (a: MyApplication): Outing => {
    const fromApi = data?.nextAccess?.id === a.id ? data.nextAccess : null;
    const arrival = arrivalPhrase(fromApi?.arrival ?? a.arrival ?? null);
    const accepted = a.status === "accepted";
    return {
      key: `app-${a.id}`,
      title: a.event.title,
      startsAt: a.event.startsAt,
      countdown: dayCountdown(a.event.startsAt, now),
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
      onMap: accepted ? onMap(a.event.slug) : null,
      onOpen: () => openEvent(a.event.slug),
    };
  };

  // Les sorties du glissement : la prochaine (place retenue d'abord) puis les autres par date. Un billet n'est caché que
  // si une place retenue donne déjà un accès au même événement (lot M5, tour 2) : en attente ou en liste d'attente, le
  // billet reste, c'est lui qui fait entrer.
  const apps = next ? [next, ...live.filter((a) => a.id !== next.id)] : live;
  const accessSlugs = new Set(apps.filter((a) => a.status === "accepted").map((a) => a.event.slug));
  const tickets = ticketsUpcoming(myTickets.data ?? [], now).filter(
    (x) => x.id !== ticket?.id && !accessSlugs.has(x.event.slug),
  );
  const ticketOuting = (x: {
    id: string;
    priceCents: number | null;
    event: { slug: string; title: string; startsAt: string; city: string | null; posterUrl?: string | null };
    posterUrl?: string | null;
    arrivalText?: string | null;
  }): Outing => ({
    key: `ticket-${x.id}`,
    title: x.event.title,
    startsAt: x.event.startsAt,
    countdown: dayCountdown(x.event.startsAt, now),
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
    onMap: onMap(x.event.slug),
    onOpen: () => openEvent(x.event.slug),
  });
  const outings: Outing[] = [
    ...(ticket
      ? [
          ticketOuting({
            ...ticket,
            arrivalText: ticket.arrival
              ? upper(arrivalPhrase(ticket.arrival) ?? "")
              : homeProfileLabels.publicOpening(formatHour(ticket.event.startsAt)),
          }),
        ]
      : []),
    ...[
      ...apps.slice(next ? 1 : 0).map((a) => ({ startsAt: a.event.startsAt, o: appOuting(a) })),
      ...tickets.map((x) => ({ startsAt: x.event.startsAt, o: ticketOuting(x) })),
    ]
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .map((x) => x.o),
  ];
  if (next) outings.unshift(appOuting(next));
  const shown = outings.slice(0, MAX_OUTINGS);

  // Météo : celle du jour J de la prochaine sortie (lieu, jour et heure), sinon celle du département.
  const weather = data?.weather ?? null;
  const weatherWhen = weather?.kind === "event" ? weatherDay(weather.event.startsAt) : null;
  const weatherPlace = weather?.kind === "event" ? (heroEvent?.city ?? null) : department ? `Dép. ${department}` : null;

  return (
    <TabScreen
      onRefresh={async () => {
        await Promise.all([reload(), home.reload(), staff.reload(), passport.reload(), myTickets.reload()]);
      }}
    >
      {offline ? <Notice>Hors ligne : voici ce que ton téléphone a gardé.</Notice> : null}

      <Greet line={todayLine(now, department ? `Dép. ${department}` : null)} name={name} />

      {shown.length > 0 ? (
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
      )}

      {home.error && !data ? <Notice>{homeLabels.loadFailed}</Notice> : null}

      {weather ? <WeatherCard weather={weather} place={weatherPlace} when={weatherWhen} /> : null}

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

      {rail.visible ? (
        <>
          <SecH
            title={
              department ? homeProfileLabels.aroundThisMonth(department) : homeProfileLabels.aroundThisMonthNoPlace
            }
            link={homeProfileLabels.exploreLink}
            onLink={() => goTab("explorer")}
          />
          <PosterRail
            events={rail.events}
            onOpen={openEvent}
            sponsored={rail.sponsored}
            onSponsored={(s) => {
              void api.sponsoredClick(s.id).catch(() => undefined);
              if (/^https?:\/\//i.test(s.linkUrl)) void Linking.openURL(s.linkUrl).catch(() => undefined);
            }}
          />
        </>
      ) : null}

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
          // Le visiteur a son onglet Passeport ; l'exposant ouvre l'écran (lot 50).
          onPress={() => (exhibitor ? router.push("/mon-passeport") : goTab("passeport"))}
        />
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  lead: { gap: space2, padding: space3 },
  stamps: { flexDirection: "row" },
  stampOver: { marginLeft: -14 },
});
