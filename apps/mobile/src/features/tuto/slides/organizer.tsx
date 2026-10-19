// Les six diapos de l'organisateur (prototype `s-tuto`, `data-tu="orga"`).
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { Art, Bars, Between, Card, Count, Dot, Enter, Grow, Item, Lbl, Nm, Row, Sm, Swap, Tag, Typed } from "../kit";

const { space1, space2 } = tokens.spacing;
const radius = tokens.radius;
/** Les huit temps de l'assistant de création (docs/01) : une barre chacun. */
const WIZARD_STEPS = ["format", "adresse", "arrivees", "criteres", "reglement", "photos", "equipe", "publier"] as const;

/** L'assistant en huit temps, le titre qui se tape, les trois styles d'affiche générés. */
function Create() {
  const { t } = useTheme();
  const o = tutoArt.organizer;
  const posters = [
    { bg: t.color.poster, ink: t.color.posterInk, turn: "-9deg", dx: -62 },
    { bg: t.color.accent, ink: t.color.accentInk, turn: "8deg", dx: 62 },
    { bg: t.color.night, ink: t.color.nightInk, turn: "0deg", dx: 0 },
  ];
  return (
    <Art label={o.typed}>
      <View style={styles.steps}>
        {WIZARD_STEPS.map((step, i) => (
          <Enter key={step} kind="fade" delay={250 + i * 120} style={styles.stepSlot}>
            <View style={[styles.step, { backgroundColor: t.color.accent }]} />
          </Enter>
        ))}
      </View>
      <Card>
        <Sm>{o.fieldLabel}</Sm>
        <Typed text={o.typed} delay={500} />
      </Card>
      <View style={styles.posters}>
        {posters.map((p, i) => (
          <Enter
            key={p.turn}
            kind="pop"
            delay={1500 + i * 250}
            style={[styles.posterSlot, { left: `${50 + p.dx / 3}%` }]}
          >
            <View
              style={[
                styles.poster,
                { backgroundColor: p.bg, borderRadius: radius.radiusSm, transform: [{ rotate: p.turn }] },
              ]}
            >
              <Text variant="posterS" color={p.ink}>
                {o.posterWord}
              </Text>
            </View>
          </Enter>
        ))}
      </View>
      <Enter kind="pop" delay={2600} style={styles.self}>
        <Tag kind="acc" icon="check">
          {o.published}
        </Tag>
      </Enter>
    </Art>
  );
}

/** Les compteurs bougent, les candidatures se trient : Retenue, Liste d'attente. */
function Sort() {
  const { t } = useTheme();
  const o = tutoArt.organizer;
  return (
    <Art label={`${o.retained} · ${o.waitlist}`}>
      <View style={styles.duo}>
        <Card style={styles.half}>
          <Lbl>{o.retained}</Lbl>
          <Row style={styles.baseline}>
            <Count to={42} from={41} dur={300} delay={1500} variant="posterL" color={t.color.plateInk} />
            <Sm>/ 60</Sm>
          </Row>
        </Card>
        <Card style={styles.half}>
          <Lbl>{o.waitlist}</Lbl>
          <Count to={8} from={7} dur={300} delay={2750} variant="posterL" color={t.color.plateInk} />
        </Card>
      </View>
      <Item
        delay={300}
        lead={<Icon name="vehicle" size={22} color={t.color.plateMuted} />}
        title={o.cardA.name}
        meta={o.cardA.meta}
      />
      <Item
        delay={600}
        lead={<Icon name="vehicle" size={22} color={t.color.plateMuted} />}
        title={o.cardB.name}
        meta={o.cardB.meta}
        trail={<Swap delay={2200} before={<View />} after={<Tag kind="wait">{tutoArt.garage.waitlist}</Tag>} />}
      />
      <Item
        delay={900}
        lead={<Icon name="vehicle" size={22} color={t.color.plateMuted} />}
        title={o.cardC.name}
        meta={o.cardC.meta}
        trail={<Swap delay={800} before={<View />} after={<Tag kind="acc">{tutoArt.garage.retained}</Tag>} />}
      />
    </Art>
  );
}

/** Les bénévoles en bulles : la taille dit l'engagement, un rôle par bulle. */
function Team() {
  const { t } = useTheme();
  const { team } = tutoArt.organizer;
  const bubbles = [
    {
      initials: "SA",
      size: 96,
      x: 26,
      y: 30,
      tone: t.color.statusWaitlist,
      ink: t.color.night,
      role: team.roles[0],
      at: 200,
    },
    { initials: "TH", size: 74, x: 66, y: 20, tone: t.color.win, ink: t.color.winInk, role: team.roles[1], at: 350 },
    {
      initials: "LU",
      size: 64,
      x: 60,
      y: 64,
      tone: t.color.night,
      ink: t.color.nightInk,
      role: team.roles[2],
      at: 500,
    },
    { initials: "NA", size: 52, x: 18, y: 72, tone: t.color.poster, ink: t.color.posterInk, role: undefined, at: 650 },
    {
      initials: "JO",
      size: 44,
      x: 86,
      y: 62,
      tone: t.color.plateChip,
      ink: t.color.plateInk,
      role: undefined,
      at: 800,
    },
  ];
  return (
    <Art label={team.kicker}>
      <Between>
        <Lbl>{team.kicker}</Lbl>
        <Enter kind="pop" delay={200}>
          <Tag>{team.volunteers}</Tag>
        </Enter>
      </Between>
      <View style={styles.bubbles}>
        {bubbles.map((b, i) => (
          <View
            key={b.initials}
            style={[
              styles.bubSlot,
              { left: `${b.x}%`, top: `${b.y}%`, marginLeft: -b.size / 2, marginTop: -b.size / 2 },
            ]}
          >
            <Enter kind="pop" delay={b.at}>
              <View
                style={[
                  styles.bubble,
                  { width: b.size, height: b.size, borderRadius: b.size / 2, backgroundColor: b.tone },
                ]}
              >
                <Text variant="posterS" color={b.ink}>
                  {b.initials}
                </Text>
              </View>
            </Enter>
            {b.role ? (
              <Enter kind="pop" delay={1300 + i * 150} style={styles.role}>
                <Tag kind="acc">{b.role}</Tag>
              </Enter>
            ) : null}
          </View>
        ))}
        <View style={[styles.bubSlot, { left: "44%", top: "88%", marginLeft: -22, marginTop: -22 }]}>
          <Enter kind="pop" delay={950}>
            <View style={[styles.bubble, styles.request, { borderColor: t.color.plateChip }]}>
              <Icon name="add" size={20} color={t.color.plateMuted} />
            </View>
          </Enter>
        </View>
      </View>
    </Art>
  );
}

/** Météo, statut conseillé, notifications envoyées à tous les inscrits. */
function Notify() {
  const { t } = useTheme();
  const w = tutoArt.organizer.weather;
  return (
    <Art label={w.title}>
      <Enter kind="up" delay={100}>
        <Card>
          <Row>
            <Icon name="weatherRain" size={26} color={t.color.plateInk} />
            <Grow>
              <Nm>{w.title}</Nm>
              <Sm>{w.meta}</Sm>
            </Grow>
          </Row>
        </Card>
      </Enter>
      <View style={styles.segments}>
        {w.segments.map((s, i) => (
          <View key={s} style={[styles.segment, { borderColor: t.color.plateChip }]}>
            {i === 1 ? (
              <Swap
                delay={1000}
                before={
                  <Text variant="meta" color={t.color.plateMuted}>
                    {s}
                  </Text>
                }
                after={
                  <Text variant="meta" color={t.color.statusUncertain}>
                    {s}
                  </Text>
                }
              />
            ) : (
              <Text variant="meta" color={t.color.plateMuted}>
                {s}
              </Text>
            )}
          </View>
        ))}
      </View>
      {w.notifs.map((n, i) => (
        <Item
          key={n.text}
          delay={1350 + i * 500}
          lead={<Icon name="bell" size={18} color={t.color.accent} />}
          title={n.text}
          meta={n.small}
        />
      ))}
      <Enter kind="pop" delay={2800} style={styles.self}>
        <View style={styles.sent}>
          <Icon name="bell" size={14} color={t.color.plateInk} />
          <Sm>{w.sent}</Sm>
          <Count to={148} delay={2800} dur={600} variant="meta" color={t.color.plateInk} />
          <Sm>{w.sentTail}</Sm>
        </View>
      </Enter>
    </Art>
  );
}

/** Le direct : entrés, zones, scans du staff, même hors ligne. */
function Live() {
  const { t } = useTheme();
  const l = tutoArt.organizer.live;
  const offline: IconName = "wait";
  return (
    <Art label={l.entered}>
      <Between>
        <View>
          <Lbl>{l.entered}</Lbl>
          <Row style={styles.baseline}>
            <Count to={87} delay={200} dur={1400} variant="posterL" color={t.color.plateInk} />
            <Sm>/ 120</Sm>
          </Row>
        </View>
        <Enter kind="pop" delay={500}>
          <Tag icon={offline}>{l.offline}</Tag>
        </Enter>
      </Between>
      <Card>
        <Bars rows={l.zones} delay={500} />
      </Card>
      {l.scans.map((s, i) => (
        <Item key={s.text} delay={1200 + i * 400} lead={<Dot on={s.ok} />} title={s.text} meta={s.meta} />
      ))}
    </Art>
  );
}

/** J+2 : les points partent seuls, l'absent non excusé a son malus. */
function Points() {
  const { t } = useTheme();
  const p = tutoArt.organizer.points;
  return (
    <Art label={p.done}>
      <Enter kind="up" delay={100}>
        <Card>
          <Between>
            <Lbl>{p.done}</Lbl>
            <Sm>{tutoArt.event.title}</Sm>
          </Between>
          <Row style={styles.baseline}>
            <Count to={112} delay={350} variant="posterL" color={t.color.plateInk} />
            <Sm>{p.present}</Sm>
          </Row>
        </Card>
      </Enter>
      {p.rows.map((r, i) => (
        <Item
          key={r.name}
          delay={900 + i * 150}
          title={r.name}
          meta={r.meta}
          trail={
            <Enter kind="pop" delay={1250 + i * 150}>
              <Tag kind={r.accent ? "acc" : "line"}>{r.tag}</Tag>
            </Enter>
          }
        />
      ))}
      <Enter kind="pop" delay={2100} style={styles.self}>
        <Tag kind="line" icon="next">
          {p.sent}
        </Tag>
      </Enter>
    </Art>
  );
}

export const organizerSlides = [Create, Sort, Team, Notify, Live, Points] as const;

const styles = StyleSheet.create({
  self: { alignSelf: "center" },
  steps: { flexDirection: "row", gap: space1 },
  stepSlot: { flex: 1 },
  step: { height: 4, borderRadius: 2 },
  posters: { height: 96, alignItems: "center" },
  posterSlot: { position: "absolute", top: 0, marginLeft: -36 },
  poster: { width: 72, height: 92, alignItems: "center", justifyContent: "center" },
  duo: { flexDirection: "row", gap: space2 },
  half: { flex: 1 },
  baseline: { alignItems: "baseline" },
  bubbles: { height: 230 },
  bubSlot: { position: "absolute", alignItems: "center" },
  bubble: { alignItems: "center", justifyContent: "center" },
  request: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: "dashed" },
  role: { position: "absolute", bottom: -10 },
  segments: { flexDirection: "row", gap: space2 },
  segment: { flex: 1, alignItems: "center", paddingVertical: space2, borderWidth: 1, borderRadius: radius.radiusSm },
  sent: { flexDirection: "row", alignItems: "center", gap: space1, flexWrap: "wrap", justifyContent: "center" },
});
