// Compte suspendu et mes sanctions (lot 32, § 15.2) : « Compte suspendu jusqu'au <date> · motif », lecture seule, et la
// contestation (une seule fois par sanction, docs/01). Ouvert depuis Moi, et une fois au lancement si le compte est
// suspendu. Jamais qui a signalé.
import { Button, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  contestStateLabels,
  MODERATION,
  type MySanction,
  moderationLabels,
  reportReasonLabels,
  sanctionKindLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

function ContestForm({ sanction, onDone }: { sanction: MySanction; onDone: () => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.block} testID="contest-form">
      <Muted variant="caption">{moderationLabels.contestHint}</Muted>
      <TextField
        label={moderationLabels.contestMessage}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={MODERATION.contestMax}
        style={{ minHeight: 96 }}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="primary"
        icon="next"
        loading={busy}
        disabled={message.trim().length === 0}
        fullWidth
        testID="contest-send"
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.contestSanction(sanction.id, message.trim());
            setMessage("");
            onDone();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {moderationLabels.contestSend}
      </Button>
    </View>
  );
}

export default function SuspendedScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const sanctions = useApi(() => api.mySanctions(), []);
  const [sent, setSent] = useState(false);
  const suspension = me?.suspension ?? null;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/moi"));
  const reload = async () => {
    await Promise.all([sanctions.reload(), refreshMe()]);
  };

  return (
    <FlowScreen
      title={suspension ? moderationLabels.suspendedTitle : moderationLabels.mySanctions}
      onClose={close}
      onRefresh={reload}
    >
      {suspension ? (
        <Plate style={styles.block} testID="suspended-card">
          <Text variant="posterS" color={t.color.plateInk}>
            {moderationLabels.suspendedUntil(formatDayHour(suspension.until))}
          </Text>
          <Text variant="body" color={t.color.plateInk}>
            {moderationLabels.suspendedReason(reportReasonLabels[suspension.reason])}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {moderationLabels.suspendedReadOnly}
          </Text>
        </Plate>
      ) : null}
      {sent ? <Notice>{moderationLabels.contestSent}</Notice> : null}
      {sanctions.error ? <Notice tone="error">{sanctions.error.message}</Notice> : null}
      {sanctions.data && sanctions.data.length === 0 ? (
        <Muted variant="body">{moderationLabels.mySanctionsEmpty}</Muted>
      ) : null}
      {sanctions.data?.map((s) => (
        <Plate key={s.id} style={styles.block} testID="my-sanction">
          <View style={styles.head}>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {sanctionKindLabels[s.kind]}
            </Text>
            {s.active ? (
              <Chip surface="plate" variant="accent">
                En cours
              </Chip>
            ) : null}
          </View>
          <Text variant="body" color={t.color.plateInk}>
            {moderationLabels.suspendedReason(reportReasonLabels[s.reason])} ·{" "}
            {moderationLabels.sanctionFrom(formatDayHour(s.startsAt))}
            {s.endsAt && s.kind !== "warning" ? ` ${moderationLabels.sanctionUntil(formatDayHour(s.endsAt))}` : ""}
          </Text>
          {s.note ? (
            <Text variant="caption" color={t.color.plateMuted}>
              {s.note}
            </Text>
          ) : null}
          {s.liftedAt ? (
            <Text variant="caption" color={t.color.plateMuted}>
              {moderationLabels.sanctionLifted(formatDayHour(s.liftedAt))}
            </Text>
          ) : null}
          {s.contestStatus !== "none" ? (
            <Text variant="caption" color={t.color.plateMuted}>
              {contestStateLabels[s.contestStatus]}
            </Text>
          ) : null}
          {s.canContest ? (
            <ContestForm
              sanction={s}
              onDone={() => {
                setSent(true);
                void reload();
              }}
            />
          ) : null}
        </Plate>
      ))}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
});
