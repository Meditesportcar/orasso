// Inscrire mon crew à un événement (lot 19, docs/01 « trier les candidatures ») : le chef choisit qui vient et avec
// quel véhicule, relit le récapitulatif et envoie ; chaque membre confirme sa venue (rien n'est envoyé à l'organisateur
// sans son accord). Le chef suit ici les confirmations et peut retirer un membre qui n'a pas confirmé.
import { Button, CheckboxField, Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewLabels, eventDaysLabels, formatDayDate } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CrewLogo } from "@/features/crews/CrewLogo";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { ApplicationStatusBadge } from "@/ui/StatusOf";

const { space1, space2, space3 } = tokens.spacing;

export default function CrewRegistration() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { event: slug } = useLocalSearchParams<{ event: string }>();
  const event = useApi(() => api.eventBySlug(slug), [slug]);
  const crews = useApi(() => api.myCrews(), []);
  const led = (crews.data ?? []).filter((x) => x.role === "leader");
  const [crewId, setCrewId] = useState<string | null>(null);
  const crew = led.find((x) => x.id === crewId) ?? led[0] ?? null;
  const e = event.data;
  const options = useApi(() => api.crewRegistrationOptions(e?.id ?? "", crew?.id ?? ""), [e?.id, crew?.id], {
    enabled: Boolean(e && crew),
  });
  const registrations = useApi(() => api.myCrewRegistrations(e?.id ?? ""), [e?.id], { enabled: Boolean(e) });
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [rules, setRules] = useState(false);
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  // Lot 26 : un jour pour tout le crew (événement sur plusieurs jours ; `undefined` = pas encore touché).
  const [dayChoice, setDayChoice] = useState<string | null | undefined>(undefined);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/e/${slug}`));
  const members = options.data?.members ?? [];
  const chosen = members.filter((m) => picked[m.person.userId]);
  const others = chosen.filter((m) => !m.isLeader);
  const mine = registrations.data?.find((r) => r.crew.id === crew?.id);
  const closed = e ? e.isLocked || e.status !== "published" || e.admission === "invite_only" : false;

  return (
    <FlowScreen
      title={crewLabels.registerCrew}
      onClose={close}
      onRefresh={async () => {
        await Promise.all([options.reload(), registrations.reload()]);
      }}
    >
      {e ? (
        <View style={styles.block}>
          <Text variant="posterM" color={c.ink}>
            {e.title}
          </Text>
          <Muted variant="meta">
            {formatDayHour(e.startsAt)}
            {e.city ? ` · ${e.city}` : ""}
          </Muted>
        </View>
      ) : (
        <Muted variant="body">Chargement…</Muted>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {sent !== null ? <Notice>{crewLabels.registerCrewSent(sent)}</Notice> : null}
      {crews.data && led.length === 0 ? <Notice>{crewLabels.registerCrewLeaderOnly}</Notice> : null}

      {led.length > 1 ? (
        <ChipRow>
          {led.map((x) => (
            <Chip key={x.id} selected={x.id === crew?.id} onPress={() => setCrewId(x.id)}>
              {x.name}
            </Chip>
          ))}
        </ChipRow>
      ) : null}

      {mine ? (
        <>
          <SectionTitle>{crewLabels.myRegistrations}</SectionTitle>
          <Muted variant="caption">
            {crewLabels.confirmedCount(mine.members.filter((m) => m.confirmed).length, mine.members.length)}
          </Muted>
          {mine.members.map((m) => {
            return (
              <Plate key={m.applicationId} style={styles.member} testID="crew-registration-member">
                <View style={styles.rowBetween}>
                  <View style={styles.grow}>
                    <Text variant="bodyStrong" color={c.plateInk}>
                      {m.pseudo}
                    </Text>
                    {m.vehicleLabel ? (
                      <Text variant="body" color={c.plateMuted}>
                        {m.vehicleLabel}
                      </Text>
                    ) : null}
                    {m.confirmBefore ? (
                      <Text variant="caption" color={c.plateMuted}>
                        {crewLabels.confirmBefore(formatDayHour(m.confirmBefore))}
                      </Text>
                    ) : null}
                  </View>
                  <ApplicationStatusBadge app={{ status: m.status, checkedInAt: null, waitlistRank: null }} />
                </View>
                {m.status === "awaiting_member" ? (
                  <Button
                    variant="plate"
                    tone="dashed"
                    icon="close"
                    disabled={busy}
                    onPress={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        await api.removeFromCrewRegistration(m.applicationId);
                        await registrations.reload();
                      } catch (err) {
                        setError(errorMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {crewLabels.removeFromRegistration}
                  </Button>
                ) : null}
              </Plate>
            );
          })}
        </>
      ) : null}

      {crew && options.data && !closed ? (
        <>
          <View style={styles.crewRow}>
            <CrewLogo url={crew.logoUrl} name={crew.name} size={40} />
            <Text variant="posterS" color={c.ink}>
              {crew.name}
            </Text>
          </View>
          <Muted variant="body">{crewLabels.registerCrewHint}</Muted>
          <SectionTitle>{crewLabels.registerCrewWho}</SectionTitle>
          {members.map((m) => {
            const id = m.person.userId;
            const usable = m.vehicles.filter((x) => !x.blocked);
            const on = Boolean(picked[id]);
            return (
              <Plate key={id} style={styles.member} testID="crew-pick">
                <CheckboxField
                  label={m.isLeader ? `${m.person.pseudo} (${crewLabels.registerCrewSelf})` : m.person.pseudo}
                  checked={on}
                  disabled={Boolean(m.blocked) || usable.length === 0}
                  onChange={(value) =>
                    setPicked((cur) => {
                      const next = { ...cur };
                      if (value && usable[0]) next[id] = usable[0].id;
                      else delete next[id];
                      return next;
                    })
                  }
                />
                <View style={styles.personRow}>
                  <Avatar url={m.person.avatarUrl} pseudo={m.person.pseudo} size={28} />
                  <Text variant="caption" color={c.plateMuted}>
                    {m.blocked ??
                      (usable.length === 0 ? (m.vehicles[0]?.blocked ?? crewLabels.registerCrewNoVehicle) : "")}
                  </Text>
                </View>
                {on
                  ? m.vehicles.map((x) => (
                      <Pressable
                        key={x.id}
                        disabled={Boolean(x.blocked)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: picked[id] === x.id, disabled: Boolean(x.blocked) }}
                        onPress={() => setPicked((cur) => ({ ...cur, [id]: x.id }))}
                        style={styles.vehicle}
                      >
                        <Chip surface="plate" selected={picked[id] === x.id}>
                          {x.label}
                        </Chip>
                        {x.blocked ? (
                          <Text variant="caption" color={c.plateMuted}>
                            {x.blocked}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))
                  : null}
              </Plate>
            );
          })}

          {e && (e.days?.length ?? 0) > 1 && e.dayAccess !== "whole" ? (
            <>
              <SectionTitle>{eventDaysLabels.chooseDay}</SectionTitle>
              <ChipRow>
                {e.dayAccess === "both" ? (
                  <Chip selected={dayChoice === null || dayChoice === undefined} onPress={() => setDayChoice(null)}>
                    {eventDaysLabels.wholeEvent}
                  </Chip>
                ) : null}
                {e.days.map((d, i) => (
                  <Chip
                    key={d.id}
                    selected={dayChoice === d.id || (dayChoice === undefined && e.dayAccess === "per_day" && i === 0)}
                    onPress={() => setDayChoice(d.id)}
                  >
                    {formatDayDate(d.date)}
                  </Chip>
                ))}
              </ChipRow>
            </>
          ) : null}
          <SectionTitle>{crewLabels.registerCrewRecap}</SectionTitle>
          <Plate style={styles.member} testID="crew-registration-recap">
            {chosen.length === 0 ? (
              <Text variant="body" color={c.plateMuted}>
                {crewLabels.registerCrewNeedMember}
              </Text>
            ) : (
              chosen.map((m) => (
                <View key={m.person.userId} style={styles.recapRow}>
                  <Text variant="bodyStrong" color={c.plateInk}>
                    {m.person.pseudo}
                  </Text>
                  <Text variant="body" color={c.plateInk}>
                    {m.vehicles.find((x) => x.id === picked[m.person.userId])?.label}
                  </Text>
                </View>
              ))
            )}
          </Plate>
          <CheckboxField label={crewLabels.registerCrewRules} checked={rules} onChange={setRules} />
          <CheckboxField
            label="Suivre l'organisation (nouveaux événements, avant-premières)"
            checked={follow}
            onChange={setFollow}
          />
          <Button
            icon="crew"
            loading={busy}
            disabled={!rules || others.length === 0}
            fullWidth
            testID="crew-registration-send"
            onPress={async () => {
              if (!e) return;
              setBusy(true);
              setError(null);
              try {
                await api.registerCrew(e.id, {
                  crewId: crew.id,
                  members: chosen.map((m) => ({ userId: m.person.userId, vehicleId: picked[m.person.userId] ?? "" })),
                  rulesAccepted: true,
                  followStructure: follow,
                  message: null,
                  eventDayId:
                    (e.days?.length ?? 0) > 1 && e.dayAccess !== "whole"
                      ? dayChoice !== undefined
                        ? dayChoice
                        : e.dayAccess === "per_day"
                          ? (e.days[0]?.id ?? null)
                          : null
                      : undefined,
                });
                setSent(others.length);
                setPicked({});
                setRules(false);
                await Promise.all([options.reload(), registrations.reload()]);
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {crewLabels.registerCrewSend}
          </Button>
        </>
      ) : null}
      {closed ? <Notice>Les inscriptions ne sont pas ouvertes pour cet événement.</Notice> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space1 },
  crewRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  member: { gap: space2, padding: space3 },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space2 },
  grow: { flex: 1, gap: space1 },
  personRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  vehicle: { gap: space1, paddingLeft: space3 },
  recapRow: { gap: space1 },
});
