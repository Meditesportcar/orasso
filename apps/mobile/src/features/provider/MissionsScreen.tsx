// Casquette Prestataire, Missions (DA v2, lot 54, prototype `s-missions`) : les événements qui cherchent mon métier,
// du plus proche au plus loin. Grand titre « Missions · Autour du 66 », puces de métier (ceux de ma vitrine) et de rayon
// (curseur), la phrase « N événements cherchent un food truck… », puis une carte en ticket par événement : statut de ma
// candidature ou « 1 place sur 2 », structure · distance · attendus, ce qui est fourni, et « Proposer <nom> » qui ouvre
// la feuille d'envoi. L'API (lot 46, `GET /missions`) fait le tri et le calcul de distance.
import { Button, Chip, EmptyState, tokens } from "@orasso/design-system/native";
import type { VendorTypeCode } from "@orasso/shared";
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
import { Ticket } from "@/features/sorties/Ticket";
import { api } from "@/lib/api";
import { alreadyApplied, candidatureKind, missionDetail, missionFacts, missionTag } from "@/lib/proPresta";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { Slider } from "@/ui/Slider";
import { StatusTag } from "@/ui/StatusTag";
import { ProposeSheet } from "./ProposeSheet";

const { space1, space2, space3 } = tokens.spacing;

export function MissionsScreen() {
  const router = useRouter();
  const { refreshMe } = useSession();
  const profile = useApi(async () => (await api.providerProfile()).profile, [], { cacheKey: "provider-profile" });
  const p = profile.data;
  const [trade, setTrade] = useState<VendorTypeCode | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [proposing, setProposing] = useState<MissionCard | null>(null);

  // Le rayon de départ est celui de la vitrine, une fois le profil lu.
  const baseRadius = p?.radiusKm ?? PROVIDER_DEFAULT_RADIUS_KM;
  const [draft, setDraft] = useState<number | null>(null);
  const shownRadius = draft ?? radius ?? baseRadius;

  const missions = useApi(
    () => api.missions({ trade: trade ?? undefined, radiusKm: radius ?? undefined }),
    [trade, radius, p?.id],
    { enabled: Boolean(p), cacheKey: `missions-${trade ?? "main"}-${radius ?? "base"}` },
  );
  const result = missions.data;
  const trades = p ? (p.trades.length ? p.trades : [p.type]) : [];
  const activeTrade: VendorTypeCode | null = result?.trade ?? trade ?? trades[0] ?? null;
  const tradeLabel = activeTrade ? vendorTypeLabels[activeTrade] : "";
  const items = result?.items ?? [];

  async function reloadAll() {
    await Promise.all([profile.reload(), missions.reload()]);
    void refreshMe();
  }

  return (
    <TabScreen
      title={proV2Labels.missionsTitle}
      facts={result?.from ? proV2Labels.around(result.from) : proV2Labels.aroundUnknown}
      onRefresh={reloadAll}
      overlays={
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
      }
    >
      {!p ? (
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
          <View style={styles.chips} testID="missions-filters">
            {trades.map((code) => (
              <Chip key={code} selected={activeTrade === code} onPress={() => setTrade(code)}>
                {vendorTypeLabels[code]}
              </Chip>
            ))}
            <Chip variant="accent" selected={radiusOpen} onPress={() => setRadiusOpen((v) => !v)}>
              {proV2Labels.radiusChip(shownRadius)}
            </Chip>
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
                min={10}
                max={300}
                step={10}
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
                      <Chip surface="plate">{tag.label}</Chip>
                    )
                  }
                  title={card.title}
                  detail={missionDetail(card)}
                  onPressTitle={() => router.push(`/e/${card.slug}`)}
                >
                  {facts.length && !tag.mine ? (
                    <View style={styles.facts}>
                      {facts.map((f) => (
                        <Chip key={f} surface="plate">
                          {f}
                        </Chip>
                      ))}
                    </View>
                  ) : null}
                  {applied ? (
                    <Button
                      variant="plate"
                      icon="ticket"
                      onPress={() => router.navigate("/candidatures")}
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
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  radius: { paddingVertical: space1 },
  stack: { gap: space3 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
