// Casquette Organisateur, bannissements de la structure (lot 35a, décision D20) : la liste, l'ajout par pseudo avec un
// motif, la levée. Une personne bannie ne peut plus candidater aux événements de la structure (règle de l'API). Chaque
// geste passe par une feuille de confirmation. Seule l'équipe Orasso bannit de la plateforme.
import { Button, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { orgaManageLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { api, type StructureBan } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { isTwoFactorError } from "@/lib/orga";
import { banIssue, sortedBans } from "@/lib/teamModel";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { ConfirmSheet } from "./ConfirmSheet";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space2, space3 } = tokens.spacing;

export function BansScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { structureId, structureName } = useOrga();
  const bans = useApi(() => api.bans(structureId), [structureId]);
  const [pseudo, setPseudo] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [lifting, setLifting] = useState<StructureBan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const close = () => (router.canGoBack() ? router.back() : router.replace("/staff"));
  const list = sortedBans(bans.data ?? []);

  function askAdd() {
    const issue = banIssue(pseudo);
    if (issue) {
      setFieldError(issue);
      return;
    }
    setFieldError(undefined);
    setSheetError(null);
    setNotice(null);
    setAdding(true);
  }

  async function work(task: () => Promise<void>, message: string) {
    setBusy(true);
    setSheetError(null);
    try {
      await task();
      setAdding(false);
      setLifting(null);
      setError(null);
      setNotice(message);
      await bans.reload();
    } catch (e) {
      if (isTwoFactorError(e)) {
        setAdding(false);
        setLifting(null);
        setError(e);
      } else setSheetError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      title={L.bansTitle}
      facts={structureName}
      onClose={close}
      onRefresh={async () => {
        await bans.reload();
      }}
      overlays={
        <>
          <ConfirmSheet
            visible={adding}
            title={`${L.bansAddTitle} · ${pseudo.trim()}`}
            body={L.bansAddConfirmBody(pseudo.trim())}
            confirmLabel={L.bansAdd}
            confirmIcon="flag"
            danger
            busy={busy}
            error={sheetError}
            onConfirm={() =>
              void work(async () => {
                await api.ban(structureId, pseudo.trim(), reason.trim() || null);
                setPseudo("");
                setReason("");
              }, L.bansAddDone)
            }
            onClose={() => {
              setAdding(false);
              setSheetError(null);
            }}
          />
          <ConfirmSheet
            visible={lifting !== null}
            title={L.bansLiftTitle(lifting?.pseudo ?? "")}
            body={L.bansLiftBody}
            confirmLabel={L.bansLift}
            confirmIcon="undo"
            busy={busy}
            error={sheetError}
            onConfirm={() =>
              lifting && void work(() => api.unban(structureId, lifting.userId).then(() => undefined), L.bansLiftDone)
            }
            onClose={() => {
              setLifting(null);
              setSheetError(null);
            }}
          />
        </>
      }
    >
      <OrgaFailure error={error ?? bans.error} />
      {notice ? <Notice>{notice}</Notice> : null}
      <Muted variant="caption">{L.bansIntro}</Muted>

      <SectionTitle>{L.bansAddTitle}</SectionTitle>
      <TextField
        label={L.bansPseudo}
        value={pseudo}
        onChangeText={(v) => {
          setPseudo(v);
          setFieldError(undefined);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        error={fieldError}
        testID="bans-pseudo"
      />
      <TextField
        label={L.bansReason}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        multiline
        testID="bans-reason"
      />
      <Button
        variant="secondary"
        icon="flag"
        disabled={pseudo.trim() === ""}
        onPress={askAdd}
        fullWidth
        testID="bans-add"
      >
        {L.bansAdd}
      </Button>

      <SectionTitle>{`${L.bansTitle} · ${list.length}`}</SectionTitle>
      {list.length === 0 ? (
        <Muted variant="body">{bans.loading ? "Chargement…" : L.bansEmpty}</Muted>
      ) : (
        list.map((b) => (
          <Plate key={b.userId} style={styles.block} testID="bans-row">
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {b.pseudo}
            </Text>
            <Text variant="caption" color={t.color.plateMuted}>
              {b.reason ?? L.bansNoReason} · {L.bansSince(formatDay(b.at))}
            </Text>
            <Button
              variant="plate"
              icon="undo"
              onPress={() => {
                setSheetError(null);
                setNotice(null);
                setLifting(b);
              }}
              fullWidth
              testID="bans-lift"
            >
              {L.bansLift}
            </Button>
          </Plate>
        ))
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
