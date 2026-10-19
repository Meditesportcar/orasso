// Accueil de l'exposant et du visiteur (lot 43, prototype `s-home`) : une salutation, la carte du prochain événement
// (affiche en fond, compte à rebours en contour, organisateur, arrivée, Mon accès ou Mon billet, itinéraires), puis les
// blocs réglables dans l'ordre choisi (météo du jour J, autres sorties, autour de moi, agenda, garage favori, lavage,
// carburant), le rappel « Tu es staff », la tuile Passeport. Un emplacement sponsorisé (même apparence, mention
// « Sponsorisé ») et une seule incitation à la fois. Appui long sur un bloc : feuille « Réorganiser ».
// La carte, les compteurs et les sorties viennent des candidatures gardées sur le téléphone (lisibles hors ligne) ;
// le reste vient de `GET /me/home?persona=`.

import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  defaultHomeWidgets,
  type HomeData,
  type HomeNudgeKind,
  type HomeWidgetsConfig,
  homeLabels,
  homeProfileLabels,
  type MyApplication,
  visibleHomeWidgets,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable } from "react-native";
import { PendingCard } from "@/features/arrivee/PendingCard";
import { useMyPosition } from "@/features/explorer/useMyPosition";
import {
  AgendaWidget,
  FavoriteGarageWidget,
  NearbyWidget,
  NudgeCard,
  PlacesWidget,
  SponsoredCard,
} from "@/features/home/HomeWidgets";
import { ReorderSheet } from "@/features/home/ReorderSheet";
import { arrivalPhrase, liveApplications, ticketsUpcoming } from "@/features/sorties/model";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { dayCountdown, formatDay, formatHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { ApplicationStatusTag } from "@/ui/StatusTag";
import { Greeting, HeroCard, MiniTile, NoteTile, SectionHead, TutoTile, WeatherBlock } from "./parts";
import { todayLine } from "./today";

const { space2, space3 } = tokens.spacing;

export function FanHome({ variant }: { variant: "exhibitor" | "visitor" }) {
  const { t } = useTheme();
  const router = useRouter();
  const { goTab } = usePersona();
  const now = useNow();
  const { me } = useSession();
  const { upcoming, offline, reload } = useApplications();
  const position = useMyPosition();
  const [radius, setRadius] = useState<number | undefined>(undefined);
  const [reorder, setReorder] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const exhibitor = variant === "exhibitor";

  const home = useApi(
    () =>
      api.homeData({
        radiusKm: radius,
        lat: position.position?.lat,
        lng: position.position?.lng,
        persona: exhibitor ? "fan" : "visitor",
      }),
    [radius, position.position?.lat, position.position?.lng, variant],
    { cacheKey: `home-${variant}` },
  );
  const data: HomeData | null = home.data;
  const staff = useApi(() => api.staffEvents(), [], { cacheKey: "staff-events" });
  const widgets: HomeWidgetsConfig = data?.widgets ?? defaultHomeWidgets;

  const live = liveApplications(upcoming);
  const myTickets = useApi(() => api.myTickets(), [], { cacheKey: "tickets-home" });
  // Exposant : la place retenue d'abord, sinon la candidature en cours (copie du téléphone si l'API n'a pas répondu).
  const localNext: MyApplication | undefined =
    live.find((a) => a.status === "accepted") ??
    live.find((a) => a.status === "pending" || a.status === "waitlisted" || a.status === "offered");
  const next = exhibitor ? (data?.nextAccess ?? localNext ?? null) : null;
  const ticket = exhibitor ? null : (data?.nextTicket ?? null);
  // « Tes autres sorties » : candidatures vivantes et billets du public, sans celle de la carte.
  const otherTickets = ticketsUpcoming(myTickets.data ?? [], now).filter((x) => x.id !== ticket?.id);
  const others = [
    ...live
      .filter((a) => a.id !== next?.id)
      .map((a) => ({ key: a.id, kind: "app" as const, app: a, startsAt: a.event.startsAt })),
    ...otherTickets.map((x) => ({ key: x.id, kind: "ticket" as const, ticket: x, startsAt: x.event.startsAt })),
  ]
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 3);
  const nudge: HomeNudgeKind | null = data?.nudge ?? null;
  const nudgeLeadsScreen = !next && !ticket && exhibitor && nudge === "add_vehicle";
  const profile = me?.profile;
  const name = profile?.firstName ?? profile?.pseudo ?? "";
  const department = profile?.departments[0];
  const staffNext = (staff.data ?? []).find((s) => new Date(s.event.endsAt) > now && s.presence !== "absent");

  /** Réglage des blocs : appliqué tout de suite, enregistré par l'API, rétabli si l'enregistrement échoue. */
  async function changeWidgets(config: HomeWidgetsConfig) {
    if (!data) return;
    const before = data;
    setReorderError(null);
    home.setData({ ...data, widgets: config });
    try {
      const saved = await api.setHomeWidgets(config);
      home.setData({ ...data, widgets: saved });
    } catch (error) {
      home.setData(before);
      setReorderError(errorMessage(error) || homeLabels.saveFailed);
    }
  }

  function nudgeAction(kind: HomeNudgeKind) {
    if (kind === "add_vehicle") router.push("/vehicule/nouveau");
    else if (kind === "create_crew") router.push("/crew/nouveau");
    else goTab("profil");
  }

  const openReorder = () => setReorder(true);

  const hero = next ? (
    <HeroCard
      posterUrl={data?.nextAccess?.id === next.id ? data.nextAccess.posterUrl : null}
      startsAt={next.event.startsAt}
      countdown={dayCountdown(next.event.startsAt, now)}
      hourLabel={homeProfileLabels.openingAt(formatHour(next.event.startsAt))}
      title={next.event.title}
      tags={
        <>
          <ApplicationStatusTag app={next} />
          {next.zone ? <Chip surface="plate">{`Zone ${next.zone.code}`}</Chip> : null}
        </>
      }
      organizer={next.organizer ?? (data?.nextAccess?.id === next.id ? data.nextAccess.organizer : null) ?? null}
      meta={[
        ...(next.event.city ? [{ icon: "place" as const, text: next.event.city }] : []),
        ...(arrivalPhrase(next.arrival)
          ? [{ icon: "wait" as const, text: arrivalPhrase(next.arrival)?.replace(/^./, (c) => c.toUpperCase()) ?? "" }]
          : []),
      ]}
      action={
        next.status === "accepted"
          ? { label: homeProfileLabels.myAccess, icon: "qr", onPress: () => router.push(`/jour-j/${next.id}`) }
          : { label: homeLabels.seeAccess, icon: "wait", onPress: () => goTab("sorties") }
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
      posterUrl={ticket.posterUrl}
      startsAt={ticket.event.startsAt}
      countdown={dayCountdown(ticket.event.startsAt, now)}
      hourLabel={homeProfileLabels.openingAt(formatHour(ticket.event.startsAt))}
      title={ticket.event.title}
      tags={
        <>
          <Chip surface="plate" selected>
            Billet
          </Chip>
          <Chip surface="plate">
            {ticket.priceCents == null ? "Entrée public · gratuite" : "Entrée public · payante"}
          </Chip>
        </>
      }
      organizer={ticket.organizer}
      meta={[
        ...(ticket.event.city ? [{ icon: "place" as const, text: ticket.event.city }] : []),
        {
          icon: "wait",
          text: ticket.arrival
            ? (arrivalPhrase(ticket.arrival) ?? "").replace(/^./, (c) => c.toUpperCase())
            : homeProfileLabels.publicOpening(formatHour(ticket.event.startsAt)),
        },
      ]}
      action={{ label: homeProfileLabels.myTicket, icon: "ticket", onPress: () => router.push("/billets") }}
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

  const blocks: Record<string, ReactNode> = {
    // « En attente » devient « Tes autres sorties » : les petites tuiles des sorties suivantes.
    pending:
      others.length > 0 ? (
        <>
          <SectionHead
            title={homeProfileLabels.otherOutings}
            link={homeProfileLabels.seeAll}
            onLink={() => goTab("sorties")}
          />
          {others.map((o) =>
            o.kind === "app" ? (
              <MiniTile
                key={o.key}
                testID="home-other-outing"
                tag={<ApplicationStatusTag app={o.app} />}
                title={o.app.event.title}
                caption={`${formatDay(o.app.event.startsAt)}${o.app.status === "waitlisted" ? " · si une place se libère" : ""}`}
                onPress={() => goTab("sorties")}
              />
            ) : (
              <MiniTile
                key={o.key}
                testID="home-other-outing"
                tag={<Chip surface="plate">Billet</Chip>}
                title={o.ticket.event.title}
                caption={`${formatDay(o.ticket.event.startsAt)} · ${o.ticket.priceCents == null ? "entrée libre, réservée" : "entrée réservée"}`}
                onPress={() => goTab("sorties")}
              />
            ),
          )}
        </>
      ) : null,
    nearby: data?.nearby ? (
      <NearbyWidget
        nearby={data.nearby}
        position={position}
        onRadius={(km) => {
          // Enregistré par `PATCH /me/settings` (une lecture n'écrit pas) ; refusé à un compte suspendu, le rayon sert alors
          // à l'affichage seulement (paramètre de la lecture). Une requête par relâchement du curseur.
          void api.updateSettings({ radiusKm: km }).catch(() => undefined);
          setRadius(km);
        }}
      />
    ) : null,
    weather: data ? <WeatherBlock weather={data.weather} /> : null,
    agenda: <AgendaWidget items={upcoming ?? []} />,
    favorite_garage: data ? <FavoriteGarageWidget garage={data.favoriteGarage} /> : null,
    wash: data ? <PlacesWidget kind="wash" places={data.wash} /> : null,
    fuel: data ? <PlacesWidget kind="fuel" places={data.fuel} /> : null,
  };

  return (
    <TabScreen
      title={homeLabels.title}
      onRefresh={async () => {
        await Promise.all([reload(), home.reload(), staff.reload()]);
      }}
      overlays={
        <ReorderSheet
          visible={reorder}
          config={widgets}
          error={reorderError}
          onChange={(config) => void changeWidgets(config)}
          onClose={() => setReorder(false)}
        />
      }
    >
      {offline ? <Notice>Hors ligne : voici ce que ton téléphone a gardé.</Notice> : null}
      <PendingCard where="home" />

      <Greeting line={todayLine(now, department ? `Dép. ${department}` : null)} name={name} />

      {hero ??
        (nudgeLeadsScreen && nudge ? (
          <NudgeCard kind={nudge} primary onAction={() => nudgeAction(nudge)} />
        ) : (
          <Plate style={{ gap: space2, padding: space3 }} testID="home-lead">
            <Text variant="posterM" color={t.color.plateInk}>
              {me?.counts.vehicles || !exhibitor ? "Trouve ton prochain événement" : "Ajoute ton premier véhicule"}
            </Text>
            <Text variant="body" color={t.color.plateMuted}>
              {exhibitor
                ? me?.counts.vehicles
                  ? "Rassemblements, expositions, cars & coffee : candidate avec l'un de tes véhicules."
                  : "Ton garage, c'est toi. Tu auras besoin d'un véhicule pour candidater."
                : "Réserve ton entrée gratuite à un événement : ton billet apparaîtra ici."}
            </Text>
            <Button
              variant="primary"
              icon={me?.counts.vehicles || !exhibitor ? "explore" : "add"}
              onPress={() => (me?.counts.vehicles || !exhibitor ? goTab("explorer") : router.push("/vehicule/nouveau"))}
              fullWidth
            >
              {me?.counts.vehicles || !exhibitor ? homeLabels.explore : "Ajouter un véhicule"}
            </Button>
          </Plate>
        ))}

      {nudge && !nudgeLeadsScreen ? (
        <NudgeCard kind={nudge} primary={false} onAction={() => nudgeAction(nudge)} />
      ) : null}

      {home.error && !data ? <Notice>{homeLabels.loadFailed}</Notice> : null}

      {visibleHomeWidgets(widgets)
        .filter((id) => id !== "next_access")
        .map((id) => (
          <Pressable key={id} accessible={false} onLongPress={openReorder} delayLongPress={450} testID={`block-${id}`}>
            {blocks[id] ?? null}
          </Pressable>
        ))}

      {exhibitor && staffNext ? (
        <NoteTile
          label={homeProfileLabels.staffNudge}
          text={`${staffNext.event.title} · ${formatDay(staffNext.event.startsAt)}`}
          icon="staff"
          testID="home-staff-nudge"
          onPress={() => goTab("sorties")}
        />
      ) : null}

      {data?.stampsThisSeason !== null && data?.stampsThisSeason !== undefined ? (
        <NoteTile
          label={homeProfileLabels.passportTitle}
          text={homeProfileLabels.passportTile(data.stampsThisSeason)}
          icon="stamp"
          testID="home-passport"
          // L'écran du passeport est au lot 50 : le visiteur a son onglet, l'exposant passe par Mon profil.
          onPress={() => goTab(exhibitor ? "profil" : "passeport")}
        />
      ) : null}

      <TutoTile profile={exhibitor ? "exhibitor" : "visitor"} />

      {data?.sponsored ? <SponsoredCard sponsored={data.sponsored} /> : null}

      <Button variant="secondary" icon="list" onPress={openReorder} fullWidth testID="open-reorder">
        {homeLabels.reorder}
      </Button>
      {hero ? (
        <Button variant="secondary" icon="explore" onPress={() => goTab("explorer")} fullWidth>
          {homeLabels.explore}
        </Button>
      ) : null}
    </TabScreen>
  );
}
