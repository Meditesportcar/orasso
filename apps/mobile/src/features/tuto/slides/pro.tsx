// Les quatre diapos du pro (prototype `s-tuto`, `data-tu="pro"`).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { MiniMap } from "../illustrations/discover";
import { ScanBox } from "../illustrations/scan";
import { Art, Bars, Card, Chips, Count, Enter, Grow, Lbl, Logo, Nm, Row, Sm, Tag } from "../kit";

const { space1, space2 } = tokens.spacing;

/** La fiche se remplit : logo, activités qui s'allument, remises par grade. */
function Sheet() {
  const p = tutoArt.pro;
  return (
    <Art label={p.sheet.name}>
      <Enter kind="up" delay={100}>
        <Card>
          <Row>
            <Enter kind="pop" delay={350}>
              <Logo initials={p.sheet.logo} tone="night" />
            </Enter>
            <Grow>
              <Nm>{p.sheet.name}</Nm>
              <Sm>{p.sheet.meta}</Sm>
            </Grow>
          </Row>
        </Card>
      </Enter>
      <Chips items={p.chips} on={[0, 1, 3]} delay={700} />
      <Enter kind="up" delay={1200}>
        <Card>
          <Lbl>{p.discounts}</Lbl>
          <Bars rows={p.grades} delay={1500} />
        </Card>
      </Enter>
    </Art>
  );
}

/** La fiche sur la carte, avec la remise du grade et « Garage favori ». */
function Found() {
  const { found, sheet } = tutoArt.pro;
  return (
    <Art label={sheet.name}>
      <MiniMap
        dots={[
          [22, 30],
          [74, 22],
          [30, 58],
        ]}
      />
      <Enter kind="up" delay={500}>
        <Card>
          <Row>
            <Logo initials={sheet.logo} tone="night" />
            <Grow>
              <Nm>{sheet.name}</Nm>
              <Sm>{found.meta}</Sm>
            </Grow>
          </Row>
        </Card>
      </Enter>
      <Enter kind="pop" delay={1100} style={styles.self}>
        <Tag kind="acc" icon="heart">
          {found.favorite}
        </Tag>
      </Enter>
    </Art>
  );
}

/** Un client montre son QR de compte : grade vérifié, remise affichée. */
function Discount() {
  const { t } = useTheme();
  const s = tutoArt.pro.scan;
  return (
    <Art label={`${s.off} · ${s.verified}`}>
      <ScanBox qrLabel="QR de compte (exemple)" laserAt={500}>
        <Enter kind="fade" delay={1600} style={styles.grow}>
          <Text variant="posterL" color={t.color.accent}>
            {s.off}
          </Text>
          <Sm>{s.verified}</Sm>
          <Sm>{s.client}</Sm>
        </Enter>
      </ScanBox>
      <Enter kind="pop" delay={2100} style={styles.self}>
        <Tag kind="line" icon="check">
          {s.applied}
        </Tag>
      </Enter>
    </Art>
  );
}

/** Les statistiques du mois : vues, remises, remises par grade. */
function Stats() {
  const { t } = useTheme();
  const s = tutoArt.pro.stats;
  return (
    <Art label={s.byGrade}>
      <View style={styles.duo}>
        <Enter kind="up" delay={100} style={styles.half}>
          <Card>
            <Lbl>{s.views}</Lbl>
            <Count to={1284} delay={300} variant="posterL" color={t.color.plateInk} />
          </Card>
        </Enter>
        <Enter kind="up" delay={200} style={styles.half}>
          <Card>
            <Lbl>{s.discounts}</Lbl>
            <Count to={37} delay={400} variant="posterL" color={t.color.plateInk} />
          </Card>
        </Enter>
      </View>
      <Enter kind="up" delay={500}>
        <Card>
          <Lbl>{s.byGrade}</Lbl>
          <Bars rows={s.grades} delay={800} />
        </Card>
      </Enter>
      <Enter kind="pop" delay={1600} style={styles.self}>
        <Tag kind="line" icon="up">
          {s.growth}
        </Tag>
      </Enter>
    </Art>
  );
}

export const proSlides = [Sheet, Found, Discount, Stats] as const;

const styles = StyleSheet.create({
  self: { alignSelf: "center" },
  grow: { flex: 1, minWidth: 0, gap: space1 },
  duo: { flexDirection: "row", gap: space2 },
  half: { flex: 1 },
});
