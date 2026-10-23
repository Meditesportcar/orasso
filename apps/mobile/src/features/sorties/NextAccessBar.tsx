// Accès flottant (lot 43 ; lot C1 : `.near` de l'artefact DA v2). Une carte affiche (crème en Béton, noire en Sable)
// posée au-dessus de la barre d'onglets flottante : « J-6 / sam. », le titre en italique, la ligne « Retenue · Sam. 24 ·
// 18 h 30 » et le bouton moutarde « QR », qui ouvre l'écran du jour J. Masquée sur Accueil et Sorties (l'accès y est
// déjà en tête), sur le Garage et le Profil (lot M5) et sur tout écran de flux. Elle apparaît de J-7 à J+1 pour un accès (candidature retenue, billet, mission staff,
// accréditation) ; jamais sur l'écran du jour J ni en mode staff (ce sont des écrans plein cadre, hors de la barre
// d'onglets). Aucun néon : le seul de l'écran est celui de son bouton principal.
//
// Les données sont celles que le téléphone garde déjà (candidatures lisibles hors ligne) ; billets et missions staff sont
// rechargés à chaque changement d'onglet, sans bruit si le réseau manque.

import { archivoAt, Icon, Text, useTheme } from "@orasso/design-system/native";
import { nextAccessBarLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { dayCountdown, formatHour } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useNow } from "@/lib/useNow";
import { type AccessItem, applicationAccesses, barDay, nextAccessOf, staffAccesses, ticketAccesses } from "./model";

/**
 * Onglets sans accès flottant : ceux où l'artefact ne le montre pas (`.app.no-near` : Accueil et Sorties, l'accès y
 * est déjà en tête), depuis le lot M4 l'Explorer (la bascule « Liste | Carte » y flotte, maquette 3.1), et depuis le
 * lot M5 le Garage et le Profil (retours 30 et 31 : il n'y a rien à faire). L'exposant ne l'a donc plus sur aucun de
 * ses onglets ; le visiteur (Passeport), le prestataire et le média le gardent sur les leurs.
 */
const NO_NEAR = new Set(["home", "outings", "explore", "garage", "profile"]);

/** Nature de l'accès, en tête de la ligne d'information. */
const KIND_LABEL: Record<AccessItem["kind"], string> = {
  application: "Retenue",
  ticket: "Billet",
  staff: "Staff",
  accreditation: "Accréditée",
  mission: "Mission",
};

const KINDS = new Set(["fan", "visitor", "provider", "media"]);

type Extra = { tickets: Parameters<typeof ticketAccesses>[0]; staff: Parameters<typeof staffAccesses>[0] };

/** Les accès de la casquette qui ne viennent pas des candidatures : billets, missions staff, mission, accréditation. */
function useExtraAccesses(kind: string, routeKey: string | undefined, now: Date): AccessItem[] {
  const [extra, setExtra] = useState<Extra>({ tickets: null, staff: null });
  const [role, setRole] = useState<AccessItem | null>(null);
  const lastRole = useRef(0);
  const load = useCallback(async () => {
    if (kind === "fan" || kind === "visitor") {
      const [tickets, staff] = await Promise.all([
        api.myTickets().catch(() => null),
        api.staffEvents().catch(() => null),
      ]);
      setExtra({ tickets, staff });
    } else {
      // Lecture légère : les blocs du profil seulement (ni sources externes ni sponsorisé), et au plus une par minute.
      if (Date.now() - lastRole.current < 60_000) return;
      lastRole.current = Date.now();
      const home = await api
        .homeData({ persona: kind === "provider" ? "provider" : "media", light: "1" })
        .catch(() => null);
      const item = home?.provider?.nextMission ?? home?.media?.nextReport ?? null;
      setRole(
        item && item.status === "accepted"
          ? {
              key: `${kind}-${item.applicationId}`,
              kind: kind === "provider" ? "mission" : "accreditation",
              startsAt: item.event.startsAt,
              endsAt: item.event.endsAt,
              title: item.event.title,
              // Le ticket du prestataire et le badge presse vivent dans leurs onglets (lots 54 et 55).
              href: kind === "provider" ? "/candidatures" : "/presse",
            }
          : null,
      );
    }
  }, [kind]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on recharge à chaque changement d'onglet (`routeKey`).
  useEffect(() => {
    void load();
  }, [load, routeKey]);
  return useMemo(
    () => [...ticketAccesses(extra.tickets, now), ...staffAccesses(extra.staff, now), ...(role ? [role] : [])],
    [extra, role, now],
  );
}

export function NextAccessBar({ routeKey, tabId }: { routeKey?: string; tabId?: string }) {
  const { persona } = usePersona();
  if (!KINDS.has(persona.kind) || (tabId && NO_NEAR.has(tabId))) return null;
  return <Bar kind={persona.kind} routeKey={routeKey} />;
}

function Bar({ kind, routeKey }: { kind: string; routeKey?: string }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const now = useNow(60_000);
  const { upcoming } = useApplications();
  const extra = useExtraAccesses(kind, routeKey, now);
  const items = useMemo(
    () => [...(kind === "fan" || kind === "visitor" ? applicationAccesses(upcoming) : []), ...extra],
    [kind, upcoming, extra],
  );
  const next = nextAccessOf(items, now);
  if (!next) return null;
  const countdown = dayCountdown(next.startsAt, now);
  const [weekday] = barDay(next.startsAt).split(" ");
  const info = `${KIND_LABEL[next.kind]} · ${barDay(next.startsAt)} · ${formatHour(next.startsAt)}`;
  const line = nextAccessBarLabels.line(barDay(next.startsAt), next.title, countdown);
  return (
    <Pressable
      onPress={() => router.push(next.href as never)}
      accessibilityRole="button"
      accessibilityLabel={`${nextAccessBarLabels.open} : ${line}`}
      testID="next-access-bar"
      style={[styles.near, { backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster }]}
    >
      <View style={styles.nd}>
        <Text variant="body" color={c.posterInk} style={styles.ndBig}>
          {countdown}
        </Text>
        <Text variant="body" color={c.posterInk} style={styles.ndSmall}>
          {weekday}
        </Text>
      </View>
      <View style={styles.nt}>
        <Text variant="posterS" color={c.posterInk} numberOfLines={2} style={styles.ntTitle}>
          {next.title}
        </Text>
        <Text variant="body" color={c.posterMuted} numberOfLines={1} style={styles.ntInfo}>
          {info}
        </Text>
      </View>
      <View style={[styles.nq, { backgroundColor: c.accent }]}>
        <Icon name={next.kind === "ticket" ? "ticket" : "qr"} size={16} color={c.accentInk} />
        <Text variant="body" color={c.accentInk} style={styles.nqText}>
          QR
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `.near` : 18 px des bords, rayon 16, au-dessus de la barre d'onglets.
  near: {
    marginHorizontal: 18,
    marginBottom: -12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 16,
  },
  nd: { alignItems: "center", minWidth: 44 },
  ndBig: { fontFamily: archivoAt(62, 800), fontSize: 28, lineHeight: 26 },
  ndSmall: {
    fontFamily: archivoAt(75, 700),
    fontSize: 9.5,
    lineHeight: 12,
    letterSpacing: 0.76,
    textTransform: "uppercase",
  },
  nt: { flex: 1, minWidth: 0 },
  ntTitle: { fontSize: 13, lineHeight: 14 },
  ntInfo: { fontSize: 12, lineHeight: 16 },
  nq: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nqText: { fontFamily: archivoAt(115, 900), fontSize: 12, lineHeight: 14, textTransform: "uppercase" },
});
