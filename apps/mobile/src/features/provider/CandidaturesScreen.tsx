// Casquette Prestataire, Candidatures (DA v2, lot 54, prototype `s-pcand`) : mes candidatures comme des tickets. Deux
// segments « À venir » et « Passées ». Retenue : « J-6 », emplacement, arrivée, électricité, « Mon accès » (le jour J) et
// « Consignes » ; en attente : envoyée le… réponse avant le… ; liste d'attente avec le délai pour accepter ; les passées
// gardent l'avis de l'organisateur. Le retrait se fait depuis le ticket. Les prestataires ne comptent jamais dans les
// places. Cohérent avec le Tri de l'organisateur (lot 52) : statut, emplacement et « Sans mission précise ».
import { Button, Chip, EmptyState, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ProviderApplicationView, proV2Labels, providerWaitlistNote } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { AngledTag, SegBlock } from "@/features/pro/kit";
import { Ticket } from "@/features/sorties/Ticket";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { candidatureKind, countdown, needLabel, reviewTag, upcomingDetail } from "@/lib/proPresta";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AppSheet } from "@/ui/AppSheet";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { StatusTag } from "@/ui/StatusTag";

const { space2, space3 } = tokens.spacing;

type Segment = "upcoming" | "past";

/** Les retenues d'abord, puis l'attente, la liste d'attente et le reste ; à rang égal, la plus proche. */
const ORDER = ["retained", "pending", "waitlist", "refused", "withdrawn", "other"] as const;
const byStatusThenDate = (a: ProviderApplicationView, b: ProviderApplicationView) =>
  ORDER.indexOf(candidatureKind(a)) - ORDER.indexOf(candidatureKind(b)) ||
  Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt);

export function CandidaturesScreen() {
  const { t } = useTheme();
  const router = useRouter();
  // « Voir ma candidature » (Missions, fiche événement) : le ticket demandé passe en tête.
  const { open } = useLocalSearchParams<{ open?: string }>();
  const now = useNow();
  const { refreshMe } = useSession();
  const profile = useApi(async () => (await api.providerProfile()).profile, [], { cacheKey: "provider-profile" });
  const upcoming = useApi(() => api.providerApplications("upcoming"), [], { cacheKey: "provider-applications" });
  const past = useApi(() => api.providerApplications("past"), [], { cacheKey: "provider-applications-past" });
  const [segment, setSegment] = useState<Segment>("upcoming");
  const [withdrawing, setWithdrawing] = useState<ProviderApplicationView | null>(null);
  const [instructions, setInstructions] = useState<ProviderApplicationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Une candidature retirée (ou expirée, annulée) n'est plus un ticket à venir.
  const next = (upcoming.data ?? [])
    .filter((a) => candidatureKind(a) !== "withdrawn")
    .sort((a, b) => Number(b.id === open) - Number(a.id === open) || byStatusThenDate(a, b));
  const done = [...(past.data ?? [])].sort((a, b) => Date.parse(b.event.startsAt) - Date.parse(a.event.startsAt));
  const firstRetained = next.find((a) => a.status === "accepted")?.id;

  // Une panne n'est pas « aucune candidature » : le message et « Réessayer » ; les données en cache restent affichées.
  const failed =
    (upcoming.error && !upcoming.data ? upcoming.error : null) ?? (past.error && !past.data ? past.error : null);

  async function reloadAll() {
    await Promise.all([upcoming.reload(), past.reload(), profile.reload()]);
    void refreshMe();
  }

  async function withdraw() {
    if (!withdrawing) return;
    setBusy(true);
    setError(null);
    try {
      await api.withdraw(withdrawing.id);
      setWithdrawing(null);
      await reloadAll();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function badgeOf(app: ProviderApplicationView) {
    switch (candidatureKind(app)) {
      case "retained":
        return <StatusTag status={app.checkedInAt ? "onsite" : "retained"} />;
      case "pending":
        return <StatusTag status="pending" />;
      case "waitlist":
        return <AngledTag tone="wait">{proV2Labels.waitlistRank(app.waitlistRank)}</AngledTag>;
      case "refused":
        return <StatusTag status="refused" />;
      default:
        return <StatusTag status="cancelled" />;
    }
  }

  return (
    <TabScreen
      title={proV2Labels.candTitle}
      facts={profile.data?.name}
      onRefresh={reloadAll}
      overlays={
        <>
          <ConfirmSheet
            visible={withdrawing !== null}
            title={proV2Labels.withdrawTitle}
            body={proV2Labels.withdrawBody(withdrawing?.event.title ?? "")}
            confirmLabel={proV2Labels.withdraw}
            confirmIcon="undo"
            busy={busy}
            error={error}
            onConfirm={() => void withdraw()}
            onClose={() => {
              setWithdrawing(null);
              setError(null);
            }}
          />
          <AppSheet
            visible={instructions !== null}
            onClose={() => setInstructions(null)}
            accessibilityLabel="Consignes"
          >
            <Text variant="title" color={t.color.ink}>
              {`Consignes · ${instructions?.event.title ?? ""}`}
            </Text>
            <Text variant="body" color={t.color.ink} testID="candidature-instructions">
              {instructions?.instructions || proV2Labels.noInstructions}
            </Text>
            <Button variant="plate" icon="close" onPress={() => setInstructions(null)} fullWidth>
              Fermer
            </Button>
          </AppSheet>
        </>
      }
    >
      {profile.data?.issue ? <Notice>Complète ta vitrine pour candidater : {profile.data.issue}</Notice> : null}
      {error && withdrawing === null ? <Notice tone="error">{error}</Notice> : null}
      <SegBlock
        testID="candidatures-segments"
        value={segment}
        onChange={setSegment}
        items={[
          { id: "upcoming", label: proV2Labels.candUpcoming(next.length) },
          { id: "past", label: proV2Labels.candPast(done.length) },
        ]}
      />

      {failed ? <LoadError message={failed.message} onRetry={() => void reloadAll()} /> : null}

      {failed ? null : segment === "upcoming" ? (
        <View style={styles.stack} testID="candidatures-upcoming">
          {next.length === 0 ? (
            upcoming.loading ? (
              <Muted variant="body">Chargement…</Muted>
            ) : (
              <EmptyState title="Aucune candidature" text={proV2Labels.upcomingNone} />
            )
          ) : (
            next.map((app) => {
              const kind = candidatureKind(app);
              const retained = kind === "retained";
              const notes: string[] = [needLabel(app)];
              if (kind === "waitlist") notes.unshift(providerWaitlistNote);
              if (app.spot?.note) notes.push(app.spot.note);
              return (
                <Ticket
                  key={app.id}
                  testID="provider-application"
                  date={app.event.startsAt}
                  badge={badgeOf(app)}
                  lead={retained ? countdown(app, now) : undefined}
                  title={app.event.title}
                  detail={upcomingDetail(app) ?? undefined}
                  notes={notes}
                  onPressTitle={() => router.push(`/e/${app.event.slug}`)}
                >
                  {app.accreditedMedia ? <Chip surface="plate">{proV2Labels.mediaOfficial}</Chip> : null}
                  {retained ? (
                    <View style={styles.row}>
                      <Button
                        variant={app.id === firstRetained ? "primary" : "plate"}
                        icon="qr"
                        onPress={() => router.push(`/stand/${app.id}`)}
                        testID="candidature-access"
                      >
                        {"Mon accès"}
                      </Button>
                      <Button
                        variant="plate"
                        icon="list"
                        onPress={() => setInstructions(app)}
                        testID="candidature-instructions-open"
                      >
                        {"Consignes"}
                      </Button>
                    </View>
                  ) : null}
                  {app.canWithdraw ? (
                    <Button
                      variant="plate"
                      tone="dashed"
                      icon="undo"
                      onPress={() => setWithdrawing(app)}
                      testID="candidature-withdraw"
                    >
                      {proV2Labels.withdraw}
                    </Button>
                  ) : null}
                </Ticket>
              );
            })
          )}
          {next.length > 0 ? (
            <Muted variant="caption" style={styles.center}>
              {proV2Labels.withdrawHint}
            </Muted>
          ) : null}
        </View>
      ) : (
        <View style={styles.stack} testID="candidatures-past">
          {done.length === 0 ? (
            <Muted variant="body">{past.loading ? "Chargement…" : proV2Labels.pastNone}</Muted>
          ) : (
            done.map((app) => {
              const review = reviewTag(app);
              return (
                <Ticket
                  key={app.id}
                  testID="provider-application-past"
                  date={app.event.startsAt}
                  badge={review ? <AngledTag tone="line">{review}</AngledTag> : badgeOf(app)}
                  title={app.event.title}
                  detail={
                    app.review?.comment
                      ? `« ${app.review.comment} »`
                      : (app.refusalNote ?? (candidatureKind(app) === "retained" ? proV2Labels.noReview : undefined))
                  }
                  dim
                  onPressTitle={() => router.push(`/e/${app.event.slug}`)}
                />
              );
            })
          )}
        </View>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space3 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  center: { textAlign: "center" },
});
