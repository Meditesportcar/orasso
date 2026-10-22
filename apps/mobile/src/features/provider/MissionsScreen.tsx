// Casquette Prestataire, Missions (DA v2, lot 54, prototype `s-missions`) : les événements qui cherchent mon métier,
// du plus proche au plus loin. Grand titre « Missions · Autour du 66 », puces de métier (ceux de ma vitrine) et de rayon
// (curseur, 5 à 500 km comme la vitrine), la phrase « N événements cherchent un food truck… », puis une carte en ticket
// par événement : statut de ma candidature ou « 1 place sur 2 », structure · distance · attendus, ce qui est fourni, et
// « Proposer <nom> » qui ouvre la feuille d'envoi. Dessous, « Sans mission précise · Ouverts à ton activité » : les
// événements qui acceptent mon type sans avoir écrit de besoin (candidature libre, docs/01). L'API (lot 46,
// `GET /missions`) fait le tri et le calcul de distance.
import { Button, EmptyState, tokens } from "@orasso/design-system/native";
import type { OpenEventForProvider, VendorTypeCode } from "@orasso/shared";
import {
  type MissionCard,
  missionTexts,
  PROVIDER_DEFAULT_RADIUS_KM,
  proV2Labels,
  vendorTypeLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AngledTag, TzChip } from "@/features/pro/kit";
import { Ticket } from "@/features/sorties/Ticket";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { alreadyApplied, candidatureKind, missionDetail, missionFacts, missionTag, tradeIcons } from "@/lib/proPresta";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";
import { Slider } from "@/ui/Slider";
import { StatusTag } from "@/ui/StatusTag";
import { ApplySheet } from "./ApplySheet";
import { ProposeSheet } from "./ProposeSheet";

const { space1, space3 } = tokens.spacing;

/** Rayon d'intervention : la même plage que la vitrine (`providerProfileSchema`). */
const RADIUS_MIN = 5;
const RADIUS_MAX = 500;
const RADIUS_STEP = 5;

/** Statuts qui permettent de candidater de nouveau à un événement. */
const REOPENED = ["withdrawn", "refused", "expired", "cancelled"];

export function MissionsScreen() {
  const router = useRouter();
  const { refreshMe } = useSession();
  const profile = useApi(async () => (await api.providerProfile()).profile, [], { cacheKey: "provider-profile" });
  const p = profile.data;
  const [trade, setTrade] = useState<VendorTypeCode | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [proposing, setProposing] = useState<MissionCard | null>(null);
  const [applying, setApplying] = useState<OpenEventForProvider | null>(null);

  // Le rayon de départ est celui de la vitrine, une fois le profil lu.
  const baseRadius = p?.radiusKm ?? PROVIDER_DEFAULT_RADIUS_KM;
  const shownRadius = draft ?? radius ?? baseRadius;

  const missions = useApi(
    () => api.missions({ trade: trade ?? undefined, radiusKm: radius ?? undefined }),
    [trade, radius, p?.id],
    { enabled: Boolean(p), cacheKey: `missions-${trade ?? "main"}-${radius ?? "base"}` },
  );
  const open = useApi(() => api.openToProviders(), [p?.id], { enabled: Boolean(p), cacheKey: "provider-open-events" });
  const result = missions.data;
  const trades = p ? (p.trades.length ? p.trades : [p.type]) : [];
  const activeTrade: VendorTypeCode | null = result?.trade ?? trade ?? trades[0] ?? null;
  const tradeLabel = activeTrade ? vendorTypeLabels[activeTrade] : "";
  const items = result?.items ?? [];
  // Les événements déjà montrés par une mission n'ont pas à revenir dans la candidature libre.
  const shown = new Set(items.map((c) => c.id));
  const freeEvents = (open.data ?? []).filter(
    (e) => !shown.has(e.id) && (!e.myApplication || REOPENED.includes(e.myApplication.status)),
  );

  async function reloadAll() {
    await Promise.all([profile.reload(), missions.reload(), open.reload()]);
    void refreshMe();
  }

  // Une panne n'est jamais une liste vide : le message de l'API et « Réessayer » (les données en cache restent affichées).
  const failed = (profile.error && !p ? profile.error : null) ?? (missions.error && !result ? missions.error : null);

  return (
    <TabScreen
      title={proV2Labels.missionsTitle}
      facts={result?.from ? proV2Labels.around(result.from) : proV2Labels.aroundUnknown}
      onRefresh={reloadAll}
      overlays={
        <>
          <ProposeSheet
            mission={proposing}
            providerName={p?.name ?? ""}
            onClose={() => setProposing(null)}
            onSend={async ({ needId, message }) => {
              if (!proposing) return;
              await api.applyAsProvider(proposing.id, { rulesAccepted: true, message, needId });
              await reloadAll();
            }}
          />
          <ApplySheet
            eventTitle={applying?.title ?? null}
            onClose={() => setApplying(null)}
            onSend={async (message) => {
              if (!applying) return;
              await api.applyAsProvider(applying.id, { rulesAccepted: true, message });
              setApplying(null);
              await reloadAll();
            }}
          />
        </>
      }
    >
      {failed ? (
        <LoadError message={failed.message} onRetry={() => void reloadAll()} />
      ) : !p ? (
        profile.loading ? null : (
          <>
            <Notice>Crée ton profil prestataire pour voir les missions autour de toi.</Notice>
            <Button variant="plate" icon="add" onPress={() => router.push("/prestataire/nouveau")} fullWidth>
              Créer mon profil prestataire
            </Button>
          </>
        )
      ) : (
        <>
          {p.issue ? <Notice>{proV2Labels.profileIncomplete(p.issue)}</Notice> : null}
          {/* Lot C4b (artefact `s-missions`, `.tz-chips`) : le métier actif en moutarde avec son icône, le rayon avec l'épingle. */}
          <View style={styles.chips} testID="missions-filters" accessibilityRole="radiogroup">
            {trades.map((id) => {
              const on = id === (activeTrade ?? p.type);
              return (
                <TzChip
                  key={id}
                  label={vendorTypeLabels[id]}
                  icon={on ? tradeIcons[id] : undefined}
                  on={on}
                  onPress={() => setTrade(id)}
                />
              );
            })}
            <TzChip
              label={proV2Labels.radiusChip(shownRadius)}
              icon="place"
              kind="toggle"
              on={radiusOpen}
              onPress={() => setRadiusOpen((v) => !v)}
            />
          </View>
          {radiusOpen ? (
            <View style={styles.radius} testID="missions-radius">
              <Slider
                value={shownRadius}
                onChange={setDraft}
                onCommit={(km) => {
                  setRadius(km);
                  setDraft(null);
                }}
                min={RADIUS_MIN}
                max={RADIUS_MAX}
                step={RADIUS_STEP}
                label={proV2Labels.radiusLabel}
                format={proV2Labels.radiusChip}
              />
            </View>
          ) : null}

          {result && result.from === null ? <Notice>{proV2Labels.noZone}</Notice> : null}
          {result?.from ? (
            <Muted variant="caption" testID="missions-intro">
              {missionTexts.intro(items.length, tradeLabel)}
            </Muted>
          ) : null}

          {result?.from && items.length === 0 && !missions.loading ? (
            <EmptyState title={proV2Labels.emptyTitle} text={proV2Labels.emptyText} />
          ) : null}

          <View style={styles.stack}>
            {items.map((card) => {
              const tag = missionTag(card);
              const applied = alreadyApplied(card);
              const facts = missionFacts(card);
              const mineStatus = card.myApplication ? candidatureKind({ status: card.myApplication.status }) : null;
              return (
                <Ticket
                  key={card.id}
                  testID="mission-card"
                  date={card.startsAt}
                  badge={
                    mineStatus === "pending" ? (
                      <StatusTag status="pending" />
                    ) : mineStatus === "waitlist" ? (
                      <StatusTag status="waitlist" />
                    ) : tag.mine ? (
                      <StatusTag status="retained" />
                    ) : (
                      <AngledTag tone="line">{tag.label}</AngledTag>
                    )
                  }
                  title={card.title}
                  detail={missionDetail(card)}
                  onPressTitle={() => router.push(`/e/${card.slug}`)}
                >
                  {facts.length && !tag.mine ? (
                    <View style={styles.facts}>
                      {facts.map((f) => (
                        <TzChip key={f} label={f} />
                      ))}
                    </View>
                  ) : null}
                  {applied ? (
                    <Button
                      variant="plate"
                      icon="ticket"
                      onPress={() =>
                        router.navigate({
                          pathname: "/candidatures",
                          params: card.myApplication ? { open: card.myApplication.id } : {},
                        })
                      }
                      testID="mission-see"
                    >
                      {missionTexts.seeApplication}
                    </Button>
                  ) : (
                    <Button
                      variant="plate"
                      icon="send"
                      disabled={Boolean(p.issue)}
                      onPress={() => setProposing(card)}
                      testID="mission-propose"
                    >
                      {missionTexts.propose(p.name)}
                    </Button>
                  )}
                </Ticket>
              );
            })}
          </View>

          {open.error && !open.data ? (
            <LoadError message={open.error.message} onRetry={() => void open.reload()} />
          ) : null}
          {freeEvents.length > 0 ? (
            <View style={styles.stack} testID="missions-free">
              <SecHead title={proV2Labels.openTitle} hint={proV2Labels.openSubtitle} />
              {freeEvents.map((e) => (
                <Ticket
                  key={e.id}
                  testID="provider-open-event"
                  date={e.startsAt}
                  badge={<AngledTag tone="line">{proV2Labels.openSubtitle}</AngledTag>}
                  title={e.title}
                  detail={[e.structureName, e.city, formatDayHour(e.startsAt)].filter(Boolean).join(" · ")}
                  onPressTitle={() => router.push(`/e/${e.slug}`)}
                >
                  <Button
                    variant="plate"
                    icon="send"
                    disabled={Boolean(p.issue)}
                    onPress={() => setApplying(e)}
                    testID="open-apply"
                  >
                    {proV2Labels.apply}
                  </Button>
                </Ticket>
              ))}
            </View>
          ) : null}
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  radius: { paddingVertical: space1 },
  stack: { gap: space3 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
