// Accueil du média (lot 43, prototype `s-home` media) : le reportage accrédité (affiche, zone presse), le badge presse, les
// consignes de l'organisation (visibles une fois accrédité), « À couvrir bientôt », les contenus. Sans reportage : une
// phrase qui dit quoi faire.

import { Chip, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { homeLabels, homeProfileLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { dayCountdown, formatDay, formatHour } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { StatusTag } from "@/ui/StatusTag";
import { Greeting, HeroCard, MiniTile, NoteTile, QuietNote, SectionHead, TutoTile } from "./parts";
import { todayLine } from "./today";

const { space2, space3 } = tokens.spacing;

export function MediaHome() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { goTab } = usePersona();
  const { me } = useSession();
  const now = useNow();
  const home = useApi(() => api.homeData({ persona: "media" }), [], { cacheKey: "home-media" });
  const data = home.data;
  const media = data?.media ?? null;
  const report = media?.nextReport ?? null;
  const name = me?.profile.firstName ?? me?.profile.pseudo ?? "";
  const accredited = report?.status === "accepted";
  const lines = (report?.briefing?.instructions ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const views = (media?.contents ?? []).reduce((sum, x) => sum + x.views, 0);

  return (
    <TabScreen title={homeLabels.title} onRefresh={async () => void (await home.reload())}>
      <Greeting line={todayLine(now, media?.name ?? null)} name={name} />

      {home.error && !data ? <Notice>{homeLabels.loadFailed}</Notice> : null}

      {report ? (
        <>
          <HeroCard
            posterUrl={report.posterUrl}
            startsAt={report.event.startsAt}
            countdown={dayCountdown(report.event.startsAt, now)}
            hourLabel={homeProfileLabels.openingAt(formatHour(report.event.startsAt))}
            title={report.event.title}
            tags={
              accredited ? (
                <>
                  <Chip surface="plate">{homeProfileLabels.accredited}</Chip>
                  <Chip surface="plate">Badge presse</Chip>
                </>
              ) : (
                <StatusTag status={report.status === "pending" ? "pending" : "waitlist"} />
              )
            }
            organizer={report.organizer}
            meta={[
              ...(report.event.city ? [{ icon: "place" as const, text: report.event.city }] : []),
              ...(report.briefing?.zones ? [{ icon: "press" as const, text: report.briefing.zones }] : []),
            ]}
            action={{
              label: accredited ? homeProfileLabels.myPressBadge : homeLabels.seeAccess,
              icon: accredited ? "press" : "wait",
              // Le badge presse (QR du pass) et les consignes vivent dans l'onglet Presse (lot 55).
              onPress: () => goTab("presse"),
            }}
            destination={{
              lat: report.location?.lat ?? null,
              lng: report.location?.lng ?? null,
              addressLine: report.location?.addressLine,
              city: report.event.city,
              title: report.event.title,
            }}
            onMap={() => router.push(`/e/${report.event.slug}`)}
          />
          {accredited && (report.briefing?.zones || lines.length > 0) ? (
            <>
              <SectionHead title={homeProfileLabels.pressInstructions} />
              <Plate style={styles.brief} testID="home-press-brief">
                {report.briefing?.zones ? (
                  <View style={styles.briefLine}>
                    <Icon name="check" size={16} color={c.plateInk} />
                    <Text variant="body" color={c.plateInk} style={styles.fill}>
                      {report.briefing.zones}
                    </Text>
                  </View>
                ) : null}
                {lines.map((l) => (
                  <View key={l} style={styles.briefLine}>
                    <Icon name="check" size={16} color={c.plateInk} />
                    <Text variant="body" color={c.plateInk} style={styles.fill}>
                      {l}
                    </Text>
                  </View>
                ))}
                {report.briefing?.contact ? (
                  <Text variant="caption" color={c.plateMuted}>
                    Contact : {report.briefing.contact}
                  </Text>
                ) : null}
              </Plate>
            </>
          ) : null}
        </>
      ) : data ? (
        <QuietNote title={homeProfileLabels.noReport} body={homeProfileLabels.noReportBody} />
      ) : null}

      {media && media.toCover.length > 0 ? (
        <>
          <SectionHead title={homeProfileLabels.toCover} link="Explorer" onLink={() => goTab("explorer")} />
          {media.toCover.map((e) => (
            <MiniTile
              key={e.slug}
              testID="home-to-cover"
              tag={<Chip surface="plate">Gardé</Chip>}
              title={e.title}
              caption={[formatDay(e.startsAt), e.city].filter(Boolean).join(" · ")}
              onPress={() => router.push(`/e/${e.slug}`)}
            />
          ))}
        </>
      ) : null}

      {media && media.contents.length > 0 ? (
        <NoteTile
          label={homeProfileLabels.yourContents}
          text={homeProfileLabels.views(views)}
          icon="gallery"
          testID="home-contents"
          onPress={() => goTab("contenus")}
        />
      ) : null}

      <TutoTile profile="media" />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  brief: { gap: space2, padding: space3 },
  briefLine: { flexDirection: "row", alignItems: "flex-start", gap: space2 },
  fill: { flex: 1 },
});
