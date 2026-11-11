// « Ce que tu recevras pour cet événement » (lot R8n2, maquette R8.11, vue « insc ») : le bloc de l'écran de fin d'une
// candidature. L'Essentiel (cadenas), « Nouveautés de l'événement » à la valeur déjà enregistrée, enregistrée au
// changement (envois sérialisés, dernier choix gardé), puis « C'est noté », qui attend la fin de l'écriture avant de
// fermer. Une lecture impossible n'est jamais présentée comme « activé » : erreur et « Réessayer ».
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { createSerialWriter, eventNotifyLabels as L, type SerialWriter } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { Muted } from "@/ui/Muted";
import { EssentialBlock, SwitchRow } from "./NotifyPrefsSheet";

const { space2, space3 } = tokens.spacing;

export function NotifySignup({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const { t } = useTheme();
  const [news, setNews] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const writer = useRef<SerialWriter<boolean> | null>(null);
  const alive = useRef(true);
  // Un échec d'écriture pas encore « vu » à l'appui : le premier appui le montre, le suivant ferme.
  const unseenFailure = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    setStatus("loading");
    api
      .eventNotificationPrefs(eventId)
      .then((prefs) => {
        if (!alive.current) return;
        writer.current = createSerialWriter<boolean>({
          initial: prefs.news,
          write: async (value) => (await api.setEventNotificationPrefs(eventId, value)).news,
          onSettled: (value) => alive.current && setNews(value),
          onError: (confirmed) => {
            unseenFailure.current = true;
            if (!alive.current) return;
            setNews(confirmed);
            setMessage(L.saveFailed);
          },
        });
        setNews(prefs.news);
        setStatus("ready");
      })
      .catch(() => alive.current && setStatus("error"));
  }, [eventId]);
  useEffect(load, [load]);

  async function noted() {
    if (busy) return;
    setBusy(true);
    await writer.current?.whenIdle();
    if (!alive.current) return;
    setBusy(false);
    // Un échec reste visible : un second appui ferme quand même (la candidature n'est jamais remise en cause).
    if (unseenFailure.current) {
      unseenFailure.current = false;
      return;
    }
    onDone();
  }

  return (
    <View style={styles.box} testID="notify-signup">
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header">
        {L.signupTitle}
      </Text>
      <EssentialBlock />
      {status === "error" ? (
        <View style={styles.box} testID="notify-signup-read-error">
          <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
            {L.readFailed}
          </Text>
          <SmButton kind="s" icon="undo" onPress={load} testID="notify-signup-retry">
            {L.retry}
          </SmButton>
        </View>
      ) : (
        <SwitchRow
          title={L.eventNewsTitle}
          help={L.eventNewsHelpOnSignup}
          on={news}
          disabled={status !== "ready"}
          onChange={(v) => {
            setNews(v);
            setMessage(null);
            writer.current?.set(v);
          }}
          testID="notify-signup-news"
        />
      )}
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
