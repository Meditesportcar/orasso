// Accueil du pro (lot 43, prototype `s-home` pro) : remises et vues de la semaine, Scanner un QR de compte, événements près
// de l'atelier (avec « N de tes clients y vont »), passionnés du coin, derniers scans. Le client scanné n'est jamais
// gardé (statistiques seulement) : les derniers scans disent le grade et la remise, pas la personne.
// Lot C4b (artefact `s-home` pro) : pas de grand titre, deux tuiles `.dir-big` (la première crème), titres de section
// italiques (`.sec-h`), listes `.tz-it` à souche datée, « Stats › » en lien moutarde, remise en étiquette inclinée.

import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type Grade, gradeLabels, homeLabels, homeProfileLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { formatCount } from "@/lib/proPresta";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AngledTag, DirBig, MiniDate, RoundInitials, SecH, TzRow } from "@/ui/KitTz";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { Greeting, QuietNote, TutoTile } from "./parts";
import { todayLine } from "./today";

/** Initiales distinctes des grades (relecture C4b, lot C7 : « Rodage » et « Route » donnaient tous deux « RO »). */
const GRADE_SHORT: Record<Grade, string> = { rodage: "RD", route: "RT", sport: "SP", circuit: "CI", legende: "LG" };

const { space2, space4 } = tokens.spacing;

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
          <DirBig
            testID="home-pair"
            items={[
              { value: formatCount(pro.discountsThisWeek), label: homeProfileLabels.discountsThisWeek },
              { value: formatCount(pro.profileViews), label: homeProfileLabels.profileViews },
            ]}
          />
          <Button variant="primary" icon="qr" onPress={() => goTab("scanner")} fullWidth testID="home-scan-account-qr">
            {homeProfileLabels.scanAccountQr}
          </Button>

          <SecH title={homeProfileLabels.eventsNearWorkshop} />
          {pro.nearbyEventsWithClients.length > 0 ? (
            pro.nearbyEventsWithClients.map((e) => (
              <TzRow
                key={e.event.id}
                testID="home-pro-event"
                leading={<MiniDate iso={e.event.startsAt} />}
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

          <SecH title={homeProfileLabels.fansNearbyTitle} />
          <View
            style={[styles.fans, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}
            testID="home-fans"
          >
            <View style={styles.fansRow}>
              <Text variant="numberNarrow" color={t.color.ink} style={styles.fansNum}>
                {formatCount(pro.fansNearby)}
              </Text>
              <Text variant="caption" color={t.color.inkMuted} style={styles.fansCap}>
                {homeProfileLabels.fansNearby(pro.fansNearby)}
              </Text>
            </View>
            <Text variant="caption" color={t.color.inkMuted}>
              {homeProfileLabels.favoritedBy(pro.favoritedBy)}
            </Text>
          </View>

          <SecH title={homeProfileLabels.lastScans} link={homeProfileLabels.stats} onLink={() => goTab("stats")} />
          {pro.lastScans.length > 0 ? (
            pro.lastScans.map((s) => (
              // Le client scanné n'est pas gardé : le rond porte les initiales du grade, pas celles de la personne.
              <TzRow
                key={`${s.usedAt}-${s.grade}`}
                testID="home-pro-scan"
                leading={<RoundInitials text={GRADE_SHORT[s.grade as Grade] ?? s.grade.slice(0, 2).toUpperCase()} />}
                title={`Grade ${gradeLabels[s.grade as Grade] ?? s.grade}`}
                caption={formatDayHour(s.usedAt)}
                trailing={<AngledTag tone="acc">{`−${s.percent} %`}</AngledTag>}
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
  // `.card.p` : carte, rayon 18, 16 px.
  fans: { borderRadius: tokens.radius.radiusLg, padding: space4, gap: 10 },
  fansRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  fansNum: { fontSize: 44, lineHeight: 42 },
  fansCap: { flexShrink: 1, textAlign: "right" },
});
