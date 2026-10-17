// Billets du public sur la page d'un événement (lot 34, parité D20) : réserver des billets gratuits, retrouver les siens.
// Un billet payant ne s'achète pas dans l'appli (règles de paiement des stores, « À revoir avec Damien ») : la page du
// site s'ouvre dans le navigateur. Rien n'apparaît pour un événement sans billetterie Orasso.
import { Button, Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { ticketAppLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet } from "react-native";

import { siteUrl } from "@/api";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

export function TicketsBlock({ slug, eventId }: { slug: string; eventId: string }) {
  const { t } = useTheme();
  const router = useRouter();
  const { status } = useSession();
  const data = useApi(() => api.ticketOffer(slug), [slug, status], { enabled: status !== "loading" });
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offer = data.data?.offer;
  if (!offer) return null;
  const mine = data.data?.mine ?? [];
  const max = Math.max(1, Math.min(offer.maxPerOrder, offer.remaining ?? offer.maxPerOrder));
  const paid = offer.kind === "paid";

  async function reserve() {
    setBusy(true);
    setError(null);
    try {
      await api.reserveTickets(eventId, Math.min(quantity, max));
      router.push({ pathname: "/billets", params: { reserve: "ok" } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Plate style={styles.block} testID="ticket-block">
      <Text variant="label" color={t.color.plateMuted}>
        {L.blockTitle}
      </Text>
      <Text variant="bodyStrong" color={t.color.plateInk}>
        {offer.name} · {offer.priceCents != null ? formatPrice(offer.priceCents) : L.free}
      </Text>
      {offer.remaining != null ? (
        <Text variant="meta" color={t.color.plateMuted}>
          {L.remaining(offer.remaining)}
        </Text>
      ) : null}
      {mine.length > 0 ? (
        <>
          <Text variant="body" color={t.color.plateInk} testID="my-tickets-note">
            {L.mine(mine.length)}
          </Text>
          <Button variant="plate" icon="qr" onPress={() => router.push("/billets")} fullWidth>
            {L.seeMine}
          </Button>
        </>
      ) : null}
      {offer.block ? (
        <Text variant="body" color={t.color.plateMuted} testID="ticket-blocked">
          {offer.blockLabel}.
        </Text>
      ) : status !== "in" ? (
        <Button
          variant="plate"
          icon="entry"
          onPress={() => router.push({ pathname: "/auth", params: { next: `/e/${slug}` } })}
          fullWidth
        >
          {L.signIn}
        </Button>
      ) : paid ? (
        <>
          <Text variant="body" color={t.color.plateMuted}>
            {L.paidOnSite}
          </Text>
          <Button variant="plate" icon="next" onPress={() => void Linking.openURL(siteUrl(`/e/${slug}`))} fullWidth>
            {L.openSite}
          </Button>
        </>
      ) : (
        <>
          <Text variant="label" color={t.color.plateMuted}>
            {L.quantity}
          </Text>
          <ChipRow>
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <Chip
                key={n}
                surface="plate"
                selected={quantity === n}
                onPress={() => setQuantity(n)}
                accessibilityLabel={`${n} billet${n > 1 ? "s" : ""}`}
              >
                {String(n)}
              </Chip>
            ))}
          </ChipRow>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="secondary"
            icon="calendar"
            loading={busy}
            disabled={busy}
            onPress={() => void reserve()}
            fullWidth
            testID="ticket-reserve"
          >
            {L.reserve}
          </Button>
        </>
      )}
    </Plate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3, marginTop: space1 },
});
