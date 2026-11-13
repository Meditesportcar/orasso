// « Nouveau message » (lot R9d, T30) : une feuille à deux lignes. « Message groupé » (les inscrits, les retenus, la liste d'attente :
// `GroupMessageSheet`, modèles compris) et « Discussion de staff » (la permanente ou celle d'un événement). Écrire à une seule
// personne se fait depuis sa candidature ou sa conversation, comme avant.
import { Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { communicationLabels, structureActivityLabels as L, type StaffConversationState } from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";

const { space2, space3 } = tokens.spacing;

export function NewMessageSheet({
  visible,
  onClose,
  staffChats,
  staffLoading,
  onGrouped,
  onStaff,
}: {
  visible: boolean;
  onClose: () => void;
  /** Les discussions de staff ouvertes : la permanente d'abord, puis celles des événements. */
  staffChats: readonly StaffConversationState[];
  staffLoading: boolean;
  onGrouped: () => void;
  onStaff: (conversationId: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [choosing, setChoosing] = useState(false);
  const close = () => {
    setChoosing(false);
    onClose();
  };
  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel={L.newMessage}>
      <Text variant="title" color={c.ink}>
        {L.newMessage}
      </Text>
      <Pressable
        onPress={() => {
          setChoosing(false);
          onGrouped();
        }}
        accessibilityRole="button"
        testID="new-message-group"
      >
        <Plate style={styles.row}>
          <Icon name="bubble" size={24} color={c.plateInk} />
          <Text variant="bodyStrong" color={c.plateInk} style={styles.grow}>
            {L.groupedMessage}
          </Text>
          <Icon name="next" size={20} color={c.plateInk} />
        </Plate>
      </Pressable>
      <Pressable
        onPress={() => setChoosing((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: choosing }}
        testID="new-message-staff"
      >
        <Plate style={styles.row}>
          <Icon name="staff" size={24} color={c.plateInk} />
          <Text variant="bodyStrong" color={c.plateInk} style={styles.grow}>
            {L.staffDiscussion}
          </Text>
          <Icon name={choosing ? "up" : "down"} size={20} color={c.plateInk} />
        </Plate>
      </Pressable>
      {choosing ? (
        <View style={styles.list}>
          {staffChats.length === 0 ? (
            <Muted variant="body">{staffLoading ? "Chargement…" : communicationLabels.staffEmpty}</Muted>
          ) : (
            staffChats.map((chat) => (
              <Pressable
                key={chat.conversationId}
                onPress={() => {
                  setChoosing(false);
                  onStaff(chat.conversationId);
                }}
                accessibilityRole="link"
                accessibilityLabel={chat.title}
                testID="new-message-staff-chat"
              >
                <Plate style={styles.row}>
                  <Text variant="body" color={c.plateInk} style={styles.grow}>
                    {chat.title}
                  </Text>
                  <Icon name="next" size={20} color={c.plateInk} />
                </Plate>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  grow: { flex: 1 },
  list: { gap: space2 },
});
