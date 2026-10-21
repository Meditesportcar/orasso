// Récap (lot 50, prototype DA v2 `s-recap`) : le lendemain de l'événement, tout seul. Les chiffres de la soirée, le
// classement au prix du public, les points (prévus à J+1, acquis après le règlement de J+2 : le même écran se met à
// jour, V8), le tampon dessiné, l'avis à donner, et « Partager » (texte et lien de l'événement). Ouvert par la
// notification `event_recap_ready`, par « Voir le récap » des Sorties, ou par la notification du prix du public.

import { Icon, type IconName, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  formatDayDate,
  frDuration,
  frOrdinal,
  localDate,
  type RecapView,
  recapScreenTexts,
  recapTexts,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Share, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { heroPoster } from "@/features/explorer/poster";
import { PosterSurface, SmButton } from "@/features/passionne/kit";
import { Stamp } from "@/features/passport/Stamp";
import { ReviewSheet, type ReviewTarget } from "@/features/ReviewSheet";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3, space4 } = tokens.spacing;

export function RecapScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recap = useApi(() => api.recap(id), [id], { enabled: Boolean(id), cacheKey: `recap.${id}` });
  const [reviewing, setReviewing] = useState<ReviewTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const r = recap.data;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));

  async function share(view: RecapView) {
    setNotice(null);
    try {
      await Share.share({ message: `${view.shareText} ${siteUrl(`/e/${view.event.slug}`)}` });
    } catch {
      setNotice(recapScreenTexts.shareFailed);
    }
  }

  return (
    <FlowScreen
      title={recapScreenTexts.title}
      onClose={close}
      onRefresh={async () => {
        await recap.reload();
      }}
      overlays={
        <ReviewSheet
          target={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            void recap.reload();
          }}
        />
      }
    >
      {recap.error && !r ? (
        <Notice tone="error">
          {recap.error.status === 404 ? recapScreenTexts.notReady : recapScreenTexts.loadFailed}
        </Notice>
      ) : null}
      {!r && !recap.error ? <Muted variant="body">Chargement…</Muted> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {r ? (
        <RecapBody
          view={r}
          onShare={() => void share(r)}
          onReview={
            r.reviewApplicationId
              ? () =>
                  setReviewing({
                    applicationId: r.reviewApplicationId as string,
                    title: r.event.title,
                    deadline: r.reviewDeadline,
                  })
              : undefined
          }
        />
      ) : null}
    </FlowScreen>
  );
}

function RecapBody({ view, onShare, onReview }: { view: RecapView; onShare: () => void; onReview?: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const day = formatDayDate(localDate(new Date(view.event.startsAt)));
  const next = view.nextGradeIn ? { grade: view.nextGradeIn.grade, in: view.nextGradeIn.points } : null;
  const pointsText = recapTexts.points(
    view.points.total,
    view.points.detail.map((d) => d.label),
    next,
  );
  const rank = view.audienceRank;
  // Lot C2b (artefact `.rc-hero`) : l'image de l'événement en tête de la carte crème (l'affiche générée tant que
  // l'API ne sert pas la photo source, lot C5), qui fond dans la carte ; date et titre remontent dessus.
  const event = useApi(() => api.eventBySlug(view.event.slug), [view.event.slug]);
  const image = event.data ? heroPoster(event.data) : null;
  return (
    <>
      <PosterSurface style={styles.hero} testID="recap-hero">
        <View style={styles.photo}>
          <Photo
            source={mediaSource(image)}
            placeholder={`linear-gradient(160deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.fade} pointerEvents="none">
            <Photo
              placeholder={`linear-gradient(180deg, ${c.poster}00 0%, ${c.poster} 100%)`}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>
        <View style={styles.heroBody}>
          <Text variant="label" color={c.posterMuted}>
            {day.charAt(0).toUpperCase() + day.slice(1)}
          </Text>
          <Text variant="posterXl" color={c.posterInk} style={styles.heroTitle}>
            {recapScreenTexts.was(view.event.title)}
          </Text>
          {view.myArrival ? (
            <Text variant="caption" color={c.posterMuted} testID="recap-arrived">
              {recapTexts.arrived(new Date(view.myArrival))}
            </Text>
          ) : null}
        </View>
        <Text variant="credit" color={c.posterMuted} style={styles.credit}>
          Orasso
        </Text>
      </PosterSurface>

      <View style={styles.nums}>
        <Tile label={recapTexts.vehicles} testID="recap-vehicles">
          <Big>{String(view.vehiclesCount)}</Big>
        </Tile>
        {view.myDuration !== null ? (
          <Tile label={recapTexts.myEvening} testID="recap-evening">
            <Big>{frDuration(view.myDuration)}</Big>
          </Tile>
        ) : null}
        {rank ? (
          <Tile label={recapTexts.audiencePrize} wide testID="recap-rank">
            <View style={styles.rankRow}>
              <Big>{frOrdinal(rank.rank)}</Big>
              <Text variant="body" color={c.inkMuted}>
                sur {rank.of}
              </Text>
              {view.stamp ? (
                <View style={styles.stamp}>
                  <Stamp stamp={view.stamp} size={96} paper={c.surface} testID="recap-stamp" />
                </View>
              ) : null}
            </View>
          </Tile>
        ) : view.stamp ? (
          <Tile label="Ton tampon" wide testID="recap-rank">
            <View style={styles.stamp}>
              <Stamp stamp={view.stamp} size={96} paper={c.surface} testID="recap-stamp" />
            </View>
          </Tile>
        ) : null}
      </View>

      <View style={styles.moments}>
        {view.points.total !== 0 ? (
          <Moment icon="grade" testID="recap-points">
            <Text variant="body" color={c.ink}>
              {pointsText}
            </Text>
            <Text variant="meta" color={c.inkMuted}>
              {view.points.status === "projected" ? recapTexts.projected : recapTexts.settled}
            </Text>
          </Moment>
        ) : null}
        {view.stamp ? (
          <Moment icon="stamp" testID="recap-stamp-line">
            <Text variant="body" color={c.ink}>
              {view.stamp.sentence}
            </Text>
          </Moment>
        ) : null}
        {view.reviewApplicationId ? (
          <Moment icon="chat" testID="recap-review-line">
            <Text variant="body" color={c.ink}>
              {recapTexts.reviewUntil(new Date(view.reviewDeadline))}
            </Text>
          </Moment>
        ) : null}
      </View>

      <View style={styles.actions}>
        <SmButton kind="p" big icon="share" onPress={onShare} style={styles.grow} testID="recap-share">
          {recapTexts.share}
        </SmButton>
        {onReview ? (
          <SmButton kind="s" big icon="grade" onPress={onReview} style={styles.grow} testID="recap-review">
            {recapTexts.review}
          </SmButton>
        ) : null}
      </View>
    </>
  );
}

function Tile({
  label,
  children,
  wide,
  testID,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.tile,
        wide ? styles.wide : null,
        { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard },
      ]}
    >
      <Text variant="label" color={t.color.inkMuted}>
        {label}
      </Text>
      {children}
    </View>
  );
}

/** Un grand chiffre étroit (prototype `.t-num`, 54 px). */
function Big({ children }: { children: string }) {
  const { t } = useTheme();
  return (
    <Text variant="numberNarrow" color={t.color.ink} style={styles.big}>
      {children}
    </Text>
  );
}

function Moment({ icon, children, testID }: { icon: IconName; children: ReactNode; testID?: string }) {
  const { t } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.moment, { backgroundColor: t.color.surface, borderColor: t.color.surfaceRaised }]}
    >
      <Icon name={icon} size={20} color={t.color.accentText} />
      <View style={styles.momentText}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, overflow: "hidden" },
  photo: { height: 200 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" },
  heroBody: { marginTop: -50, paddingHorizontal: space4, paddingBottom: space4 + 2, gap: space2 },
  heroTitle: { fontSize: 34, lineHeight: 32 },
  credit: { position: "absolute", right: space3, bottom: space2 },
  nums: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tile: { flexBasis: "47%", flexGrow: 1, borderRadius: 18, padding: space3 + 2, gap: space1 },
  wide: { flexBasis: "100%" },
  big: { fontSize: 54, lineHeight: 48 },
  rankRow: { flexDirection: "row", alignItems: "baseline", gap: space2 },
  stamp: { marginLeft: "auto" },
  moments: { gap: space2 },
  moment: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderRadius: 14,
    borderWidth: 1,
  },
  momentText: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", gap: space2 + 2 },
  grow: { flex: 1, alignSelf: "stretch" },
});
