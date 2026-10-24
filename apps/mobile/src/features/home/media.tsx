// Accueil du média (lot 43, prototype `s-home` media) : le reportage accrédité (affiche, zone presse), le badge presse, les
// consignes de l'organisation (visibles une fois accrédité), « À couvrir bientôt », les contenus. Sans reportage : une
// phrase qui dit quoi faire.
// Lot C4b (artefact `s-home` média) : pas de grand titre, consignes en lignes `.tz-it` cochées, titres `.sec-h`.

import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { homeLabels, homeProfileLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { api } from "@/lib/api";
import { dayCountdown, formatDay, formatHour } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AngledTag, SecH, TzRow } from "@/ui/KitTz";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { StatusTag } from "@/ui/StatusTag";
import { Greeting, HeroCard, MiniTile, NoteTile, QuietNote, TutoTile } from "./parts";
import { todayLine } from "./today";

const { space2 } = tokens.spacing;

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
    <TabScreen onRefresh={async () => void (await home.reload())}>
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
                  <Tag on="poster" tone="acc">
                    {homeProfileLabels.accredited}
                  </Tag>
                  <Tag on="poster">Badge presse</Tag>
                </>
              ) : (
                <StatusTag status={report.status === "pending" ? "pending" : "waitlist"} on="poster" />
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
              <SecH title={homeProfileLabels.pressInstructions} />
              <View style={styles.brief} testID="home-press-brief">
                {/* Une consigne répétée (zones et une ligne identiques) ne s'affiche qu'une fois : clé unique (lot C7). */}
                {[...new Set([...(report.briefing?.zones ? [report.briefing.zones] : []), ...lines])].map((l) => (
                  <TzRow key={l} leading={<Icon name="check" size={16} color={c.accentText} />} title={l} />
                ))}
                {report.briefing?.contact ? (
                  <Text variant="caption" color={c.inkMuted}>
                    Contact : {report.briefing.contact}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </>
      ) : data ? (
        <QuietNote title={homeProfileLabels.noReport} body={homeProfileLabels.noReportBody} />
      ) : null}

      {media && media.toCover.length > 0 ? (
        <>
          <SecH title={homeProfileLabels.toCover} link="Explorer" onLink={() => goTab("explorer")} />
          {media.toCover.map((e) => (
            <MiniTile
              key={e.slug}
              testID="home-to-cover"
              tag={<AngledTag tone="line">Gardé</AngledTag>}
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
  // `.tz-list` : 8 px entre deux lignes.
  brief: { gap: space2 },
});
