// Accueil du prestataire (lot 43, prototype `s-home` presta) : la mission retenue (affiche, emplacement, arrivée), la
// météo du jour, le message de l'organisateur, les missions qui t'attendent. Sans mission : une phrase qui dit quoi faire.
// Lot C4b (artefact `s-home` prestataire) : pas de grand titre, titres `.sec-h`, étiquettes inclinées.

import { Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { homeLabels, homeProfileLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { AngledTag, SecH } from "@/features/pro/kit";
import { api } from "@/lib/api";
import { dayCountdown, formatDay, formatHour } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { StatusTag } from "@/ui/StatusTag";
import { Greeting, HeroCard, MiniTile, OrganizerLine, QuietNote, TutoTile, WeatherBlock } from "./parts";
import { todayLine } from "./today";

const { space2 } = tokens.spacing;

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
              <SecH title={homeProfileLabels.organizerMessage} />
              <View
                style={[styles.message, { backgroundColor: t.color.ground, boxShadow: t.shadow.shadowCard }]}
                testID="home-organizer-message"
              >
                {mission.organizer ? <OrganizerLine organizer={mission.organizer} /> : null}
                <Text variant="caption" color={t.color.ink}>
                  {mission.organizerMessage}
                </Text>
              </View>
            </>
          ) : null}
        </>
      ) : data ? (
        <QuietNote title={homeProfileLabels.noMission} body={homeProfileLabels.noMissionBody} />
      ) : null}

      {data?.provider && data.provider.nearbyMissions.length > 0 ? (
        <>
          <SecH
            title={homeProfileLabels.missionsNearby}
            link={homeProfileLabels.seeAll}
            onLink={() => goTab("missions")}
          />
          {data.provider.nearbyMissions.map((m) => (
            <MiniTile
              key={m.slug}
              testID="home-nearby-mission"
              tag={<AngledTag tone="line">{m.structureName}</AngledTag>}
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
  // `.tz-it` : posé sur le fond, rayon 12.
  message: { gap: space2, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12 },
});
