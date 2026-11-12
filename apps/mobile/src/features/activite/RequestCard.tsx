// Carte d'une demande de l'Activité (prototype « Demandes ») : photo, titre, détail, Accepter / Refuser sur la plaque.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { messagingLabels } from "@orasso/shared";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { errorMessage } from "@/lib/http";
import { Avatar } from "@/ui/Avatar";

const { space2, space3 } = tokens.spacing;

export function RequestCard({
  avatarUrl,
  pseudo,
  title,
  detail,
  message,
  onOpenProfile,
  onAccept,
  onDecline,
  acceptLabel = messagingLabels.accept,
  declineLabel = messagingLabels.decline,
  children,
  testID,
}: {
  avatarUrl: string | null;
  pseudo: string;
  title: string;
  detail?: string | null;
  message?: string | null;
  onOpenProfile?: () => void;
  onAccept: () => Promise<unknown>;
  onDecline: () => Promise<unknown>;
  /** Lot R7c2 : « Confirmer » / « Pas moi » d'un transfert de plaque. */
  acceptLabel?: string;
  declineLabel?: string;
  /** Lot R7m1 : un bloc entre le texte et les boutons (la voiture concernée d'un partenariat). */
  children?: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (which: "accept" | "decline", action: () => Promise<unknown>) => {
    setBusy(which);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Plate style={styles.card} testID={testID}>
      <Pressable
        style={styles.head}
        onPress={onOpenProfile}
        accessibilityRole={onOpenProfile ? "link" : undefined}
        accessibilityLabel={pseudo}
      >
        <Avatar url={avatarUrl} pseudo={pseudo} size={40} />
        <View style={styles.text}>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {title}
          </Text>
          {detail ? (
            <Text variant="caption" color={t.color.plateMuted}>
              {detail}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {message ? (
        <Text variant="body" color={t.color.plateInk}>
          {message}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          variant="plate"
          icon="check"
          style={styles.half}
          loading={busy === "accept"}
          disabled={busy !== null}
          onPress={() => void run("accept", onAccept)}
        >
          {acceptLabel}
        </Button>
        <Button
          variant="plate"
          tone="dashed"
          icon="close"
          style={styles.half}
          loading={busy === "decline"}
          disabled={busy !== null}
          onPress={() => void run("decline", onDecline)}
        >
          {declineLabel}
        </Button>
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  card: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  text: { flex: 1, gap: 2 },
  // Accepter et Refuser se partagent la ligne (maquette) ; à police agrandie les libellés passent sur deux lignes, sans déborder.
  row: { flexDirection: "row", gap: space2 },
  half: { flex: 1, minWidth: 0, alignSelf: "stretch" },
});
