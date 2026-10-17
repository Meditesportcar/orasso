// Casquette Organisateur, bilan d'un événement (lot 27, docs/02 : page événement côté organisateur > bilan) : les
// compteurs du bilan automatique (retenus, présents, absents, taux) et « Remercier les présents » (un message dans la
// Boîte de chaque présent, avec son lien d'avis, une seule fois). Lot 35a (D20) : l'export des participants (motif
// obligatoire, tracé, CSV partagé) et l'accès aux notes internes. L'édition suivante reste sur le site (lot 35b).
import { Button, Counters, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventReportView, formatDayDate, afterEventLabels as L, orgaManageLabels as M } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { orgaSitePath, structureSlugOf } from "@/lib/orga";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { ConfirmSheet } from "./ConfirmSheet";
import { ExportPanel } from "./ExportPanel";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space2, space3 } = tokens.spacing;

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)} %`);

export function Bilan({ eventId }: { eventId: string }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { structureId } = useOrga();
  const { me } = useSession();
  const event = useApi(() => api.orgEvent(eventId), [eventId]);
  const view = useApi<EventReportView>(() => api.eventReport(eventId), [eventId]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const e = event.data;
  // Un événement d'une autre structure (même compte, autre casquette) ne s'ouvre pas sous celle-ci.
  const foreign = e ? e.structure.id !== structureId : false;
  const slug = structureSlugOf(me?.memberships, structureId);
  const close = () => (router.canGoBack() ? router.back() : router.replace(`/evenement/${eventId}`));
  const r = view.data?.report ?? null;
  const d = r?.data;
  const thanks = view.data?.thanks;
  const canThank = Boolean(thanks && !thanks.sentAt && !thanks.blockedReason && thanks.recipients > 0);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.sendThanks(eventId);
      setConfirming(false);
      setNotice(L.thanksDone);
      await view.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      title={L.reportTitle}
      facts={e?.title}
      onClose={close}
      onRefresh={async () => {
        await Promise.all([event.reload(), view.reload()]);
      }}
      overlays={
        <ConfirmSheet
          visible={confirming}
          title={L.thanksTitle}
          body={thanks ? L.thanksConfirm(thanks.recipients) : ""}
          confirmLabel={L.thanksSend}
          confirmIcon="share"
          busy={busy}
          error={error}
          onConfirm={() => void send()}
          onClose={() => {
            setConfirming(false);
            setError(null);
          }}
        />
      }
    >
      <OrgaFailure error={failure ?? event.error ?? view.error} />
      {foreign ? <Notice tone="error">Cet événement appartient à une autre structure.</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {view.data && !foreign ? (
        <>
          {d && r ? (
            <>
              <Counters
                items={[
                  { value: d.accepted, label: L.accepted },
                  { value: d.present, label: L.present },
                  { value: d.absent, label: L.absent },
                  { value: percent(d.presenceRate), label: L.presenceRate },
                ]}
                active={1}
              />
              <Muted variant="caption">
                {r.refreshedAt
                  ? L.reportFinal(formatDayHour(r.refreshedAt))
                  : L.reportProvisional(formatDayHour(view.data.refreshAt))}
              </Muted>
              {/* Lot 26 : bilan par jour d'un événement sur plusieurs jours. */}
              {d.byDay && d.byDay.length > 1 ? (
                <Plate style={styles.block} testID="orga-report-days">
                  {d.byDay.map((day) => (
                    <Fact
                      key={day.dayId}
                      label={formatDayDate(day.date)}
                      value={`${day.present} / ${day.accepted} · ${day.absent} ${L.absent.toLowerCase()}`}
                    />
                  ))}
                </Plate>
              ) : null}
              <Plate style={styles.block} testID="orga-report-facts">
                <Fact label={L.newFollowers} value={String(d.newFollowers)} />
                <Fact label={L.providers} value={L.providersValue(d.providers.present, d.providers.accepted)} />
                <Fact label={L.staff} value={L.staffValue(d.staff.present, d.staff.expected)} />
                <Fact label={L.incidents} value={String(d.incidents)} />
                <Fact
                  label={L.reviews}
                  value={L.reviewsValue(
                    d.reviews.count,
                    d.reviews.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) ?? null,
                  )}
                />
              </Plate>
              <SectionTitle>{L.byCategory}</SectionTitle>
              <Ranked items={d.byCategory} />
              <SectionTitle>{L.byMake}</SectionTitle>
              <Ranked items={d.byMake} />
              <SectionTitle>{L.byDepartment}</SectionTitle>
              <Ranked items={d.byDepartment} />
            </>
          ) : (
            <Notice>{Date.parse(e?.endsAt ?? "") > Date.now() ? L.notEnded : L.notReady}</Notice>
          )}

          <SectionTitle>{L.thanksTitle}</SectionTitle>
          <Plate style={styles.block} testID="orga-thanks">
            <Text variant="body" color={c.plateInk}>
              {L.thanksIntro}
            </Text>
            {thanks?.sentAt ? (
              <Text variant="bodyStrong" color={c.plateInk}>
                {L.thanksSent(formatDayHour(thanks.sentAt))}
              </Text>
            ) : thanks?.blockedReason ? (
              <Text variant="body" color={c.plateMuted}>
                {L.thanksBlocked[thanks.blockedReason]}
              </Text>
            ) : thanks && thanks.recipients === 0 ? (
              <Text variant="body" color={c.plateMuted}>
                {L.thanksNoPresent}
              </Text>
            ) : thanks ? (
              <Text variant="caption" color={c.plateMuted}>
                {L.thanksRecipients(thanks.recipients)}
              </Text>
            ) : null}
            <Button
              variant="primary"
              icon="share"
              disabled={!canThank}
              onPress={() => setConfirming(true)}
              fullWidth
              testID="orga-thanks-send"
            >
              {L.thanksSend}
            </Button>
          </Plate>

          <SectionTitle>{L.exportTitle}</SectionTitle>
          <ExportPanel eventId={eventId} onTwoFactor={setFailure} />

          <View style={styles.buttons}>
            <Button
              variant="plate"
              icon="incident"
              onPress={() => router.push("/notes")}
              fullWidth
              testID="orga-report-notes"
            >
              {M.notesBilanLink}
            </Button>
            <Button
              variant="plate"
              icon="export"
              disabled={!slug}
              onPress={() => slug && void Linking.openURL(siteUrl(orgaSitePath(slug, `/e/${eventId}/apres`)))}
              fullWidth
              testID="orga-report-on-site"
            >
              {L.nextTitle}
            </Button>
            <Muted variant="caption">{M.nextOnSite}</Muted>
          </View>
        </>
      ) : null}
    </FlowScreen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.fact}>
      <Text variant="caption" color={t.color.plateMuted}>
        {label}
      </Text>
      <Text variant="bodyStrong" color={t.color.plateInk}>
        {value}
      </Text>
    </View>
  );
}

function Ranked({ items }: { items: { label: string; count: number }[] }) {
  const { t } = useTheme();
  if (items.length === 0) return <Muted variant="body">{L.none}</Muted>;
  return (
    <Plate style={styles.block}>
      {items.map((i) => (
        <View key={i.label} style={styles.rank}>
          <Text variant="body" color={t.color.plateInk} style={styles.rankLabel}>
            {i.label}
          </Text>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {i.count}
          </Text>
        </View>
      ))}
    </Plate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  buttons: { gap: space2, marginTop: space2 },
  fact: { gap: 2 },
  rank: { flexDirection: "row", justifyContent: "space-between", gap: space3 },
  rankLabel: { flex: 1 },
});
