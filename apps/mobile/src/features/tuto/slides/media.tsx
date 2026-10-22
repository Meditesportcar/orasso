// Les quatre diapos du média (artefact `s-tuto`, `data-tu="media"`) : tu repères quoi couvrir, tu demandes ton
// accréditation, badge presse et zones photo, tes vidéos mises en avant.
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { A, Bar, Count, Fill, FillText } from "../anim";
import { Badge, FILL, SWATCH, T, Tag, useArt } from "../art";
import { ArtFrame, Btn, Card, Chip, Chips, Flip, Fly, Grow, It, Lbl, Mark, Nm, Row, Sm, Tz } from "../blocks";
import { ArtIcon } from "../icons";
import { MscLogo, Photo } from "../scenes";
import { PaperQr } from "./common";

const md = tutoArt.media;

/** La semaine de l'agenda : le samedi s'allume, la Nocturne est gardée. */
function Agenda() {
  const a = useArt();
  return (
    <ArtFrame label={md.agenda}>
      <Tz>
        <Row sb>
          <Lbl>{md.agenda}</Lbl>
          <Chip>{tutoArt.departments}</Chip>
        </Row>
        <View style={styles.week}>
          {md.week.map((d, i) => {
            const ev = i >= 5;
            const body = (lit: boolean) => (
              <>
                <T k="b" size={10} lh={12} color={a.muted}>
                  {d.d}
                </T>
                {lit ? (
                  <FillText from={a.ink} to={a.accentInk} d={0.5} size={20} weight="num">
                    {d.n}
                  </FillText>
                ) : (
                  <T k="num" size={20} lh={22} color={a.ink}>
                    {d.n}
                  </T>
                )}
              </>
            );
            const inset = ev ? { boxShadow: `inset 0 -3px 0 ${a.accent}` } : null;
            return i === 5 ? (
              <Fill key={d.n} from={a.card2} to={a.accent} d={0.5} style={[styles.day, inset]}>
                {body(true)}
              </Fill>
            ) : (
              <View key={d.n} style={[styles.day, { backgroundColor: a.card2 }, inset]}>
                {body(false)}
              </View>
            );
          })}
        </View>
        <View style={styles.list}>
          {md.items.map((it, i) => (
            <A key={it.name} k="inr" d={0.9 + i * 0.15}>
              <It>
                <Grow>
                  <Nm>{it.name}</Nm>
                  <Sm>{it.meta}</Sm>
                </Grow>
                {i === 0 ? (
                  <Fill from="transparent" to={a.accent} d={1.5} style={styles.book}>
                    <ArtIcon name="star" size={20} color={a.accentInk} />
                  </Fill>
                ) : (
                  <View style={styles.book}>
                    <ArtIcon name="star" size={20} color={a.faint} />
                  </View>
                )}
              </It>
            </A>
          ))}
        </View>
        <A k="tag" d={1.9} style={styles.center}>
          <Tag kind="line" icon="cal">
            {md.kept}
          </Tag>
        </A>
      </Tz>
    </ArtFrame>
  );
}

/** La carte média part vers MéditeSportCar ; la réponse tombe plus tard : accréditation validée. */
function Request() {
  const r = md.request;
  return (
    <ArtFrame label={r.send}>
      <Tz>
        <Row sb>
          <Lbl>{tutoArt.event.title}</Lbl>
          <View style={styles.org}>
            <Flip before={tutoArt.garage.wait} after={r.accredited} out={0} inAt={3.2} late />
            <Mark id="org">
              <MscLogo size={32} />
            </Mark>
          </View>
        </Row>
        <Mark id="mc">
          <Card>
            <Row>
              <Badge initials={r.card.logo} color={SWATCH.navy} />
              <Grow>
                <Nm>{r.card.name}</Nm>
                <Sm>{r.card.meta}</Sm>
              </Grow>
            </Row>
            <Chips>
              <Chip on={0.5} icon="camera">
                {r.chips[0]}
              </Chip>
              <Chip on={0.65}>{r.chips[1]}</Chip>
              <Chip>{r.chips[2]}</Chip>
            </Chips>
          </Card>
        </Mark>
        <Btn icon="send" press={1.3}>
          {r.send}
        </Btn>
      </Tz>
      <Fly from="mc" to="org" d={1.6}>
        <FlyCard initials={r.card.logo} />
      </Fly>
    </ArtFrame>
  );
}

/** `.tz-flym` : la carte qui vole, réduite à son logo. */
function FlyCard({ initials }: { initials: string }) {
  const a = useArt();
  return (
    <View style={[FILL, styles.flym, { backgroundColor: a.bg }]}>
      <Badge initials={initials} color={SWATCH.navy} size={60} font={22} />
    </View>
  );
}

/** Le badge presse (QR qui change) et les zones permises ou non. */
function Badges() {
  const a = useArt();
  const b = md.badge;
  return (
    <ArtFrame label={b.band}>
      <Tz>
        <A k="up" d={0.1} style={[styles.badge, { backgroundColor: a.night, boxShadow: a.shadowLg }]}>
          <View style={[styles.bd, { backgroundColor: a.accent }]}>
            <T k="label" size={12} lh={14} color={a.accentInk} style={styles.bdText}>
              {b.band}
            </T>
          </View>
          <Row>
            <Grow>
              <T k="b" size={15} lh={19} color={a.paper}>
                {b.name}
              </T>
              <T k="body" size={11.5} lh={15} color={SWATCH.nightMuted}>
                {b.meta}
              </T>
            </Grow>
            <PaperQr d={0.5} label={tutoArt.alt.qrBadge} />
          </Row>
          <T k="body" size={10.5} lh={14} color={SWATCH.nightMuted}>
            {b.renew}
          </T>
        </A>
        <View style={styles.list}>
          {b.zones.map((z, i) => (
            <A key={z.name} k="inr" d={1 + i * 0.15}>
              <It>
                <ArtIcon name={z.yes ? "check" : "x"} size={16} color={z.yes ? a.accentText : a.faint} />
                <Grow>
                  <Nm>{z.name}</Nm>
                  <Sm>{z.meta}</Sm>
                </Grow>
              </It>
            </A>
          ))}
        </View>
      </Tz>
    </ArtFrame>
  );
}

/** L'envoi des vidéos et photos, puis la page de l'événement qui les met en avant. */
function Publish() {
  const a = useArt();
  const p = md.publish;
  return (
    <ArtFrame label={p.sending}>
      <Tz>
        <A k="up" d={0.1}>
          <Card>
            <Row sb>
              <Lbl>{p.sending}</Lbl>
              <A k="fade" d={1.3}>
                <T k="cap" color={a.muted}>
                  {p.done}
                </T>
              </A>
            </Row>
            <Bar w={100} d={0.3} />
          </Card>
        </A>
        <A k="up" d={1.4}>
          <Card>
            <Row sb>
              <Nm>{tutoArt.event.title}</Nm>
              <T k="cap" color={a.muted}>
                {p.seenBy}
              </T>
            </Row>
            <View style={styles.vid}>
              <Photo m="supra" style={FILL} />
              <View style={[styles.play, { backgroundColor: SWATCH.playScrim }]}>
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path d="M8 5v14l11-7z" fill={a.paper} />
                </Svg>
              </View>
            </View>
            <View style={styles.thumbs}>
              {(["e30", "s2000", "supra"] as const).map((m, i) => (
                <A key={m} k="pop" d={1.9 + i * 0.1} style={styles.thumb}>
                  <Photo m={m} style={FILL} />
                </A>
              ))}
            </View>
          </Card>
        </A>
        <A k="tag" d={2.4} style={styles.center}>
          <View style={[styles.lineTag, { borderColor: a.ink }]}>
            <View style={styles.unskew}>
              <ArtIcon name="eye" size={16} color={a.ink} />
              <T k="label" size={11} lh={13} color={a.ink}>
                <Count to={2310} d={2.4} />
                {` ${p.views}`}
              </T>
            </View>
          </View>
        </A>
      </Tz>
    </ArtFrame>
  );
}

export const mediaSlides = [Agenda, Request, Badges, Publish] as const;

const styles = StyleSheet.create({
  center: { alignSelf: "center" },
  list: { gap: 8 },
  org: { flexDirection: "row", alignItems: "center", gap: 8 },
  week: { flexDirection: "row", gap: 4 },
  day: { flex: 1, alignItems: "center", gap: 1, paddingVertical: 7, borderRadius: 10 },
  book: { width: 30, height: 30, borderRadius: 15, padding: 5, alignItems: "center", justifyContent: "center" },
  flym: { alignItems: "center", justifyContent: "center" },
  badge: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
  bd: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 4,
    transform: [{ skewX: "-8deg" }],
  },
  bdText: { letterSpacing: 1.7, transform: [{ skewX: "8deg" }] },
  vid: { height: 110, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  thumbs: { flexDirection: "row", gap: 6 },
  thumb: { flex: 1, aspectRatio: 4 / 3, borderRadius: 8, overflow: "hidden" },
  lineTag: {
    alignSelf: "flex-start",
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: "center",
    transform: [{ skewX: "-8deg" }],
  },
  unskew: { flexDirection: "row", alignItems: "center", gap: 5, transform: [{ skewX: "8deg" }] },
});
