// Accès flottant (lot 43, prototype `s-sorties` : « ton accès urgent flotte au-dessus de la barre sur tous les onglets dès
// J-7 »). Une fine barre posée juste au-dessus de la barre d'onglets : « Sam. 24 · Nocturne de Canet · J-6 », qui ouvre
// l'écran du jour J. Elle apparaît de J-7 à J+1 pour un accès (candidature retenue, billet, mission staff,
// accréditation) ; jamais sur l'écran du jour J ni en mode staff (ce sont des écrans plein cadre, hors de la barre
// d'onglets). Aucun néon : le seul de l'écran est celui de son bouton principal.
//
// Les données sont celles que le téléphone garde déjà (candidatures lisibles hors ligne) ; billets et missions staff sont
// rechargés à chaque changement d'onglet, sans bruit si le réseau manque.

import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { nextAccessBarLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { dayCountdown } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useNow } from "@/lib/useNow";
import { type AccessItem, applicationAccesses, barDay, nextAccessOf, staffAccesses, ticketAccesses } from "./model";

const { space2, space3 } = tokens.spacing;

const KINDS = new Set(["fan", "visitor", "provider", "media"]);

type Extra = { tickets: Parameters<typeof ticketAccesses>[0]; staff: Parameters<typeof staffAccesses>[0] };

/** Les accès de la casquette qui ne viennent pas des candidatures : billets, missions staff, mission, accréditation. */
function useExtraAccesses(kind: string, routeKey: string | undefined, now: Date): AccessItem[] {
  const [extra, setExtra] = useState<Extra>({ tickets: null, staff: null });
  const [role, setRole] = useState<AccessItem | null>(null);
  const load = useCallback(async () => {
    if (kind === "fan" || kind === "visitor") {
      const [tickets, staff] = await Promise.all([
        api.myTickets().catch(() => null),
        api.staffEvents().catch(() => null),
      ]);
      setExtra({ tickets, staff });
    } else {
      const home = await api.homeData({ persona: kind === "provider" ? "provider" : "media" }).catch(() => null);
      const item = home?.provider?.nextMission ?? home?.media?.nextReport ?? null;
      setRole(
        item && item.status === "accepted"
          ? {
              key: `${kind}-${item.applicationId}`,
              kind: kind === "provider" ? "mission" : "accreditation",
              startsAt: item.event.startsAt,
              endsAt: item.event.startsAt,
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

export function NextAccessBar({ routeKey }: { routeKey?: string }) {
  const { persona } = usePersona();
  if (!KINDS.has(persona.kind)) return null;
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
  const line = nextAccessBarLabels.line(barDay(next.startsAt), next.title, dayCountdown(next.startsAt, now));
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push(next.href as never)}
        accessibilityRole="button"
        accessibilityLabel={`${nextAccessBarLabels.open} : ${line}`}
        testID="next-access-bar"
        style={[styles.bar, { backgroundColor: c.surfaceRaised, borderColor: c.plateLine }]}
      >
        <Icon name={next.kind === "ticket" ? "ticket" : "qr"} size={18} color={c.ink} />
        <Text variant="meta" color={c.ink} style={styles.line} numberOfLines={1}>
          {line}
        </Text>
        <Icon name="next" size={18} color={c.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space3, paddingBottom: space2 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    minHeight: 44,
    paddingHorizontal: space3,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  line: { flex: 1 },
});
