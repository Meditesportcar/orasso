// Onglet « Membres » du crew (lot R7b2, maquette R7.11 `ct_mem`) : les demandes (chef), les membres, « Inviter quelqu'un »,
// « Quitter le crew ». Toucher un membre ouvre sa fiche : ses voitures (l'ancien « Garage du crew », D38) et son profil.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CrewGarageVehicle,
  type CrewMemberView,
  type CrewPendingView,
  type CrewView,
  crewLabels,
  crewPageLabels as L,
  crewTabLabels as T,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { CrewSecHead, GarageTile, MemberRow, memberCaption, RequestCard } from "../page/parts";
import { carsOf } from "./crewTabModel";

const { space2, space3 } = tokens.spacing;

/** Les voitures en deux colonnes. */
function pairs<V>(items: readonly V[]): V[][] {
  const out: V[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

/** La fiche d'un membre : son pseudo, son rôle, ses voitures et son profil. */
function MemberSheet({
  member,
  cars,
  onClose,
}: {
  member: CrewMemberView | null;
  cars: readonly CrewGarageVehicle[];
  onClose: () => void;
}) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <AppSheet visible={member !== null} onClose={onClose} accessibilityLabel={member?.pseudo ?? ""}>
      {member ? (
        <View style={styles.sheet} testID="crew-member-sheet">
          <View style={styles.who}>
            <Avatar url={member.avatarUrl} pseudo={member.pseudo} size={48} />
            <View style={styles.grow}>
              <Text variant="posterM" color={t.color.ink} accessibilityRole="header">
                {member.pseudo}
              </Text>
              <Text variant="caption" color={t.color.inkMuted}>
                {member.role === "leader" ? L.roleLeader : memberCaption(member)}
              </Text>
            </View>
          </View>
          <CrewSecHead title={T.memberCars} hint={T.memberCarsCount(cars.length)} />
          {cars.length === 0 ? <Muted variant="body">{T.memberCarsEmpty}</Muted> : null}
          <View testID="crew-member-cars" style={styles.sheet}>
            {pairs(cars).map((row) => (
              <View key={row.map((g) => g.id).join("-")} style={styles.grid}>
                {row.map((g) => (
                  <GarageTile
                    key={g.id}
                    vehicle={g}
                    onPress={() => {
                      onClose();
                      router.push(`/v/${g.id}`);
                    }}
                  />
                ))}
                {row.length === 1 ? <View style={styles.grow} /> : null}
              </View>
            ))}
          </View>
          <SmButton
            kind="s"
            big
            wide
            icon="profile"
            onPress={() => {
              onClose();
              router.push(`/u/${encodeURIComponent(member.pseudo)}`);
            }}
            testID="crew-member-profile"
          >
            {T.memberProfile}
          </SmButton>
        </View>
      ) : null}
    </AppSheet>
  );
}

export function CrewMembers({
  crew,
  members,
  garage,
  requests,
  leader,
  live,
  busy,
  onInvite,
  onAccept,
  onDecline,
  onLeave,
}: {
  crew: CrewView;
  members: readonly CrewMemberView[] | null;
  garage: readonly CrewGarageVehicle[];
  requests: readonly CrewPendingView[];
  leader: boolean;
  live: boolean;
  busy: boolean;
  onInvite: () => void;
  onAccept: (userId: string) => void;
  onDecline: (userId: string) => void;
  onLeave: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<CrewMemberView | null>(null);
  return (
    <View style={styles.sheet} testID="crew-members">
      {leader && requests.length > 0 ? (
        <>
          <CrewSecHead title={L.requestsTitle} hint={L.requestsHint} />
          {requests.map((r) => (
            <RequestCard
              key={r.person.userId}
              request={r}
              busy={busy}
              onOpen={() => router.push(`/u/${encodeURIComponent(r.person.pseudo)}`)}
              onAccept={() => onAccept(r.person.userId)}
              onDecline={() => onDecline(r.person.userId)}
            />
          ))}
        </>
      ) : null}
      <CrewSecHead title={L.membersTitle} hint={String(members?.length ?? crew.membersCount)} />
      {(members ?? []).map((m) => (
        <MemberRow
          key={m.userId}
          pseudo={m.pseudo}
          avatarUrl={m.avatarUrl}
          caption={memberCaption(m)}
          leader={m.role === "leader"}
          onPress={() => setOpen(m)}
        />
      ))}
      {/* Lot R6c (R6.7) : « Inviter quelqu'un » pour tout membre (chef compris). */}
      {live ? (
        <SmButton kind={leader ? "s" : "p"} big wide icon="add" onPress={onInvite} testID="crew-invite-someone">
          {L.inviteSomeone}
        </SmButton>
      ) : null}
      {crew.viewerState === "member" ? (
        <SmButton kind="g" icon="undo" disabled={busy} onPress={onLeave} testID="crew-leave">
          {crewLabels.leave}
        </SmButton>
      ) : null}
      <MemberSheet member={open} cars={open ? carsOf(garage, open.pseudo) : []} onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: space3 },
  who: { flexDirection: "row", alignItems: "center", gap: space3 },
  grow: { flex: 1, minWidth: 0 },
  grid: { flexDirection: "row", gap: space2 + 2 },
});
