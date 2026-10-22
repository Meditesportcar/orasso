// Les quatre diapos du prestataire (artefact `s-tuto`, `data-tu="presta"`) : tu trouves une mission, tu proposes ta
// prestation, ton emplacement t'attend, les avis font ta vitrine.
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { A, Fill } from "../anim";
import { DateMini, FILL, SWATCH, T, Tag, useArt } from "../art";
import {
  ArtFrame,
  Big,
  BigCount,
  BigText,
  Btn,
  Card,
  Chip,
  Chips,
  Flip,
  Fly,
  Grow,
  It,
  Lbl,
  Mark,
  Nm,
  Ring,
  Row,
  Sm,
  Tz,
} from "../blocks";
import { ArtIcon } from "../icons";
import { MscLogo } from "../scenes";

const pr = tutoArt.provider;

/** Le métier s'allume, les missions du coin arrivent, la première est choisie. */
function Missions() {
  return (
    <ArtFrame label={pr.missions[0]?.meta ?? ""}>
      <Tz>
        <Chips>
          {pr.trades.map((t, i) => (
            <Chip key={t} on={i === 0 ? 0.35 : undefined} icon={i === 0 ? "truck" : undefined}>
              {t}
            </Chip>
          ))}
        </Chips>
        <View style={styles.list}>
          {pr.missions.map((m, i) => (
            <A key={m.name} k="inr" d={0.7 + i * 0.15}>
              <It>
                {i === 0 ? <Ring d={1.6} /> : null}
                <DateMini weekday={m.weekday} day={m.day} month={m.month} big={24} />
                <Grow>
                  <Nm>{m.name}</Nm>
                  <Sm>{m.meta}</Sm>
                </Grow>
                <Tag kind="line">{m.places}</Tag>
              </It>
            </A>
          ))}
        </View>
      </Tz>
    </ArtFrame>
  );
}

/** `.tz-hero` : la photo de vitrine du food truck (dégradé orange → bordeaux, camion au trait). */
function Hero({ height }: { height?: number }) {
  const a = useArt();
  return (
    <View style={[styles.hero, height === undefined ? FILL : { height }]}>
      <Svg style={FILL} viewBox="0 0 10 10" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="vit" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={a.vitrineFrom} />
            <Stop offset="1" stopColor={a.vitrineTo} />
          </LinearGradient>
        </Defs>
        <Rect width={10} height={10} fill="url(#vit)" />
      </Svg>
      {/* Au-dessus du dégradé (posé en absolu) : un élément en flux passerait dessous. */}
      <View style={styles.heroIcon}>
        <ArtIcon name="truck" size={44} color={a.paper} strokeWidth={1.6} />
      </View>
    </View>
  );
}

/** La vitrine part avec la candidature : elle s'envole vers MéditeSportCar, « En attente ». */
function Propose() {
  const s = pr.showcase;
  return (
    <ArtFrame label={pr.propose}>
      <Tz>
        <Row sb>
          <Lbl>{tutoArt.event.title}</Lbl>
          <View style={styles.org}>
            <A k="tag" d={3.25}>
              <Tag kind="line">{tutoArt.garage.wait}</Tag>
            </A>
            <Mark id="org">
              <MscLogo size={32} />
            </Mark>
          </View>
        </Row>
        <Mark id="vit">
          <Card>
            <Hero height={86} />
            <Row>
              <Grow>
                <Nm>{s.name}</Nm>
                <Sm>{s.meta}</Sm>
              </Grow>
            </Row>
            <Chips>
              {s.chips.map((c) => (
                <Chip key={c}>{c}</Chip>
              ))}
            </Chips>
          </Card>
        </Mark>
        <Btn icon="send" press={2.1}>
          {pr.propose}
        </Btn>
      </Tz>
      <Fly from="vit" to="org" d={2.4}>
        <Hero />
      </Fly>
    </ArtFrame>
  );
}

/** « Retenue » : le plan de l'événement, ton emplacement B2 s'allume, l'heure d'arrivée et l'électricité. */
function Spot() {
  const a = useArt();
  const zone = (label: string, pos: object, food?: boolean, children?: React.ReactNode) => (
    <View style={[styles.zn, { borderColor: a.line }, pos]}>
      <T k="label" size={10} lh={12} color={a.faint} style={food ? styles.znFood : styles.znLabel}>
        {label}
      </T>
      {children}
    </View>
  );
  const slot = (left: `${number}%`, me?: boolean) =>
    me ? (
      <Fill
        key={left}
        from={a.line}
        to={a.accent}
        d={1.7}
        style={[styles.slot, { left, boxShadow: `0 0 0 2px ${a.accent}` }]}
      >
        <T k="b" size={10} lh={12} color={a.ink}>
          B2
        </T>
      </Fill>
    ) : (
      <View key={left} style={[styles.slot, { left, backgroundColor: a.line }]} />
    );
  return (
    <ArtFrame label={pr.spot.chips[0] ?? ""}>
      <Tz>
        <Row sb>
          <Lbl>{tutoArt.event.title}</Lbl>
          <Flip before={tutoArt.garage.wait} after={tutoArt.garage.retained} out={0.5} inAt={0.7} />
        </Row>
        <A k="up" d={1.1} style={[styles.plan, { backgroundColor: a.card2, boxShadow: `inset 0 0 0 1px ${a.line}` }]}>
          {zone(tutoArt.parking.zoneJdm, { left: "4%", top: "8%", width: "40%", height: "52%" })}
          {zone(tutoArt.parking.zoneEuro, { left: "48%", top: "8%", width: "48%", height: "52%" })}
          {zone(pr.spot.food, { left: "4%", top: "66%", width: "92%", height: "26%" }, true, [
            slot("30%"),
            slot("48%", true),
            slot("66%"),
          ])}
          <T k="b" size={10} lh={12} color={a.faint} style={styles.ent}>
            {`${pr.spot.entry} ↓`}
          </T>
        </A>
        <A k="up" d={1.9}>
          <Chips>
            {pr.spot.chips.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </Chips>
        </A>
      </Tz>
    </ArtFrame>
  );
}

/** L'avis de l'organisateur : cinq étoiles, une phrase, et la vitrine qui compte un événement de plus. */
function Review() {
  const a = useArt();
  const r = pr.review;
  return (
    <ArtFrame label={r.quote}>
      <Tz>
        <A k="up" d={0.1}>
          <Card>
            <Row>
              <MscLogo />
              <Grow>
                <Nm>{r.from}</Nm>
                <Sm>{r.meta}</Sm>
              </Grow>
            </Row>
            <View style={styles.stars}>
              {Array.from({ length: 5 }, (_, i) => (
                <A key={String(i)} k="pop" d={0.5 + i * 0.14}>
                  <ArtIcon name="star" size={24} color={a.accent} fill={a.accent} />
                </A>
              ))}
            </View>
            <A k="fade" d={1.3}>
              <T k="body" size={13} lh={18} color={a.ink} style={styles.quote}>
                {r.quote}
              </T>
            </A>
          </Card>
        </A>
        <View style={styles.duo}>
          <A k="up" d={1.6} style={styles.grow}>
            <Card>
              <Lbl>{r.events}</Lbl>
              <Big>
                <BigCount to={13} from={12} d={2} dur={0.3} />
              </Big>
            </Card>
          </A>
          <A k="up" d={1.7} style={styles.grow}>
            <Card>
              <Lbl>{r.note}</Lbl>
              <Big small={r.noteMax}>
                <BigText>{r.noteValue}</BigText>
              </Big>
            </Card>
          </A>
        </View>
      </Tz>
    </ArtFrame>
  );
}

export const providerSlides = [Missions, Propose, Spot, Review] as const;

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  list: { gap: 8 },
  org: { flexDirection: "row", alignItems: "center", gap: 8 },
  hero: { borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  heroIcon: { position: "relative", zIndex: 1 },
  plan: { height: 170, borderRadius: 14, overflow: "hidden" },
  zn: { position: "absolute", borderWidth: 2, borderStyle: "dashed", borderRadius: 10 },
  znLabel: { position: "absolute", left: 8, top: 6, letterSpacing: 0.8 },
  znFood: { position: "absolute", left: 8, top: "50%", marginTop: -6, letterSpacing: 0.8 },
  slot: {
    position: "absolute",
    top: "50%",
    width: 30,
    height: 22,
    marginTop: -11,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  ent: { position: "absolute", right: 10, bottom: 4 },
  stars: { flexDirection: "row", gap: 4 },
  quote: { fontStyle: "italic" },
  duo: { flexDirection: "row", gap: 10 },
});
