// Moi > Sécurité : mes clés d'accès (lot 35c, D20) : liste, renommage, suppression (routes `passkey` de Better Auth).
// La création d'une clé demande WebAuthn dans l'appareil (module natif, hors périmètre de la V1 de l'appli) : elle reste
// sur le site, dans le navigateur du téléphone. Supprimer une clé demande une session qui prouve la double
// authentification : sinon l'API répond 403 et le message explique quoi faire.
import { Button, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { accountAppLabels as L } from "@orasso/shared";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { PASSKEY_NAME_MAX, passkeyErrorMessage, passkeyKind, passkeyNameIssue, passkeyTitle } from "@/lib/accountTools";
import { api } from "@/lib/api";
import type { PasskeyRow } from "@/lib/api/security";
import { formatDay } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Feedback } from "@/ui/Feedback";

const { space1, space2, space3 } = tokens.spacing;

export function PasskeysSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const list = useApi(() => api.passkeys(), [visible], { enabled: visible });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ key: PasskeyRow; name: string } | null>(null);
  const [removing, setRemoving] = useState<PasskeyRow | null>(null);

  async function act(key: string, work: () => Promise<unknown>, done: string, fallback?: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await work();
      await list.reload();
      setNotice(done);
      return true;
    } catch (e) {
      setError(passkeyErrorMessage(e, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function rename() {
    if (!renaming) return;
    const issue = passkeyNameIssue(renaming.name);
    if (issue) return setError(issue);
    const ok = await act("rename", () => api.renamePasskey(renaming.key.id, renaming.name.trim()), L.passkeyRenamed);
    if (ok) setRenaming(null);
  }

  async function remove() {
    if (!removing) return;
    const ok = await act("delete", () => api.deletePasskey(removing.id), L.passkeyDeleted);
    if (ok) setRemoving(null);
  }

  const keys = list.data ?? [];
  return (
    <>
      <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.passkeysTitle}>
        <Text variant="title" color={t.color.ink}>
          {L.passkeysTitle}
        </Text>
        <Text variant="body" color={t.color.ink}>
          {L.passkeysHelp}
        </Text>
        {list.loading && !list.data ? (
          <Text variant="body" color={t.color.inkMuted}>
            Chargement…
          </Text>
        ) : keys.length > 0 ? (
          keys.map((key) => (
            <Plate key={key.id} style={styles.item} testID="passkey-row">
              <Text variant="bodyStrong" color={t.color.plateInk} testID="passkey-name">
                {passkeyTitle(key)}
              </Text>
              <View style={styles.chips}>
                <Chip surface="plate">{passkeyKind(key.deviceType)}</Chip>
              </View>
              <Text variant="meta" color={t.color.plateMuted}>
                {L.created(formatDay(key.createdAt))}
              </Text>
              <View style={styles.actions}>
                <Button
                  variant="plate"
                  icon="chat"
                  disabled={busy !== null}
                  onPress={() => {
                    setError(null);
                    setNotice(null);
                    setRenaming({ key, name: key.name ?? "" });
                  }}
                  fullWidth
                  testID="passkey-rename"
                >
                  {L.passkeyRename}
                </Button>
                <Button
                  variant="plate"
                  tone="dashed"
                  icon="close"
                  disabled={busy !== null}
                  onPress={() => {
                    setError(null);
                    setNotice(null);
                    setRemoving(key);
                  }}
                  fullWidth
                  testID="passkey-delete"
                >
                  {L.passkeyDelete}
                </Button>
              </View>
            </Plate>
          ))
        ) : (
          <Text variant="body" color={t.color.inkMuted}>
            {list.error ? "Impossible de charger les clés hors ligne." : L.passkeysEmpty}
          </Text>
        )}
        <Feedback
          error={renaming || removing ? null : error}
          notice={notice}
          onPlate={false}
          testID="passkeys-notice"
        />
        <Button
          variant="plate"
          icon="export"
          onPress={() => void Linking.openURL(siteUrl("/app/securite")).catch(() => undefined)}
          fullWidth
        >
          {L.passkeysAdd}
        </Button>
        <Button variant="plate" icon="back" onPress={onClose} fullWidth>
          Fermer
        </Button>
      </AppSheet>

      <AppSheet visible={renaming !== null} onClose={() => setRenaming(null)} accessibilityLabel={L.passkeyRename}>
        <Text variant="title" color={t.color.ink}>
          {L.passkeyRename}
        </Text>
        <TextField
          label={L.passkeyRenameField}
          value={renaming?.name ?? ""}
          onChangeText={(name) => setRenaming((r) => (r ? { ...r, name } : r))}
          maxLength={PASSKEY_NAME_MAX}
          autoFocus
          testID="passkey-name-field"
        />
        <Feedback error={error} onPlate={false} />
        <Button
          variant="secondary"
          icon="check"
          loading={busy === "rename"}
          onPress={() => void rename()}
          fullWidth
          testID="passkey-rename-save"
        >
          {L.passkeyRenameSave}
        </Button>
        <Button variant="plate" icon="close" onPress={() => setRenaming(null)} fullWidth>
          Annuler
        </Button>
      </AppSheet>

      <ConfirmSheet
        visible={removing !== null}
        title={L.passkeyDeleteTitle}
        body={removing ? `« ${passkeyTitle(removing)} » : ${L.passkeyDeleteBody}` : L.passkeyDeleteBody}
        confirmLabel={L.passkeyDelete}
        confirmIcon="close"
        danger
        busy={busy === "delete"}
        error={removing ? error : null}
        onConfirm={() => void remove()}
        onClose={() => {
          setRemoving(null);
          setError(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  item: { gap: space1, padding: space3 },
  chips: { flexDirection: "row" },
  actions: { gap: space2, paddingTop: space1 },
});
