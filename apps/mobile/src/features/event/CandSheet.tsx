// Feuille de candidature unique (lot C2b, prototype `sh-cand`) : remplace le flux de trois écrans `/candidater/<slug>`
// et l'écran séparé d'inscription du crew. Dans l'ordre de l'artefact : « Seul » / « Avec <crew> » (segments, le
// second seulement pour le chef d'un crew), le véhicule (ligne bordée moutarde), la case « J'ai vu le créneau
// d'arrivée » sur l'aplat crème (obligatoire quand il y a un créneau exposants), une précision facultative, l'aide
// « Un empêchement ? », puis « Envoyer ma candidature ». À l'envoi : le O, « Candidature envoyée » et « Voir mes
// sorties ». Gardés de l'ancien flux (docs/01, audit § 2) : la case du règlement, sur une ligne, et le choix du jour
// d'un événement sur plusieurs jours, et la newsletter (case non cochée, docs/01).
// Lot M4 (maquette 4.4, retour 24) : « Suivre <structure> » revient, cochée d'office (docs/01 l. 50 et Damien), juste
// au-dessus de la newsletter (non cochée) ; le véhicule de la dernière candidature est présélectionné (« Dernière
// utilisée ») ; fiches de véhicule de la maquette (photo carrée, nom entier, coche ronde).
// Lot R4c (maquette R4.5b) : le véhicule principal est présélectionné (« ★ Véhicule principal »), sinon le dernier
// utilisé, sinon le premier qui convient (`preselectVehicle`, packages/shared, même règle sur le site).
// Tour 2 (relectures) : le mode crew s'ouvre aussi seul (`mode="crew"`, bouton « Inscrire mon crew » de la fiche) pour un
// chef qui a déjà candidaté ou qui n'a pas de véhicule ; sélecteur quand on dirige plusieurs crews ; lien vers le suivi
// des confirmations (`/crew/inscription`) ; état remis à zéro à la fermeture.
import {
  Chip,
  ChipRow,
  Icon,
  initialsOf,
  Monogram,
  Photo,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  ARRIVAL_NOTE_MAX,
  type ArrivalSlot,
  arrivalTime,
  crewLabels,
  type EventPublic,
  eventDaysLabels,
  formatDayDate,
  type MyApplication,
  mainVehicleLabels,
  preselectVehicle,
  type VehicleFull,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { arrivalBody } from "@/features/arrival/ArrivalSeen";
import { AfterInviteCard } from "@/features/event/invite/AfterInviteCard";
import { CheckBox, CrewDot, Seg, SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { NotificationAsk } from "@/ui/NotificationAsk";

const { space1, space2, space3 } = tokens.spacing;
const OPEN = ["pending", "accepted", "waitlisted", "offered"];

/** « Exposants de 18 h 30 à 19 h 15, strict. Entrée côté capitainerie. » Lot M4 : jamais « conseillé » (Damien). */
export function seenText(slot: ArrivalSlot): string {
  const when = slot.to ? `de ${arrivalTime(slot.from)} à ${arrivalTime(slot.to)}` : `dès ${arrivalTime(slot.from)}`;
  return `Exposants ${when}${slot.strict ? ", strict" : ""}.${slot.note ? ` ${slot.note}` : ""}`;
}

export function CandSheet({
  event: e,
  visible,
  onClose,
  onSent,
  mode: openMode = "solo",
  soloAllowed = true,
  crewSlug,
  initialDay,
  alreadyFollowing = false,
  onInvite,
}: {
  event: EventPublic;
  visible: boolean;
  onClose: () => void;
  onSent: () => void;
  /** Lot R6c (R6.5) : « Inviter » de la carte « Invite du monde à venir » (la fiche ouvre la feuille d'invitation). */
  onInvite?: () => void;
  /** Mode à l'ouverture : `crew` depuis « Inscrire mon crew ». */
  mode?: "solo" | "crew";
  /** Faux quand la candidature personnelle n'est plus possible (déjà candidat) : seul le mode crew reste. */
  soloAllowed?: boolean;
  /** Le crew présélectionné (ouvert depuis sa fiche). */
  crewSlug?: string;
  /** Jour présélectionné (`?jour=` des liens du site). */
  initialDay?: string;
  /** Lot M4 : la personne suit déjà la structure (la case « Suivre » n'a plus lieu d'être). */
  alreadyFollowing?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { reload, markAnnounced, upcoming, past } = useApplications();
  const vehicles = useApi(() => api.vehicles(), [visible], { enabled: visible, cacheKey: "vehicles" });
  const crews = useApi(() => api.myCrews(), [visible], { enabled: visible, cacheKey: "my-crews" });
  const led = (crews.data ?? []).filter((x) => x.role === "leader");
  const [crewId, setCrewId] = useState<string | null>(null);
  const crew = led.find((x) => x.id === crewId) ?? led.find((x) => x.slug === crewSlug) ?? led[0] ?? null;
  const options = useApi(() => api.crewRegistrationOptions(e.id, crew?.id ?? ""), [e.id, crew?.id, visible], {
    enabled: visible && Boolean(crew),
  });

  const [mode, setMode] = useState<"solo" | "crew">(openMode);
  // `null` : pas encore touché (le premier véhicule avec photo est proposé) ; une liste vidée exprès reste vide.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [members, setMembers] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState(false);
  const [rules, setRules] = useState(false);
  const [note, setNote] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [followOn, setFollowOn] = useState(true);
  const [dayChoice, setDayChoice] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ retained: boolean; crew: number | null } | null>(null);

  // Chaque ouverture repart d'un état neuf (mode demandé, aucune case cochée, aucune note). Seulement au passage à
  // l'affichage : après l'envoi, la fiche se recharge (`soloAllowed` peut changer) sans effacer l'écran d'envoi.
  const shown = useRef(false);
  useEffect(() => {
    const opening = visible && !shown.current;
    shown.current = visible;
    if (!opening) return;
    setMode(soloAllowed ? openMode : "crew");
    setCrewId(null);
    setPicked(null);
    setMembers({});
    setSeen(false);
    setRules(false);
    setNote("");
    setNewsletter(false);
    setFollowOn(true);
    setDayChoice(undefined);
    setError(null);
    setDone(null);
  }, [visible, openMode, soloAllowed]);

  // Tour 2 (relectures) : le créneau des exposants est privé ; la fiche ne le donne qu'aux inscrits. La feuille le lit
  // à son ouverture (`apply-context`), seulement si l'on peut candidater maintenant ; jamais gardé en cache.
  const context = useApi(() => api.applyContext(e.id), [e.id, visible], { enabled: visible });
  const contextReady = context.data !== null;
  const slot = context.data?.exhibitors ?? e.arrivals?.exhibitors ?? null;
  // Sans véhicule, la feuille propose d'en ajouter un : ce refus-là ne s'affiche pas.
  const contextError = context.error && !context.error.details?.noVehicle ? errorMessage(context.error) : null;
  const wanted = useMemo(() => new Set(e.criteria?.categoryIds ?? []), [e]);
  const eligible = useMemo(() => {
    const active = (vehicles.data ?? []).filter((v) => v.status === "active");
    const score = (v: VehicleFull) => v.categories.some((cat) => wanted.has(cat.id));
    // Ceux qui collent aux catégories recherchées passent en premier.
    return [...active].sort((a, b) => Number(score(b)) - Number(score(a)));
  }, [vehicles.data, wanted]);
  const limit = e.maxVehiclesPerUser ?? 1;
  // Lot M4 : le véhicule de la dernière candidature (s'il est encore au garage, avec une photo).
  const lastUsed = useMemo(() => {
    const usable = new Set(eligible.filter((v) => v.photos.length > 0).map((v) => v.id));
    const recent = [...(upcoming ?? []), ...(past ?? [])]
      .filter((a) => a.vehicle && usable.has(a.vehicle.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return recent?.vehicle?.id ?? null;
  }, [eligible, upcoming, past]);
  // Lot R4c, tour 2 : le principal se lit dans le garage qui vient d'être chargé (l'API le renvoie en tête), pas dans le
  // profil de la session, qui peut dater d'avant un archivage depuis la fiche du véhicule.
  const mainVehicleId = useMemo(
    () => (vehicles.data ?? []).find((v) => v.status === "active")?.id ?? null,
    [vehicles.data],
  );
  // Lot R4c : principal → dernier utilisé → premier qui convient (règle commune avec le site) ; tour 2 : un véhicule
  // dont le type n'est pas admis par l'événement n'est jamais proposé.
  const preselected = useMemo(
    () =>
      preselectVehicle(
        eligible.map((v) => ({
          id: v.id,
          hasPhoto: v.photos.length > 0,
          matches: wanted.size === 0 || v.categories.some((cat) => wanted.has(cat.id)),
          admitted: e.admittedVehicleTypes.includes(v.vehicleType),
        })),
        mainVehicleId,
        lastUsed,
      ),
    [eligible, wanted, mainVehicleId, lastUsed, e.admittedVehicleTypes],
  );
  const selected = picked !== null ? picked : preselected ? [preselected.id] : [];

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
    dayChoice !== undefined
      ? dayChoice
      : ((
          dayChoices.find((d) => d.id === initialDay && !d.full && !d.mine) ??
          dayChoices.find((d) => !d.full && !d.mine) ??
          dayChoices[0]
        )?.id ?? null);

  const crewMembers = options.data?.members ?? [];
  const chosenMembers = crewMembers.filter((m) => members[m.person.userId]);
  const leaderComes = chosenMembers.some((m) => m.isLeader);
  const needSeen = slot !== null && (mode === "solo" || leaderComes);
  // Tant que le créneau n'est pas lu, on ne sait pas s'il faut cocher « J'ai vu » : pas d'envoi (sauf crew sans le chef).
  const ready =
    (contextReady || (mode === "crew" && !leaderComes)) &&
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
          followStructure: followOn && !alreadyFollowing,
          newsletterOptIn: newsletter,
          // Accompagnants : absents de l'artefact, le champ n'est plus envoyé (relecture C2b).
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
          // La précision part comme note d'arrivée du chef s'il vient avec un créneau, sinon comme mot pour l'équipe.
          message: leaderComes && slot ? null : note.trim().slice(0, 120) || null,
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
  const follow = () => {
    closeAll();
    router.push({ pathname: "/crew/inscription", params: { event: e.slug } });
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
          <Monogram size={120} />
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
          {/* Lot R6c (R6.5) : « Invite du monde à venir », trois visages et « Inviter » ; fermée, elle ne revient pas. */}
          {onInvite ? (
            <AfterInviteCard
              eventId={e.id}
              onInvite={() => {
                closeAll();
                onInvite();
              }}
            />
          ) : null}
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
          {done.crew !== null ? (
            <SmButton kind="g" icon="list" onPress={follow} testID="cand-crew-follow-done">
              Suivre les confirmations du crew
            </SmButton>
          ) : null}
        </View>
      ) : (
        <View style={styles.stack} testID="cand-sheet">
          {crew ? (
            <Seg
              cmode
              testID="cand-mode"
              value={mode}
              onChange={setMode}
              options={[
                ...(soloAllowed ? [{ value: "solo" as const, label: "Seul", icon: "profile" as const }] : []),
                {
                  value: "crew",
                  label: `Avec ${crew.name}`,
                  lead: <CrewDot initials={initialsOf(crew.name).slice(0, 2)} size={22} />,
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
              {led.length > 1 ? (
                <ChipRow>
                  {led.map((x) => (
                    <Chip
                      key={x.id}
                      selected={x.id === crew.id}
                      onPress={() => {
                        setCrewId(x.id);
                        setMembers({});
                      }}
                    >
                      {x.name}
                    </Chip>
                  ))}
                </ChipRow>
              ) : null}
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
                      aria-checked={on}
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
              <SmButton kind="g" icon="list" onPress={follow} testID="cand-crew-follow">
                Suivre les inscriptions du crew
              </SmButton>
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
                      on
                        ? { backgroundColor: c.ground, borderColor: c.accent, borderWidth: 2 }
                        : { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1.5 },
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
                      {/* Nom entier, jamais coupé : il passe à la ligne. */}
                      <Text variant="posterS" color={c.ink} style={styles.vehName}>
                        {v.label}
                      </Text>
                      <Text variant="caption" color={c.inkMuted} style={styles.vehSmall}>
                        {noPhoto
                          ? "Ajoute au moins une photo pour candidater"
                          : [
                              ...v.categories.map((cat) => cat.label),
                              wanted.size > 0 && !match ? "hors des catégories, possible quand même" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </Text>
                      {v.id === mainVehicleId ? (
                        <View style={styles.fav} testID="cand-main">
                          <Icon name="star" size={12} color={c.accentText} />
                          <Text variant="caption" color={c.accentText} style={styles.favText}>
                            {mainVehicleLabels.candTag}
                          </Text>
                        </View>
                      ) : v.id === lastUsed ? (
                        // « Dernière utilisée » seulement si ce n'est pas le principal (R4.5b).
                        <View style={styles.fav} testID="cand-last-used">
                          <Icon name="wait" size={12} color={c.inkMuted} />
                          <Text variant="caption" color={c.inkMuted} style={styles.favText}>
                            {mainVehicleLabels.lastUsed}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View
                      style={[styles.ck, on ? { backgroundColor: c.accent } : { borderWidth: 2, borderColor: c.line }]}
                      testID={on ? "cand-checked" : undefined}
                    >
                      {on ? <Icon name="check" size={16} strokeWidth={3} color={c.accentInk} /> : null}
                    </View>
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
              aria-checked={seen}
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
            aria-checked={rules}
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

          {mode === "solo" && !alreadyFollowing ? (
            <CaseRow
              on={followOn}
              onToggle={() => setFollowOn((f) => !f)}
              title={`Suivre ${e.structure.name}`}
              hint="Ses prochains événements dans ton fil"
              testID="cand-follow"
            />
          ) : null}
          {mode === "solo" ? (
            <CaseRow
              on={newsletter}
              onToggle={() => setNewsletter((n) => !n)}
              title="Recevoir la newsletter d'Orasso"
              hint="Un e-mail de temps en temps, désinscription en un clic"
              testID="cand-newsletter"
            />
          ) : null}

          <TextField
            label="Une précision pour l'équipe ? (facultatif)"
            value={note}
            onChangeText={setNote}
            maxLength={slot && (mode === "solo" || leaderComes) ? ARRIVAL_NOTE_MAX : 120}
            placeholder="ex. J'arriverai vers 19 h 30 à cause du travail"
            multiline
            testID="arrival-note"
          />

          <View style={styles.hint}>
            <Icon name="alert" size={16} color={c.inkMuted} />
            <Text variant="caption" color={c.inkMuted} style={styles.grow}>
              Un empêchement ? Préviens depuis Sorties : ta place ira à la liste d'attente.
            </Text>
          </View>
          {error || contextError ? (
            <Text variant="caption" color={c.winText} accessibilityRole="alert" testID="cand-error">
              {error ?? contextError}
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

/** `.cm-row` de la maquette 4.4 : une case à cocher sur une ligne de carte, un titre et une aide. */
function CaseRow({
  on,
  onToggle,
  title,
  hint,
  testID,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
  hint: string;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={`${title}. ${hint}`}
      onPress={onToggle}
      style={[styles.caseRow, { backgroundColor: c.surface }]}
      testID={testID}
    >
      <CheckBox on={on} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink} style={styles.caseTitle}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.caseHint}>
          {hint}
        </Text>
      </View>
    </Pressable>
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
  // `.cveh` (maquette 4.4) : photo carrée de 84 px, nom entier, coche ronde de 26 px.
  candVeh: { flexDirection: "row", alignItems: "center", gap: space3, padding: space2, borderRadius: 16 },
  cvPh: { width: 84, height: 84, borderRadius: 11, overflow: "hidden" },
  vehName: { fontSize: 14, lineHeight: 15 },
  vehSmall: { fontSize: 12, lineHeight: 16, marginTop: space1 },
  fav: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: space1 },
  favText: { fontSize: 11, lineHeight: 14, fontFamily: "Archivo-ExtraBold" },
  ck: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  caseRow: { flexDirection: "row", alignItems: "center", gap: space2 + 2, padding: space3, borderRadius: 12 },
  caseTitle: { fontSize: 13.5, lineHeight: 18, fontFamily: "Archivo-ExtraBold" },
  caseHint: { fontSize: 11.5, lineHeight: 15 },
  seen: { flexDirection: "row", alignItems: "flex-start", gap: space3, padding: space3 + 2, borderRadius: 16 },
  seenCheck: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  rulesRow: { flexDirection: "row", alignItems: "center", gap: space3 },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: space1 + 2 },
  done: { alignItems: "center", gap: space2 + 2, paddingVertical: space2 + 2 },
  center: { textAlign: "center" },
});
