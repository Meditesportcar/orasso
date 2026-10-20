// Presse, l'onglet des accréditations du média (lot 55, prototype DA v2 `s-accred`) : « À venir » et « Passées ». Un ticket
// par accréditation : accréditée (J-N, badge presse = le pass de l'événement, « Mon badge presse » ouvre le QR du jour J,
// « Consignes » donne les zones, horaires et contact de l'organisation), en attente (demande envoyée, retrait possible),
// refusée avec la raison donnée par l'organisation ; les passées gardent ce qui a été publié et vu. Statuts et libellés sont
// ceux du Tri côté organisateur (lot 52) : Accréditée, En attente, Refusée.
import { Button, Chip, EmptyState, OLoader, Text, tokens, useTheme } from "@orasso/design-system/native";
import { mediaAppLabels as L, type MediaAccreditationView, mediaFormatLabels, mediaLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Ticket } from "@/features/sorties/Ticket";
import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { formatShortDate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { daysUntil } from "./model";

const { space2 } = tokens.spacing;

type Segment = "upcoming" | "past";
const formatsOf = (a: MediaAccreditationView) => a.formats.map((f) => mediaFormatLabels[f].toLowerCase()).join(" et ");

export function AccreditationsScreen() {
  const router = useRouter();
  const { goTab } = usePersona();
  const [segment, setSegment] = useState<Segment>("upcoming");
  const [briefing, setBriefing] = useState<MediaAccreditationView | null>(null);
  const [withdrawing, setWithdrawing] = useState<MediaAccreditationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useApi(() => api.myAccreditations("all"), [], { cacheKey: "media-accreditations" });

  const now = new Date(nowMs());
  const all = list.data ?? [];
  // « À venir » : l'événement n'est pas fini ; une demande retirée ou annulée n'a plus de ticket.
  const ended = (a: MediaAccreditationView) => new Date(a.event.endsAt) <= now;
  const upcoming = all.filter((a) => !ended(a) && ["pending", "accepted", "refused"].includes(a.status));
  const past = all
    .filter((a) => ended(a) && ["accepted", "refused"].includes(a.status))
    .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));
  const shown = segment === "upcoming" ? upcoming : past;
  // Un seul bouton principal à l'écran : le badge de la prochaine accréditation.
  const firstBadge = upcoming.find((a) => a.status === "accepted" && a.pass)?.id ?? null;

  return (
    <TabScreen
      title={L.pressTitle}
      onRefresh={async () => void (await list.reload())}
      overlays={
        <>
          <BriefingSheet item={briefing} onClose={() => setBriefing(null)} />
          <WithdrawMediaSheet
            item={withdrawing}
            onClose={() => setWithdrawing(null)}
            onDone={() => {
              setWithdrawing(null);
              void list.reload();
            }}
            onError={setError}
          />
        </>
      }
    >
      <View style={styles.segments}>
        <Chip selected={segment === "upcoming"} onPress={() => setSegment("upcoming")}>
          {L.upcoming(upcoming.length)}
        </Chip>
        <Chip selected={segment === "past"} onPress={() => setSegment("past")}>
          {L.past(past.length)}
        </Chip>
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {list.error && !list.data ? <Notice tone="error">{list.error.message}</Notice> : null}
      {list.loading && !list.data ? <OLoader label="Chargement…" /> : null}
      {list.data && shown.length === 0 ? (
        <EmptyState
          title={segment === "upcoming" ? L.pressEmpty : L.pressPastEmpty}
          text={segment === "upcoming" ? L.pressEmptyText : L.pressPastEmptyText}
        />
      ) : null}
      {list.data && shown.length === 0 && segment === "upcoming" ? (
        <Button variant="secondary" icon="explore" fullWidth onPress={() => goTab("explorer")}>
          {L.pressSeeExplorer}
        </Button>
      ) : null}

      {shown.map((a) =>
        segment === "upcoming" ? (
          <UpcomingTicket
            key={a.id}
            a={a}
            now={now}
            primary={a.id === firstBadge}
            onBadge={() => router.push(`/jour-j/${a.id}`)}
            onBriefing={() => setBriefing(a)}
            onWithdraw={() => setWithdrawing(a)}
            onOpen={() => router.push(`/e/${a.event.slug}`)}
          />
        ) : (
          <PastTicket
            key={a.id}
            a={a}
            onOpen={() => router.push(`/e/${a.event.slug}`)}
            onAdd={() => goTab("contenus")}
          />
        ),
      )}
    </TabScreen>
  );
}

function UpcomingTicket({
  a,
  now,
  primary,
  onBadge,
  onBriefing,
  onWithdraw,
  onOpen,
}: {
  a: MediaAccreditationView;
  now: Date;
  primary: boolean;
  onBadge: () => void;
  onBriefing: () => void;
  onWithdraw: () => void;
  onOpen: () => void;
}) {
  const accredited = a.status === "accepted";
  const refused = a.status === "refused";
  const detail = accredited
    ? a.briefing?.zones
      ? L.badgeZones(a.briefing.zones)
      : L.badgeOf
    : refused
      ? (a.refusalNote ?? L.refusedDefault)
      : L.requestedOn(formatShortDate(a.createdAt), formatsOf(a));
  return (
    <Ticket
      testID={`media-ticket-${a.status}`}
      date={a.event.startsAt}
      badge={
        <Chip surface="plate" selected={accredited}>
          {accredited ? mediaLabels.accredited : refused ? mediaLabels.refused : mediaLabels.pending}
        </Chip>
      }
      lead={accredited ? L.daysLeft(daysUntil(a.event.startsAt, now)) : undefined}
      title={a.event.title}
      detail={detail}
      notes={accredited && !a.pass ? [L.badgeNotYet] : undefined}
      onPressTitle={onOpen}
      dim={refused}
    >
      {accredited ? (
        <View style={styles.actions}>
          {a.pass ? (
            <Button
              variant={primary ? "primary" : "secondary"}
              icon="qr"
              onPress={onBadge}
              style={styles.grow}
              testID="media-badge"
            >
              {mediaLabels.pressBadge}
            </Button>
          ) : null}
          <Button variant="plate" icon="press" onPress={onBriefing} style={styles.grow} testID="media-briefing">
            {mediaLabels.instructions}
          </Button>
        </View>
      ) : null}
      {a.canWithdraw && a.status !== "refused" ? (
        <Button variant="plate" tone="dashed" icon="close" onPress={onWithdraw} testID="media-withdraw">
          {a.status === "pending" ? L.withdraw : "Me désister"}
        </Button>
      ) : null}
    </Ticket>
  );
}

function PastTicket({ a, onOpen, onAdd }: { a: MediaAccreditationView; onOpen: () => void; onAdd: () => void }) {
  const refused = a.status === "refused";
  return (
    <Ticket
      testID="media-ticket-past"
      date={a.event.startsAt}
      badge={
        <Chip surface="plate">
          {refused ? mediaLabels.refused : a.coverage.contents > 0 ? L.covered(a.coverage.contents) : L.notCovered}
        </Chip>
      }
      title={a.event.title}
      detail={
        refused
          ? (a.refusalNote ?? L.refusedDefault)
          : a.coverage.contents > 0
            ? L.coveredViews(a.coverage.views)
            : undefined
      }
      onPressTitle={onOpen}
      dim
    >
      {!refused && a.coverage.contents === 0 ? (
        <Button variant="plate" icon="add" onPress={onAdd}>
          {L.addContentFor}
        </Button>
      ) : null}
    </Ticket>
  );
}

/** « Consignes » : zones, consignes écrites et contact de l'organisation (`event_press_settings`), visibles une fois accrédité. */
function BriefingSheet({ item, onClose }: { item: MediaAccreditationView | null; onClose: () => void }) {
  const { t } = useTheme();
  const b = item?.briefing ?? null;
  const empty = !b || (!b.zones && !b.instructions && !b.contact);
  return (
    <AppSheet visible={item !== null} onClose={onClose} accessibilityLabel={L.briefingTitle}>
      <Text variant="title" color={t.color.ink}>
        {L.briefingTitle}
      </Text>
      {item ? <Muted variant="body">{item.event.title}</Muted> : null}
      {empty ? <Muted variant="body">{L.briefingNone}</Muted> : null}
      {b?.zones ? <Block label={L.briefingZones} text={b.zones} /> : null}
      {b?.instructions ? <Block label={L.briefingInstructions} text={b.instructions} /> : null}
      {b?.contact ? <Block label={L.briefingContact} text={b.contact} /> : null}
    </AppSheet>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.block}>
      <Muted variant="label">{label}</Muted>
      <Text variant="body" color={t.color.ink}>
        {text}
      </Text>
    </View>
  );
}

/** Retirer la demande (ou renoncer à l'accréditation) : l'organisation est prévenue ; pas de malus pour la presse. */
function WithdrawMediaSheet({
  item,
  onClose,
  onDone,
  onError,
}: {
  item: MediaAccreditationView | null;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <AppSheet visible={item !== null} onClose={onClose} accessibilityLabel={L.withdrawConfirm}>
      <Text variant="title" color={t.color.ink}>
        {L.withdrawConfirm}
      </Text>
      {item ? <Muted variant="body">{item.event.title}</Muted> : null}
      <Muted variant="body">{L.withdrawText}</Muted>
      <Button
        variant="alert"
        icon="close"
        loading={busy}
        fullWidth
        testID="media-withdraw-confirm"
        onPress={async () => {
          if (!item) return;
          setBusy(true);
          try {
            await api.withdraw(item.id);
            onDone();
          } catch (e) {
            onError(errorMessage(e));
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        {L.withdrawYes}
      </Button>
      <Button variant="plate" icon="undo" fullWidth onPress={onClose}>
        {L.withdrawNo}
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: "row", gap: space2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  grow: { flexGrow: 1 },
  block: { gap: 4 },
});
