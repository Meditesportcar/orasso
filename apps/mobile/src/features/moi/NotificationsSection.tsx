// Moi, notifications : un interrupteur par famille et, dans chaque famille, un par type (`muted_types`). Les relances du
// staff et les alertes de sécurité arrivent toujours. Tout reste visible dans le Journal.
import { CheckboxField, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  mutableTypesByFamily,
  type NotificationFamily,
  notificationFamilies,
  notificationFamilyLabels,
  notificationTypeLabels,
} from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { prefsWith, toggleMutedType, typeIsOn } from "@/lib/settingsPatch";
import { Muted } from "@/ui/Muted";
import { SectionTitle } from "@/ui/Screens";
import type { SettingsApi } from "./useSettings";

const { space2, space3 } = tokens.spacing;

const MUTABLE = mutableTypesByFamily();
/** Les familles qu'on peut régler (staff et sécurité du compte n'en font pas partie). */
const FAMILIES = notificationFamilies.filter((f) => MUTABLE[f]?.length) as NotificationFamily[];

function Family({ family, settings, save }: { family: NotificationFamily } & Pick<SettingsApi, "settings" | "save">) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  if (!settings) return null;
  const types = MUTABLE[family] ?? [];
  const familyOn = settings.notificationPrefs[family] !== false;
  const muted = types.filter((type) => settings.mutedTypes.includes(type)).length;
  return (
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
});
