// Page du crew (lot R5c2, maquettes R5.7 et R5.8) : les morceaux de la page. Classes de la maquette en commentaire
// (`.r5out`, `.r5req`, `.r5sq`…) ; couleurs et rayons des jetons seulement.
import { Icon, type IconName, Photo, Tag, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import {
  type CrewEventView,
  type CrewFace,
  type CrewGarageVehicle,
  type CrewMemberView,
  type CrewOutingRsvp,
  type CrewOutingView,
  type CrewPendingView,
  type CrewVitrineMember,
  crewLabels,
  gradeLabels,
  crewPageLabels as L,
} from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { openMaps, openWaze } from "@/lib/directions";
import { formatHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";
import { MiniDate } from "@/ui/KitTz";

const { space1, space2, space3 } = tokens.spacing;

/**
 * `.sec-h` de la page : le titre ne rétrécit jamais (défaut « SON » des titres sur Android, retour de Damien du 26/10) ;
 * l'aide passe à la ligne s'il le faut.
 */
export function CrewSecHead({ title, hint, icon }: { title: string; hint?: string; icon?: IconName }) {
  const { t } = useTheme();
  return (
    <View style={styles.secH}>
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header" style={styles.secTitle}>
        {title}
      </Text>
      {hint ? (
        <View style={styles.secHint}>
          {icon ? <Icon name={icon} size={14} color={t.color.inkMuted} /> : null}
          <Text variant="caption" color={t.color.inkMuted}>
            {hint}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** `.tz-avs` : ronds qui se chevauchent (qui vient, les amis membres). */
export function AvatarStack({
  faces,
  max = 4,
  size = 26,
}: {
  faces: readonly CrewFace[];
  max?: number;
  size?: number;
}) {
  const { t } = useTheme();
  if (!faces.length) return null;
  return (
    <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {faces.slice(0, max).map((f, i) => (
        <View
          key={f.pseudo}
          style={[styles.stackItem, { marginLeft: i === 0 ? 0 : -size / 3, borderColor: t.color.surface }]}
        >
          <Avatar url={f.avatarUrl} pseudo={f.pseudo} size={size} />
        </View>
      ))}
    </View>
  );
}

/** `.r5out .seg` : « Je viens | Peut-être | Non », le choix fait en moutarde. */
function RsvpSeg({
  value,
  onChange,
  disabled,
}: {
  value: CrewOutingRsvp | null;
  onChange: (v: CrewOutingRsvp) => void;
  disabled?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const items: { id: CrewOutingRsvp; label: string }[] = [
    { id: "yes", label: L.rsvpYes },
    { id: "maybe", label: L.rsvpMaybe },
    { id: "no", label: L.rsvpNo },
  ];
  return (
    <View
      style={[styles.seg, { backgroundColor: c.surfaceRaised }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={L.rsvpA11y}
    >
      {items.map((it) => {
        const on = value === it.id;
        return (
          <Pressable
            key={it.id}
            onPress={() => onChange(it.id)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !!disabled }}
            aria-checked={on}
            accessibilityLabel={it.label}
            testID={`outing-rsvp-${it.id}`}
            style={styles.segHit}
          >
            <View style={[styles.segBtn, on && { backgroundColor: c.accent }]}>
              <Text variant="bodyStrong" color={on ? c.accentInk : c.inkMuted} style={styles.segText}>
                {it.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** `.r5out` : une sortie du crew (date, nom, rendez-vous, programme, qui vient, réponse, Maps et Waze). */
export function OutingCard({
  outing,
  busy,
  onAnswer,
  onEdit,
  onCancel,
}: {
  outing: CrewOutingView;
  busy: boolean;
  onAnswer: (answer: CrewOutingRsvp) => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const dest = { lat: outing.lat, lng: outing.lng, addressLine: outing.place, title: outing.title };
  return (
    <View style={[styles.out, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]} testID="crew-outing">
      <View style={styles.outHead}>
        <MiniDate iso={outing.startsAt} />
        <View style={styles.grow}>
          <Text variant="posterS" color={c.ink} style={styles.outTitle}>
            {outing.title}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {L.outingRdv(formatHour(outing.startsAt), outing.place)}
          </Text>
          {outing.program ? (
            <Text variant="caption" color={c.inkMuted}>
              {outing.program}
            </Text>
          ) : null}
          <Text variant="caption" color={c.inkMuted}>
            {L.outingBy(outing.authorPseudo)}
          </Text>
        </View>
      </View>
      <View style={styles.who}>
        <AvatarStack faces={outing.going} />
        <Text variant="caption" color={c.ink} style={styles.grow} testID="outing-count">
          {L.rsvpCount(outing.yes, outing.maybe)}
        </Text>
      </View>
      <RsvpSeg value={outing.mine} onChange={onAnswer} disabled={busy} />
      <View style={styles.outActs}>
        <SmButton icon="nav" onPress={() => openMaps(dest)} accessibilityLabel={L.mapsA11y(outing.place)}>
          {L.maps}
        </SmButton>
        <SmButton icon="nav" onPress={() => openWaze(dest)} accessibilityLabel={L.wazeA11y(outing.place)}>
          {L.waze}
        </SmButton>
        <View style={styles.grow} />
        {outing.canManage ? (
          <>
            <SmButton kind="g" icon="edit" onPress={onEdit} testID="outing-edit">
              {L.editOuting}
            </SmButton>
            <SmButton
              kind="g"
              icon="close"
              onPress={onCancel}
              accessibilityLabel={L.cancelOuting}
              testID="outing-cancel"
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

/** `.tz-it.r5it` : un événement Orasso où va le crew. */
export function CrewEventRow({ event, onPress }: { event: CrewEventView; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const retained = event.going.length > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={event.title}
      style={[styles.evRow, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      testID="crew-event"
    >
      <MiniDate iso={event.startsAt} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {event.title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {retained
            ? L.crewEventGoing(event.city, event.going.length)
            : L.crewEventRegistered(event.city, event.registered)}
        </Text>
        {retained ? (
          <View style={styles.who}>
            <AvatarStack faces={event.going} size={20} />
            <Text variant="caption" color={c.inkMuted} style={styles.grow}>
              {event.going.map((g) => g.pseudo).join(", ")}
            </Text>
          </View>
        ) : null}
      </View>
      <Tag tone={retained ? "acc" : "line"}>{retained ? L.tagRetained : L.tagRegistered}</Tag>
    </Pressable>
  );
}

/** `.r5sq` : un véhicule du garage du crew, en carré ; le nom jamais coupé, le propriétaire dessous. */
export function GarageTile({ vehicle, onPress }: { vehicle: CrewGarageVehicle; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const source = mediaSource(vehicle.photoUrl);
  const icon: IconName =
    vehicle.vehicleType === "moto" ? "moto" : vehicle.vehicleType === "truck" ? "truck" : "vehicle";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${vehicle.label}, ${vehicle.ownerPseudo}`}
      style={styles.tile}
      testID="crew-garage-vehicle"
    >
      <View style={[styles.tilePhoto, { backgroundColor: c.night, boxShadow: t.shadow.shadowCard }]}>
        {source ? (
          <Photo source={source} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.sil}>
            <Icon name={icon} size={40} color={c.inkFaint} />
          </View>
        )}
      </View>
      <Text variant="posterS" color={c.ink} style={styles.tileName}>
        {vehicle.label}
      </Text>
      <Text variant="caption" color={c.inkMuted}>
        {vehicle.isMain ? `${vehicle.ownerPseudo} · ${L.mainVehicle}` : vehicle.ownerPseudo}
      </Text>
    </Pressable>
  );
}

/** `.prow.r5mem` : un membre (rond, pseudo, véhicule ou grade, « Chef »). */
export function MemberRow({
  pseudo,
  avatarUrl,
  caption,
  leader,
  onPress,
  trailing,
  testID = "crew-member",
}: {
  pseudo: string;
  avatarUrl: string | null;
  caption: string;
  leader: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const body = (
    <View style={[styles.prow, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
      <Avatar url={avatarUrl} pseudo={pseudo} size={42} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {pseudo}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {caption}
        </Text>
      </View>
      {trailing ?? (leader ? <Tag tone="acc">{L.roleLeader}</Tag> : null)}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={pseudo} testID={testID}>
      {body}
    </Pressable>
  ) : (
    <View testID={testID}>{body}</View>
  );
}

export const memberCaption = (m: CrewMemberView) => m.vehicleLabel ?? L.noVehicle;
export const vitrineCaption = (m: CrewVitrineMember) => `Grade ${gradeLabels[m.grade]}`;

/** `.r5req` : une demande reçue (chef seul), avec son message. */
export function RequestCard({
  request,
  busy,
  onOpen,
  onAccept,
  onDecline,
}: {
  request: CrewPendingView;
  busy: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const p = request.person;
  return (
    <View
      style={[styles.req, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      testID="crew-pending-request"
    >
      <View style={styles.reqHead}>
        <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={p.pseudo}>
          <Avatar url={p.avatarUrl} pseudo={p.pseudo} size={42} />
        </Pressable>
        <View style={styles.grow}>
          <Text variant="bodyStrong" color={c.ink}>
            {p.pseudo}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {[`Grade ${gradeLabels[p.grade]}`, request.vehicleLabel].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={styles.reqActs}>
          <SmButton icon="check" disabled={busy} onPress={onAccept} testID="crew-request-accept">
            {crewLabels.accept}
          </SmButton>
          <SmButton kind="g" icon="close" disabled={busy} onPress={onDecline} accessibilityLabel={crewLabels.decline} />
        </View>
      </View>
      <View style={[styles.quote, { backgroundColor: c.ground }]}>
        <Text variant="body" color={request.message ? c.ink : c.inkMuted} style={styles.quoteText}>
          {request.message ? `« ${request.message} »` : L.requestNoMessage}
        </Text>
      </View>
    </View>
  );
}

/** `.r5lock` / `.r5vis` / `.r5sent` : un encadré avec une icône, une ligne forte et une légende. */
export function InfoBox({
  icon,
  title,
  caption,
  tone = "plain",
  testID,
}: {
  icon: IconName;
  title: string;
  caption?: string;
  tone?: "plain" | "accent";
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      style={[styles.box, { backgroundColor: tone === "accent" ? withAlpha(c.accent, 0.18) : c.surfaceRaised }]}
      testID={testID}
    >
      <Icon name={icon} size={20} color={tone === "accent" ? c.accentText : c.inkMuted} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" color={c.inkMuted}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** `.r5friends` : « 2 de tes amis en font partie ». */
export function FriendsBox({ friends }: { friends: readonly CrewVitrineMember[] }) {
  const { t } = useTheme();
  const c = t.color;
  if (!friends.length) return null;
  return (
    <View style={[styles.friends, { backgroundColor: c.surface }]} testID="crew-friends">
      <AvatarStack faces={friends} size={28} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {L.friendsIn(friends.length)}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {L.friendsNames(friends.map((f) => f.pseudo))}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  secH: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: space2,
    rowGap: 2,
    marginTop: space2,
  },
  secTitle: { flexShrink: 0, fontSize: 16, lineHeight: 18, letterSpacing: -0.16 },
  secHint: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, marginLeft: "auto" },
  stack: { flexDirection: "row", alignItems: "center" },
  stackItem: { borderWidth: 2, borderRadius: 999 },
  seg: { flexDirection: "row", padding: 3, borderRadius: 14, gap: 2 },
  segHit: { flex: 1, minWidth: 0, minHeight: tokens.spacing.touch, justifyContent: "center" },
  segBtn: {
    minHeight: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  segText: { fontSize: 13, lineHeight: 15, textAlign: "center" },
  out: { gap: space2 + 2, padding: space3 + 2, borderRadius: tokens.radius.radiusLg },
  outHead: { flexDirection: "row", gap: space3, alignItems: "flex-start" },
  outTitle: { fontSize: 17, lineHeight: 18, marginBottom: 4 },
  who: { flexDirection: "row", alignItems: "center", gap: space2 },
  outActs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2 },
  evRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderRadius: tokens.radius.radiusMd + 2,
  },
  tile: { flex: 1, minWidth: 0, gap: 7 },
  tilePhoto: { aspectRatio: 1, borderRadius: 16, overflow: "hidden" },
  sil: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  tileName: { fontSize: 14, lineHeight: 15 },
  prow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  req: { gap: space2, padding: 10, borderRadius: 16 },
  reqHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  reqActs: { flexDirection: "row", alignItems: "center", gap: space1 + 2 },
  quote: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  quoteText: { fontStyle: "italic", fontSize: 13.5, lineHeight: 19 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  friends: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
});
