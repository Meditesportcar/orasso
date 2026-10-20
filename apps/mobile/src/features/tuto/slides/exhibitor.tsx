// Les sept diapos de l'exposant (prototype `s-tuto`, `data-tu="exposant"`). Chaque fonction est l'illustration d'une
// diapo ; les textes (jour, titre, paragraphe) sont dans `tutoSlides.exhibitor`.
import { Icon, StampDrop, Text, tokens, useTheme } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import { EventOnMap } from "../illustrations/discover";
import { ParkingPlan } from "../illustrations/parking";
import { QrTile } from "../illustrations/scan";
import { GradesAndPros, SocialBand } from "../illustrations/season";
import { Art, BarFill, Between, Card, Enter, FakeButton, Fly, Lbl, Nm, Ph, Row, Sm, Swap, Tag } from "../kit";

const { space1, space2, space3 } = tokens.spacing;
const radius = tokens.radius;

function Find() {
  return (
    <Art label="Explorer : un événement près de toi">
      <EventOnMap meta={tutoArt.eventMeta} />
    </Art>
  );
}

/** Garage › règlement › envoi › « En attente » (v20) : la candidature, du garage au tri. */
function Apply() {
  const { t } = useTheme();
  const g = tutoArt.garage;
  return (
    <Art label={`${g.car} : choisir sa voiture, cocher le règlement, envoyer`}>
      <Between>
        <Lbl>{g.kicker}</Lbl>
        <Enter kind="pop" delay={2700}>
          <Tag kind="line">{g.wait}</Tag>
        </Enter>
      </Between>
      <View style={styles.strip}>
        <Ph size={64} />
        <View style={[styles.chosen, { borderColor: t.color.accent, borderRadius: radius.radiusSm }]}>
          <Ph size={64} icon="vehicle" />
          <Enter kind="pop" delay={600} style={[styles.check, { backgroundColor: t.color.accent }]}>
            <Icon name="check" size={14} color={t.color.accentInk} />
          </Enter>
        </View>
        <Ph size={64} />
      </View>
      <Nm>{g.car}</Nm>
      <Row>
        <View style={[styles.box, { borderColor: t.color.accent }]}>
          <Enter kind="pop" delay={1400} style={[styles.boxFill, { backgroundColor: t.color.accent }]}>
            <Icon name="check" size={12} color={t.color.accentInk} />
          </Enter>
        </View>
        <View style={styles.rule}>
          <Sm>{g.rule}</Sm>
        </View>
      </Row>
      <Swap
        delay={2500}
        before={
          <FakeButton icon="next" delay={2000}>
            {g.send}
          </FakeButton>
        }
        after={<FakeButton icon="check">{g.sent}</FakeButton>}
      />
      <Fly delay={2500} dx={120} dy={-150}>
        <Ph size={44} />
      </Fly>
    </Art>
  );
}

/** En attente › Retenue, et le QR d'accès apparaît. */
function Accepted() {
  const { accepted, garage } = tutoArt;
  return (
    <Art label={accepted.note}>
      <View style={styles.centered}>
        <Swap
          before={<Tag kind="line">{garage.wait}</Tag>}
          after={<Tag kind="acc">{garage.retained}</Tag>}
          delay={900}
        />
        <QrTile size={120} delay={1500} label={accepted.qrLabel} />
        <View style={styles.note}>
          <Sm center>{accepted.note}</Sm>
        </View>
      </View>
    </Art>
  );
}

function Park() {
  return (
    <Art label={tutoArt.parking.label}>
      <ParkingPlan />
    </Art>
  );
}

/** Le passeport reçoit le tampon, les points montent, les photos restent. */
function Souvenirs() {
  const { t } = useTheme();
  const s = tutoArt.souvenir;
  return (
    <Art label={s.stampLabel}>
      <View style={styles.top}>
        <Card style={styles.page}>
          <Lbl>{s.passport}</Lbl>
          <View style={styles.stamp}>
            <StampDrop shape="round" seed={24} size={84} />
          </View>
        </Card>
        <View style={styles.photos}>
          <View style={[styles.photo, styles.photoA]}>
            <Enter kind="pop" delay={900} style={styles.photoBox}>
              <Ph size={64} />
              <Text variant="meta" color={t.color.plateMuted}>
                {s.photoA}
              </Text>
            </Enter>
          </View>
          <View style={[styles.photo, styles.photoB]}>
            <Enter kind="pop" delay={1100} style={styles.photoBox}>
              <Ph size={64} />
              <Text variant="meta" color={t.color.plateMuted}>
                {s.photoB}
              </Text>
            </Enter>
          </View>
        </View>
      </View>
      <Card>
        <Between>
          <Lbl>{s.counted}</Lbl>
          <Enter kind="pop" delay={1500}>
            <Text variant="posterS" color={t.color.accent}>
              {s.plus}
            </Text>
          </Enter>
        </Between>
        <BarFill width={72} delay={1500} />
        <Between>
          <Sm>{s.sport}</Sm>
          <Sm>{s.circuit}</Sm>
        </Between>
      </Card>
    </Art>
  );
}

function Season() {
  return (
    <Art label={tutoArt.grade.kicker}>
      <GradesAndPros />
    </Art>
  );
}

function Band() {
  return (
    <Art label={tutoArt.social.kicker}>
      <SocialBand crewAction="join" />
    </Art>
  );
}

export const exhibitorSlides = [Find, Apply, Accepted, Park, Souvenirs, Season, Band] as const;

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: space2, justifyContent: "center", paddingVertical: space1 },
  chosen: { borderWidth: 2, padding: 2 },
  check: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  box: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: radius.radiusSm / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  boxFill: { width: 18, height: 18, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  rule: { flex: 1, minWidth: 0 },
  centered: { alignItems: "center", gap: space3, paddingVertical: space2 },
  note: { maxWidth: 240 },
  top: { flexDirection: "row", gap: space2, minHeight: 180 },
  page: { flex: 1, minHeight: 180 },
  stamp: { alignItems: "center", paddingTop: space2 },
  photos: { flex: 1, minHeight: 180 },
  photo: { position: "absolute", width: 96, alignItems: "center" },
  photoBox: { alignItems: "center", gap: 2 },
  photoA: { right: 4, top: 0, transform: [{ rotate: "7deg" }] },
  photoB: { right: 40, top: 96, transform: [{ rotate: "-6deg" }] },
});
