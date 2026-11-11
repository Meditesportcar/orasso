// « Ce que tu recevras pour cet événement » (lot R8n2, maquette R8.11, vue « insc ») : le bloc de l'écran de fin d'une
// candidature. L'Essentiel (cadenas), « Nouveautés de l'événement » activé par défaut, puis « C'est noté » : il enregistre
// (seulement si l'interrupteur a changé) et ferme. Un échec ne remet jamais la candidature en cause : le défaut reste.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventNotifyLabels as L } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { Muted } from "@/ui/Muted";
import { EssentialBlock, SwitchRow } from "./NotifyPrefsSheet";

const { space2, space3 } = tokens.spacing;

export function NotifySignup({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const { t } = useTheme();
  const [news, setNews] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function noted() {
    if (busy) return;
    if (news) return onDone();
    setBusy(true);
    setMessage(null);
    try {
      await api.setEventNotificationPrefs(eventId, news);
      onDone();
    } catch {
      // Le défaut (activé) reste : un message discret, la candidature n'est jamais remise en cause.
      setNews(true);
      setMessage(L.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.box} testID="notify-signup">
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header">
        {L.signupTitle}
      </Text>
      <EssentialBlock />
      <SwitchRow
        title={L.eventNewsTitle}
        help={L.eventNewsHelpOnSignup}
        on={news}
        onChange={setNews}
        testID="notify-signup-news"
      />
      {message ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert" testID="notify-signup-message">
          {message}
        </Text>
      ) : (
        <Muted variant="caption">{L.signupNote}</Muted>
      )}
      <SmButton kind="p" big wide icon="check" onPress={() => void noted()} disabled={busy} testID="notify-noted">
        {L.noted}
      </SmButton>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: "stretch", gap: space3 - 2, marginTop: space2 },
});
