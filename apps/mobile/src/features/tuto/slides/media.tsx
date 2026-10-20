// Les quatre diapos du média (prototype `s-tuto`, `data-tu="media"`).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { QrTile } from "../illustrations/scan";
import {
  Art,
  BarFill,
  Between,
  Card,
  Chips,
  Count,
  Enter,
  FakeButton,
  Fly,
  Grow,
  Item,
  Lbl,
  Logo,
  Nm,
  Ph,
  Row,
  Sm,
  Swap,
  Tag,
} from "../kit";

const { space1, space2 } = tokens.spacing;
const radius = tokens.radius;

/** L'agenda de la semaine : le samedi s'allume, l'événement est gardé. */
function Spot() {
  const { t } = useTheme();
  const m = tutoArt.media;
  return (
    <Art label={m.agenda}>
      <Between>
        <Lbl>{m.agenda}</Lbl>
        <Tag>{tutoArt.departments}</Tag>
      </Between>
      <View style={styles.week}>
        {m.week.map((w, i) => {
          const on = w.n === "24";
          return (
            <View key={w.n} style={styles.day}>
              <Swap
                delay={500}
                before={<DayCell d={w.d} n={w.n} lit={false} ev={i >= 5} />}
                after={<DayCell d={w.d} n={w.n} lit={on} ev={i >= 5} />}
              />
            </View>
          );
        })}
      </View>
      {m.items.map((item, i) => (
        <Item
          key={item.name}
          delay={900 + i * 150}
          title={item.name}
          meta={item.meta}
          trail={
            i === 0 ? (
              <Swap
                delay={1500}
                before={<Icon name="heart" size={20} color={t.color.plateMuted} />}
                after={<Icon name="heart" size={20} color={t.color.accent} filled />}
              />
            ) : (
              <Icon name="heart" size={20} color={t.color.plateMuted} />
            )
          }
        />
      ))}
      <Enter kind="pop" delay={1900} style={styles.self}>
        <Tag kind="line" icon="calendar">
          {m.kept}
        </Tag>
      </Enter>
    </Art>
  );
}

function DayCell({ d, n, lit, ev }: { d: string; n: string; lit: boolean; ev: boolean }) {
  const { t } = useTheme();
  return (
    <View
      style={[
        styles.cell,
        {
          backgroundColor: lit ? t.color.accent : "transparent",
          borderColor: ev ? t.color.accent : t.color.plateLine,
        },
      ]}
    >
      <Text variant="meta" color={lit ? t.color.accentInk : t.color.plateMuted}>
        {d}
      </Text>
      <Text variant="bodyStrong" color={lit ? t.color.accentInk : t.color.plateInk}>
        {n}
      </Text>
    </View>
  );
}

/** La carte média part à l'organisation : En attente › Accréditée. */
function Request() {
  const r = tutoArt.media.request;
  const g = tutoArt.garage;
  return (
    <Art label={r.send}>
      <Between>
        <Lbl>{tutoArt.event.title}</Lbl>
        <Row>
          <Swap delay={3200} before={<Tag>{g.wait}</Tag>} after={<Tag kind="acc">{r.accredited}</Tag>} />
          <Logo initials="MSC" tone="accent" size={30} />
        </Row>
      </Between>
      <Card>
        <Row>
          <Logo initials={r.card.logo} tone="waitlist" />
          <Grow>
            <Nm>{r.card.name}</Nm>
            <Sm>{r.card.meta}</Sm>
          </Grow>
        </Row>
        <Chips items={r.chips} on={[0, 1]} delay={500} />
      </Card>
      <FakeButton icon="next" delay={1300}>
        {r.send}
      </FakeButton>
      <Fly delay={1600} dx={130} dy={-170}>
        <Logo initials={r.card.logo} tone="waitlist" />
      </Fly>
    </Art>
  );
}

/** Le badge presse et son QR qui change, les zones permises et refusées. */
function Badge() {
  const { t } = useTheme();
  const b = tutoArt.media.badge;
  return (
    <Art label={b.band}>
      <Enter kind="up" delay={100}>
        <Card>
          <View style={[styles.band, { backgroundColor: t.color.accent }]}>
            <Text variant="label" color={t.color.accentInk}>
              {b.band}
            </Text>
          </View>
          <Row>
            <Grow>
              <Nm>{b.name}</Nm>
              <Sm>{b.meta}</Sm>
            </Grow>
            <QrTile size={64} delay={500} label={tutoArt.alt.qrBadge} />
          </Row>
          <Sm>{b.renew}</Sm>
        </Card>
      </Enter>
      {b.zones.map((z, i) => (
        <Item
          key={z.name}
          delay={1000 + i * 150}
          lead={<Icon name={z.yes ? "check" : "close"} size={18} color={z.yes ? t.color.accent : t.color.plateMuted} />}
          title={z.name}
          meta={z.meta}
        />
      ))}
    </Art>
  );
}

/** L'envoi, la page de l'événement qui met les vidéos en avant, les vues. */
function Publish() {
  const { t } = useTheme();
  const p = tutoArt.media.publish;
  return (
    <Art label={p.sending}>
      <Enter kind="up" delay={100}>
        <Card>
          <Between>
            <Lbl>{p.sending}</Lbl>
            <Enter kind="fade" delay={1300}>
              <Sm>{p.done}</Sm>
            </Enter>
          </Between>
          <BarFill width={100} delay={300} />
        </Card>
      </Enter>
      <Enter kind="up" delay={1400}>
        <Card>
          <Between>
            <Nm>{tutoArt.event.title}</Nm>
            <Sm>{p.seenBy}</Sm>
          </Between>
          <View style={[styles.video, { backgroundColor: t.color.night, borderRadius: radius.radiusSm }]}>
            <Icon name="gallery" size={30} color={t.color.nightInk} />
          </View>
          <Row>
            {[1900, 2000, 2100].map((at) => (
              <Enter key={at} kind="pop" delay={at}>
                <Ph size={52} icon="gallery" />
              </Enter>
            ))}
          </Row>
        </Card>
      </Enter>
      <Enter kind="pop" delay={2400} style={styles.self}>
        <View style={styles.views}>
          <Icon name="eye" size={14} color={t.color.plateInk} />
          <Count to={2310} delay={2400} dur={900} variant="meta" color={t.color.plateInk} />
          <Sm>{p.views}</Sm>
        </View>
      </Enter>
    </Art>
  );
}

export const mediaSlides = [Spot, Request, Badge, Publish] as const;

const styles = StyleSheet.create({
  self: { alignSelf: "center" },
  week: { flexDirection: "row", gap: space1 },
  day: { flex: 1 },
  cell: { alignItems: "center", paddingVertical: space1 + 2, borderWidth: 1, borderRadius: radius.radiusSm },
  band: { alignSelf: "flex-start", paddingHorizontal: space2, paddingVertical: 2, borderRadius: radius.radiusSm },
  video: { height: 90, alignItems: "center", justifyContent: "center" },
  views: { flexDirection: "row", alignItems: "center", gap: space1 },
});
