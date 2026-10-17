// QR de compte en grand (docs/02) : dynamique, il se redessine toutes les 60 s et fonctionne hors ligne, avec le secret
// reçu à la connexion (gardé dans le trousseau sécurisé). Un pro le scanne pour une remise ; une capture prêtée expire
// en une à deux minutes.

import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { ACCOUNT_QR_STEP_SECONDS, type AccountQrSecret, gradeLabels } from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { accountQrAt, secondsLeft } from "@/lib/accountQr";
import { loadAccountQrSecret, saveAccountQrSecret } from "@/lib/accountQrStore";
import { api } from "@/lib/api";
import { now as clockNow } from "@/lib/clock";
import { useSession } from "@/lib/session";
import { AppSheet } from "@/ui/AppSheet";
import { QrCode } from "@/ui/QrCode";

const { space2, space3 } = tokens.spacing;

export function AccountQrSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const { me } = useSession();
  const { width } = useWindowDimensions();
  const [secret, setSecret] = useState<AccountQrSecret | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => clockNow());

  // Le secret vient du trousseau ; s'il manque (premier lancement après une mise à jour), on le redemande à l'API.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const stored = await loadAccountQrSecret();
      if (stored) {
        if (!cancelled) {
          setSecret(stored);
          setMissing(false);
        }
        return;
      }
      try {
        const fresh = await api.accountQrSecret();
        await saveAccountQrSecret(fresh);
        if (!cancelled) {
          setSecret(fresh);
          setMissing(false);
        }
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Le code change toutes les 60 s : on regarde l'heure chaque seconde (aucun réseau).
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(clockNow()), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  const left = secondsLeft(now);
  const size = Math.min(width - 2 * space3 - 32, 300);
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Mon QR de compte">
      <Text variant="title" color={t.color.ink}>
        Mon QR de compte
      </Text>
      {secret ? (
        <View style={styles.center}>
          <QrCode value={accountQrAt(secret, now)} size={size} label="QR de compte Orasso" />
          <View style={[styles.bar, { backgroundColor: t.color.line }]}>
            <View
              style={{
                width: `${(left / ACCOUNT_QR_STEP_SECONDS) * 100}%`,
                height: "100%",
                backgroundColor: t.color.accent,
              }}
            />
          </View>
          <Text variant="meta" color={t.color.inkMuted}>
            Se redessine dans {left} s · fonctionne sans réseau
          </Text>
          <Text variant="bodyStrong" color={t.color.ink}>
            {me?.profile.pseudo} · {me ? gradeLabels[me.profile.grade] : ""}
          </Text>
        </View>
      ) : (
        <Text variant="body" color={t.color.inkMuted}>
          {missing
            ? "Ton QR de compte se prépare avec du réseau, une première fois. Reconnecte-toi à Internet puis rouvre-le."
            : "Chargement…"}
        </Text>
      )}
      <Button variant="plate" icon="close" onPress={onClose} fullWidth>
        Fermer
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: space2 },
  bar: { width: "100%", height: 4, borderRadius: 2, overflow: "hidden" },
});
