// Mes billets (lot 34, parité D20 ; docs/02 : les billets vivent dans « Accès », à côté des candidatures) : le QR de
// chaque billet à présenter à l'entrée, rendre un billet gratuit. Mêmes règles et mêmes phrases que `/app/billets`.
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { ticketAppLabels as L, type MyTicket } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { formatPrice } from "@/features/tickets/TicketsBlock";
import { api } from "@/lib/api";
import { formatDay, formatHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { QrCode } from "@/ui/QrCode";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

function Ticket({ ticket, onGiveBack }: { ticket: MyTicket; onGiveBack: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const used = ticket.status === "used";
  const e = ticket.event;
  return (
    <Plate style={styles.ticket} testID="ticket" accessibilityLabel={`${ticket.name}, ${e.title}`}>
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text variant="label" color={t.color.plateMuted}>
            {ticket.name}
          </Text>
          <Text
            variant="title"
            color={t.color.plateInk}
            onPress={() => router.push(`/e/${e.slug}`)}
            accessibilityRole="link"
          >
            {e.title}
          </Text>
          <Text variant="meta" color={t.color.plateMuted}>
            {`${formatDay(e.startsAt)} · ${formatHour(e.startsAt)} – ${formatHour(e.endsAt)}${e.city ? ` · ${e.city}` : ""}`}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {e.structureName}
          </Text>
        </View>
        <Chip surface="plate" variant={used ? undefined : "accent"}>
          {used ? L.used : L.valid}
        </Chip>
      </View>
      <View style={styles.qr} testID="ticket-qr">
        <QrCode value={ticket.payload} size={232} label={L.qrLabel(e.title)} />
      </View>
      <Text variant="caption" color={t.color.plateMuted} style={styles.center}>
        {used ? L.entryRecorded : L.showAtEntry}
        {ticket.priceCents != null
          ? ` ${formatPrice(ticket.priceCents)}${ticket.testMode ? ` · ${L.demoPayment}` : ""}.`
          : ` ${L.freeTicket}`}
      </Text>
      {!used && ticket.priceCents == null ? (
        <Button variant="plate" icon="undo" onPress={onGiveBack} fullWidth testID="ticket-give-back">
          {L.giveBack}
        </Button>
      ) : null}
    </Plate>
  );
}

export default function Billets() {
  const router = useRouter();
  const { reserve } = useLocalSearchParams<{ reserve?: string }>();
  const tickets = useApi(() => api.myTickets(), []);
  const [giving, setGiving] = useState<MyTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(reserve === "ok" ? L.reserved : null);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));
  const list = tickets.data ?? [];

  async function giveBack() {
    if (!giving) return;
    setBusy(true);
    setError(null);
    try {
      await api.returnTicket(giving.id);
      setGiving(null);
      setNotice(L.givenBack);
      await tickets.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen title={L.title} onClose={close} onRefresh={tickets.reload}>
      {notice ? <Notice>{notice}</Notice> : null}
      {tickets.error ? <Notice tone="error">{tickets.error.message}</Notice> : null}
      {tickets.data && list.length === 0 ? (
        <Muted variant="body" testID="no-tickets">
          {L.none}
        </Muted>
      ) : null}
      {list.map((ticket) => (
        <Ticket key={ticket.id} ticket={ticket} onGiveBack={() => setGiving(ticket)} />
      ))}
      <ConfirmSheet
        visible={giving !== null}
        title={L.giveBackTitle}
        body={L.giveBackBody}
        confirmLabel={L.giveBack}
        confirmIcon="undo"
        busy={busy}
        error={error}
        onConfirm={() => void giveBack()}
        onClose={() => setGiving(null)}
      />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  ticket: { gap: space2, padding: space3 },
  head: { flexDirection: "row", gap: space3, alignItems: "flex-start" },
  grow: { flex: 1, gap: space1 },
  qr: { alignItems: "center", paddingVertical: space2 },
  center: { textAlign: "center" },
});
