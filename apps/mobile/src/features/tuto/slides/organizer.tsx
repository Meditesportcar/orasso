// Les six diapos de l'organisateur (artefact `s-tuto`, `data-tu="orga"`) : tu crées ton événement, tu tries d'un geste,
// tu places ton équipe, tu préviens tout le monde, le jour J en direct, les points partent tout seuls.
import { textStyles } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { A, Count, Fill, FillText, Typed, useKey } from "../anim";
import { FILL, SWATCH, T, Tag, useArt } from "../art";
import { ArtFrame, Bars, Big, BigCount, Card, Grow, It, Lbl, Nm, Row, Sm, Tz } from "../blocks";
import { ArtIcon } from "../icons";
import { OMono, Poster } from "../posters";
import { Photo, type PhotoKey } from "../scenes";

const o = tutoArt.organizer;

/** L'assistant en huit temps : la frise se remplit, le titre se tape, trois affiches sortent. */
function Create() {
  const a = useArt();
  return (
    <ArtFrame label={o.published}>
      <Tz>
        <View style={styles.steps}>
          {Array.from({ length: 8 }, (_, i) => (
            <Fill key={String(i)} from={a.line} to={a.accent} d={0.25 + i * 0.12} style={styles.step} />
          ))}
        </View>
        <View style={[styles.field, { backgroundColor: a.card2 }]}>
          <T k="b" size={11} lh={14} color={a.muted}>
            {o.fieldLabel}
          </T>
          <Typed text={o.typed} d={0.5} dur={0.9} style={[fieldText, { color: a.ink }]} />
        </View>
        <View style={styles.posters}>
          <A k="pz" d={1.5} rest={{ x: -62, rot: -9 }} style={[styles.pz, { boxShadow: a.shadowLg }]}>
            <Poster tpl="neon" size={140} />
          </A>
          <A k="pz" d={1.75} rest={{ x: 62, rot: 8 }} style={[styles.pz, { boxShadow: a.shadowLg }]}>
            <Poster tpl="jdm" size={140} />
          </A>
          <A k="pz" d={2} style={[styles.pz, { boxShadow: a.shadowLg }]}>
            <Poster tpl="flyer" size={140} />
          </A>
        </View>
        <A k="tag" d={2.6} style={styles.center}>
          <Tag kind="acc" icon="check">
            {o.published}
          </Tag>
        </A>
      </Tz>
    </ArtFrame>
  );
}
const fieldText = { ...textStyles.number, fontSize: 17, lineHeight: 22, letterSpacing: 0 } as const;

/** Une carte du tri (`.tz-tc`) : photo, véhicule, pilote, et l'étiquette posée dessus. */
function TriCard({ m, name, meta, tag }: { m: PhotoKey; name: string; meta: string; tag?: React.ReactNode }) {
  const a = useArt();
  return (
    <View style={[styles.tc, { backgroundColor: a.bg, boxShadow: a.shadowLg }]}>
      <Photo m={m} style={styles.grow} />
      <View style={styles.inf}>
        <Nm size={14}>{name}</Nm>
        <Sm>{meta}</Sm>
      </View>
      {tag}
    </View>
  );
}

/** Le tri : la Supra part à droite (retenue), la E30 monte (liste d'attente), les compteurs bougent. */
function Sort() {
  const a = useArt();
  const right = useKey(1.25, 0.55);
  const front = useKey(1.75, 0.4);
  const upk = useKey(2.55, 0.55);
  const rightStyle = useAnimatedStyle(() => {
    "worklet";
    const k = right.reduced ? 1 : right.p.value;
    return { opacity: 1 - k, transform: [{ translateX: k * 350 }, { rotate: `${18 * k}deg` }] };
  });
  const frontStyle = useAnimatedStyle(() => {
    "worklet";
    const k = front.reduced ? 1 : front.p.value;
    return { opacity: 0.85 + 0.15 * k, transform: [{ translateY: 9 * (1 - k) }, { scale: 0.95 + 0.05 * k }] };
  });
  const upStyle = useAnimatedStyle(() => {
    "worklet";
    const k = upk.reduced ? 1 : upk.p.value;
    return { opacity: 1 - k, transform: [{ translateY: -280 * k }, { rotate: `${-4 * k}deg` }] };
  });
  const stampTag = (kind: "acc" | "line", text: string, d: number) => (
    <A k="tag" d={d} style={styles.stampt}>
      <Tag
        kind={kind}
        height={30}
        size={13}
        style={[kind === "line" ? { backgroundColor: a.bg } : null, { boxShadow: a.shadow }]}
      >
        {text}
      </Tag>
    </A>
  );
  return (
    <ArtFrame label={o.retained}>
      <Tz>
        <View style={styles.duo}>
          <Card style={styles.grow}>
            <Lbl>{o.retained}</Lbl>
            <Big small="/ 60">
              <BigCount to={42} from={41} d={1.5} dur={0.3} />
            </Big>
          </Card>
          <Card style={styles.grow}>
            <Lbl>{o.waitlist}</Lbl>
            <Big>
              <BigCount to={8} from={7} d={2.75} dur={0.3} />
            </Big>
          </Card>
        </View>
        <View style={styles.tri}>
          <View style={[styles.tcw, styles.b2]}>
            <TriCard m="s2000" name={o.cardA.name} meta={o.cardA.meta} />
          </View>
          <Animated.View style={[styles.tcw, frontStyle]}>
            <Animated.View style={[FILL, upStyle]}>
              <TriCard
                m="e30"
                name={o.cardB.name}
                meta={o.cardB.meta}
                tag={stampTag("line", tutoArt.garage.waitlist, 2.2)}
              />
            </Animated.View>
          </Animated.View>
          <View style={styles.tcw}>
            <Animated.View style={[FILL, rightStyle]}>
              <TriCard
                m="supra"
                name={o.cardC.name}
                meta={o.cardC.meta}
                tag={stampTag("acc", tutoArt.garage.retained, 0.8)}
              />
            </Animated.View>
          </View>
        </View>
      </Tz>
    </ArtFrame>
  );
}

const BUBBLES = [
  { i: "SA", c: SWATCH.blue, x: 26, y: 30, s: 96, f: 24, role: 0, d: 0.2 },
  { i: "TH", c: SWATCH.wine, x: 66, y: 20, s: 74, f: 18, role: 1, d: 0.35 },
  { i: "LU", c: SWATCH.graphite, x: 60, y: 64, s: 64, f: 16, role: 2, d: 0.5 },
  { i: "NA", c: SWATCH.navy, x: 18, y: 72, s: 52, f: 13, role: -1, d: 0.65 },
  { i: "JO", c: SWATCH.taupe, x: 86, y: 62, s: 44, f: 12, role: -1, d: 0.8 },
] as const;

/** L'équipe en bulles (la taille dit l'engagement), un rôle par bénévole, la demande en pointillés. */
function Team() {
  const a = useArt();
  const [w, setW] = useState(0);
  return (
    <ArtFrame label={o.team.kicker}>
      <Tz>
        <Row sb>
          <Lbl>{o.team.kicker}</Lbl>
          <A k="tag" d={0.2}>
            <Tag kind="line">{o.team.volunteers}</Tag>
          </A>
        </Row>
        <View style={styles.bubs} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {w > 0
            ? BUBBLES.map((b) => (
                <A
                  key={b.i}
                  k="pop"
                  d={b.d}
                  style={[
                    styles.bub,
                    {
                      left: (b.x / 100) * w - b.s / 2,
                      top: (b.y / 100) * 240 - b.s / 2,
                      width: b.s,
                      height: b.s,
                      backgroundColor: b.c,
                    },
                  ]}
                >
                  <T k="label" size={b.f} lh={b.f + 2} color={a.paper}>
                    {b.i}
                  </T>
                  {b.role >= 0 ? (
                    <A k="tag" d={1.3 + b.role * 0.15} style={styles.role}>
                      <Tag kind="acc" size={10.5}>
                        {o.team.roles[b.role as 0 | 1 | 2] ?? ""}
                      </Tag>
                    </A>
                  ) : null}
                </A>
              ))
            : null}
          {w > 0 ? (
            <A
              k="pop"
              d={0.95}
              style={[
                styles.bub,
                styles.req,
                {
                  left: 0.44 * w - 22,
                  top: 0.86 * 240 - 22,
                  width: 44,
                  height: 44,
                  borderColor: a.ink,
                  outlineColor: a.accent,
                },
              ]}
            >
              <T k="label" size={18} lh={20} color={a.ink}>
                +
              </T>
            </A>
          ) : null}
        </View>
      </Tz>
    </ArtFrame>
  );
}

/** La météo tourne : « Incertain », et tous les inscrits reçoivent la notification et les annonces. */
function Warn() {
  const a = useArt();
  const w = o.weather;
  const off = useKey(1, 0.3);
  const offStyle = useAnimatedStyle(() => {
    "worklet";
    const k = off.reduced ? 1 : off.p.value;
    return { opacity: 1 - k };
  });
  return (
    <ArtFrame label={w.title}>
      <Tz>
        <A k="up" d={0.1}>
          <Card>
            <Row>
              <View style={[styles.wx, { backgroundColor: a.card2 }]}>
                <ArtIcon name="drop" size={20} color={a.accentText} />
              </View>
              <Grow>
                <Nm>{w.title}</Nm>
                <Sm>{w.meta}</Sm>
              </Grow>
            </Row>
          </Card>
        </A>
        <View style={[styles.seg, { backgroundColor: a.card2 }]}>
          <View style={styles.segCell}>
            <Animated.View style={[FILL, styles.segOn, { backgroundColor: a.bg, boxShadow: a.shadow }, offStyle]} />
            <T k="b" size={12.5} lh={16} color={a.muted}>
              {w.segments[0]}
            </T>
          </View>
          <Fill from={a.card2} to={a.accent} d={1} style={[styles.segCell, styles.segOn]}>
            <FillText from={a.muted} to={a.accentInk} d={1} size={12.5}>
              {w.segments[1]}
            </FillText>
          </Fill>
          <View style={styles.segCell}>
            <T k="b" size={12.5} lh={16} color={a.muted}>
              {w.segments[2]}
            </T>
          </View>
        </View>
        <View style={styles.list}>
          {w.notifs.map((n, i) => (
            <A
              key={n.small}
              k="up"
              d={1.35 + i * 0.5}
              style={[styles.nt, { backgroundColor: a.bg, boxShadow: a.shadow }]}
            >
              <View style={[styles.ni, { backgroundColor: a.ink }]}>
                <OMono size={18} color={a.accent} />
              </View>
              <Grow>
                <T k="body" size={11} lh={14} color={a.muted}>
                  {n.small}
                </T>
                <T k="semi" size={13} lh={17} color={a.ink}>
                  {n.text}
                </T>
              </Grow>
            </A>
          ))}
        </View>
        <A k="tag" d={2.8} style={styles.center}>
          <View style={[styles.lineTag, { borderColor: a.ink }]}>
            <View style={styles.unskew}>
              <ArtIcon name="bell" size={16} color={a.ink} />
              <T k="label" size={11} lh={13} color={a.ink}>
                {`${w.sent} `}
                <Count to={148} d={2.8} />
                {` ${w.sentTail}`}
              </T>
            </View>
          </View>
        </A>
      </Tz>
    </ArtFrame>
  );
}

/** Le direct : entrées qui montent, remplissage des zones, scans du staff même hors ligne. */
function Live() {
  const a = useArt();
  const l = o.live;
  return (
    <ArtFrame label={l.entered}>
      <Tz>
        <Row sb>
          <View>
            <Lbl>{l.entered}</Lbl>
            <Big small="/ 120">
              <BigCount to={87} d={0.2} dur={1.4} />
            </Big>
          </View>
          <A k="tag" d={0.5}>
            <Tag kind="line" icon="wifioff">
              {l.offline}
            </Tag>
          </A>
        </Row>
        <Card>
          <Bars rows={l.zones.map((z, i) => ({ ...z, d: 0.5 + i * 0.12 }))} />
        </Card>
        <View style={styles.list}>
          {l.scans.map((s, i) => (
            <A key={s.text} k="inr" d={1.2 + i * 0.4}>
              <It>
                <View
                  style={[
                    styles.okDot,
                    s.ok
                      ? { backgroundColor: a.accent, boxShadow: `0 0 0 4px ${a.accentSoft}` }
                      : { backgroundColor: a.faint },
                  ]}
                />
                <Grow>
                  <Nm>{s.text}</Nm>
                  <Sm>{s.meta}</Sm>
                </Grow>
              </It>
            </A>
          ))}
        </View>
      </Tz>
    </ArtFrame>
  );
}

/** J+2 : le pointage fait foi, les points partent, le malus de l'absent. */
function Points() {
  const a = useArt();
  const pt = o.points;
  return (
    <ArtFrame label={pt.done}>
      <Tz>
        <A k="up" d={0.1}>
          <Card>
            <Row sb>
              <Lbl>{pt.done}</Lbl>
              <T k="cap" color={a.muted}>
                {tutoArt.event.title}
              </T>
            </Row>
            <Big small={pt.present}>
              <BigCount to={112} d={0.35} />
            </Big>
          </Card>
        </A>
        <View style={styles.list}>
          {pt.rows.map((r, i) => (
            <A key={r.name} k="inr" d={0.9 + i * 0.15}>
              <It>
                <Grow>
                  <Nm>{r.name}</Nm>
                  <Sm>{r.meta}</Sm>
                </Grow>
                <A k="tag" d={1.25 + i * 0.15}>
                  <Tag kind={r.accent ? "acc" : "line"}>{r.tag}</Tag>
                </A>
              </It>
            </A>
          ))}
        </View>
        <A k="tag" d={2.1} style={styles.center}>
          <Tag kind="line" icon="send">
            {pt.sent}
          </Tag>
        </A>
      </Tz>
    </ArtFrame>
  );
}

export const organizerSlides = [Create, Sort, Team, Warn, Live, Points] as const;

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  center: { alignSelf: "center" },
  unskew: { flexDirection: "row", alignItems: "center", gap: 5, transform: [{ skewX: "8deg" }] },
  lineTag: {
    alignSelf: "flex-start",
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: "center",
    transform: [{ skewX: "-8deg" }],
  },
  steps: { flexDirection: "row", gap: 4 },
  step: { flex: 1, height: 5, borderRadius: 3 },
  field: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  posters: { height: 150 },
  pz: {
    position: "absolute",
    top: 4,
    left: "50%",
    marginLeft: -70,
    width: 140,
    height: 140,
    borderRadius: 10,
    overflow: "hidden",
  },
  duo: { flexDirection: "row", gap: 10 },
  tri: { height: 250 },
  tcw: { ...FILL, left: 14, right: 14 },
  b2: { opacity: 0.6, transform: [{ translateY: 18 }, { scale: 0.9 }] },
  tc: { ...FILL, borderRadius: 16, overflow: "hidden" },
  inf: { paddingVertical: 10, paddingHorizontal: 12 },
  stampt: { position: "absolute", left: 12, top: 12 },
  bubs: { height: 240 },
  bub: {
    position: "absolute",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 18px rgba(0,0,0,.25)",
  },
  req: {
    backgroundColor: "transparent",
    borderWidth: 2,
    outlineWidth: 2,
    outlineStyle: "dashed",
    outlineOffset: 4,
    boxShadow: "none",
  },
  role: { position: "absolute", bottom: -12, alignSelf: "center" },
  wx: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  seg: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 12 },
  segCell: { flex: 1, height: 32, alignItems: "center", justifyContent: "center" },
  segOn: { borderRadius: 9 },
  list: { gap: 8 },
  nt: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  ni: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  okDot: { width: 10, height: 10, borderRadius: 5 },
});
