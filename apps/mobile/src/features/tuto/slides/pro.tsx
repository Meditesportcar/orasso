// Les quatre diapos du pro (artefact `s-tuto`, `data-tu="pro"`) : tu montes la fiche de ton atelier, les passionnés
// du coin te trouvent, un scan la remise, tu vois ce que ça rapporte.
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { A } from "../anim";
import { Badge, FILL, SWATCH, T, Tag, useArt } from "../art";
import { ArtFrame, Bars, Big, BigCount, Card, Chip, Chips, Grow, Lbl, Nm, Row, Sm, Tz } from "../blocks";
import { MapMini } from "../scenes";
import { DroppedPin, FloatCard, Scanner, ScanOk } from "./common";

const p = tutoArt.pro;

/** Fiche de l'atelier : logo, activités qui s'allument, remises par grade qui se remplissent. */
function Sheet() {
  const on = [0.7, 0.85, undefined, 1];
  return (
    <ArtFrame label={p.sheet.name}>
      <Tz>
        <A k="up" d={0.1}>
          <Card>
            <Row>
              <A k="pop" d={0.35}>
                <Badge initials={p.sheet.logo} color={SWATCH.blue} size={40} radius={11} font={16} />
              </A>
              <Grow>
                <Nm>{p.sheet.name}</Nm>
                <Sm>{p.sheet.meta}</Sm>
              </Grow>
            </Row>
          </Card>
        </A>
        <Chips>
          {p.chips.map((c, i) => (
            <Chip key={c} on={on[i]}>
              {c}
            </Chip>
          ))}
        </Chips>
        <A k="up" d={1.2}>
          <Card>
            <Lbl>{p.discounts}</Lbl>
            <Bars rows={p.grades.map((g, i) => ({ ...g, d: 1.5 + i * 0.12 }))} />
          </Card>
        </A>
      </Tz>
    </ArtFrame>
  );
}

/** La fiche sur la carte d'Explorer, et un passionné en fait son garage favori. */
function Found() {
  const a = useArt();
  const dots: [string, string][] = [
    ["22%", "30%"],
    ["74%", "22%"],
    ["30%", "58%"],
  ];
  return (
    <ArtFrame label={p.found.favorite}>
      <View style={FILL}>
        <MapMini />
      </View>
      {dots.map(([left, top]) => (
        <View
          key={left}
          style={[
            styles.dot,
            {
              left: left as `${number}%`,
              top: top as `${number}%`,
              backgroundColor: a.faint,
              boxShadow: `0 0 0 3px ${a.card}`,
            },
          ]}
        />
      ))}
      <DroppedPin />
      <FloatCard>
        <Badge initials={p.sheet.logo} color={SWATCH.blue} size={40} radius={11} font={16} />
        <View style={styles.grow}>
          <T k="poster" size={13} lh={14} color={a.ink}>
            {p.sheet.name}
          </T>
          <T k="cap" color={a.muted}>
            {p.found.meta}
          </T>
        </View>
      </FloatCard>
      <A k="sent" d={1.5} dur={0.5} style={styles.fav}>
        <Tag kind="acc" icon="star" height={30} size={12}>
          {p.found.favorite}
        </Tag>
      </A>
    </ArtFrame>
  );
}

/** Le QR de compte d'un client passe : grade vérifié, la remise s'affiche. */
function Scan() {
  return (
    <ArtFrame label={p.scan.applied}>
      <Tz>
        <Scanner qrAt={0.15} laserAt={0.5} okAt={1.6}>
          <ScanOk big={p.scan.off} lines={[p.scan.verified, p.scan.client]} />
        </Scanner>
        <A k="tag" d={2.1} style={styles.center}>
          <Tag kind="line" icon="check">
            {p.scan.applied}
          </Tag>
        </A>
      </Tz>
    </ArtFrame>
  );
}

/** Les statistiques : vues, remises, remises par grade. */
function Stats() {
  const s = p.stats;
  return (
    <ArtFrame label={s.byGrade}>
      <Tz>
        <View style={styles.duo}>
          <A k="up" d={0.1} style={styles.grow}>
            <Card>
              <Lbl>{s.views}</Lbl>
              <Big>
                <BigCount to={1284} d={0.3} />
              </Big>
            </Card>
          </A>
          <A k="up" d={0.2} style={styles.grow}>
            <Card>
              <Lbl>{s.discounts}</Lbl>
              <Big>
                <BigCount to={37} d={0.4} />
              </Big>
            </Card>
          </A>
        </View>
        <A k="up" d={0.5}>
          <Card>
            <Lbl>{s.byGrade}</Lbl>
            <Bars rows={s.grades.map((g, i) => ({ ...g, d: 0.8 + i * 0.12 }))} />
          </Card>
        </A>
        <A k="tag" d={1.6} style={styles.center}>
          <Tag kind="line" icon="chart">
            {s.growth}
          </Tag>
        </A>
      </Tz>
    </ArtFrame>
  );
}

export const proSlides = [Sheet, Found, Scan, Stats] as const;

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  center: { alignSelf: "center" },
  duo: { flexDirection: "row", gap: 10 },
  dot: { position: "absolute", width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: 6, opacity: 0.8 },
  fav: { position: "absolute", top: 18, alignSelf: "center" },
});
