// Moi, mes données (lot 35c, D20) : la newsletter Orasso (case libre, non cochée par défaut, comme à l'inscription à un
// événement) et l'export de mes données personnelles en un fichier JSON, remis à la feuille de partage du système.
import { Button, CheckboxField, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { accountAppLabels as L } from "@orasso/shared";
import { StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { saveExport } from "@/lib/dataExport";
import { useSession } from "@/lib/session";
import { useRun } from "@/lib/useRun";
import { Feedback } from "@/ui/Feedback";
import { SectionTitle } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

export function DataSection() {
  const { t } = useTheme();
  const { me, refreshMe } = useSession();
  const news = useRun();
  const exportRun = useRun();
  const optIn = me?.profile.newsletterOptIn ?? false;

  const setNewsletter = (next: boolean) =>
    news.run(
      "newsletter",
      async () => {
        await api.updateProfile({ newsletterOptIn: next });
        await refreshMe();
      },
      next ? L.newsletterOn : L.newsletterOff,
    );

  const exportData = () =>
    exportRun.run("export", async () => {
      const outcome = await saveExport(await api.exportMyData());
      exportRun.setNotice(
        outcome === "shared" ? L.exportDone : outcome === "saved" ? L.exportSaved : L.exportUnavailable,
      );
    });

  return (
    <>
      <SectionTitle>{L.dataTitle}</SectionTitle>
      <Plate style={styles.block} testID="moi-data">
        <CheckboxField
          label={L.newsletter}
          checked={optIn}
          disabled={!me || news.busy !== null}
          onChange={(next) => void setNewsletter(next)}
        />
        <Text variant="caption" color={t.color.plateMuted}>
          {L.newsletterHelp}
        </Text>
        <Feedback error={news.error} notice={news.notice} testID="newsletter-notice" />
      </Plate>
      <Plate style={styles.block}>
        <Text variant="caption" color={t.color.plateMuted}>
          {L.exportHelp}
        </Text>
        <Feedback error={exportRun.error} notice={exportRun.notice} testID="export-notice" />
        <Button
          variant="plate"
          icon="export"
          loading={exportRun.busy === "export"}
          onPress={() => void exportData()}
          fullWidth
          testID="export-data"
        >
          {L.export}
        </Button>
      </Plate>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
