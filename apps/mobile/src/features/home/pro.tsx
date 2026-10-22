// Accueil du pro (lot 43, prototype `s-home` pro) : remises et vues de la semaine, Scanner un QR de compte, événements près
// de l'atelier (avec « N de tes clients y vont »), passionnés du coin, derniers scans. Le client scanné n'est jamais
// gardé (statistiques seulement) : les derniers scans disent le grade et la remise, pas la personne.

import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type Grade, gradeLabels, homeLabels, homeProfileLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { BigPair, Greeting, ListRow, QuietNote, SectionHead, TutoTile } from "./parts";
import { todayLine } from "./today";

const { space2, space3, space4 } = tokens.spacing;

export function ProHome() {
  const { t } = useTheme();
  const router = useRouter();
  const { goTab } = usePersona();
  const { me } = useSession();
  const now = useNow();
  const home = useApi(() => api.homeData({ persona: "pro" }), [], { cacheKey: "home-pro" });
  const pro = home.data?.pro ?? null;
  const name = me?.profile.firstName ?? me?.profile.pseudo ?? "";

  return (
    <TabScreen onRefresh={async () => void (await home.reload())}>
      <Greeting line={todayLine(now, pro?.name ?? me?.pro?.name ?? null)} name={name} />

      {home.error && !home.data ? <Notice>{homeLabels.loadFailed}</Notice> : null}

      {pro ? (
        <>
          <BigPair
            items={[
              { value: pro.discountsThisWeek, label: homeProfileLabels.discountsThisWeek },
              { value: pro.profileViews, label: homeProfileLabels.profileViews },
            ]}
          />
          <Button variant="primary" icon="qr" onPress={() => goTab("scanner")} fullWidth testID="home-scan-account-qr">
            {homeProfileLabels.scanAccountQr}
          </Button>

          <SectionHead title={homeProfileLabels.eventsNearWorkshop} />
          {pro.nearbyEventsWithClients.length > 0 ? (
            pro.nearbyEventsWithClients.map((e) => (
              <ListRow
                key={e.event.id}
                testID="home-pro-event"
                date={e.event.startsAt}
                title={e.event.title}
                caption={[e.event.city, e.clientsGoing > 0 ? homeProfileLabels.clientsGoing(e.clientsGoing) : null]
                  .filter(Boolean)
                  .join(" · ")}
                onPress={() => router.push(`/e/${e.event.slug}`)}
              />
            ))
          ) : (
            <Muted variant="body">Aucun événement à venir près de ton atelier pour le moment.</Muted>
          )}

          <SectionHead title={homeProfileLabels.fansNearbyTitle} />
          <Plate style={styles.fans} testID="home-fans">
            <Text variant="numberNarrow" color={t.color.plateInk}>
              {pro.fansNearby.toLocaleString("fr-FR")}
            </Text>
            <View style={styles.fansText}>
              <Text variant="caption" color={t.color.plateMuted}>
                {homeProfileLabels.fansNearby(pro.fansNearby)}
              </Text>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {homeProfileLabels.favoritedBy(pro.favoritedBy)}
              </Text>
            </View>
          </Plate>

          <SectionHead
            title={homeProfileLabels.lastScans}
            link={homeProfileLabels.stats}
            onLink={() => goTab("stats")}
          />
          {pro.lastScans.length > 0 ? (
            pro.lastScans.map((s) => (
              <ListRow
                key={`${s.usedAt}-${s.grade}`}
                testID="home-pro-scan"
                leading={<Chip surface="plate">{gradeLabels[s.grade as Grade] ?? s.grade}</Chip>}
                title={`Remise de ${s.percent} %`}
                caption={formatDayHour(s.usedAt)}
                trailing={<Chip surface="plate">{`−${s.percent} %`}</Chip>}
              />
            ))
          ) : (
            <Muted variant="body">{homeProfileLabels.noScans}</Muted>
          )}
        </>
      ) : home.data ? (
        <QuietNote
          title="Pas de fiche pro"
          body="Crée ta fiche depuis Mon profil : tes remises, tes vues et les événements proches apparaîtront ici."
        />
      ) : null}

      <TutoTile profile="pro" />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  fans: { flexDirection: "row", alignItems: "center", gap: space4, padding: space4 },
  fansText: { flex: 1, gap: space2 },
});
