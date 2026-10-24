// Le plateau (lot R4b, maquette R4 validée par Damien le 24/10/2026) : qui vient, en voitures et en pros.
// - `LineupBlock` : le bloc compact de la fiche (R4.3), sous les lignes Quand / Où / Places : cinq vignettes (la mienne
//   marquée « Toi »), le nombre, les pros sur place en pastilles et « Voir le plateau · N voitures ». Le bloc
//   « Prestataires présents » de la fiche l'a rejoint. Personne encore : le bloc reste, avec sa phrase.
// - `CarTile` et `ProRow` : la vignette d'une voiture (photo plaque masquée, nom entier sous la photo, pseudo, cadenas)
//   et la ligne d'un pro (logo, nom, métier, « Média officiel » ou remise), partagées avec le plein écran (R4.3b).
// Toutes les règles (qui y apparaît, quels champs) sont dans l'API : l'appli affiche ce qu'elle reçoit.
import { Button, Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type EventLineup,
  type Grade,
  isMemberCar,
  lineupLabels as L,
  LINEUP_BLOCK_SIZE,
  type LineupCar,
  type LineupPro,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";

const { space1, space2, space3 } = tokens.spacing;
const { radiusSm, radiusMd, radiusLg, radiusPill } = tokens.radius;

/** Le plateau d'un événement, relu à chaque acceptation (canal `event:{id}:lineup`, personne connectée). */
export function useLineup(eventId: string | null, query: { category?: string; limit?: number } = {}) {
  const { status } = useSession();
  const state = useApi(() => api.eventLineup(eventId ?? "", query), [eventId, status, query.category, query.limit], {
    enabled: Boolean(eventId) && status !== "loading",
  });
  // Lot R4b, tour 2 : relu aussi à chaque (ré)abonnement, pour les changements manqués pendant une coupure.
  useChannel(
    eventId && status === "in" ? `event:${eventId}:lineup` : null,
    () => void state.reload(),
    () => void state.reload(),
  );
  return state;
}

/** Le logo d'un pro (photo de sa vitrine) ou ses initiales. */
function ProLogo({ pro, size }: { pro: LineupPro; size: number }) {
  const { t } = useTheme();
  const c = t.color;
  const initials = pro.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <View style={[styles.logo, { width: size, height: size, backgroundColor: c.surfaceRaised }]}>
      {pro.logoUrl ? (
        <Photo source={mediaSource(pro.logoUrl)} style={StyleSheet.absoluteFill} />
      ) : (
        <Text variant="numberNarrow" color={c.ink} style={{ fontSize: size * 0.36, lineHeight: size * 0.42 }}>
          {initials}
        </Text>
      )}
    </View>
  );
}

/** Une vignette de voiture : la photo carrée (plaque masquée), le nom entier dessous, le pseudo (et le cadenas). */
export function CarTile({ car, onPress }: { car: LineupCar; onPress?: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const member = isMemberCar(car) ? car : null;
  const me = member?.me ?? false;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={[car.label, member?.pseudo, member?.private ? L.privateLock : null, me ? L.me : null]
        .filter(Boolean)
        .join(", ")}
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.tile,
        { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
        me ? { borderColor: c.accent, borderWidth: 2.5 } : null,
      ]}
      testID={me ? "lineup-car-me" : member?.private ? "lineup-car-private" : "lineup-car"}
    >
      <View style={styles.tilePhoto}>
        <Photo
          source={mediaSource(car.photoUrl)}
          placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
          style={StyleSheet.absoluteFill}
        />
        {me ? <MeBadge /> : null}
      </View>
      <View style={styles.tileText}>
        {/* Nom entier, jamais coupé : il passe à la ligne. */}
        <Text variant="posterS" color={c.ink} style={styles.tileName} testID="lineup-car-name">
          {car.label}
        </Text>
        {member ? (
          <View style={styles.who}>
            {member.private ? <Icon name="lock" size={13} color={c.ink} /> : null}
            <Text variant="caption" color={c.inkMuted} style={styles.whoText}>
              {member.pseudo}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function MeBadge() {
  const { t } = useTheme();
  return (
    <View style={[styles.me, { backgroundColor: t.color.accent }]}>
      <Text variant="label" color={t.color.accentInk} style={styles.meText}>
        {L.me}
      </Text>
    </View>
  );
}

/** Un pro sur place : logo, nom, métier (et « Média officiel »), remise pour mon grade. */
export function ProRow({ pro, grade, onPress }: { pro: LineupPro; grade: Grade | null; onPress?: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.proRow, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      testID="lineup-pro"
    >
      <ProLogo pro={pro} size={44} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink} style={styles.proName}>
          {pro.name}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.proSub}>
          <Text variant="caption" color={c.ink} style={styles.strong}>
            {pro.job}
          </Text>
          {pro.officialMedia ? (
            <>
              {" · "}
              <Text variant="caption" color={c.accentText} style={styles.strong} testID="lineup-pro-official">
                {L.officialMedia}
              </Text>
            </>
          ) : null}
        </Text>
        {pro.discount && grade ? (
          <Text variant="caption" color={c.accentText} style={styles.strong} testID="lineup-pro-discount">
            {L.discount(pro.discount, grade)}
          </Text>
        ) : null}
      </View>
      {onPress ? <Icon name="next" size={18} color={c.inkMuted} /> : null}
    </Pressable>
  );
}

/** Les pros sur place en une ligne de pastilles (bloc de la fiche) ; un prestataire ouvre sa vitrine (connecté). */
function ProPills({ pros }: { pros: LineupPro[] }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { status } = useSession();
  return (
    <View style={styles.pills} testID="lineup-pros-line">
      {pros.map((p) => (
        <Pressable
          key={`${p.kind}-${p.id}`}
          accessibilityRole={p.kind === "provider" && status === "in" ? "link" : undefined}
          disabled={!(p.kind === "provider" && status === "in")}
          onPress={() => router.push(`/providers/${p.id}`)}
          style={[styles.pill, { backgroundColor: c.ground, borderColor: c.line }]}
          testID="lineup-pro-pill"
        >
          <Icon name={p.kind === "media" || p.officialMedia ? "camera" : "shop"} size={14} color={c.inkMuted} />
          <Text variant="caption" color={c.ink} style={styles.strong}>
            {p.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** R4.3 : le bloc « Le plateau » de la fiche. */
export function LineupBlock({ eventId, slug }: { eventId: string; slug: string }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const lineup = useLineup(eventId, { limit: LINEUP_BLOCK_SIZE - 1 });
  const data: EventLineup | null = lineup.data;
  // Brouillon, privé, annulé : l'API ne montre rien, le bloc non plus.
  if (!data) return null;
  const n = data.counts.cars;
  const open = () => router.push(`/e/${slug}/plateau`);
  return (
    <View style={[styles.block, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]} testID="lineup-block">
      <View style={styles.blockHead}>
        <Text variant="posterM" color={c.ink} accessibilityRole="header">
          {L.title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {n === 0 && data.phase === "accepted" ? L.emptyCount : L.caption(data.phase)}
        </Text>
      </View>
      {n === 0 ? (
        <Text variant="body" color={c.inkMuted} testID="lineup-empty">
          {data.phase === "present" ? L.emptyPresent : L.empty}
        </Text>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${L.seeAll} · ${L.carsCount(n, data.phase)}`}
            onPress={open}
          >
            <View style={styles.thumbs} testID="lineup-thumbs">
              {data.cars.map((car, i) => (
                <View key={isMemberCar(car) ? car.vehicleId : `${i}`} style={styles.thumb}>
                  <View style={[styles.thumbIn, { backgroundColor: c.surfaceRaised }]}>
                    <Photo source={mediaSource(car.photoUrl)} style={StyleSheet.absoluteFill} />
                  </View>
                  {isMemberCar(car) && car.me ? (
                    <>
                      <View style={[styles.thumbMe, { borderColor: c.accent }]} pointerEvents="none" />
                      <MeBadge />
                    </>
                  ) : null}
                </View>
              ))}
              {n > data.cars.length ? (
                <View style={styles.thumb}>
                  <View style={[styles.thumbIn, styles.more, { backgroundColor: c.surfaceRaised }]}>
                    <Text variant="numberNarrow" color={c.ink} style={styles.moreText}>
                      +{n - data.cars.length}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </Pressable>
          <View style={styles.num}>
            <Text variant="numberNarrow" color={c.ink} style={styles.numBig} testID="lineup-count">
              {n}
            </Text>
            <View style={styles.grow}>
              <Text variant="bodyStrong" color={c.ink}>
                {L.cars(n, data.phase)}
              </Text>
              {data.counts.pros > 0 ? (
                <Text variant="caption" color={c.inkMuted}>
                  {L.prosOnSite(data.counts.pros)}
                </Text>
              ) : null}
            </View>
          </View>
        </>
      )}
      {data.pros.length > 0 ? (
        <>
          <Text variant="label" color={c.inkMuted}>
            {L.prosLabel}
          </Text>
          <ProPills pros={data.pros} />
        </>
      ) : null}
      {lineup.error ? (
        <Text variant="caption" color={c.inkMuted} testID="lineup-stale">
          {L.stale}
        </Text>
      ) : null}
      {/* Lot R4b, tour 2 : le plateau s'ouvre dès qu'il y a une voiture ou un pro. */}
      {n > 0 || data.pros.length > 0 ? (
        <Button variant="secondary" icon="grid" fullWidth onPress={open} testID="lineup-open">
          {L.seeAll}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  strong: { fontWeight: "800" },
  block: { gap: space2 + 2, padding: 14, borderRadius: radiusLg },
  blockHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  thumbs: { flexDirection: "row", gap: 6 },
  thumb: { flex: 1, aspectRatio: 1, position: "relative" },
  thumbIn: { flex: 1, borderRadius: 11, overflow: "hidden" },
  thumbMe: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2, borderRadius: 11 },
  more: { alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 20 },
  num: { flexDirection: "row", alignItems: "center", gap: space2 + 2 },
  numBig: { fontSize: 40, lineHeight: 44 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radiusPill,
    borderWidth: 1,
  },
  tile: { flex: 1, borderRadius: radiusMd, overflow: "hidden" },
  tilePhoto: { aspectRatio: 1, position: "relative" },
  tileText: { gap: 3, paddingHorizontal: 10, paddingTop: space2, paddingBottom: 10 },
  tileName: { fontSize: 12.5, lineHeight: 14 },
  who: { flexDirection: "row", alignItems: "center", gap: space1 },
  whoText: { fontWeight: "700", flexShrink: 1 },
  me: { position: "absolute", left: 6, top: 6, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  meText: { fontSize: 9.5, letterSpacing: 0.6 },
  logo: { borderRadius: radiusSm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  proRow: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: radiusMd },
  proName: { flexShrink: 1 },
  proSub: { flexShrink: 1 },
});
