// Moi, notifications : un interrupteur par famille et, dans chaque famille, un par type (`muted_types`). Les relances du
// staff et les alertes de sécurité arrivent toujours. Tout reste visible dans le Journal.
import { CheckboxField, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  eventNotifyLabels,
  mutableTypesByFamily,
  type NotificationFamily,
  newsDigestType,
  notificationFamilies,
  notificationFamilyLabels,
  notificationTypeLabels,
  settingsEventRows,
} from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SwitchRow } from "@/features/event/NotifyPrefsSheet";
import { prefsWith, toggleMutedType, typeIsOn } from "@/lib/settingsPatch";
import { Muted } from "@/ui/Muted";
import { SectionTitle } from "@/ui/Screens";
import type { SettingsApi } from "./useSettings";

const { space2, space3 } = tokens.spacing;
const { radiusMd } = tokens.radius;

const MUTABLE = mutableTypesByFamily();
// Lot R8n2 : le résumé des nouveautés a sa propre ligne (« Nouveautés de mes sorties »), pas une case de plus.
const typesOf = (family: NotificationFamily) =>
  (MUTABLE[family] ?? []).filter((type) => !(family === "event" && type === newsDigestType));
/** Les familles qu'on peut régler (staff et sécurité du compte n'en font pas partie). */
const FAMILIES = notificationFamilies.filter((f) => f === "event" || MUTABLE[f]?.length) as NotificationFamily[];

/** Lot R8n2 (R8.11, vue « reg ») : les deux lignes de « Événements ». « Changements importants » ne se coupe pas. */
function EventRows({
  settings,
  save,
}: Pick<SettingsApi, "settings" | "save"> & { settings: NonNullable<SettingsApi["settings"]> }) {
  const { t } = useTheme();
  const c = t.color;
  const rows = settingsEventRows(settings.notificationPrefs);
  return (
    <View style={styles.rows} testID="notif-event-rows">
      <View
        accessible
        accessibilityLabel={`${eventNotifyLabels.essentialTitle}, ${eventNotifyLabels.alwaysOn.toLowerCase()}`}
        style={[styles.locked, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
        testID="notif-essential"
      >
        <Icon name="lock" size={20} color={c.accentText} />
        <View style={styles.lockedText}>
          <Text variant="bodyStrong" color={c.ink}>
            {eventNotifyLabels.essentialTitle}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {eventNotifyLabels.essentialHelp}
          </Text>
        </View>
        <Text variant="caption" color={c.inkMuted} style={styles.lockedState}>
          {eventNotifyLabels.alwaysOn}
        </Text>
      </View>
      <SwitchRow
        title={eventNotifyLabels.newsTitle}
        help={rows.news.reason ?? eventNotifyLabels.newsHelp}
        on={rows.news.on}
        disabled={rows.news.disabled}
        onChange={(on) =>
          void save({
            notificationPrefs: {
              ...prefsWith(settings.notificationPrefs, "event", settings.notificationPrefs.event !== false),
              eventNews: on,
            },
          })
        }
        testID="notif-news"
      />
    </View>
  );
}

function Family({ family, settings, save }: { family: NotificationFamily } & Pick<SettingsApi, "settings" | "save">) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  if (!settings) return null;
  const types = typesOf(family);
  const familyOn = settings.notificationPrefs[family] !== false;
  const muted = types.filter((type) => settings.mutedTypes.includes(type)).length;
  const plate = (
    <Plate style={styles.block} testID={`notif-family-${family}`}>
      <CheckboxField
        label={`Recevoir les notifications « ${notificationFamilyLabels[family]} »`}
        checked={familyOn}
        onChange={(on) => void save({ notificationPrefs: prefsWith(settings.notificationPrefs, family, on) })}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        testID={`notif-types-${family}`}
      >
        <Text variant="caption" color={t.color.plateMuted}>
          {open ? "Masquer" : "Choisir une par une"}
          {muted > 0 ? ` · ${muted} coupée${muted > 1 ? "s" : ""}` : ""}
        </Text>
      </Pressable>
      {open
        ? types.map((type) => (
            <CheckboxField
              key={type}
              label={notificationTypeLabels[type]}
              checked={typeIsOn(settings.notificationPrefs, settings.mutedTypes, family, type)}
              disabled={!familyOn}
              onChange={(on) => void save({ mutedTypes: toggleMutedType(settings.mutedTypes, type, on) })}
            />
          ))
        : null}
    </Plate>
  );
  if (family !== "event") return plate;
  return (
    <>
      <Text variant="label" color={t.color.inkMuted}>
        {eventNotifyLabels.settingsGroup}
      </Text>
      <EventRows settings={settings} save={save} />
      {plate}
    </>
  );
}

export function NotificationsSection({ settings, save }: Pick<SettingsApi, "settings" | "save">) {
  return (
    <>
      <SectionTitle>Notifications</SectionTitle>
      <Muted variant="caption">
        Les relances du staff et les alertes de sécurité du compte arrivent toujours. Tout reste visible dans ton
        Journal, derrière la cloche.
      </Muted>
      {settings ? (
        FAMILIES.map((family) => <Family key={family} family={family} settings={settings} save={save} />)
      ) : (
        <Muted variant="caption">Chargement…</Muted>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  rows: { gap: space2 },
  locked: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderRadius: radiusMd,
    minHeight: 56,
  },
  lockedText: { flex: 1, gap: 2 },
  lockedState: { fontFamily: "Archivo-ExtraBold" },
});
