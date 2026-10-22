// Accueil du prestataire (lot 43, prototype `s-home` presta) : la mission retenue (affiche, emplacement, arrivée), la
// météo du jour, le message de l'organisateur, les missions qui t'attendent. Sans mission : une phrase qui dit quoi faire.

import { Chip, Plate, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { homeLabels, homeProfileLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { dayCountdown, formatDay, formatHour } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { StatusTag } from "@/ui/StatusTag";
import { Greeting, HeroCard, MiniTile, OrganizerLine, QuietNote, SectionHead, TutoTile, WeatherBlock } from "./parts";
import { todayLine } from "./today";

const { space2, space3 } = tokens.spacing;

export function ProviderHome() {
  const { t } = useTheme();
  const router = useRouter();
  const { goTab } = usePersona();
  const { me } = useSession();
  const now = useNow();
  const home = useApi(() => api.homeData({ persona: "provider" }), [], { cacheKey: "home-provider" });
  const data = home.data;
  const mission = data?.provider?.nextMission ?? null;
  const name = me?.profile.firstName ?? me?.profile.pseudo ?? "";
  const accepted = mission?.status === "accepted";

  return (
    <TabScreen onRefresh={async () => void (await home.reload())}>
      <Greeting line={todayLine(now)} name={name} />

      {home.error && !data ? <Notice>{homeLabels.loadFailed}</Notice> : null}

      {mission ? (
        <>
          <HeroCard
            posterUrl={mission.posterUrl}
            startsAt={mission.event.startsAt}
            countdown={dayCountdown(mission.event.startsAt, now)}
            hourLabel={homeProfileLabels.installAt(formatHour(mission.installAt ?? mission.event.startsAt))}
            title={mission.event.title}
            tags={
              <>
                <StatusTag
                  status={accepted ? "retained" : mission.status === "pending" ? "pending" : "waitlist"}
                  on="poster"
                />
                {mission.spotLabel ? <Tag on="poster">{homeProfileLabels.spot(mission.spotLabel)}</Tag> : null}
              </>
            }
            organizer={mission.organizer}
            meta={[
              ...(mission.event.city ? [{ icon: "place" as const, text: mission.event.city }] : []),
              ...(mission.installAt
                ? [{ icon: "wait" as const, text: `Arrivée ${formatHour(mission.installAt)}` }]
                : []),
            ]}
            action={{
              label: homeProfileLabels.myProviderAccess,
              icon: "qr",
              // Le ticket de la candidature (emplacement, arrivée, consignes) vit dans l'onglet Candidatures (lot 54).
              onPress: () => goTab("candidatures"),
            }}
            destination={{
              lat: mission.location?.lat ?? null,
              lng: mission.location?.lng ?? null,
              addressLine: mission.location?.addressLine,
              city: mission.event.city,
              title: mission.event.title,
            }}
            onMap={() => router.push(`/e/${mission.event.slug}`)}
          />
          <WeatherBlock weather={data?.weather ?? null} />
          {mission.organizerMessage ? (
            <>
              <SectionHead title={homeProfileLabels.organizerMessage} />
              <Plate style={styles.message} testID="home-organizer-message">
                {mission.organizer ? <OrganizerLine organizer={mission.organizer} /> : null}
                <Text variant="body" color={t.color.plateInk}>
                  {mission.organizerMessage}
                </Text>
              </Plate>
            </>
          ) : null}
        </>
      ) : data ? (
        <QuietNote title={homeProfileLabels.noMission} body={homeProfileLabels.noMissionBody} />
      ) : null}

      {data?.provider && data.provider.nearbyMissions.length > 0 ? (
        <>
          <SectionHead
            title={homeProfileLabels.missionsNearby}
            link={homeProfileLabels.seeAll}
            onLink={() => goTab("missions")}
          />
          {data.provider.nearbyMissions.map((m) => (
            <MiniTile
              key={m.slug}
              testID="home-nearby-mission"
              tag={<Chip surface="plate">{m.structureName}</Chip>}
              title={m.title}
              caption={[formatDay(m.startsAt), m.city, m.distanceKm !== null ? `${m.distanceKm} km` : null]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => goTab("missions")}
            />
          ))}
        </>
      ) : null}

      <TutoTile profile="provider" />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  message: { gap: space3, padding: space3 },
});
