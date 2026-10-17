// Accueil : un tableau de bord, jamais un fil (docs/02). « Prochain accès » en tête (bouton vers le mode jour J, seul
// néon de l'écran), puis les compteurs et les blocs réglables dans l'ordre choisi : en attente, autour de moi (curseur de
// rayon), météo, agenda, garage favori, lavage et carburant les plus proches. Un emplacement sponsorisé (même apparence,
// mention « Sponsorisé ») et une seule incitation à la fois. Appui long sur un bloc : feuille « Réorganiser ».
// « Prochain accès », compteurs et agenda viennent des candidatures gardées sur le téléphone (lisibles hors ligne) ;
// le reste vient de `GET /me/home`.

import { Button, Counters, Plate, PosterCard, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  defaultHomeWidgets,
  gradeLabels,
  type HomeNudgeKind,
  type HomeWidgetsConfig,
  homeLabels,
  homeWidgetTitles,
  type MyApplication,
  type MyWeather,
  visibleHomeWidgets,
  weatherTexts,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useMyPosition } from "@/features/explorer/useMyPosition";
import {
  AgendaWidget,
  FavoriteGarageWidget,
  NearbyWidget,
  NudgeCard,
  PendingWidget,
  PlacesWidget,
  SponsoredCard,
} from "@/features/home/HomeWidgets";
import { ReorderSheet } from "@/features/home/ReorderSheet";
import { WeatherWidget } from "@/features/WeatherWidget";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { breakTitle, formatDay, formatHour, relativeDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

function WeatherBlock({ weather }: { weather: MyWeather | null }) {
  return (
    <>
      <SectionTitle>{homeWidgetTitles.weather}</SectionTitle>
      {weather ? (
        <WeatherWidget
          summary={weather.summary}
          attribution={weather.attribution}
          title={weather.kind === "event" ? weather.event.title : weatherTexts.todayTitle}
        />
      ) : (
        <Muted variant="body">{weatherTexts.unavailable}</Muted>
      )}
    </>
  );
}

export default function Accueil() {
  const { t } = useTheme();
  const router = useRouter();
  const now = useNow();
  const { me } = useSession();
  const { upcoming, offline, reload } = useApplications();
  const position = useMyPosition();
  const [radius, setRadius] = useState<number | undefined>(undefined);
  const [reorder, setReorder] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const home = useApi(
    () => api.homeData({ radiusKm: radius, lat: position.position?.lat, lng: position.position?.lng }),
    [radius, position.position?.lat, position.position?.lng],
    { cacheKey: "home" },
  );
  const data = home.data;
  const widgets: HomeWidgetsConfig = data?.widgets ?? defaultHomeWidgets;

  const next: MyApplication | undefined =
    upcoming?.find((a) => a.status === "accepted") ??
    upcoming?.find((a) => a.status === "pending" || a.status === "waitlisted" || a.status === "offered");
  const pending = upcoming?.filter(
    (a) => a.status === "pending" || a.status === "waitlisted" || a.status === "offered",
  );
  const pendingCount = upcoming?.filter((a) => a.status === "pending").length ?? 0;
  const retainedCount = upcoming?.filter((a) => a.status === "accepted").length ?? 0;
  const profile = me?.profile;
  const nudge: HomeNudgeKind | null = data?.nudge ?? null;

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
    else router.push("/moi");
  }

  const openReorder = () => setReorder(true);
  // Bouton principal de l'écran : le « Prochain accès » le porte ; sinon la plaque de tête ou l'incitation.
  const nudgeLeadsScreen = !next && nudge === "add_vehicle";

  const blocks: Record<string, ReactNode> = {
    pending: <PendingWidget items={pending ?? []} />,
    nearby: data?.nearby ? (
      <NearbyWidget
        nearby={data.nearby}
        position={position}
        onRadius={(km) => {
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
      home
      onRefresh={async () => {
        await Promise.all([reload(), home.reload()]);
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

      {next ? (
        <PosterCard
          label={
            next.status === "accepted"
              ? `${homeLabels.nextAccess} · ${relativeDay(next.event.startsAt, now)}`
              : homeLabels.applicationInProgress
          }
          title={breakTitle(next.event.title)}
          facts={`${formatDay(next.event.startsAt)} · ${formatHour(next.event.startsAt)}${next.zone ? ` · Zone ${next.zone.code}` : ""}`}
          photo={{ placeholder: `linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)` }}
          status={next.status === "accepted" ? "retained" : "pending"}
          action={
            next.status === "accepted"
              ? {
                  label: homeLabels.openAccess,
                  icon: "qr",
                  next: true,
                  onPress: () => router.push(`/jour-j/${next.id}`),
                }
              : { label: homeLabels.seeAccess, icon: "wait", next: true, onPress: () => router.navigate("/acces") }
          }
        />
      ) : nudgeLeadsScreen && nudge ? (
        <NudgeCard kind={nudge} primary onAction={() => nudgeAction(nudge)} />
      ) : (
        <Plate style={styles.lead}>
          <Text variant="posterM" color={t.color.plateInk}>
            {me?.counts.vehicles ? "Trouve ton prochain événement" : "Ajoute ton premier véhicule"}
          </Text>
          <Text variant="body" color={t.color.plateMuted}>
            {me?.counts.vehicles
              ? "Rassemblements, expositions, cars & coffee : candidate avec l'un de tes véhicules."
              : "Ton garage, c'est toi. Tu auras besoin d'un véhicule pour candidater."}
          </Text>
          <Button
            variant="primary"
            icon={me?.counts.vehicles ? "explore" : "add"}
            onPress={() => (me?.counts.vehicles ? router.navigate("/explorer") : router.push("/vehicule/nouveau"))}
            fullWidth
          >
            {me?.counts.vehicles ? homeLabels.explore : "Ajouter un véhicule"}
          </Button>
        </Plate>
      )}

      <Counters
        items={[
          { value: pendingCount, label: "En attente" },
          { value: retainedCount, label: "Retenues" },
          { value: profile?.pointsSeason ?? 0, label: profile ? `Pts · ${gradeLabels[profile.grade]}` : "Points" },
        ]}
      />

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

      {data?.sponsored ? <SponsoredCard sponsored={data.sponsored} /> : null}

      <Button variant="secondary" icon="list" onPress={openReorder} fullWidth testID="open-reorder">
        {homeLabels.reorder}
      </Button>
      {next ? (
        <Button variant="secondary" icon="explore" onPress={() => router.navigate("/explorer")} fullWidth>
          {homeLabels.explore}
        </Button>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  lead: { gap: space2, padding: space3 },
});
