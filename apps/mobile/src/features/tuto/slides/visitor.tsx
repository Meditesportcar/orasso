// Les six diapos du visiteur (artefact `s-tuto`, `data-tu="visiteur"`) : tu trouves une expo, tu réserves ton entrée,
// un scan un tampon, tu votes, tes points t'ouvrent des remises, tu retrouves ta bande.
import { textStyles } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { A, Bar, Count, useKey } from "../anim";
import { DateMini, FILL, T, Tag, useArt } from "../art";
import { ArtFrame, Btn, Card, Grow, Lbl, Nm, Ring, Row, Sm, Tz } from "../blocks";
import { MscLogo, Photo, type PhotoKey, Stamp } from "../scenes";
import { GradesAndPros, MapFind, PaperQr, Scanner, ScanOk, SocialBand } from "./common";

const v = tutoArt.visitor;

function FindExpo() {
  return (
    <ArtFrame label={tutoArt.alt.findPublic}>
      <MapFind meta={tutoArt.eventMetaPublic} />
    </ArtFrame>
  );
}

/** La fiche de la Nocturne, « Réserver mon entrée », puis le billet et son QR dans Sorties. */
function Reserve() {
  const a = useArt();
  const e = tutoArt.event;
  return (
    <ArtFrame label={v.reserve}>
      <Tz>
        <A k="up" d={0.15}>
          <Card>
            <Row>
              <MscLogo />
              <Grow>
                <Nm>{e.title}</Nm>
                <Sm>{v.dates}</Sm>
              </Grow>
            </Row>
            <Row sb>
              <T k="cap" color={a.muted}>
                {v.publicEntry}
              </T>
              <Nm>{v.free}</Nm>
            </Row>
          </Card>
        </A>
        <Btn icon="ticket" press={0.95}>
          {v.reserve}
        </Btn>
        <A k="up" d={1.35} style={[styles.ticket, { backgroundColor: a.card2, boxShadow: a.shadowLg }]}>
          <View style={[styles.stub, { borderRightColor: a.line }]}>
            <DateMini weekday={e.weekday} day={e.day} month={e.month} />
          </View>
          <Grow>
            <Nm>{e.title}</Nm>
            <Sm>{v.ticketFor}</Sm>
            <Sm>{v.inOutings}</Sm>
          </Grow>
          <PaperQr d={1.85} label={tutoArt.alt.qrTicket} />
        </A>
      </Tz>
    </ArtFrame>
  );
}

/** Le lecteur lit le billet, « Scan OK », puis le tampon de la Nocturne tombe dans le passeport. */
function ScanStamp() {
  const a = useArt();
  return (
    <ArtFrame label={v.scanOk}>
      <Tz>
        <Scanner qrAt={0.2} laserAt={0.55} okAt={1.65}>
          <ScanOk big={v.scanOk} lines={[v.ticketFor]} />
        </Scanner>
        <A k="up" d={1.75} style={[styles.pass, { backgroundColor: a.card2, boxShadow: `inset 0 0 0 1px ${a.line}` }]}>
          <Lbl>{v.passport}</Lbl>
          <A k="stamp" d={2.15} style={styles.passStamp}>
            <Stamp spec="nocturne|66|Nocturne de Canet|24.10.26|0" size={112} />
          </A>
        </A>
      </Tz>
    </ArtFrame>
  );
}

/** Le classement du prix du public : ta voix fait passer la Supra en tête. */
function Vote() {
  const a = useArt();
  const [rx8, supra, gtr] = v.ranking;
  const up = useKey(1.95, 0.5);
  const upStyle = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateY: -62 * (up.reduced ? 1 : up.p.value) }] };
  });
  const downStyle = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateY: 62 * (up.reduced ? 1 : up.p.value) }] };
  });
  const row = (r: (typeof v.ranking)[number] | undefined, m: PhotoKey, top: number, mine: boolean) => {
    if (!r) return null;
    return (
      <View style={[styles.voteRow, { top, backgroundColor: a.bg, boxShadow: a.shadow }]}>
        {mine ? <Ring d={1.15} /> : null}
        <Photo m={m} style={styles.votePh} />
        <View style={styles.voteBody}>
          <T k="b" size={12.5} lh={16} color={a.ink} numberOfLines={1}>
            {r.name}
          </T>
          {mine ? (
            <Bar w={86} from={76} d={1.45} dur={0.5} height={7} />
          ) : (
            <Bar w={r.width} from={r.width} height={7} />
          )}
        </View>
        {mine ? (
          <Count
            to={42}
            from={38}
            d={1.45}
            dur={0.5}
            style={[textStyles.numberNarrow, styles.em, { color: a.ink, letterSpacing: 0 }]}
          />
        ) : (
          <T k="num" size={22} lh={24} color={a.ink} style={styles.em}>
            {String(r.votes)}
          </T>
        )}
      </View>
    );
  };
  return (
    <ArtFrame label={v.voteKicker}>
      <Tz>
        <Row sb>
          <Lbl>{v.voteKicker}</Lbl>
          <A k="tag" d={0.2}>
            <Tag kind="line">{v.oneVote}</Tag>
          </A>
        </Row>
        <View style={styles.vote}>
          <Animated.View style={[FILL, downStyle]}>{row(rx8, "rx7", 0, false)}</Animated.View>
          <Animated.View style={[FILL, upStyle]}>{row(supra, "supra", 62, true)}</Animated.View>
          <View style={FILL}>{row(gtr, "s2000", 124, false)}</View>
        </View>
        <A k="tag" d={2.4} style={styles.center}>
          <Tag kind="acc" icon="trophy">
            {v.yourVote}
          </Tag>
        </A>
      </Tz>
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
      <SocialBand crewAction="follow" />
    </ArtFrame>
  );
}

export const visitorSlides = [FindExpo, Reserve, ScanStamp, Vote, Season, Band] as const;

const styles = StyleSheet.create({
  center: { alignSelf: "center" },
  ticket: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  stub: { borderRightWidth: 2, borderStyle: "dashed", paddingRight: 10 },
  pass: { height: 150, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  passStamp: { position: "absolute", left: "50%", top: "50%", marginLeft: -56, marginTop: -50 },
  vote: { height: 178 },
  voteRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  votePh: { width: 46, height: 34, borderRadius: 8 },
  voteBody: { flex: 1, minWidth: 0, gap: 5 },
  em: { minWidth: 28, textAlign: "right", fontSize: 22, lineHeight: 24 },
});
