// Feuille de candidature unique (lot C2b, prototype `sh-cand`) : remplace le flux de trois écrans `/candidater/<slug>`
// et l'écran séparé d'inscription du crew. Dans l'ordre de l'artefact : « Seul » / « Avec <crew> » (segments, le
// second seulement pour le chef d'un crew), le véhicule (ligne bordée moutarde), la case « J'ai vu le créneau
// d'arrivée » sur l'aplat crème (obligatoire quand il y a un créneau exposants), une précision facultative, l'aide
// « Un empêchement ? », puis « Envoyer ma candidature ». À l'envoi : le O, « Candidature envoyée » et « Voir mes
// sorties ». Gardés de l'ancien flux (docs/01, audit § 2) : la case du règlement, sur une ligne, et le choix du jour
// d'un événement sur plusieurs jours. Ni suivi de la structure ni newsletter cochés d'office : le bouton « Suivre » de
// la fiche s'en charge.
import { Chip, ChipRow, Icon, Photo, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  ARRIVAL_NOTE_MAX,
  type ArrivalSlot,
  arrivalTime,
  crewLabels,
  type EventPublic,
  eventDaysLabels,
  formatDayDate,
  type MyApplication,
  type VehicleFull,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { arrivalBody } from "@/features/arrival/ArrivalSeen";
import { CheckBox, CrewDot, initialsOf, Seg, SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { NotificationAsk } from "@/ui/NotificationAsk";

const { space1, space2, space3 } = tokens.spacing;
const OPEN = ["pending", "accepted", "waitlisted", "offered"];

/** « Exposants de 18 h 30 à 19 h 15, strict. Entrée côté capitainerie. » */
export function seenText(slot: ArrivalSlot): string {
  const when = slot.to ? `de ${arrivalTime(slot.from)} à ${arrivalTime(slot.to)}` : `dès ${arrivalTime(slot.from)}`;
  return `Exposants ${when}, ${slot.strict ? "strict" : "conseillé"}.${slot.note ? ` ${slot.note}` : ""}`;
}

export function CandSheet({
  event: e,
  visible,
  onClose,
  onSent,
}: {
  event: EventPublic;
  visible: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { reload, markAnnounced } = useApplications();
  const vehicles = useApi(() => api.vehicles(), [visible], { enabled: visible, cacheKey: "vehicles" });
  const crews = useApi(() => api.myCrews(), [visible], { enabled: visible, cacheKey: "my-crews" });
  const crew = (crews.data ?? []).find((x) => x.role === "leader") ?? null;
  const options = useApi(() => api.crewRegistrationOptions(e.id, crew?.id ?? ""), [e.id, crew?.id, visible], {
    enabled: visible && Boolean(crew),
  });

  const [mode, setMode] = useState<"solo" | "crew">("solo");
  const [picked, setPicked] = useState<string[]>([]);
  const [members, setMembers] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState(false);
  const [rules, setRules] = useState(false);
  const [note, setNote] = useState("");
  const [dayChoice, setDayChoice] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ retained: boolean; crew: number | null } | null>(null);

  const slot = e.arrivals?.exhibitors ?? null;
  const wanted = useMemo(() => new Set(e.criteria?.categoryIds ?? []), [e]);
  const eligible = useMemo(() => {
    const active = (vehicles.data ?? []).filter((v) => v.status === "active");
    const score = (v: VehicleFull) => v.categories.some((cat) => wanted.has(cat.id));
    // Ceux qui collent aux catégories recherchées passent en premier.
    return [...active].sort((a, b) => Number(score(b)) - Number(score(a)));
  }, [vehicles.data, wanted]);
  const limit = e.maxVehiclesPerUser ?? 1;
  // Par défaut, le premier véhicule qui a une photo (« Candidater avec ma Supra »).
  const selected =
    picked.length > 0
      ? picked
      : eligible
          .filter((v) => v.photos.length > 0)
          .slice(0, 1)
          .map((v) => v.id);

  // Plusieurs jours (lot 26) : « Tout l'événement » et/ou un jour, selon le mode d'accès de l'organisateur.
  const taken = (e.myApplications ?? []).filter((a) => OPEN.includes(a.status)).map((a) => a.eventDayId);
  const multi = (e.days?.length ?? 0) > 1;
  const dayChoices: { id: string | null; label: string; full: boolean; mine: boolean }[] = multi
    ? [
        ...(e.dayAccess !== "per_day"
          ? [
              {
                id: null,
                label: eventDaysLabels.wholeEvent,
                full: e.days.some((d) => d.remaining === 0),
                mine: taken.length > 0,
              },
            ]
          : []),
        ...(e.dayAccess !== "whole"
          ? e.days.map((d) => ({
              id: d.id as string | null,
              label: formatDayDate(d.date),
              full: d.remaining === 0,
              mine: taken.includes(d.id),
            }))
          : []),
      ]
    : [];
  const dayId =
    dayChoice !== undefined ? dayChoice : ((dayChoices.find((d) => !d.full && !d.mine) ?? dayChoices[0])?.id ?? null);

  const crewMembers = options.data?.members ?? [];
  const chosenMembers = crewMembers.filter((m) => members[m.person.userId]);
  const leaderComes = chosenMembers.some((m) => m.isLeader);
  const needSeen = slot !== null && (mode === "solo" || leaderComes);
  const ready =
    rules &&
    (!needSeen || seen) &&
    (mode === "solo" ? selected.length > 0 : chosenMembers.filter((m) => !m.isLeader).length > 0);

  const toggleVehicle = (id: string) =>
    setPicked(() => {
      const cur = selected;
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      return limit > 1 && cur.length < limit ? [...cur, id] : [id];
    });

  async function send() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "solo") {
        const apps: MyApplication[] = await api.apply(e.id, {
          vehicleIds: selected,
          rulesAccepted: true,
          followStructure: false,
          newsletterOptIn: false,
          companions: 0,
          // Sans créneau exposants, la précision part comme mot pour l'équipe.
          message: slot ? null : note.trim().slice(0, 120) || null,
          eventDayId: multi ? dayId : undefined,
          ...arrivalBody(slot, seen, note.slice(0, ARRIVAL_NOTE_MAX)),
        });
        // Une admission sans sélection est une retenue d'office : annoncée ici, pas une deuxième fois ensuite.
        markAnnounced(apps.filter((a) => a.status === "accepted").map((a) => a.id));
        setDone({ retained: apps.some((a) => a.status === "accepted"), crew: null });
      } else if (crew) {
        await api.registerCrew(e.id, {
          crewId: crew.id,
          members: chosenMembers.map((m) => ({ userId: m.person.userId, vehicleId: members[m.person.userId] ?? "" })),
          rulesAccepted: true,
          followStructure: false,
          message: null,
          ...(leaderComes ? arrivalBody(slot, seen, note.slice(0, ARRIVAL_NOTE_MAX)) : {}),
          eventDayId: multi && e.dayAccess !== "whole" ? dayId : undefined,
        });
        setDone({ retained: false, crew: chosenMembers.filter((m) => !m.isLeader).length });
      }
      await reload();
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const closeAll = () => {
    setDone(null);
    onClose();
  };

  return (
    <AppSheet visible={visible} onClose={closeAll} accessibilityLabel="Candidater" maxHeight={0.9}>
      <View style={styles.head}>
        <Text variant="posterM" color={c.ink} style={styles.headTitle}>
          {done ? "Candidature envoyée" : `Candidater à ${e.title}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          onPress={closeAll}
          style={[styles.closex, { backgroundColor: c.surface }]}
          testID="cand-close"
        >
          <Icon name="close" size={20} color={c.ink} />
        </Pressable>
      </View>

      {done ? (
        <View style={styles.done} testID="cand-done">
          <Icon name="o" size={120} color={c.accent} />
          <Text variant="posterL" color={c.ink} style={styles.center}>
            {done.retained ? "Tu es retenu" : "Candidature envoyée"}
          </Text>
          <Text variant="caption" color={c.inkMuted} style={styles.center}>
            {done.crew !== null
              ? crewLabels.registerCrewSent(done.crew)
              : done.retained
                ? "L'événement est sans sélection : ta place est réservée. Ton QR t'attend dans Sorties."
                : "L'équipe organisatrice te répond au fil des candidatures. Tu retrouves ta candidature dans Sorties."}
          </Text>
          <NotificationAsk reason="Active les notifications pour recevoir la réponse tout de suite, même appli fermée." />
          <SmButton
            kind="p"
            big
            wide
            icon="ticket"
            onPress={() => {
              closeAll();
              router.navigate("/sorties");
            }}
            testID="cand-sorties"
          >
            Voir mes sorties
          </SmButton>
        </View>
      ) : (
        <View style={styles.stack} testID="cand-sheet">
          {crew ? (
            <Seg
              testID="cand-mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "solo", label: "Seul", icon: "profile" },
                {
                  value: "crew",
                  label: `Avec ${crew.name}`,
                  lead: <CrewDot initials={initialsOf(crew.name, 2)} size={22} />,
                },
              ]}
            />
          ) : null}

          {dayChoices.length > 0 ? (
            <View style={styles.block} testID="apply-day-choice">
              <Text variant="label" color={c.inkMuted}>
                {eventDaysLabels.chooseDay}
              </Text>
              <ChipRow>
                {dayChoices.map((d) => (
                  <Chip key={d.id ?? "whole"} selected={dayId === d.id} onPress={() => setDayChoice(d.id)}>
                    {d.mine
                      ? `${d.label} · ${eventDaysLabels.alreadyApplied}`
                      : d.full
                        ? `${d.label} · ${eventDaysLabels.dayFull}`
                        : d.label}
                  </Chip>
                ))}
              </ChipRow>
            </View>
          ) : null}

          {mode === "crew" && crew ? (
            <View style={styles.block} testID="cand-crew">
              <Text variant="label" color={c.inkMuted}>
                Qui vient du crew, avec quel véhicule ?
              </Text>
              {crewMembers.map((m) => {
                const id = m.person.userId;
                const usable = m.vehicles.filter((x) => !x.blocked);
                const on = Boolean(members[id]);
                const disabled = Boolean(m.blocked) || usable.length === 0;
                return (
                  <View key={id} style={styles.block}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled }}
                      accessibilityLabel={m.person.pseudo}
                      disabled={disabled}
                      onPress={() =>
                        setMembers((cur) => {
                          const next = { ...cur };
                          if (on) delete next[id];
                          else if (usable[0]) next[id] = usable[0].id;
                          return next;
                        })
                      }
                      style={[styles.cmRow, { backgroundColor: c.surface }, disabled && styles.dim]}
                      testID="crew-pick"
                    >
                      <CheckBox on={on} />
                      <View style={styles.grow}>
                        <Text variant="bodyStrong" color={c.ink}>
                          {m.isLeader ? `${m.person.pseudo} (${crewLabels.registerCrewSelf})` : m.person.pseudo}
                        </Text>
                        <Text variant="caption" color={c.inkMuted}>
                          {m.blocked ??
                            (usable.length === 0
                              ? (m.vehicles[0]?.blocked ?? crewLabels.registerCrewNoVehicle)
                              : (m.vehicles.find((x) => x.id === members[id])?.label ?? usable[0]?.label ?? ""))}
                        </Text>
                      </View>
                    </Pressable>
                    {on && usable.length > 1 ? (
                      <ChipRow>
                        {usable.map((x) => (
                          <Chip
                            key={x.id}
                            selected={members[id] === x.id}
                            onPress={() => setMembers((cur) => ({ ...cur, [id]: x.id }))}
                          >
                            {x.label}
                          </Chip>
                        ))}
                      </ChipRow>
                    ) : null}
                  </View>
                );
              })}
              <Text variant="caption" color={c.inkMuted}>
                Chacun reçoit une notification et confirme sa venue. Si le crew est retenu, chacun a son QR et arrive à
                son heure.
              </Text>
            </View>
          ) : (
            <View style={styles.block}>
              <Text variant="label" color={c.inkMuted}>
                {limit > 1 ? `Avec quels véhicules ? (${limit} au plus)` : "Avec quel véhicule ?"}
              </Text>
              {vehicles.loading && !vehicles.data ? (
                <Text variant="caption" color={c.inkMuted}>
                  Chargement de ton garage…
                </Text>
              ) : null}
              {eligible.map((v) => {
                const on = selected.includes(v.id);
                // L'API exige une photo pour candidater : sans elle, on renvoie vers la fiche du véhicule.
                const noPhoto = v.photos.length === 0;
                const match = v.categories.some((cat) => wanted.has(cat.id));
                return (
                  <Pressable
                    key={v.id}
                    accessibilityRole={noPhoto ? "link" : "checkbox"}
                    accessibilityState={noPhoto ? undefined : { checked: on }}
                    accessibilityLabel={v.label}
                    onPress={() => {
                      if (noPhoto) {
                        closeAll();
                        router.push(`/vehicule/${v.id}`);
                      } else toggleVehicle(v.id);
                    }}
                    style={[
                      styles.candVeh,
                      { backgroundColor: c.surface, borderColor: on ? c.accent : c.surfaceRaised },
                    ]}
                    testID="cand-vehicle"
                  >
                    <View style={styles.cvPh}>
                      <Photo
                        source={mediaSource(v.photos[0]?.url)}
                        placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
                        style={StyleSheet.absoluteFill}
                      />
                    </View>
                    <View style={styles.grow}>
                      <Text variant="posterS" color={c.ink}>
                        {v.label}
                      </Text>
                      <Text variant="caption" color={c.inkMuted}>
                        {noPhoto
                          ? "Ajoute au moins une photo pour candidater"
                          : [
                              ...v.categories.map((cat) => cat.label),
                              wanted.size > 0 && !match ? "hors des catégories, possible quand même" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </Text>
                    </View>
                    {on ? <Icon name="check" size={20} color={c.accentText} /> : null}
                  </Pressable>
                );
              })}
              {!vehicles.loading && eligible.length === 0 ? (
                <SmButton
                  kind="s"
                  icon="add"
                  wide
                  onPress={() => {
                    closeAll();
                    router.push("/vehicule/nouveau");
                  }}
                >
                  Ajouter un véhicule au garage
                </SmButton>
              ) : null}
            </View>
          )}

          {needSeen && slot ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: seen }}
              accessibilityLabel={`J'ai vu le créneau d'arrivée. ${seenText(slot)}`}
              onPress={() => setSeen((s) => !s)}
              style={[styles.seen, { backgroundColor: c.poster }]}
              testID="arrival-seen"
            >
              {seen ? <CheckBox on /> : <View style={[styles.seenCheck, { borderColor: `${c.posterInk}66` }]} />}
              <View style={styles.grow}>
                <Text variant="bodyStrong" color={c.posterInk} style={styles.strong}>
                  J'ai vu le créneau d'arrivée
                </Text>
                <Text variant="caption" color={c.posterMuted}>
                  {seenText(slot)}
                </Text>
              </View>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rules }}
            accessibilityLabel="J'ai lu le règlement de l'événement et je l'accepte"
            onPress={() => setRules((r) => !r)}
            style={styles.rulesRow}
            testID="cand-rules"
          >
            <CheckBox on={rules} />
            <Text variant="caption" color={c.ink} style={styles.grow}>
              {e.rulesText
                ? "J'ai lu le règlement de l'événement (sur la fiche) et je l'accepte."
                : "Je respecte le voisinage, je roule au pas, aucun burn."}
            </Text>
          </Pressable>

          {mode === "solo" || leaderComes ? (
            <TextField
              label="Une précision pour l'équipe ? (facultatif)"
              value={note}
              onChangeText={setNote}
              maxLength={slot ? ARRIVAL_NOTE_MAX : 120}
              placeholder="ex. J'arriverai vers 19 h 30 à cause du travail"
              multiline
              testID="arrival-note"
            />
          ) : null}

          <View style={styles.hint}>
            <Icon name="alert" size={16} color={c.inkMuted} />
            <Text variant="caption" color={c.inkMuted} style={styles.grow}>
              Un empêchement ? Préviens depuis Sorties : ta place ira à la liste d'attente.
            </Text>
          </View>
          {error ? (
            <Text variant="caption" color={c.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <SmButton
            kind="p"
            big
            wide
            icon="send"
            disabled={!ready || busy}
            onPress={() => void send()}
            testID="cand-send"
          >
            {mode === "crew" ? crewLabels.registerCrewSend : "Envoyer ma candidature"}
          </SmButton>
        </View>
      )}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space2 + 2 },
  headTitle: { flex: 1, fontSize: 18, lineHeight: 19 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stack: { gap: space3 + 2 },
  block: { gap: space2 },
  grow: { flex: 1, minWidth: 0 },
  dim: { opacity: 0.5 },
  strong: { fontFamily: "Archivo-ExtraBold" },
  cmRow: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: 14 },
  candVeh: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space2,
    borderRadius: 16,
    borderWidth: 2,
  },
  cvPh: { width: 96, height: 66, borderRadius: 10, overflow: "hidden" },
  seen: { flexDirection: "row", alignItems: "flex-start", gap: space3, padding: space3 + 2, borderRadius: 16 },
  seenCheck: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  rulesRow: { flexDirection: "row", alignItems: "center", gap: space3 },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: space1 + 2 },
  done: { alignItems: "center", gap: space2 + 2, paddingVertical: space2 + 2 },
  center: { textAlign: "center" },
});
