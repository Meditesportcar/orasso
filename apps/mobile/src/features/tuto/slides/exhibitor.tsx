// Les sept diapos de l'exposant (artefact `s-tuto`, `data-tu="exposant"`), dans l'ordre : tu trouves, tu candidates,
// ta voiture est retenue, on te guide jusqu'à ta place, points et souvenirs, remises, ta bande. Les textes (jour,
// titre, paragraphe) sont dans `tutoSlides.exhibitor` ; ceux des illustrations dans `tutoArt`.
import { tutoArt } from "@orasso/shared";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { A, Bar, Fill, useKey } from "../anim";
import { FILL, SWATCH, T, Tag, useArt } from "../art";
import { ArtFrame, Flip, Fly, Lbl, Mark, Row } from "../blocks";
import { ArtIcon } from "../icons";
import { MscLogo, ParkScene, Photo, Qr, Stamp } from "../scenes";
import { GradesAndPros, MapFind, SocialBand } from "./common";

function Find() {
  return (
    <ArtFrame label={tutoArt.alt.find}>
      <MapFind meta={tutoArt.eventMeta} />
    </ArtFrame>
  );
}

const APath = Animated.createAnimatedComponent(Path);

/** `.tc` : le garage défile, la Supra est choisie, le règlement coché, la candidature part vers MéditeSportCar. */
function Apply() {
  const a = useArt();
  const g = tutoArt.garage;
  const sel = useKey(1.1, 0.35);
  const name = useKey(1.15, 0.3);
  const tick = useKey(1.85, 0.3);
  const ping = useKey(3.2, 0.5);
  const wait = useKey(3.3, 0.45);
  const selStyle = useAnimatedStyle(() => {
    "worklet";
    const k = sel.reduced ? 1 : sel.p.value;
    return { transform: [{ scale: 1 + 0.07 * k }] };
  });
  const selRing = useAnimatedStyle(() => {
    "worklet";
    return { opacity: sel.reduced ? 1 : sel.p.value };
  });
  const nameStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: 0.35 + 0.65 * (name.reduced ? 1 : name.p.value) };
  });
  const tickProps = useAnimatedProps(() => {
    "worklet";
    return { strokeDashoffset: 14 * (1 - (tick.reduced ? 1 : tick.p.value)) };
  });
  const pingStyle = useAnimatedStyle(() => {
    "worklet";
    const k = ping.reduced ? 1 : ping.p.value;
    return { transform: [{ scale: interpolate(k, [0, 0.45, 1], [1, 1.22, 1]) }] };
  });
  const pingRing = useAnimatedStyle(() => {
    "worklet";
    const k = ping.reduced ? 1 : ping.p.value;
    return { opacity: interpolate(k, [0, 0.45, 1], [0, 1, 0]) };
  });
  const waitStyle = useAnimatedStyle(() => {
    "worklet";
    const k = wait.reduced ? 1 : wait.p.value;
    return { opacity: k * (wait.reduced ? wait.fade.value : 1), transform: [{ translateX: 14 * (1 - k) }] };
  });
  return (
    <ArtFrame label={tutoArt.alt.apply}>
      <View style={styles.tc}>
        <Row sb>
          <Lbl>{g.kicker}</Lbl>
          <View style={styles.tcOrg}>
            <Animated.View style={waitStyle}>
              <Tag kind="line">{g.wait}</Tag>
            </Animated.View>
            <Mark id="org">
              <Animated.View style={pingStyle}>
                <Animated.View
                  style={[styles.ping, { boxShadow: `0 0 0 6px ${a.accentSoft}` }, pingRing]}
                  pointerEvents="none"
                />
                <MscLogo size={32} />
              </Animated.View>
            </Mark>
          </View>
        </Row>
        <View style={styles.rail}>
          <A k="slide" d={0.25} style={styles.strip}>
            <Photo m="s2000" style={[styles.tcCard, { boxShadow: a.shadow }]} />
            <Mark id="me">
              <Animated.View style={[styles.tcCard, selStyle]}>
                <Photo m="supra" style={FILL} />
                <Animated.View style={[FILL, styles.selRing, { boxShadow: `inset 0 0 0 3px ${a.accent}` }, selRing]} />
                <A k="pop" d={1.25} dur={0.35} style={[styles.ok, { backgroundColor: a.accent }]}>
                  <ArtIcon name="check" size={16} color={a.accentInk} />
                </A>
              </Animated.View>
            </Mark>
            <Photo m="e30" style={[styles.tcCard, { boxShadow: a.shadow }]} />
          </A>
        </View>
        <Animated.View style={nameStyle}>
          <T k="b" size={15} lh={19} color={a.ink} style={styles.center}>
            {g.car}
          </T>
        </Animated.View>
        <View style={[styles.rule, { backgroundColor: a.card2 }]}>
          <Fill from={a.card2} to={a.accent} d={1.75} dur={0.25} style={[styles.box, { borderColor: a.faint }]}>
            <Svg width={16} height={16} viewBox="0 0 16 16">
              <APath
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke={a.accentInk}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="14 14"
                animatedProps={tickProps}
              />
            </Svg>
          </Fill>
          <T k="body" size={12.5} lh={16} color={a.muted} style={styles.grow}>
            {g.rule}
          </T>
        </View>
        <A k="press" d={2.25}>
          <View style={[styles.send, { backgroundColor: a.ink }]}>
            <ArtIcon name="send" size={16} color={a.bg} />
            <View>
              <A k="out" d={2.4} dur={0.2}>
                <T k="b" size={14} lh={18} color={a.bg}>
                  {g.send}
                </T>
              </A>
              <A k="fade" d={2.45} dur={0.25} style={FILL}>
                <T k="b" size={14} lh={18} color={a.bg} style={styles.center}>
                  {g.sent}
                </T>
              </A>
            </View>
          </View>
        </A>
      </View>
      <Fly from="me" to="org" d={2.45} radius={12}>
        <Photo m="supra" style={FILL} />
      </Fly>
    </ArtFrame>
  );
}

/** `.qrsweep` : la bande moutarde qui balaie le QR (3,2 s, en boucle). */
function Sweep() {
  const a = useArt();
  const y = useSharedValue(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `y` est stable
  useEffect(() => {
    y.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(y);
  }, []);
  const style = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateY: y.value * 99 }] };
  });
  return (
    <Animated.View style={[styles.sweep, style]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
        <Defs>
          <LinearGradient id="qsw" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={a.accent} stopOpacity={0} />
            <Stop offset="0.5" stopColor={a.accent} stopOpacity={0.18} />
            <Stop offset="1" stopColor={a.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={10} height={10} fill="url(#qsw)" />
      </Svg>
    </Animated.View>
  );
}

/** `.ta-status` : « En attente » bascule en « Retenue », le QR d'accès arrive. */
function Accepted() {
  const a = useArt();
  const { accepted, garage } = tutoArt;
  return (
    <ArtFrame label={accepted.note}>
      <View style={styles.status}>
        <Flip before={garage.wait} after={garage.retained} out={0.8} inAt={1} big />
        <A
          k="qrPop"
          d={1.4}
          style={[styles.taQr, { backgroundColor: a.paper, boxShadow: `${a.shadowLg}, 0 0 0 2px ${a.accent}` }]}
        >
          <Qr size={112} label={accepted.qrLabel} />
          <Sweep />
        </A>
        <T k="cap" color={a.muted} style={styles.note}>
          {accepted.note}
        </T>
      </View>
    </ArtFrame>
  );
}

/** `.ta-park` : scan à l'entrée, la Supra suit le chemin jusqu'à sa place en zone JDM. */
function Park() {
  const p = tutoArt.parking;
  return (
    <ArtFrame label={p.label}>
      <ParkScene />
      <A k="sent" d={0.15} dur={0.5} style={styles.taScan}>
        <Tag kind="acc" icon="scan" height={32} size={12.5}>
          {p.scan}
        </Tag>
      </A>
    </ArtFrame>
  );
}

/** `.ta-souv` : le tampon tombe dans le passeport, les photos arrivent, les points montent. */
function Souvenirs() {
  const a = useArt();
  const s = tutoArt.souvenir;
  const photo = (m: "supra" | "e30", caption: string, d: number, rot: number, pos: object) => (
    <A
      k="phIn"
      d={d}
      rest={{ rot }}
      style={[styles.tsPh, { backgroundColor: SWATCH.photoPaper, boxShadow: a.shadowLg }, pos]}
    >
      <Photo m={m} style={styles.tsPhImg} />
      <T k="b" size={10} lh={13} color={SWATCH.photoCaption} style={styles.tsCaption}>
        {caption}
      </T>
    </A>
  );
  return (
    <ArtFrame label={s.stampLabel}>
      <View style={styles.souv}>
        <View style={styles.tsTop}>
          <View style={[styles.tsPage, { backgroundColor: a.card2, boxShadow: `inset 0 0 0 1px ${a.line}` }]}>
            <Lbl>{s.passport}</Lbl>
            <View style={styles.tsOld}>
              <Stamp spec="expo|66|Expo Rivesaltes|07.06.26|1" size={64} />
            </View>
            <A k="stamp" d={0.45} style={styles.tsHit}>
              <Stamp spec="nocturne|66|Nocturne de Canet|24.10.26|0" size={126} />
            </A>
          </View>
          {photo("supra", s.photoA, 1, 7, { right: 0, top: 0 })}
          {photo("e30", s.photoB, 1.2, -6, { right: "17%", top: "50%" })}
        </View>
        <A k="inUp" d={1.6} dur={0.6} style={[styles.tsPts, { backgroundColor: a.bg, boxShadow: a.shadow }]}>
          <Row sb style={styles.baseline}>
            <Lbl>{s.counted}</Lbl>
            <A k="pop" d={2} dur={0.4}>
              <T k="num" size={26} lh={26} color={a.accentText}>
                {s.plus}
              </T>
            </A>
          </Row>
          <Bar w={44} from={40} d={2.15} dur={0.8} glow />
          <Row sb>
            <T k="cap" color={a.muted}>
              {s.sport}
            </T>
            <T k="cap" color={a.muted}>
              {s.circuit}
            </T>
          </Row>
        </A>
      </View>
    </ArtFrame>
  );
}

function Season() {
  return (
    <ArtFrame label={tutoArt.grade.kicker}>
      <GradesAndPros />
    </ArtFrame>
  );
}

function Band() {
  return (
    <ArtFrame label={tutoArt.social.kicker}>
      <SocialBand crewAction="join" />
    </ArtFrame>
  );
}

export const exhibitorSlides = [Find, Apply, Accepted, Park, Souvenirs, Season, Band] as const;

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  upper: { textTransform: "uppercase" },
  baseline: { alignItems: "baseline" },
  tc: { ...FILL, justifyContent: "center", gap: 12, padding: 16 },
  tcOrg: { flexDirection: "row", alignItems: "center", gap: 8 },
  ping: { ...FILL, borderRadius: 999 },
  rail: { marginHorizontal: -16, marginVertical: -6, overflow: "hidden", paddingVertical: 14 },
  strip: { flexDirection: "row", gap: 10, justifyContent: "center" },
  tcCard: { width: 118, height: 76, borderRadius: 12, overflow: "hidden" },
  selRing: { borderRadius: 12 },
  ok: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  send: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12 },
  status: { ...FILL, alignItems: "center", justifyContent: "center", gap: 18 },
  taQr: { width: 132, padding: 10, borderRadius: 14, overflow: "hidden" },
  sweep: { position: "absolute", left: 10, right: 10, top: 10, height: 29 },
  note: { textAlign: "center", maxWidth: 190 },
  taScan: { position: "absolute", top: 14, alignSelf: "center" },
  souv: { ...FILL, padding: 18, justifyContent: "center", gap: 14 },
  tsTop: { flex: 1, minHeight: 170, maxHeight: 300 },
  tsPage: { position: "absolute", left: 0, top: 0, bottom: 0, width: "64%", borderRadius: 14, padding: 12 },
  tsOld: { position: "absolute", left: 8, bottom: 8, opacity: 0.4, transform: [{ rotate: "9deg" }] },
  tsHit: { position: "absolute", left: "50%", top: "54%", marginLeft: -63, marginTop: -63 },
  tsPh: { position: "absolute", width: "38%", paddingTop: 6, paddingHorizontal: 6, borderRadius: 6 },
  tsPhImg: { aspectRatio: 1, borderRadius: 3 },
  tsCaption: { textAlign: "center", paddingTop: 5, paddingBottom: 7 },
  tsPts: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
});
