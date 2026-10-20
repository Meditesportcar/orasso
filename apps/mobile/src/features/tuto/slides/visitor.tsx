// Les six diapos du visiteur (prototype `s-tuto`, `data-tu="visiteur"`).
import { StampDrop, Text, tokens, useTheme } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { EventOnMap } from "../illustrations/discover";
import { QrTile, ScanBox } from "../illustrations/scan";
import { GradesAndPros, SocialBand } from "../illustrations/season";
import {
  Art,
  BarFill,
  Between,
  Card,
  Count,
  DateStub,
  Enter,
  FakeButton,
  Grow,
  Later,
  Lbl,
  Logo,
  Nm,
  Ph,
  Row,
  Sm,
  Tag,
} from "../kit";

const { space1, space2 } = tokens.spacing;

function Find() {
  return (
    <Art label={tutoArt.alt.findPublic}>
      <EventOnMap meta={tutoArt.eventMetaPublic} />
    </Art>
  );
}

/** Une entrée public en deux touches : le billet et son QR arrivent dans Sorties. */
function Reserve() {
  const { event, visitor } = tutoArt;
  return (
    <Art label={visitor.reserve}>
      <Enter kind="up" delay={150}>
        <Card>
          <Row>
            <Logo initials="MSC" tone="accent" />
            <Grow>
              <Nm>{event.title}</Nm>
              <Sm>{visitor.dates}</Sm>
            </Grow>
          </Row>
          <Between>
            <Sm>{visitor.publicEntry}</Sm>
            <Nm>{visitor.free}</Nm>
          </Between>
        </Card>
      </Enter>
      <FakeButton icon="ticket" delay={950}>
        {visitor.reserve}
      </FakeButton>
      <Enter kind="up" delay={1350}>
        <Card>
          <Row>
            <DateStub weekday={event.weekday} day={event.day} month={event.month} />
            <Grow>
              <Nm>{event.title}</Nm>
              <Sm>{visitor.ticketFor}</Sm>
              <Sm>{visitor.inOutings}</Sm>
            </Grow>
            <QrTile size={56} delay={1850} label={tutoArt.alt.qrTicket} />
          </Row>
        </Card>
      </Enter>
    </Art>
  );
}

/** Le QR passe au scan, « Scan OK », puis le tampon tombe dans le passeport. */
function Stamp() {
  const { t } = useTheme();
  const { visitor } = tutoArt;
  return (
    <Art label={`${visitor.scanOk} · ${visitor.ticketFor}`}>
      <ScanBox qrLabel={tutoArt.alt.qrTicket} laserAt={550}>
        <Enter kind="fade" delay={1650} style={styles.grow}>
          <Text variant="posterM" color={t.color.accent}>
            {visitor.scanOk}
          </Text>
          <Sm>{visitor.ticketFor}</Sm>
        </Enter>
      </ScanBox>
      <Enter kind="up" delay={1750}>
        <Card style={styles.passport}>
          <Lbl>{visitor.passport}</Lbl>
          <View style={styles.stampSlot}>
            <Later delay={2150}>
              <StampDrop shape="round" seed={24} size={84} />
            </Later>
          </View>
        </Card>
      </Enter>
    </Art>
  );
}

/** Le prix du public : une voix, le classement bouge en direct. */
function Vote() {
  const { t } = useTheme();
  const v = tutoArt.visitor;
  return (
    <Art label={v.voteKicker}>
      <Between>
        <Lbl>{v.voteKicker}</Lbl>
        <Enter kind="pop" delay={200}>
          <Tag>{v.oneVote}</Tag>
        </Enter>
      </Between>
      {v.ranking.map((r, i) => (
        <Enter key={r.name} kind="right" delay={150 + i * 120}>
          <Card>
            <Row>
              <Ph size={40} />
              <Grow>
                <Nm>{r.name}</Nm>
                <BarFill width={r.width} delay={600 + i * 120} />
              </Grow>
              <View style={styles.count}>
                {i === 1 ? (
                  <Count to={r.votes} from={38} delay={1450} dur={500} variant="posterS" color={t.color.accent} />
                ) : (
                  <Text variant="posterS" color={t.color.plateInk}>
                    {r.votes}
                  </Text>
                )}
              </View>
            </Row>
          </Card>
        </Enter>
      ))}
      <Enter kind="pop" delay={2400} style={styles.self}>
        <Tag kind="acc" icon="grade">
          {v.yourVote}
        </Tag>
      </Enter>
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
      <SocialBand crewAction="follow" />
    </Art>
  );
}

export const visitorSlides = [Find, Reserve, Stamp, Vote, Season, Band] as const;

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0, gap: space1 },
  passport: { gap: space2 },
  stampSlot: { alignItems: "center", minHeight: 84 },
  count: { minWidth: 36, alignItems: "flex-end" },
  self: { alignSelf: "center" },
});
