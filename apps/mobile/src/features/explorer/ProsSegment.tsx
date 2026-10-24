// Explorer, segment Pros (lot 29 ; lot 44 : en-tête commun, position partagée). Fiches supprimées, non publiées ou de
// comptes suspendus : jamais là (API).
// Lot R2 (maquettes R2.4, R2.5) : le même lieu que les événements (« Où chercher ? »), un métier à la fois (« Quel
// métier ? »), du plus proche au plus loin par défaut. Toutes les fiches ont le même gabarit (`.pcard`) : logo, métiers,
// nom en entier, ville et distance, la remise pour mon grade (toujours une ligne : « −8 % avec ton grade Route »,
// « −10 % dès le grade Sport » ou « Pas encore de remise Orasso »), l'étoile de mon garage favori. Les pros sans atelier
// qui se déplacent chez moi sont rangés à part, en fin de liste. Les stations (lavage, carburant) restent retirées (R1).
import {
  archivoAt,
  Button,
  EmptyState,
  Icon,
  Photo,
  Plate,
  Tag,
  Text,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  explorerLabels,
  gradeLabels,
  explorerV2Labels as L,
  type ProActivity,
  type ProCard,
  proActivityLabels,
  explorerR2Labels as R,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { LoadError } from "@/ui/LoadError";
import { EVENT_LIST_BLOCKS, Waiting } from "@/ui/Waiting";
import { type ExplorerPlace, type ProSortValue, placeKey, proQuery } from "./queries";
import type { ExplorerPosition } from "./useExplorerPosition";
import { usePaged } from "./usePaged";

const { space1, space2, space3 } = tokens.spacing;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || name.slice(0, 2).toUpperCase();

/** Un pro sans atelier (zone d'intervention seulement) : il se déplace. */
export const isMover = (p: Pick<ProCard, "lat" | "city" | "interventionDepartments">) =>
  p.lat === null && !p.city && p.interventionDepartments.length > 0;

/** `.pcard` : le gabarit unique d'une fiche pro de l'Explorer. */
export function ProCardR2({ pro, gradeLabel }: { pro: ProCard; gradeLabel: string | null }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const logo = mediaSource(pro.logoUrl);
  const km = pro.distanceKm;
  const d = pro.discount;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={pro.name}
      onPress={() => router.push(`/p/${pro.slug}`)}
      testID="pro-row"
    >
      <Plate style={styles.card}>
        <View style={[styles.logo, { backgroundColor: c.night }]}>
          {logo ? (
            <Photo source={logo} style={StyleSheet.absoluteFill as never} accessibilityLabel="" />
          ) : (
            <Text variant="posterM" color={c.nightInk} style={styles.logoText}>
              {initials(pro.name)}
            </Text>
          )}
        </View>
        <View style={styles.main}>
          <Text variant="label" color={c.plateMuted}>
            {pro.activities.map((a) => proActivityLabels[a]).join(" · ")}
          </Text>
          <View style={styles.nameRow}>
            <Text variant="bodyStrong" color={c.plateInk} style={styles.name}>
              {pro.name}
            </Text>
            {pro.verified ? (
              <View accessibilityLabel={explorerLabels.verifiedPro} style={styles.badge}>
                <Icon name="badge" size={17} color={c.accentText} />
              </View>
            ) : null}
          </View>
          <View style={styles.where}>
            <Icon name={isMover(pro) ? "vehicle" : "place"} size={14} color={c.plateMuted} />
            <Text variant="caption" color={c.plateMuted} style={styles.whereText}>
              {isMover(pro)
                ? R.moverZone(pro.interventionDepartments)
                : [pro.city, pro.department].filter(Boolean).join(" · ")}
              {!isMover(pro) && km !== undefined && km !== null ? (
                <Text variant="caption" color={c.plateInk} style={styles.km}>
                  {` · ${L.km(km)}`}
                </Text>
              ) : null}
            </Text>
          </View>
          {gradeLabel !== null ? (
            d ? (
              <View style={styles.disc} testID="pro-discount">
                <Tag tone={d.from ? "line" : "acc"}>{R.discountTag(d.percent)}</Tag>
                <Text variant="caption" color={c.plateMuted} style={styles.discText}>
                  {d.from ? R.discountFrom(gradeLabels[d.from]) : R.discountMine(d.percent, gradeLabel)}
                </Text>
              </View>
            ) : (
              <Text variant="caption" color={c.inkFaint} style={styles.discNone} testID="pro-discount">
                {R.discountNone}
              </Text>
            )
          ) : null}
          {pro.favorite ? (
            <View style={styles.fav} testID="pro-favorite">
              <Icon name="star" size={14} color={c.accentText} />
              <Text variant="label" color={c.accentText}>
                {R.favorite}
              </Text>
            </View>
          ) : null}
        </View>
      </Plate>
    </Pressable>
  );
}

export function ProsSegment({
  q,
  position,
  job,
  sort,
  place,
  placeLine,
  grade,
  settled = true,
}: {
  q: string;
  position: ExplorerPosition;
  job: ProActivity | "";
  sort: ProSortValue;
  place: ExplorerPlace;
  placeLine: string;
  /** Le grade de la personne connectée (« avec ton grade Route ») ; `null` sans compte (aucune remise montrée). */
  grade: keyof typeof gradeLabels | null;
  settled?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const ready = position.status !== "checking" && position.status !== "asking";
  const key = placeKey(place);
  const list = usePaged(
    (cursor) => api.explorePros(proQuery(q, job, sort, position.position, "list", cursor, place)),
    [q, job, sort, position.position, place],
    q ? 300 : 0,
    ready && settled,
    settled && !q && !job && key !== null ? `explore-pros.${sort}.${key}` : undefined,
  );
  const items = list.items ?? [];
  const workshops = items.filter((p) => !isMover(p));
  const movers = items.filter(isMover);
  const count = list.total ?? items.length;
  const gradeLabel = grade ? gradeLabels[grade] : null;
  const card = (p: ProCard) => <ProCardR2 key={p.slug} pro={p} gradeLabel={gradeLabel} />;

  return (
    <>
      <View style={styles.line} testID="pros-line">
        <Text variant="caption" color={c.inkMuted} style={styles.lineText}>
          {[
            list.items ? R.prosLine(count, list.total === null && list.hasMore) : null,
            job ? proActivityLabels[job] : null,
            placeLine,
            sort === "distance" ? R.prosNearest : R.prosByName,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {list.error ? <LoadError message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.items === null && !list.error ? (
        <Waiting blocks={EVENT_LIST_BLOCKS} label={L.loading} testID="explorer-loading" />
      ) : null}
      {list.items?.length === 0 ? <EmptyState title={L.emptyTitle} text={L.prosEmptyText} /> : null}
      {workshops.map(card)}
      {movers.length ? (
        <View style={styles.subH} testID="pros-movers">
          <Text variant="label" color={c.inkMuted}>
            {R.movers}
          </Text>
          <View style={[styles.subLine, { backgroundColor: c.line }]} />
        </View>
      ) : null}
      {movers.map(card)}
      {list.hasMore ? (
        <Button
          variant="secondary"
          icon="add"
          loading={list.loadingMore}
          onPress={() => void list.loadMore()}
          fullWidth
        >
          {explorerLabels.more}
        </Button>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "baseline", gap: space2 },
  lineText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  card: { flexDirection: "row", alignItems: "flex-start", gap: space3, padding: 10, borderRadius: 18 },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 15,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { fontSize: 25, lineHeight: 28, fontFamily: archivoAt(62, 900) },
  main: { flex: 1, minWidth: 0, gap: space1 },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  name: { flexShrink: 1, fontSize: 16, lineHeight: 19, fontFamily: archivoAt(100, 850) },
  badge: { marginTop: 1 },
  where: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  whereText: { flex: 1, fontSize: 12.5, lineHeight: 16 },
  km: { fontSize: 12.5, lineHeight: 16, fontFamily: archivoAt(100, 800) },
  disc: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 2 },
  discText: { fontSize: 12.5, lineHeight: 16, fontFamily: archivoAt(100, 700) },
  discNone: { fontSize: 12.5, lineHeight: 16, marginTop: 2 },
  fav: { flexDirection: "row", alignItems: "center", gap: 4 },
  subH: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  subLine: { flex: 1, height: 1 },
});
