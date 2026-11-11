// « Ce que tu recevras pour cet événement » (lot R8n2, maquette R8.11, vue « insc ») : le bloc de l'écran de fin d'une
// candidature. L'Essentiel (cadenas), « Nouveautés de l'événement » à la valeur déjà enregistrée (activé par défaut),
// enregistrée au changement de l'interrupteur (comme la feuille de la cloche : quitter l'écran n'en perd rien), puis
// « C'est noté », qui ferme. Un échec rend l'interrupteur à sa valeur, sans jamais remettre la candidature en cause.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventNotifyLabels as L } from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { Muted } from "@/ui/Muted";
import { EssentialBlock, SwitchRow } from "./NotifyPrefsSheet";

const { space2, space3 } = tokens.spacing;

export function NotifySignup({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const { t } = useTheme();
  const [news, setNews] = useState(true);
  // Tant que le réglage enregistré n'est pas lu, l'interrupteur est à son défaut et ne se touche pas.
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .eventNotificationPrefs(eventId)
      .then((prefs) => alive && setNews(prefs.news))
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [eventId]);

  async function change(next: boolean) {
    const previous = news;
    setNews(next);
    setMessage(null);
    try {
      const saved = await api.setEventNotificationPrefs(eventId, next);
      setNews(saved.news);
    } catch {
      setNews(previous);
      setMessage(L.saveFailed);
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
        disabled={!loaded}
        onChange={(v) => void change(v)}
        testID="notify-signup-news"
      />
      {message ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert" testID="notify-signup-message">
          {message}
        </Text>
      ) : (
        <Muted variant="caption">{L.signupNote}</Muted>
      )}
      <SmButton kind="p" big wide icon="check" onPress={onDone} testID="notify-noted">
        {L.noted}
      </SmButton>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: "stretch", gap: space3 - 2, marginTop: space2 },
});
