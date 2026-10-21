// Passeport (lot 50, prototype DA v2 `s-passport`) : les tampons de la saison, huit par page, des pages qui ne se
// ressemblent jamais (forme selon le format, encre selon le département, usure tirée de la `seed`, dorure pour les
// rares). Onglet du visiteur (`(visitor)/passeport.tsx`) ; pour les autres profils, écran ouvert par la tuile « Mon
// passeport » de Mon profil (`app/passeport.tsx`). Quand un tampon arrive (`passport.stamped`), il tombe en plein écran
// puis rejoint sa page.

import { Chip, ChipRow, EmptyState, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  PAGE_BOX,
  type PassportStamp,
  type PassportView,
  passportScreenTexts,
  passportTexts,
  stampPlacement,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Line } from "react-native-svg";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, TabScreen } from "@/ui/Screens";
import { PassportLinks } from "./PassportLinks";
import { Stamp } from "./Stamp";
import { useStampedListener } from "./stampBus";

const { space1, space2, space3 } = tokens.spacing;

/** Les quatre notes de la page : « La forme suit le format… », etc. (textes du prototype, `passportTexts`). */
const LEGEND: { lead: string; text: string }[] = [
  { lead: "La forme", text: passportTexts.legendShape },
  { lead: "L'encre", text: passportTexts.legendInk },
  { lead: "L'usure", text: passportTexts.legendWear },
  { lead: "Les rares", text: passportTexts.legendRare },
];

export function PassportScreen({ tab }: { tab: boolean }) {
  const router = useRouter();
  const [season, setSeason] = useState<number | undefined>(undefined);
  const passport = useApi(() => api.passport(season), [season], { cacheKey: `passport.${season ?? "now"}` });
  const [arrivedId, setArrivedId] = useState<string | null>(null);
  const view = passport.data;
  const title = passportTexts.title;
  const facts = view ? passportTexts.summary(view.total, view.rare) : undefined;

  const onStamped = useCallback(
    (stamp: PassportStamp) => {
      setSeason(undefined);
      setArrivedId(stamp.id);
      void passport.reload();
    },
    [passport.reload],
  );

  const body = (
    <PassportBody
      view={view}
      loading={passport.loading}
      offline={passport.offline}
      failed={Boolean(passport.error) && !view}
      season={season}
      onSeason={setSeason}
      arrivedId={arrivedId}
    />
  );
  useStampedListener(onStamped);
  const refresh = async () => {
    await passport.reload();
  };
  if (tab) {
    return (
      <TabScreen title={title} facts={facts} onRefresh={refresh}>
        {body}
      </TabScreen>
    );
  }
  return (
    <FlowScreen
      title={title}
      facts={facts}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/profil"))}
      onRefresh={refresh}
    >
      {body}
    </FlowScreen>
  );
}

function PassportBody({
  view,
  loading,
  offline,
  failed,
  season,
  onSeason,
  arrivedId,
}: {
  view: PassportView | null;
  loading: boolean;
  offline: boolean;
  failed: boolean;
  season: number | undefined;
  onSeason: (year: number | undefined) => void;
  arrivedId: string | null;
}) {
  const { t } = useTheme();
  if (!view) {
    return failed ? (
      <Notice tone="error">{passportScreenTexts.loadFailed}</Notice>
    ) : (
      <Muted variant="body">{loading ? "Chargement…" : ""}</Muted>
    );
  }
  const current = view.season.year;
  return (
    <>
      {offline ? <Notice>{passportScreenTexts.offline}</Notice> : null}
      {view.seasons.length > 1 ? (
        <View testID="passport-seasons">
          <ChipRow accessibilityRole="tablist">
            {view.seasons.map((s) => (
              <Chip
                accessibilityRole="tab"
                key={s.year}
                selected={s.year === current}
                onPress={() => onSeason(s.year === view.seasons[0]?.year ? undefined : s.year)}
              >
                {s.name}
              </Chip>
            ))}
          </ChipRow>
        </View>
      ) : null}

      {view.total === 0 ? (
        <EmptyState title={passportScreenTexts.emptyTitle} text={passportTexts.empty} />
      ) : (
        <Book key={`${current}-${view.total}`} view={view} arrivedId={arrivedId} />
      )}

      <PassportLinks />

      <View style={styles.legend} testID="passport-legend">
        {LEGEND.map((l) => (
          <View key={l.lead} style={[styles.note, { backgroundColor: t.color.surface, borderColor: t.color.line }]}>
            <Text variant="bodyStrong" color={t.color.ink}>
              {l.lead}
            </Text>
            <Text variant="meta" color={t.color.inkMuted} style={styles.noteText}>
              {l.text.slice(l.lead.length).trim()}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

/** Le carnet : pages de huit tampons qu'on feuillette en glissant ; il s'ouvre sur la dernière page. */
function Book({ view, arrivedId }: { view: PassportView; arrivedId: string | null }) {
  const { t } = useTheme();
  const pages = view.pages;
  const last = pages.length - 1;
  const [index, setIndex] = useState(last);
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const placed = useRef(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && w !== width) setWidth(w);
  };
  // Pages posées à la largeur mesurée ; on ouvre sur la dernière une seule fois.
  const onContentSize = () => {
    if (placed.current || !width) return;
    placed.current = true;
    scroller.current?.scrollTo({ x: last * width, animated: false });
  };
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setIndex(Math.max(0, Math.min(last, Math.round(e.nativeEvent.contentOffset.x / width))));
  };
  const go = (i: number) => {
    setIndex(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };

  // Dedans : 26 px à gauche pour la reliure, 16 de chaque autre côté ; les tampons sont placés dans un cadre de 310.
  const inner = Math.max(0, width - 42);
  const scale = inner / PAGE_BOX.width;
  return (
    <View style={styles.book} testID="passport-book">
      <View
        onLayout={onLayout}
        style={[styles.paper, { backgroundColor: t.color.surface, shadowColor: t.color.night }]}
      >
        <View style={styles.paperHead}>
          <Text variant="label" color={t.color.ink} style={styles.season}>
            Saison {view.season.year}
          </Text>
          <Text variant="meta" color={t.color.inkMuted} testID="passport-page">
            {passportTexts.page(index + 1, pages.length)}
          </Text>
        </View>
        {width ? <Ruled width={width} height={PAGE_BOX.height * scale + 56} color={t.color.line} /> : null}
        <View style={[styles.spine, { borderColor: t.color.line }]} />
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onEnd}
          onContentSizeChange={onContentSize}
          scrollEventThrottle={32}
        >
          {pages.map((page, p) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: les pages n'ont pas d'identifiant, leur rang est stable
              key={p}
              style={{ width, height: PAGE_BOX.height * scale, paddingLeft: 26 }}
              testID={`passport-page-${p + 1}`}
            >
              <View style={{ width: inner, height: PAGE_BOX.height * scale }}>
                {page.stamps.map((s, i) => {
                  const spot = stampPlacement(i, s.seed);
                  return (
                    <View
                      key={s.id}
                      style={[
                        styles.slot,
                        {
                          left: spot.x * scale,
                          top: spot.y * scale,
                          width: spot.size * scale,
                          height: spot.size * scale,
                        },
                      ]}
                    >
                      <Stamp
                        stamp={s}
                        size={spot.size * scale}
                        paper={t.color.surface}
                        animateIn={s.id === arrivedId}
                        testID={`stamp-${s.id}`}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
      {pages.length > 1 ? (
        <View style={styles.dots} accessibilityRole="tablist">
          {pages.map((_, i) => (
            <Pressable
              // biome-ignore lint/suspicious/noArrayIndexKey: les pages n'ont pas d'identifiant, leur rang est stable
              key={i}
              accessibilityRole="tab"
              accessibilityLabel={passportTexts.page(i + 1, pages.length)}
              accessibilityState={{ selected: i === index }}
              hitSlop={10}
              onPress={() => go(i)}
              style={[styles.dot, { backgroundColor: i === index ? t.color.ink : t.color.line }]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Les lignes du papier (une toutes les 28 px, à 35 % d'opacité). */
function Ruled({ width, height, color }: { width: number; height: number; color: string }) {
  const lines = Math.floor(height / 28);
  return (
    <Svg width={width} height={height} style={styles.ruled} pointerEvents="none">
      {Array.from({ length: lines }, (_, i) => (
        <Line
          // biome-ignore lint/suspicious/noArrayIndexKey: lignes identiques et sans état, leur rang est leur identité
          key={i}
          x1={0}
          x2={width}
          y1={56 + i * 28}
          y2={56 + i * 28}
          stroke={color}
          strokeWidth={1}
          opacity={0.35}
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  book: { gap: space3 },
  paper: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: "hidden",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  paperHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingLeft: 26,
    paddingRight: 16,
    marginBottom: space2,
  },
  season: { fontStyle: "italic" },
  ruled: { position: "absolute", left: 0, top: 0 },
  spine: { position: "absolute", left: 10, top: 0, bottom: 0, borderLeftWidth: 2, borderStyle: "dotted" },
  slot: { position: "absolute" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  note: {
    flexBasis: "47%",
    flexGrow: 1,
    gap: space1,
    padding: space3,
    borderRadius: 14,
    borderWidth: 1,
  },
  noteText: { textTransform: "none" },
});
