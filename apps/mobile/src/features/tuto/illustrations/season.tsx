// Illustrations de la saison : l'échelle des grades, les pros du coin avec leur remise, le QR de compte scanné (exposant
// et visiteur : même diapo, textes différents) ; les bulles des amis et crews (diapo sociale).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { Between, Card, Enter, Grow, Item, Lbl, Logo, Row, Sm, Swap, Tag, type Tone } from "../kit";

const { space1, space2 } = tokens.spacing;
const radius = tokens.radius;

const proTones: Tone[] = ["night", "win", "poster"];

/** Grade, recherche de pros, remises, puis le QR de compte scanné en boutique. */
export function GradesAndPros() {
  const { t } = useTheme();
  const g = tutoArt.grade;
  return (
    <>
      <Enter kind="fade">
        <Between>
          <Lbl>{g.kicker}</Lbl>
          <Text variant="posterS" color={t.color.accent}>
            {g.name}
          </Text>
        </Between>
        <View style={styles.steps}>
          {g.steps.map((step) => {
            const me = step === g.name;
            return (
              <View
                key={step}
                style={[
                  styles.step,
                  {
                    backgroundColor: me ? t.color.accent : "transparent",
                    borderColor: me ? t.color.accent : t.color.plateChip,
                  },
                ]}
              >
                <Text variant="meta" color={me ? t.color.accentInk : t.color.plateMuted}>
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      </Enter>
      <Enter kind="up" delay={300}>
        <Card>
          <Row>
            <Icon name="search" size={16} color={t.color.plateMuted} />
            <Sm>{g.search}</Sm>
          </Row>
        </Card>
      </Enter>
      {g.pros.map((pro, i) => (
        <Item
          key={pro.name}
          delay={500 + i * 160}
          lead={<Logo initials={pro.logo} tone={proTones[i] ?? "night"} />}
          title={pro.name}
          meta={pro.meta}
          trail={<Tag>{pro.discount}</Tag>}
        />
      ))}
      <Enter kind="pop" delay={1600}>
        <Tag kind="acc" icon="qr">
          {g.scanned}
        </Tag>
      </Enter>
    </>
  );
}

/** Amis et crews du coin : on suit, on rejoint, on s'écrit, on voit qui va où. */
export function SocialBand({ crewAction }: { crewAction: "join" | "follow" }) {
  const { t } = useTheme();
  const s = tutoArt.social;
  const action = (before: string, after: string, delay: number) => (
    <Swap delay={delay} before={<Tag kind="line">{before}</Tag>} after={<Tag kind="acc">{after}</Tag>} />
  );
  return (
    <>
      <Between>
        <Lbl>{s.kicker}</Lbl>
        <Tag>66</Tag>
      </Between>
      <Item
        delay={200}
        lead={<Logo initials={s.crew.logo} tone="accent" round />}
        title={s.crew.name}
        meta={s.crew.meta}
        trail={crewAction === "join" ? action(s.join, s.requested, 1100) : action(s.follow, s.followed, 1100)}
      />
      <Item
        delay={350}
        lead={<Logo initials={s.person.logo} tone="night" round />}
        title={s.person.name}
        meta={s.person.meta}
        trail={action(s.follow, s.followed, 1400)}
      />
      <Enter kind="up" delay={1800}>
        <View style={[styles.msg, { backgroundColor: t.color.surfaceSunken }]}>
          <Sm>{s.chatFrom}</Sm>
          <Text variant="body" color={t.color.plateInk}>
            {s.chatA}
          </Text>
        </View>
      </Enter>
      <Enter kind="up" delay={2400} style={styles.mine}>
        <View style={[styles.msg, styles.me, { backgroundColor: t.color.accent }]}>
          <Text variant="body" color={t.color.accentInk}>
            {s.chatB}
          </Text>
        </View>
      </Enter>
      <Enter kind="up" delay={2900}>
        <Row style={styles.friends}>
          <Logo initials="IN" tone="night" round size={22} />
          <Logo initials="KE" tone="waitlist" round size={22} />
          <Logo initials="MA" tone="win" round size={22} />
          <Grow>
            <Sm>{s.friends}</Sm>
          </Grow>
        </Row>
      </Enter>
    </>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: "row", flexWrap: "wrap", gap: space1, marginTop: space1 },
  step: { borderWidth: 1, borderRadius: radius.radiusPill, paddingVertical: 2, paddingHorizontal: 8 },
  msg: { padding: space2, borderRadius: radius.radiusMd, gap: 2, maxWidth: "88%", alignSelf: "flex-start" },
  mine: { alignSelf: "flex-end", maxWidth: "88%" },
  me: { alignSelf: "flex-end" },
  friends: { justifyContent: "center", flexWrap: "wrap" },
});
