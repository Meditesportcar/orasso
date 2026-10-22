// Accueil de l'exposant et du visiteur (lot 43 ; lot C2a : reconstruit d'après l'artefact DA v2 `s-home`). Pas de grand
// titre : la salutation en tient lieu. Puis, dans cet ordre et seulement : la carte du prochain événement
// (`.poster.hn`), la météo du jour J (`.wx`), « Tes autres sorties » en deux mini-tickets, le rappel « Tu es staff »
// (exposant), « Autour du <département> ce mois-ci » en rail d'affiches, l'incitation Passeport avec ses tampons.
// Retirés de l'Accueil (audit § 5.2, « chaque fonction à un seul endroit ») : blocs réglables et « Réorganiser »
// (agenda = Sorties ; garage favori, lavage, carburant = Explorer › Pros), emplacement sponsorisé, tuile tuto,
// carte « Termine ta fiche » (Mon profil seulement), bouton « Explorer les événements » (lien du rail).
// La carte et les sorties viennent des candidatures gardées sur le téléphone (lisibles hors ligne) ; le reste vient de
// `GET /me/home?persona=`.

import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type HomeData,
  type HomeNudgeKind,
  type HomeOrganizer,
  homeLabels,
  homeProfileLabels,
  type MyApplication,
} from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
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
import { Greet, MiniStrip, MiniTicket, Nudge, PosterRail, SecH, WeatherCard } from "./fanBlocks";
import { HeroCard } from "./parts";
import { todayLine } from "./today";

const { space2, space3 } = tokens.spacing;
const fileUrl = (url: string | null | undefined) => mediaSource(url)?.uri ?? null;
/** Le logo de la structure vient aussi de l'API (URL relative). */
const withLogo = (o: HomeOrganizer | null) => (o ? { ...o, logoUrl: fileUrl(o.logoUrl) } : null);
const MONTH_MS = 31 * 24 * 3600 * 1000;
const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  timeZone: "Europe/Paris",
});

export function FanHome({ variant }: { variant: "exhibitor" | "visitor" }) {
  const { t } = useTheme();
  const router = useRouter();
  const { goTab } = usePersona();
  const now = useNow();
  const { me } = useSession();
  const { upcoming, offline, reload } = useApplications();
  const position = useMyPosition();
  const exhibitor = variant === "exhibitor";

  const home = useApi(
    () =>
      api.homeData({
        lat: position.position?.lat,
        lng: position.position?.lng,
        persona: exhibitor ? "fan" : "visitor",
      }),
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
  // « Tes autres sorties » : deux mini-tickets (artefact `.stat-strip`), sans la sortie de la carte.
  // (ni un billet pour l'événement de la carte : l'exposant retenu qui a aussi un billet ne le voit pas deux fois).
  const heroSlug = next?.event.slug ?? ticket?.event.slug;
  const otherTickets = ticketsUpcoming(myTickets.data ?? [], now).filter(
    (x) => x.id !== ticket?.id && x.event.slug !== heroSlug,
  );
  const others = [
    ...live
      .filter((a) => a.id !== next?.id)
      .map((a) => ({ key: a.id, kind: "app" as const, app: a, startsAt: a.event.startsAt })),
    ...otherTickets.map((x) => ({ key: x.id, kind: "ticket" as const, ticket: x, startsAt: x.event.startsAt })),
  ]
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 2);
  const nudge: HomeNudgeKind | null = data?.nudge ?? null;
  const profile = me?.profile;
  const name = profile?.firstName ?? profile?.pseudo ?? "";
  const department = profile?.departments[0];
  const staffNext = (staff.data ?? []).find((s) => new Date(s.event.endsAt) > now && s.presence !== "absent");
  const heroEvent = next?.event ?? ticket?.event ?? null;
  // Rail « Autour du 66 ce mois-ci » : les événements proches du mois qui vient, sans celui de la carte.
  const rail = (data?.nearby?.events ?? [])
    .filter((e) => e.slug !== heroEvent?.slug)
    .filter((e) => new Date(e.startsAt).getTime() - now.getTime() < MONTH_MS)
    .slice(0, 8);
  const stamps = (passport.data?.pages ?? []).flatMap((p) => p.stamps).slice(-3);

  // D34 : le jour J, le QR d'accès (ou le billet) s'affiche d'office à l'ouverture de l'Accueil, une fois par jour et par
  // place (fermé, il ne revient pas en boucle ; il reste à un geste par la carte et l'accès flottant).
  const todayTarget =
    next && next.status === "accepted" && !next.checkedInAt && dayCountdown(next.event.startsAt, now) === "Aujourd'hui"
      ? { key: next.id, href: `/jour-j/${next.id}` }
      : ticket && dayCountdown(ticket.event.startsAt, now) === "Aujourd'hui"
        ? { key: ticket.id, href: `/billet/${ticket.id}` }
        : null;
  const todayKey = todayTarget ? `jourj-auto:${todayTarget.key}:${now.toISOString().slice(0, 10)}` : null;
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

  const hero = next ? (
    <HeroCard
      // Les fichiers de l'API sont relatifs à son hôte (`mediaSource`).
      photoUrl={data?.nextAccess?.id === next.id ? fileUrl(data.nextAccess.photoUrl) : null}
      posterUrl={data?.nextAccess?.id === next.id ? fileUrl(data.nextAccess.posterUrl) : null}
      startsAt={next.event.startsAt}
      countdown={dayCountdown(next.event.startsAt, now)}
      hourLabel={homeProfileLabels.openingAt(formatHour(next.event.startsAt))}
      title={next.event.title}
      tags={
        <>
          <ApplicationTag app={next} onPoster />
          {next.zone ? <SkewTag onPoster>{`Zone ${next.zone.code}`}</SkewTag> : null}
        </>
      }
      organizer={withLogo(
        next.organizer ?? (data?.nextAccess?.id === next.id ? data.nextAccess.organizer : null) ?? null,
      )}
      meta={[
        ...(next.event.city ? [{ icon: "place" as const, text: next.event.city }] : []),
        ...(arrivalPhrase(next.arrival)
          ? [{ icon: "wait" as const, text: arrivalPhrase(next.arrival)?.replace(/^./, (c) => c.toUpperCase()) ?? "" }]
          : []),
      ]}
      // D34 : le QR se consulte dès la validation ; une candidature pas encore retenue renvoie à son ticket.
      action={
        next.status === "accepted"
          ? { label: homeProfileLabels.myAccess, icon: "qr", onPress: () => router.push(`/jour-j/${next.id}`) }
          : { label: homeLabels.seeAccess, icon: "ticket", onPress: () => goTab("sorties") }
      }
      destination={{
        lat: data?.nextAccess?.location?.lat ?? null,
        lng: data?.nextAccess?.location?.lng ?? null,
        addressLine: data?.nextAccess?.location?.addressLine,
        city: next.event.city,
        title: next.event.title,
      }}
      onMap={() => router.push(`/e/${next.event.slug}`)}
    />
  ) : ticket ? (
    <HeroCard
      photoUrl={fileUrl(ticket.photoUrl)}
      posterUrl={fileUrl(ticket.posterUrl)}
      startsAt={ticket.event.startsAt}
      countdown={dayCountdown(ticket.event.startsAt, now)}
      hourLabel={homeProfileLabels.openingAt(formatHour(ticket.event.startsAt))}
      title={ticket.event.title}
      tags={
        <>
          <SkewTag tone="acc" onPoster>
            Billet
          </SkewTag>
          <SkewTag onPoster>
            {ticket.priceCents == null ? "Entrée public · gratuite" : "Entrée public · payante"}
          </SkewTag>
        </>
      }
      organizer={withLogo(ticket.organizer)}
      meta={[
        ...(ticket.event.city ? [{ icon: "place" as const, text: ticket.event.city }] : []),
        {
          icon: "wait",
          text: ticket.arrival
            ? (arrivalPhrase(ticket.arrival) ?? "").replace(/^./, (c) => c.toUpperCase())
            : homeProfileLabels.publicOpening(formatHour(ticket.event.startsAt)),
        },
      ]}
      action={{ label: homeProfileLabels.myTicket, icon: "qr", onPress: () => router.push(`/billet/${ticket.id}`) }}
      destination={{
        lat: ticket.location?.lat ?? null,
        lng: ticket.location?.lng ?? null,
        addressLine: ticket.location?.addressLine,
        city: ticket.event.city,
        title: ticket.event.title,
      }}
      onMap={() => router.push(`/e/${ticket.event.slug}`)}
    />
  ) : null;

  // Météo : celle du jour J de la carte (lieu, jour et heure), sinon celle du département.
  const weather = data?.weather ?? null;
  const weatherWhen =
    weather?.kind === "event"
      ? DAY_FMT.format(new Date(weather.event.startsAt)).replace(/ (?:à )?(\d+) h$/, " à $1 h")
      : null;
  const weatherPlace = weather?.kind === "event" ? (heroEvent?.city ?? null) : department ? `Dép. ${department}` : null;

  return (
    <TabScreen
      onRefresh={async () => {
        await Promise.all([reload(), home.reload(), staff.reload(), passport.reload(), myTickets.reload()]);
      }}
    >
      {offline ? <Notice>Hors ligne : voici ce que ton téléphone a gardé.</Notice> : null}

      <Greet line={todayLine(now, department ? `Dép. ${department}` : null)} name={name} />

      {hero ??
        (exhibitor && nudge === "add_vehicle" ? (
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
        ))}

      {home.error && !data ? <Notice>{homeLabels.loadFailed}</Notice> : null}

      {weather ? <WeatherCard weather={weather} place={weatherPlace} when={weatherWhen} /> : null}

      {others.length > 0 ? (
        <>
          <SecH
            title={homeProfileLabels.otherOutings}
            link={homeProfileLabels.seeAll}
            onLink={() => goTab("sorties")}
          />
          <MiniStrip>
            {others.map((o) =>
              o.kind === "app" ? (
                <MiniTicket
                  key={o.key}
                  testID="home-other-outing"
                  tag={<ApplicationTag app={o.app} short />}
                  title={o.app.event.title}
                  caption={`${formatDay(o.app.event.startsAt)}${o.app.status === "waitlisted" ? " · si une place se libère" : ""}`}
                  onPress={() => goTab("sorties")}
                />
              ) : (
                <MiniTicket
                  key={o.key}
                  testID="home-other-outing"
                  tag={<SkewTag tone="acc">Billet</SkewTag>}
                  title={o.ticket.event.title}
                  caption={`${formatDay(o.ticket.event.startsAt)} · ${o.ticket.priceCents == null ? "entrée libre, réservée" : "entrée réservée"}`}
                  onPress={() => goTab("sorties")}
                />
              ),
            )}
            {others.length === 1 ? <View style={styles.fill} /> : null}
          </MiniStrip>
        </>
      ) : null}

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

      {rail.length > 0 ? (
        <>
          <SecH
            title={
              department ? homeProfileLabels.aroundThisMonth(department) : homeProfileLabels.aroundThisMonthNoPlace
            }
            link={homeProfileLabels.exploreLink}
            onLink={() => goTab("explorer")}
          />
          <PosterRail events={rail} onOpen={(slug) => router.push(`/e/${slug}`)} />
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
  fill: { flex: 1 },
  lead: { gap: space2, padding: space3 },
  stamps: { flexDirection: "row" },
  stampOver: { marginLeft: -14 },
});
