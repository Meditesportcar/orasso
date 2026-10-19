// Candidater, en trois écrans : 1 le ou les véhicules, 2 le règlement (et, si besoin, accompagnants et un mot),
// 3 le récapitulatif avec « Suivre l'organisateur » et la newsletter. À l'envoi, la demande d'autorisation des
// notifications est proposée (docs/01 : « juste après une candidature »).

import {
  Button,
  CheckboxField,
  Chip,
  ChipRow,
  Photo,
  Plate,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { eventDaysLabels, formatDayDate, type MyApplication, type VehicleFull } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ArrivalSeen, arrivalBody } from "@/features/arrival/ArrivalSeen";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { NotificationAsk } from "@/ui/NotificationAsk";
import { plateText } from "@/ui/plateText";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function Candidater() {
  const { t } = useTheme();
  const router = useRouter();
  const { slug, jour } = useLocalSearchParams<{ slug: string; jour?: string }>();
  const { reload, markAnnounced } = useApplications();
  const event = useApi(() => api.eventBySlug(slug), [slug]);
  const vehicles = useApi(() => api.vehicles(), []);
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  // Lot 47 : « J'ai vu » l'horaire d'arrivée des exposants (obligatoire s'il existe) et une note facultative.
  const [arrivalSeen, setArrivalSeen] = useState(false);
  const [arrivalNote, setArrivalNote] = useState("");
  const [companions, setCompanions] = useState(0);
  const [message, setMessage] = useState("");
  const [follow, setFollow] = useState(true);
  const [newsletter, setNewsletter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MyApplication[] | null>(null);
  // Lot 26 : jour choisi (`undefined` = pas encore touché : celui du lien, sinon le premier possible).
  const [dayChoice, setDayChoice] = useState<string | null | undefined>(undefined);

  const e = event.data;
  const wanted = useMemo(() => new Set(e?.criteria?.categoryIds ?? []), [e]);
  const eligible = useMemo(() => {
    const active = (vehicles.data ?? []).filter((v) => v.status === "active");
    const score = (v: VehicleFull) => v.categories.some((c) => wanted.has(c.id));
    // Ceux qui collent aux catégories recherchées passent en premier.
    return [...active].sort((a, b) => Number(score(b)) - Number(score(a)));
  }, [vehicles.data, wanted]);
  const chosen = eligible.filter((v) => picked.includes(v.id));
  const limit = e?.maxVehiclesPerUser ?? 1;

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/e/${slug}`));

  if (!e) {
    return (
      <FlowScreen title="Candidater" onClose={close}>
        {event.error ? <Notice tone="error">{event.error.message}</Notice> : <Muted variant="body">Chargement…</Muted>}
      </FlowScreen>
    );
  }

  // Plusieurs jours (lot 26) : « Tout l'événement » et/ou un jour, selon le mode d'accès de l'organisateur.
  const taken = (e.myApplications ?? [])
    .filter((a) => ["pending", "accepted", "waitlisted", "offered"].includes(a.status))
    .map((a) => a.eventDayId);
  const dayChoices: { id: string | null; label: string; full: boolean; mine: boolean }[] =
    (e.days?.length ?? 0) > 1
      ? [
          ...(e.dayAccess !== "per_day"
            ? [
                {
                  id: null,
                  label: eventDaysLabels.wholeEvent,
                  full: (e.days ?? []).some((d) => d.remaining === 0),
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
          dayChoices.find((c) => c.id === jour && !c.full && !c.mine) ??
          dayChoices.find((c) => !c.full && !c.mine) ??
          dayChoices[0]
        )?.id ?? null);

  const toggle = (id: string) =>
    setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < limit ? [...ids, id] : ids));

  async function send() {
    if (!e) return;
    setBusy(true);
    setError(null);
    try {
      const apps = await api.apply(e.id, {
        vehicleIds: picked,
        rulesAccepted: true,
        followStructure: follow,
        newsletterOptIn: newsletter,
        companions,
        message: message.trim() || null,
        eventDayId: (e.days?.length ?? 0) > 1 ? dayId : undefined,
        ...arrivalBody(e.arrivals?.exhibitors, arrivalSeen, arrivalNote),
      });
      // Une admission sans sélection est une retenue d'office : annoncée ici, pas une deuxième fois ensuite.
      markAnnounced(apps.filter((a) => a.status === "accepted").map((a) => a.id));
      setResult(apps);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const retained = result?.some((a) => a.status === "accepted") ?? false;
  const footer =
    step === 1 ? (
      <Button variant="primary" icon="next" disabled={chosen.length === 0} onPress={() => setStep(2)} fullWidth>
        Continuer
      </Button>
    ) : step === 2 ? (
      <Button
        variant="primary"
        icon="next"
        disabled={!rulesAccepted || (Boolean(e?.arrivals?.exhibitors) && !arrivalSeen)}
        onPress={() => setStep(3)}
        fullWidth
      >
        Continuer
      </Button>
    ) : (
      <>
        {error ? (
          <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button variant="primary" icon="check" loading={busy} onPress={() => void send()} fullWidth>
          Envoyer ma candidature
        </Button>
      </>
    );

  return (
    <FlowScreen
      title="Candidater"
      facts={e.title}
      counter={`${step} / 3`}
      onClose={step > 1 && !result ? () => setStep(step - 1) : close}
      footer={footer}
      overlays={
        <ResultSheet
          result={result}
          retained={retained}
          onClose={close}
          onAccess={() => {
            setResult(null);
            router.navigate("/acces");
          }}
        />
      }
    >
      {step === 1 ? (
        <>
          <Text variant="posterL" color={t.color.ink}>
            {"Avec quel\nvéhicule ?"}
          </Text>
          <Muted variant="body">
            Ceux qui collent aux catégories recherchées sont en premier. Limite : {limit} par personne pour cet
            événement.
          </Muted>
          {dayChoices.length > 0 ? (
            <View style={styles.days} testID="apply-day-choice">
              <Text variant="label" color={t.color.ink}>
                {eventDaysLabels.chooseDay}
              </Text>
              <ChipRow>
                {dayChoices.map((c) => (
                  <Chip key={c.id ?? "whole"} selected={dayId === c.id} onPress={() => setDayChoice(c.id)}>
                    {c.mine
                      ? `${c.label} · ${eventDaysLabels.alreadyApplied}`
                      : c.full
                        ? `${c.label} · ${eventDaysLabels.dayFull}`
                        : c.label}
                  </Chip>
                ))}
              </ChipRow>
            </View>
          ) : null}
          {vehicles.loading ? <Muted variant="body">Chargement de ton garage…</Muted> : null}
          {eligible.map((v) => {
            const on = picked.includes(v.id);
            const match = v.categories.some((c) => wanted.has(c.id));
            // L'API exige une photo pour candidater : sans elle, on renvoie vers la fiche du véhicule.
            const noPhoto = v.photos.length === 0;
            return (
              <Pressable
                key={v.id}
                accessibilityRole={noPhoto ? "link" : "checkbox"}
                accessibilityState={noPhoto ? undefined : { checked: on }}
                accessibilityLabel={v.label}
                onPress={() => (noPhoto ? router.push(`/vehicule/${v.id}`) : toggle(v.id))}
              >
                <Plate
                  style={[styles.vehicle, on && { borderColor: t.color.accent, boxShadow: t.shadow.neonAccentSoft }]}
                >
                  <Photo
                    source={mediaSource(v.photos[0]?.url)}
                    placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
                    cut="thumb"
                    style={styles.thumb}
                  />
                  <View style={styles.vehicleBody}>
                    <Text variant="posterM" color={t.color.plateInk}>
                      {v.label}
                    </Text>
                    <Text variant="meta" color={t.color.plateMuted}>
                      {[v.year, v.powerHp ? `${v.powerHp} ch` : null].filter(Boolean).join(" · ")}
                      {wanted.size > 0 && !match ? " · hors des catégories, possible quand même" : ""}
                    </Text>
                    {noPhoto ? (
                      <Text variant="meta" color={plateText.accent}>
                        Ajoute au moins une photo pour candidater →
                      </Text>
                    ) : null}
                    <ChipRow>
                      {v.categories.map((c) => (
                        <Chip key={c.id} surface="plate" lit={wanted.has(c.id)}>
                          {c.label}
                        </Chip>
                      ))}
                    </ChipRow>
                  </View>
                  {noPhoto ? null : (
                    <View
                      style={[
                        styles.check,
                        {
                          borderColor: on ? t.color.accent : t.color.plateLine,
                          backgroundColor: on ? t.color.accent : "transparent",
                        },
                      ]}
                    />
                  )}
                </Plate>
              </Pressable>
            );
          })}
          {!vehicles.loading && eligible.length === 0 ? (
            <Notice>Ton garage n'a pas encore de véhicule actif : ajoute celui avec lequel tu viens.</Notice>
          ) : null}
          <Button variant="secondary" icon="add" onPress={() => router.push("/vehicule/nouveau")} fullWidth>
            Ajouter un véhicule au garage
          </Button>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Text variant="posterL" color={t.color.ink}>
            {"Règlement\nde l'événement"}
          </Text>
          <Plate style={styles.rules}>
            <Text variant="body" color={t.color.plateInk}>
              {e.rulesText ??
                "L'organisateur n'a pas ajouté de règlement particulier : respecte le voisinage, roule au pas, aucun burn."}
            </Text>
          </Plate>
          <CheckboxField
            label="J'ai lu le règlement de l'événement et je l'accepte."
            checked={rulesAccepted}
            onChange={setRulesAccepted}
          />
          <ArrivalSeen
            slot={e.arrivals?.exhibitors}
            seen={arrivalSeen}
            onSeen={setArrivalSeen}
            note={arrivalNote}
            onNote={setArrivalNote}
          />
          {e.maxVehiclesPerUser >= 1 ? (
            <Plate style={styles.rules}>
              <Text variant="label" color={t.color.plateMuted}>
                Avec toi (accompagnants)
              </Text>
              <View style={styles.stepper}>
                <Button
                  variant="plate"
                  icon="close"
                  disabled={companions === 0}
                  onPress={() => setCompanions((n) => Math.max(0, n - 1))}
                >
                  Moins
                </Button>
                <Text variant="number" color={t.color.plateInk}>
                  {companions}
                </Text>
                <Button
                  variant="plate"
                  icon="add"
                  disabled={companions >= 9}
                  onPress={() => setCompanions((n) => Math.min(9, n + 1))}
                >
                  Plus
                </Button>
              </View>
              <TextField
                label="Un mot pour l'équipe organisatrice (facultatif)"
                value={message}
                onChangeText={setMessage}
                maxLength={120}
                help={`${message.length} / 120`}
              />
            </Plate>
          ) : null}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Text variant="posterL" color={t.color.ink}>
            On envoie ?
          </Text>
          <Plate style={styles.recap}>
            <Line k="Événement" v={e.title} />
            <Line k="Quand" v={formatDayHour(e.startsAt)} />
            <Line k={chosen.length > 1 ? "Véhicules" : "Véhicule"} v={chosen.map((v) => v.label).join("\n")} />
            <Line
              k="Plaque"
              v={chosen.map((v) => v.plate ?? "non immatriculé").join("\n")}
              hint="visible par l'équipe organisatrice seulement"
            />
            <Line
              k="Avec toi"
              v={companions === 0 ? "personne" : `${companions} accompagnant${companions > 1 ? "s" : ""}`}
            />
            <Line
              k="Réponse"
              v={e.admission === "open" ? "Retenue d'office" : "Par l'équipe organisatrice · tu seras notifié"}
              last
            />
          </Plate>
          <CheckboxField
            label={`Suivre ${e.structure.name} : être prévenu de ses prochains événements.`}
            checked={follow}
            onChange={setFollow}
          />
          <CheckboxField label="Recevoir la newsletter d'Orasso." checked={newsletter} onChange={setNewsletter} />
          <Muted variant="caption">
            Ta candidature n'est visible que de l'équipe organisatrice. Tu peux te désister depuis l'onglet Accès.
          </Muted>
        </>
      ) : null}
    </FlowScreen>
  );
}

function ResultSheet({
  result,
  retained,
  onClose,
  onAccess,
}: {
  result: MyApplication[] | null;
  retained: boolean;
  onClose: () => void;
  onAccess: () => void;
}) {
  const { t } = useTheme();
  return (
    <AppSheet visible={Boolean(result)} onClose={onClose} accessibilityLabel="Candidature envoyée">
      <Text variant="title" color={t.color.ink}>
        {retained ? "Tu es retenu" : "Candidature envoyée"}
      </Text>
      <Muted variant="body">
        {retained
          ? "L'événement est sans sélection : ta place est réservée. Ta carte d'accès t'attend dans l'onglet Accès."
          : "L'organisateur te répond au fil des candidatures. Tu seras notifié dès qu'il aura décidé."}
      </Muted>
      <NotificationAsk reason="Active les notifications pour recevoir la réponse tout de suite, même appli fermée." />
      <Button variant="primary" icon="qr" next onPress={onAccess} fullWidth>
        Voir mes accès
      </Button>
      <Button variant="plate" icon="back" onPress={onClose} fullWidth>
        Retour à l'événement
      </Button>
    </AppSheet>
  );
}

function Line({ k, v, hint, last }: { k: string; v: string; hint?: string; last?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={[styles.line, !last && { borderBottomWidth: 1, borderBottomColor: t.color.plateLine }]}>
      <Text variant="meta" color={t.color.plateMuted} style={styles.lineKey}>
        {k}
      </Text>
      <View style={styles.lineValue}>
        <Text variant="bodyStrong" color={t.color.plateInk} style={styles.right}>
          {v}
        </Text>
        {hint ? (
          <Text variant="caption" color={t.color.plateMuted} style={styles.right}>
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  days: { gap: space2 },
  vehicle: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  thumb: { width: 76, height: 58, borderRadius: tokens.radius.radiusSm },
  vehicleBody: { flex: 1, gap: space1 },
  check: { width: 24, height: 24, borderRadius: tokens.radius.radiusSm, borderWidth: 2 },
  rules: { gap: space2, padding: space3 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  recap: { padding: space3, paddingVertical: space1 },
  line: { flexDirection: "row", gap: space3, paddingVertical: space3 },
  lineKey: { width: 80 },
  lineValue: { flex: 1, gap: 2 },
  right: { textAlign: "right" },
});
