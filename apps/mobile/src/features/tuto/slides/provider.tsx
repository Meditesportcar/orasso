// Les quatre diapos du prestataire (prototype `s-tuto`, `data-tu="presta"`).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import {
  Art,
  Between,
  Card,
  Chips,
  Count,
  DateStub,
  Enter,
  FakeButton,
  Fly,
  Grow,
  Item,
  Lbl,
  Logo,
  Nm,
  Row,
  Sm,
  Swap,
  Tag,
} from "../kit";

const { space1, space2 } = tokens.spacing;
const radius = tokens.radius;

/** Les missions près de chez toi, filtrées par métier. */
function Missions() {
  const p = tutoArt.provider;
  return (
    <Art label={p.trades[0]}>
      <Chips items={p.trades} on={[0]} delay={350} />
      {p.missions.map((m, i) => (
        <Item
          key={m.name}
          delay={700 + i * 150}
          lead={<DateStub weekday={m.weekday} day={m.day} month={m.month} />}
          title={m.name}
          meta={m.meta}
          trail={<Tag>{m.places}</Tag>}
        />
      ))}
    </Art>
  );
}

/** La vitrine part avec la candidature. */
function Propose() {
  const { t } = useTheme();
  const p = tutoArt.provider;
  return (
    <Art label={p.propose}>
      <Between>
        <Lbl>{tutoArt.event.title}</Lbl>
        <Row>
          <Enter kind="pop" delay={3250}>
            <Tag>{tutoArt.garage.wait}</Tag>
          </Enter>
          <Logo initials="MSC" tone="accent" size={30} />
        </Row>
      </Between>
      <Card>
        <View style={[styles.hero, { backgroundColor: t.color.night, borderRadius: radius.radiusSm }]}>
          <Icon name="shop" size={28} color={t.color.nightInk} />
        </View>
        <Nm>{p.showcase.name}</Nm>
        <Sm>{p.showcase.meta}</Sm>
        <Chips items={p.showcase.chips} />
      </Card>
      <FakeButton icon="next" delay={2100}>
        {p.propose}
      </FakeButton>
      <Fly delay={2400} dx={130} dy={-190}>
        <View style={[styles.hero, styles.mini, { backgroundColor: t.color.night, borderRadius: radius.radiusSm }]}>
          <Icon name="shop" size={20} color={t.color.nightInk} />
        </View>
      </Fly>
    </Art>
  );
}

/** Retenue : l'emplacement B2 sur le plan, l'arrivée, l'électricité. */
function Spot() {
  const { t } = useTheme();
  const { spot } = tutoArt.provider;
  const g = tutoArt.garage;
  const zone = [styles.zone, { borderColor: t.color.plateChip, borderRadius: radius.radiusSm }];
  return (
    <Art label={spot.chips[0]}>
      <Between>
        <Lbl>{tutoArt.event.title}</Lbl>
        <Swap delay={700} before={<Tag>{g.wait}</Tag>} after={<Tag kind="acc">{g.retained}</Tag>} />
      </Between>
      <Enter kind="up" delay={1100}>
        <View style={styles.plan}>
          <View style={styles.zones}>
            <View style={[zone, styles.half]}>
              <Text variant="meta" color={t.color.plateMuted}>
                {tutoArt.parking.zoneJdm}
              </Text>
            </View>
            <View style={[zone, styles.half]}>
              <Text variant="meta" color={t.color.plateMuted}>
                {tutoArt.parking.zoneEuro}
              </Text>
            </View>
          </View>
          <View style={[zone, styles.food]}>
            <Text variant="meta" color={t.color.plateMuted}>
              {spot.food}
            </Text>
            <View style={styles.slots}>
              <View style={[styles.slot, { borderColor: t.color.plateChip }]} />
              <Enter kind="pop" delay={1700}>
                <View
                  style={[styles.slot, styles.mine, { backgroundColor: t.color.accent, borderColor: t.color.accent }]}
                >
                  <Text variant="meta" color={t.color.accentInk}>
                    B2
                  </Text>
                </View>
              </Enter>
              <View style={[styles.slot, { borderColor: t.color.plateChip }]} />
            </View>
          </View>
          <Text variant="meta" color={t.color.plateMuted} style={styles.entry}>
            {spot.entry}
          </Text>
        </View>
      </Enter>
      <Enter kind="up" delay={1900}>
        <Chips items={spot.chips} />
      </Enter>
    </Art>
  );
}

/** L'avis de l'organisateur et les compteurs de la vitrine. */
function Reviews() {
  const { t } = useTheme();
  const r = tutoArt.provider.review;
  return (
    <Art label={r.from}>
      <Enter kind="up" delay={100}>
        <Card>
          <Row>
            <Logo initials="MSC" tone="accent" />
            <Grow>
              <Nm>{r.from}</Nm>
              <Sm>{r.meta}</Sm>
            </Grow>
          </Row>
          <View style={styles.stars}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Enter key={i} kind="pop" delay={500 + i * 140}>
                <Icon name="grade" size={22} color={t.color.accent} />
              </Enter>
            ))}
          </View>
          <Enter kind="fade" delay={1300}>
            <Text variant="body" color={t.color.plateInk}>
              {r.quote}
            </Text>
          </Enter>
        </Card>
      </Enter>
      <View style={styles.duo}>
        <Enter kind="up" delay={1600} style={styles.half}>
          <Card>
            <Lbl>{r.events}</Lbl>
            <Count to={13} from={12} dur={300} delay={2000} variant="posterL" color={t.color.plateInk} />
          </Card>
        </Enter>
        <Enter kind="up" delay={1700} style={styles.half}>
          <Card>
            <Lbl>{r.note}</Lbl>
            <Row style={styles.baseline}>
              <Text variant="posterL" color={t.color.plateInk}>
                {r.noteValue}
              </Text>
              <Sm>{r.noteMax}</Sm>
            </Row>
          </Card>
        </Enter>
      </View>
    </Art>
  );
}

export const providerSlides = [Missions, Propose, Spot, Reviews] as const;

const styles = StyleSheet.create({
  hero: { height: 56, alignItems: "center", justifyContent: "center" },
  mini: { width: 56, height: 56 },
  plan: { gap: space2, minHeight: 190 },
  zones: { flexDirection: "row", gap: space2 },
  half: { flex: 1 },
  zone: { borderWidth: 1, padding: space2, minHeight: 80 },
  food: { minHeight: 70, gap: space1 },
  slots: { flexDirection: "row", gap: space2, justifyContent: "center" },
  slot: {
    width: 44,
    height: 28,
    borderWidth: 1,
    borderRadius: radius.radiusSm,
    alignItems: "center",
    justifyContent: "center",
  },
  mine: { borderWidth: 1 },
  entry: { textAlign: "center" },
  stars: { flexDirection: "row", gap: space1 },
  duo: { flexDirection: "row", gap: space2 },
  baseline: { alignItems: "baseline" },
});
