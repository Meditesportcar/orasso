// Feuille des zones (lot 23, choix C19 : zone attribuée à la main) : la zone est facultative, attribuée avec la retenue
// ou changée ensuite depuis la liste. Les zones viennent de l'événement (`EventOrganizer.zones`).
import { Button, Text, useTheme } from "@orasso/design-system/native";
import { type EventZone, triageAppLabels } from "@orasso/shared";

import { AppSheet } from "@/ui/AppSheet";

export function ZoneSheet({
  visible,
  zones,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  zones: readonly EventZone[];
  current: string | null;
  onPick: (zone: EventZone | null) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={triageAppLabels.zoneTitle}>
      <Text variant="title" color={t.color.ink}>
        {triageAppLabels.zoneTitle}
      </Text>
      <Text variant="body" color={t.color.ink}>
        {triageAppLabels.zoneBody}
      </Text>
      {zones.map((zone) => (
        <Button
          key={zone.id}
          variant={zone.id === current ? "secondary" : "plate"}
          icon="place"
          onPress={() => onPick(zone)}
          fullWidth
          testID={`triage-zone-${zone.code}`}
        >
          {`${zone.code} · ${zone.name}`}
        </Button>
      ))}
      <Button variant="plate" icon="close" onPress={() => onPick(null)} fullWidth>
        {triageAppLabels.zoneNone}
      </Button>
    </AppSheet>
  );
}
