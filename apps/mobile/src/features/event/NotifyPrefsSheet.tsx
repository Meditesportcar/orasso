// Notifications d'un événement (lot R8n2, maquette R8.11) : les pièces communes (bloc « Essentiel », ligne « Nouveautés
// de l'événement » à interrupteur) et la feuille de la cloche de la fiche. Les mots viennent de `eventNotifyLabels`.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventNotifyLabels as L } from "@orasso/shared";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";

const { space1, space2, space3 } = tokens.spacing;
const { radiusMd, radiusPill } = tokens.radius;

/** Le bloc « Essentiel » : cadenas, état « toujours actif » et les six lignes. Lecteur d'écran : « Essentiel, toujours actif ». */
export function EssentialBlock() {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.ess} testID="notify-essential">
      <View
        accessible
        accessibilityLabel={`${L.essentialAria}. ${L.essentialBlockHelp}`}
        style={[styles.row, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      >
        <Icon name="lock" size={20} color={c.accentText} />
        <View style={styles.text}>
          <Text variant="bodyStrong" color={c.ink}>
            {L.essentialBlockTitle}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {L.essentialBlockHelp}
          </Text>
        </View>
        <Icon name="lock" size={14} color={c.inkMuted} />
      </View>
      {L.essentialItems.map((item) => (
        <View key={item} style={styles.item}>
          <Icon name="check" size={16} color={c.accentText} />
          <Text variant="caption" color={c.ink} style={styles.itemText}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Une ligne à interrupteur : cloche, titre, aide ; `disabled` grise la ligne (elle garde sa raison dans l'aide). */
export function SwitchRow({
  title,
  help,
  on,
  disabled = false,
  onChange,
  testID,
  icon = "bell",
}: {
  title: string;
  help: string;
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  testID: string;
  icon?: "bell";
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={help}
      accessibilityState={{ checked: on, disabled }}
      aria-checked={on}
      disabled={disabled}
      onPress={() => onChange(!on)}
      testID={testID}
      style={[
        styles.row,
        styles.target,
        { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
        disabled ? styles.off : null,
      ]}
    >
      <Icon name={icon} size={20} color={c.accentText} />
      <View style={styles.text}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {help}
        </Text>
      </View>
      <View style={[styles.switch, { backgroundColor: on ? c.accent : c.plateLine }]}>
        <View
          style={[
            styles.knob,
            { backgroundColor: on ? c.accentInk : c.inkMuted, transform: [{ translateX: on ? 20 : 0 }] },
          ]}
        />
      </View>
    </Pressable>
  );
}

/**
 * Organisateur (maquette R8.11, vue « org ») : la confirmation d'un changement qui prévient les inscrits. `count` nul :
 * le nombre n'a pas pu être lu (« Les inscrits seront prévenus. »). Aucune case à cocher.
 */
export function RecipientsBanner({ count, timing }: { count: number | null; timing: string | null }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      accessibilityRole="summary"
      style={[styles.banner, { backgroundColor: c.surface, borderColor: c.accent }]}
      testID="notify-recipients"
    >
      <Icon name="bell" size={20} color={c.accentText} />
      <View style={styles.text}>
        <Text variant="bodyStrong" color={c.ink} testID="notify-recipients-count">
          {count === null ? L.recipientsFallback : L.recipientsBanner(count)}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {L.autoNotify}
        </Text>
        {timing ? (
          <Text variant="caption" color={c.ink} testID="notify-recipients-timing">
            {timing}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * La feuille de la cloche de la fiche : l'Essentiel, puis « Nouveautés de l'événement », enregistrée au changement.
 * Place perdue entre-temps (403 `no_place`) : le message, et la cloche disparaît (`onLost`).
 */
export function NotifyPrefsSheet({
  eventId,
  visible,
  initialNews,
  onClose,
  onLost,
}: {
  eventId: string;
  visible: boolean;
  initialNews: boolean;
  onClose: () => void;
  onLost: () => void;
}) {
  const { t } = useTheme();
  const [news, setNews] = useState(initialNews);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setNews(initialNews);
      setMessage(null);
    }
  }, [visible, initialNews]);

  const change = useCallback(
    async (next: boolean) => {
      setNews(next);
      setMessage(null);
      try {
        const saved = await api.setEventNotificationPrefs(eventId, next);
        setNews(saved.news);
      } catch (e) {
        setNews(!next);
        if (e instanceof ApiRequestError && e.status === 403 && e.code === "no_place") {
          setMessage(L.noPlace);
          onLost();
        } else setMessage(errorMessage(e) || L.ficheSaveFailed);
      }
    },
    [eventId, onLost],
  );

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.bellLabel} maxHeight={0.85}>
      <Text variant="posterM" color={t.color.ink}>
        {L.bellLabel}
      </Text>
      <EssentialBlock />
      <SwitchRow
        title={L.eventNewsTitle}
        help={L.eventNewsHelpOnFiche}
        on={news}
        onChange={(v) => void change(v)}
        testID="notify-news-switch"
      />
      {message ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert" testID="notify-message">
          {message}
        </Text>
      ) : (
        <Muted variant="caption">{L.ficheNote}</Muted>
      )}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  ess: { gap: space2 },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space3,
    padding: space3,
    borderRadius: radiusMd,
    borderWidth: 1.5,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: radiusMd },
  target: { minHeight: 56 },
  off: { opacity: 0.55 },
  text: { flex: 1, gap: 2 },
  item: { flexDirection: "row", alignItems: "center", gap: space2, paddingLeft: space1 + 4, minHeight: 24 },
  itemText: { flex: 1 },
  switch: { width: 48, height: 28, borderRadius: radiusPill, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: radiusPill },
});
