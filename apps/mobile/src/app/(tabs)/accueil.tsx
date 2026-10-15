// Accueil : un tableau de bord, jamais un fil. « Prochain accès » en tête (bouton vers le mode jour J), puis les
// compteurs, l'agenda de mes dates et une seule incitation à la fois. Les widgets avancés (autour de moi, météo,
// lavage et carburant) sont hors du lot 09.
import { applicationStatusLabels, gradeLabels, type MyApplication } from "@orasso/shared";
import { Button, Counters, Plate, PosterCard, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useApplications } from "@/lib/applications";
import { breakTitle, formatDay, formatHour, formatShortDate, relativeDay } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/useNow";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function Accueil() {
  const { t } = useTheme();
  const router = useRouter();
  const now = useNow();
  const { me } = useSession();
  const { upcoming, offline, reload } = useApplications();

  const next: MyApplication | undefined =
    upcoming?.find((a) => a.status === "accepted") ??
    upcoming?.find((a) => a.status === "pending" || a.status === "waitlisted" || a.status === "offered");
  const pendingCount = upcoming?.filter((a) => a.status === "pending").length ?? 0;
  const retainedCount = upcoming?.filter((a) => a.status === "accepted").length ?? 0;
  const profile = me?.profile;

  return (
    <TabScreen home onRefresh={reload}>
      {offline ? <Notice>Hors ligne : voici ce que ton téléphone a gardé.</Notice> : null}

      {next ? (
        <PosterCard
          label={
            next.status === "accepted"
              ? `Prochain accès · ${relativeDay(next.event.startsAt, now)}`
              : "Candidature en cours"
          }
          title={breakTitle(next.event.title)}
          facts={`${formatDay(next.event.startsAt)} · ${formatHour(next.event.startsAt)}${next.zone ? ` · Zone ${next.zone.code}` : ""}`}
          photo={{ placeholder: `linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)` }}
          status={next.status === "accepted" ? "retained" : "pending"}
          action={
            next.status === "accepted"
              ? { label: "Mode jour J", icon: "qr", next: true, onPress: () => router.push(`/jour-j/${next.id}`) }
              : { label: "Voir mes accès", icon: "wait", next: true, onPress: () => router.navigate("/acces") }
          }
        />
      ) : (
        <Plate style={styles.incitation}>
          <Text variant="posterM" color={t.color.plateInk}>
            {me?.counts.vehicles ? "Trouve ton prochain événement" : "Ajoute ton premier véhicule"}
          </Text>
          <Text variant="body" color={t.color.plateMuted}>
            {me?.counts.vehicles
              ? "Rassemblements, expositions, cars & coffee : candidate avec l'un de tes véhicules."
              : "Ton garage, c'est toi. Tu auras besoin d'un véhicule pour candidater."}
          </Text>
          <Button
            variant="primary"
            icon={me?.counts.vehicles ? "explore" : "add"}
            onPress={() => (me?.counts.vehicles ? router.navigate("/explorer") : router.push("/vehicule/nouveau"))}
            fullWidth
          >
            {me?.counts.vehicles ? "Explorer les événements" : "Ajouter un véhicule"}
          </Button>
        </Plate>
      )}

      <Counters
        items={[
          { value: pendingCount, label: "En attente" },
          { value: retainedCount, label: "Retenues" },
          { value: profile?.pointsSeason ?? 0, label: profile ? `Pts · ${gradeLabels[profile.grade]}` : "Points" },
        ]}
      />

      <SectionTitle>Agenda</SectionTitle>
      {upcoming && upcoming.length > 0 ? (
        <Plate style={styles.agenda}>
          {upcoming.slice(0, 6).map((a) => (
            <View key={a.id} style={styles.agendaLine}>
              <Text variant="meta" color={a.status === "accepted" ? t.color.accent : t.color.plateMuted} style={styles.agendaDate}>
                {formatShortDate(a.event.startsAt)}
              </Text>
              <Text variant="body" color={t.color.plateInk} style={styles.agendaTitle}>
                {a.event.title} · {applicationStatusLabels[a.status].toLowerCase()}
              </Text>
            </View>
          ))}
        </Plate>
      ) : (
        <Text variant="body" color={t.color.inkMuted}>
          Tes dates apparaîtront ici dès que tu auras candidaté.
        </Text>
      )}

      {next ? (
        <Button variant="secondary" icon="explore" onPress={() => router.navigate("/explorer")} fullWidth>
          Explorer les événements
        </Button>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  incitation: { gap: space2, padding: space3 },
  agenda: { gap: space1 },
  agendaLine: { flexDirection: "row", gap: space3, alignItems: "baseline", paddingVertical: space1 },
  agendaDate: { width: 56 },
  agendaTitle: { flex: 1 },
});
