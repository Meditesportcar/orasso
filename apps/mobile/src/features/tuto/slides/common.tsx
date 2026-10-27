// Les illustrations partagées par plusieurs tutos (lot C3, artefact `s-tuto`) : la carte d'Explorer avec son épingle
// (`.ta-map`, `.ta-pin`, `.ta-card`), le lecteur de QR (`.tz-scan`), le grade et les pros (`.tg`), la bande (`.tz`).
import { tutoArt } from "@orasso/shared";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";

import { A, Fill, useKey } from "../anim";
import { Badge, DateMini, FILL, SWATCH, T, Tag, useArt } from "../art";
import { Card, Chip, Grow, It, Lbl, Nm, Row, Sm, Tz } from "../blocks";
import { ArtIcon } from "../icons";
import { MapMini, Pin, Qr } from "../scenes";

/** `.ta-pin` : l'épingle tombe sur la carte (`pinDrop`, 0,6 s). */
export function DroppedPin() {
  const { p, reduced, fade } = useKey(0, 0.6);
  const style = useAnimatedStyle(() => {
    "worklet";
    const k = reduced ? 1 : p.value;
    return {
      opacity: reduced ? fade.value : interpolate(k, [0, 0.7, 1], [0, 1, 1]),
      transform: [{ translateY: interpolate(k, [0, 0.7, 1], [-32, 3, 0]) }],
    };
  });
  return (
    <Animated.View style={[styles.pin, style]}>
      <Pin />
    </Animated.View>
  );
}

/** `.ta-card` : la carte posée en bas de l'illustration (fond, ombre forte), qui monte à 0,25 s (`inUp`). */
export function FloatCard({ children }: { children: ReactNode }) {
  const a = useArt();
  return (
    <A k="inUp" d={0.25} dur={0.6} style={[styles.floatCard, { backgroundColor: a.bg, boxShadow: a.shadowLg }]}>
      {children}
    </A>
  );
}

/** La carte d'Explorer : la carte du 66, l'épingle et l'événement le plus proche. */
export function MapFind({ meta }: { meta: string }) {
  const a = useArt();
  const e = tutoArt.event;
  return (
    <>
      <View style={FILL}>
        <MapMini />
      </View>
      <DroppedPin />
      <FloatCard>
        <DateMini weekday={e.weekday} day={e.day} month={e.month} />
        <View style={styles.grow}>
          <T k="poster" size={13} lh={14} color={a.ink}>
            {e.title}
          </T>
          <T k="cap" color={a.muted}>
            {meta}
          </T>
        </View>
      </FloatCard>
    </>
  );
}

/** `.tz-scan` : le lecteur (cadre moutarde, QR, laser deux fois), puis l'écran moutarde du scan réussi. */
export function Scanner({
  qrAt,
  laserAt,
  okAt,
  children,
}: {
  qrAt: number;
  laserAt: number;
  okAt: number;
  children: ReactNode;
}) {
  const a = useArt();
  const laser = useKey(laserAt, 1.1);
  const laserStyle = useAnimatedStyle(() => {
    "worklet";
    if (laser.reduced) return { opacity: 0 };
    const k = laser.p.value;
    // Aller-retour (`alternate`, deux fois 0,55 s) ; avant le départ, le laser est éteint.
    const y = k < 0.5 ? k * 2 : 2 - k * 2;
    return { opacity: k > 0 && k < 1 ? 1 : 0, transform: [{ translateY: y * 140 }] };
  });
  const corner = (pos: object) => (
    <View style={[styles.corner, pos]}>
      <View style={[styles.cornerH, { backgroundColor: a.accent }]} />
      <View style={[styles.cornerV, { backgroundColor: a.accent }]} />
    </View>
  );
  return (
    <View style={[styles.scan, { backgroundColor: SWATCH.reader, boxShadow: a.shadowLg }]}>
      {corner({ left: 14, top: 14 })}
      {corner({ right: 14, top: 14, transform: [{ scaleX: -1 }] })}
      {corner({ left: 14, bottom: 14, transform: [{ scaleY: -1 }] })}
      {corner({ right: 14, bottom: 14, transform: [{ scale: -1 }] })}
      <A k="pop" d={qrAt} style={[styles.scanQr, { backgroundColor: a.paper }]}>
        <Qr size={86} label={tutoArt.alt.qrAccount} />
      </A>
      <Animated.View
        style={[styles.laser, { backgroundColor: a.accent, boxShadow: `0 0 12px ${a.accent}` }, laserStyle]}
      />
      <A k="fade" d={okAt} style={[FILL, styles.scanOk, { backgroundColor: a.accent }]}>
        {children}
      </A>
    </View>
  );
}

/** Le texte de l'écran moutarde du scan : grand mot en chiffres étroits, puis les précisions. */
export function ScanOk({ big, lines }: { big: string; lines: string[] }) {
  const a = useArt();
  return (
    <>
      <T k="num" size={24} lh={24} color={a.accentInk} style={styles.upper}>
        {big}
      </T>
      {lines.map((l) => (
        <T key={l} k="semi" size={11.5} lh={15} color={a.accentInk} style={styles.center}>
          {l}
        </T>
      ))}
    </>
  );
}

/** `.tg` : le grade de la saison qui se remplit, la recherche de pros, le pro choisi, puis la remise scannée. */
export function GradesAndPros() {
  const a = useArt();
  const g = tutoArt.grade;
  const proColors = [a.avatarBlue, a.vitrineTo, SWATCH.graphite];
  return (
    <View style={styles.tg}>
      <A k="inUp" d={0.15} dur={0.5} style={[styles.tgGrade, { backgroundColor: a.bg, boxShadow: a.shadow }]}>
        <Row sb style={styles.baseline}>
          <Lbl>{g.kicker}</Lbl>
          <T k="num" size={24} lh={24} color={a.accentText} style={styles.upper}>
            {g.name}
          </T>
        </Row>
        <View style={styles.steps}>
          {g.steps.map((s, i) => (
            <View key={s} style={styles.step}>
              {i < 3 ? (
                <Fill from={a.line} to={a.accent} d={0.45 + i * 0.15} dur={0.25} style={styles.stepBar} />
              ) : (
                <View style={[styles.stepBar, { backgroundColor: a.line }]} />
              )}
              <T k="label" size={9.5} lh={12} color={i === 2 ? a.ink : a.faint} style={styles.stepText}>
                {s}
              </T>
            </View>
          ))}
        </View>
      </A>
      <A k="inUp" d={0.95} dur={0.5} style={[styles.tgSearch, { backgroundColor: a.card2 }]}>
        <ArtIcon name="search" size={16} color={a.muted} />
        <T k="b" size={13} lh={16} color={a.muted}>
          {g.search}
        </T>
      </A>
      <View style={styles.tgList}>
        {g.pros.map((p, i) => (
          <A key={p.name} k="inr" d={1.15 + i * 0.15} dur={0.45}>
            <It>
              <Badge initials={p.logo} color={proColors[i] ?? a.avatarBlue} size={34} radius={9} font={13} />
              <Grow>
                <Nm>{p.name}</Nm>
                <Sm>{p.meta}</Sm>
              </Grow>
              <Tag kind="line">{p.discount}</Tag>
              {i === 0 ? <PickRing /> : null}
            </It>
          </A>
        ))}
      </View>
      <A k="tag" d={2.4} style={styles.center}>
        <Tag kind="acc" icon="scan" height={32} size={12}>
          {g.scanned}
        </Tag>
      </A>
    </View>
  );
}

/** `tgPick` : le premier pro est choisi (liseré moutarde, léger zoom) à 2,1 s. */
function PickRing() {
  const a = useArt();
  return (
    <A k="fade" d={2.1} dur={0.35} style={[FILL, styles.noTouch]}>
      <View style={[FILL, { borderRadius: 12, boxShadow: `0 0 0 2px ${a.accent}` }]} />
    </A>
  );
}

/** La bande : crew et personne du coin (suivre, rejoindre), discussion, personnes suivies qui y vont. */
export function SocialBand({ crewAction }: { crewAction: "join" | "follow" }) {
  const a = useArt();
  const s = tutoArt.social;
  const swap = (before: string, after: string, d: number) => (
    <Fill from={a.ink} to={a.accent} d={d} style={styles.act}>
      <A k="out" d={d} style={styles.actLayer}>
        <T k="b" size={12} lh={15} color={a.bg}>
          {before}
        </T>
      </A>
      <A k="fade" d={d + 0.1} dur={0.4} style={styles.actLayer}>
        <T k="b" size={12} lh={15} color={a.accentInk}>
          {after}
        </T>
      </A>
      <T k="b" size={12} lh={15} color="transparent">
        {before.length > after.length ? before : after}
      </T>
    </Fill>
  );
  return (
    <Tz>
      <Row sb>
        <Lbl>{s.kicker}</Lbl>
        <Chip>{tutoArt.department}</Chip>
      </Row>
      <A k="inr" d={0.2}>
        <It>
          <Badge initials={s.crew.logo} color={a.accent} ink={a.accentInk} round />
          <Grow>
            <Nm>{s.crew.name}</Nm>
            <Sm>{s.crew.meta}</Sm>
          </Grow>
          {crewAction === "join" ? swap(s.join, s.requested, 1) : swap(s.follow, s.followed, 1)}
        </It>
      </A>
      <A k="inr" d={0.35}>
        <It>
          <Badge initials={s.person.logo} color={SWATCH.graphite} round font={12} />
          <Grow>
            <Nm>{s.person.name}</Nm>
            <Sm>{s.person.meta}</Sm>
          </Grow>
          {swap(s.follow, s.followed, 1.3)}
        </It>
      </A>
      <View style={styles.chat}>
        <A k="up" d={1.8} style={[styles.msg, { backgroundColor: a.card2 }]}>
          <T k="b" size={10.5} lh={13} color={a.muted}>
            {s.chatFrom}
          </T>
          <T k="body" size={13} lh={17.5} color={a.ink}>
            {s.chatA}
          </T>
        </A>
        <A k="up" d={2.4} style={[styles.msg, styles.msgMe, { backgroundColor: a.accent }]}>
          <T k="body" size={13} lh={17.5} color={a.accentInk}>
            {s.chatB}
          </T>
        </A>
      </View>
      <A k="up" d={2.9} style={styles.friends}>
        <View style={styles.avs}>
          {[SWATCH.graphite, a.avatarBlue, a.vitrineFrom].map((c) => (
            <View key={c} style={[styles.av, { backgroundColor: c, boxShadow: `0 0 0 2px ${a.card}` }]} />
          ))}
        </View>
        <T k="cap" color={a.muted}>
          {s.friends}
        </T>
      </A>
    </Tz>
  );
}

/** La carte d'un QR sur papier (`.q`), au coin d'un billet ou d'un badge. */
export function PaperQr({ size = 62, d, label }: { size?: number; d?: number; label: string }) {
  const a = useArt();
  const box = (
    <View style={[styles.paperQr, { width: size, backgroundColor: a.paper }]}>
      <Qr size={size - 10} label={label} />
    </View>
  );
  return d === undefined ? (
    box
  ) : (
    <A k="pop" d={d}>
      {box}
    </A>
  );
}

export { Card };

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  upper: { textTransform: "uppercase" },
  center: { alignSelf: "center", textAlign: "center" },
  baseline: { alignItems: "baseline" },
  noTouch: { pointerEvents: "none" },
  pin: { position: "absolute", left: "58%", top: "30%", marginLeft: -22, marginTop: -54 },
  floatCard: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    padding: 10,
    alignItems: "center",
  },
  scan: {
    alignSelf: "center",
    width: 180,
    maxWidth: "60%",
    aspectRatio: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  corner: { position: "absolute", width: 24, height: 24 },
  cornerH: { position: "absolute", left: 0, top: 0, width: 24, height: 3 },
  cornerV: { position: "absolute", left: 0, top: 0, width: 3, height: 24 },
  scanQr: { width: "56%", aspectRatio: 1, padding: 7, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  laser: { position: "absolute", left: 14, right: 14, top: 16, height: 2 },
  scanOk: { alignItems: "center", justifyContent: "center", gap: 4, padding: 12 },
  tg: { ...FILL, padding: 18, justifyContent: "center", gap: 12 },
  tgGrade: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  steps: { flexDirection: "row", gap: 4 },
  step: { flex: 1, alignItems: "center" },
  stepBar: { alignSelf: "stretch", height: 5, borderRadius: 3 },
  stepText: { marginTop: 5, letterSpacing: 0.4, textAlign: "center" },
  tgSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  tgList: { gap: 8 },
  act: { height: 30, paddingHorizontal: 12, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  actLayer: { position: "absolute" },
  chat: { gap: 6 },
  msg: {
    maxWidth: "84%",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 4,
    alignSelf: "flex-start",
  },
  msgMe: { alignSelf: "flex-end", borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  friends: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  avs: { flexDirection: "row", paddingLeft: 6 },
  av: { width: 22, height: 22, borderRadius: 11, marginLeft: -6 },
  paperQr: { aspectRatio: 1, padding: 5, borderRadius: 6, alignItems: "center", justifyContent: "center" },
});
