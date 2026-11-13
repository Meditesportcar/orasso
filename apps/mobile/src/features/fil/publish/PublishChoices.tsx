// Les blocs de l'écran « Publier » (lot R8p, maquette R8.4) : « Publier en tant que », « Rattacher à … », le visuel de
// l'affiche, « Info importante », « Ce que verront les autres ». Aucune règle ici : tout vient de `rules/feedPublish.ts`.
import { Chip, Icon, type IconName, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AttachableEventItem,
  attachDateLabel,
  attachStateLabel,
  type ImportantReason,
  importantBlocked,
  importantReasonLabels,
  importantReasons,
  importantWhoText,
  type PublishAuthor,
  type PublishSays,
  feedPublishLabels as T,
} from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { Avatar } from "@/ui/Avatar";
import { CheckBox, SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";

const { space1, space2, space3 } = tokens.spacing;
// Aucun jeton de trait, de vignette ni d'avatar : on les compose depuis les jetons d'espacement.
const LINE = space1 / 2;
const THUMB = tokens.spacing.space12 + tokens.spacing.space6;
const AVATAR = tokens.spacing.space8 + space1;

/** Une ligne de choix exclusif (radio) : icône, titre, sous-titre ; annonce « coché » aux lecteurs d'écran. */
function Option({
  icon,
  title,
  hint,
  selected,
  disabled,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  hint: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      accessibilityLabel={`${title}. ${hint}`}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.option,
        {
          backgroundColor: c.surface,
          borderColor: selected ? c.accent : c.line,
          opacity: disabled && !selected ? 0.6 : 1,
        },
      ]}
      testID={testID}
    >
      <Icon name={icon} size={22} color={selected ? c.accentText : c.ink} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

export function Label({ children }: { children: string }) {
  const { t } = useTheme();
  return (
    <Text variant="label" color={t.color.inkMuted}>
      {children}
    </Text>
  );
}

/** `.pnote` : une icône « info » et une phrase ; `lead` en gras devant. */
export function Note({ lead, children, testID }: { lead?: string; children: string; testID?: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.note} testID={testID}>
      <Icon name="info" size={16} color={t.color.inkMuted} />
      <Text variant="caption" color={t.color.inkMuted} style={styles.flex}>
        {lead ? (
          <Text variant="bodyStrong" color={t.color.ink}>
            {`${lead} `}
          </Text>
        ) : null}
        {children}
      </Text>
    </View>
  );
}

const roleIcon = (e: AttachableEventItem) =>
  e.role === "on_site" ? "truck" : e.role === "attendee" && e.phase === "after" ? "stamp" : "ticket";

/** « Publier en tant que » : une ligne par casquette (seulement avec plus d'une casquette). */
export function AuthorChoice({
  authors,
  value,
  onChoose,
  disabled,
}: {
  authors: readonly PublishAuthor[];
  value: string;
  onChoose: (key: string) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.block} testID="fil-publish-as">
      <Label>{T.asTitle}</Label>
      <View style={styles.list} accessibilityRole="radiogroup">
        {authors.map((a) => (
          <Option
            key={a.key}
            icon={a.icon}
            title={a.title}
            hint={a.hint}
            selected={a.key === value}
            disabled={disabled}
            onPress={() => onChoose(a.key)}
            testID={`fil-publish-as-${a.key}`}
          />
        ))}
      </View>
    </View>
  );
}

/** « Rattacher à une sortie · facultatif » : « Aucun », puis les événements rendus par l'API pour la casquette. */
export function EventChoice({
  lead,
  noneHint,
  events,
  loading,
  failed,
  onRetry,
  value,
  onChoose,
  disabled,
  foot,
}: {
  lead: string;
  noneHint: string;
  events: readonly AttachableEventItem[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  value: string | null;
  onChoose: (id: string | null) => void;
  disabled: boolean;
  foot: string | null;
}) {
  return (
    <View style={styles.block} testID="fil-publish-events">
      <Label>{`${lead} · ${T.optional}`}</Label>
      <View style={styles.list} accessibilityRole="radiogroup">
        <Option
          icon="close"
          title={T.attachNone}
          hint={noneHint}
          selected={value === null}
          disabled={disabled}
          onPress={() => onChoose(null)}
          testID="fil-publish-event-none"
        />
        {events.map((e) => (
          <Option
            key={e.id}
            icon={roleIcon(e)}
            title={e.title}
            hint={`${attachDateLabel(e.startsAt)} · ${attachStateLabel(e.role, e.phase)}`}
            selected={value === e.id}
            disabled={disabled}
            onPress={() => onChoose(e.id)}
            testID={`fil-publish-event-${e.id}`}
          />
        ))}
      </View>
      {loading ? <Muted variant="caption">{T.attachLoading}</Muted> : null}
      {failed ? (
        <>
          <Muted variant="caption">{T.attachFailed}</Muted>
          <SmButton kind="s" icon="undo" onPress={onRetry} testID="fil-publish-events-retry">
            {T.attachRetry}
          </SmButton>
        </>
      ) : null}
      {foot ? <Muted variant="caption">{foot}</Muted> : null}
    </View>
  );
}

/** Sans photo, l'affiche de l'événement est le visuel (T1) : une vignette 4:5 et la ligne qui le dit. */
export function PosterVisual({ event }: { event: AttachableEventItem }) {
  const { t } = useTheme();
  const source = mediaSource(event.posterUrl);
  return (
    <View style={styles.poster} testID="fil-publish-poster">
      <View style={[styles.posterThumb, { backgroundColor: t.color.night }]}>
        {source ? (
          <Photo source={source} style={StyleSheet.absoluteFill} accessibilityLabel={T.posterAlt(event.title)} />
        ) : null}
      </View>
      <Text variant="caption" color={t.color.inkMuted} style={styles.flex}>
        {T.posterNote}
      </Text>
    </View>
  );
}

/** La case « Info importante », ses cinq motifs et le plafond. */
export function ImportantBox({
  event,
  on,
  reason,
  recipients,
  immediate,
  onToggle,
  onReason,
  disabled,
}: {
  event: AttachableEventItem;
  on: boolean;
  reason: ImportantReason | null;
  recipients: number | null;
  immediate: boolean;
  onToggle: (on: boolean) => void;
  onReason: (reason: ImportantReason) => void;
  disabled: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const blocked = importantBlocked(event);
  const left = event.important;
  const quota = left ? T.importantQuota(left.leftToday, left.leftWeek) : null;
  const sub = blocked ? T.importantLimit[blocked] : on ? importantWhoText(recipients, immediate) : T.importantOff;
  return (
    <View style={styles.block} testID="fil-publish-important">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${T.important} : ${sub}`}
        accessibilityState={{ checked: on, disabled: disabled || blocked !== null }}
        aria-checked={on}
        disabled={disabled || blocked !== null}
        onPress={() => onToggle(!on)}
        style={[
          styles.notif,
          { backgroundColor: c.surface, borderColor: on ? c.accent : c.line, opacity: blocked ? 0.6 : 1 },
        ]}
        testID="fil-publish-important-toggle"
      >
        <Icon name="bell" size={22} color={on ? c.accentText : c.ink} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" color={c.ink}>
            {T.important}
          </Text>
          <Text variant="caption" color={c.inkMuted} testID="fil-publish-important-sub">
            {sub}
          </Text>
        </View>
        <CheckBox on={on} />
      </Pressable>
      {on && !blocked ? (
        <>
          <Label>{T.importantReason}</Label>
          <View style={styles.chips} accessibilityRole="radiogroup" testID="fil-publish-important-reasons">
            {importantReasons.map((r) => (
              <Chip key={r} selected={reason === r} accessibilityRole="radio" onPress={() => !disabled && onReason(r)}>
                {importantReasonLabels[r]}
              </Chip>
            ))}
          </View>
          {quota ? (
            <Note lead={quota.lead} testID="fil-publish-important-quota">
              {quota.rest}
            </Note>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** « Ce que verront les autres » : l'auteur, la phrase du rattachement, le tampon, et où elle vit. */
export function Says({ says }: { says: PublishSays }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.block} testID="fil-publish-says">
      <Label>{T.says}</Label>
      <View style={[styles.sayCard, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Avatar url={says.logoUrl} pseudo={says.authorName} size={AVATAR} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" color={c.ink}>
            {says.authorName}
          </Text>
          <Text variant="caption" color={c.inkMuted} testID="fil-publish-says-phrase">
            {says.phrase ?? T.sayNow}
          </Text>
        </View>
        {says.tag ? (
          <View style={[styles.stamp, { backgroundColor: c.accent }]} testID="fil-publish-says-tag">
            <Icon name="ticket" size={14} color={c.accentInk} />
            <Text variant="label" color={c.accentInk}>
              {says.tag}
            </Text>
          </View>
        ) : null}
        {says.stamp ? (
          <View style={[styles.stamp, { backgroundColor: c.accent }]} testID="fil-publish-stamp">
            <Icon name="stamp" size={14} color={c.accentInk} />
            <Text variant="label" color={c.accentInk}>
              {T.stamp}
            </Text>
          </View>
        ) : null}
      </View>
      <Note testID="fil-publish-says-where">{says.where}</Note>
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    minHeight: tokens.spacing.touch,
    padding: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: LINE,
  },
  block: { gap: space2 },
  list: { gap: space2 },
  flex: { flex: 1, flexShrink: 1 },
  note: { flexDirection: "row", gap: space2, alignItems: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  poster: { flexDirection: "row", gap: space3, alignItems: "center" },
  posterThumb: { width: THUMB, aspectRatio: 0.8, borderRadius: tokens.radius.radiusMd, overflow: "hidden" },
  notif: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2 + space1,
    minHeight: tokens.spacing.touch,
    padding: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: LINE,
  },
  sayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2 + space1,
    padding: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: LINE,
  },
  stamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1,
    paddingHorizontal: space2,
    paddingVertical: space1,
    borderRadius: tokens.radius.radiusSm,
  },
});
