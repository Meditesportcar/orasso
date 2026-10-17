// Créer une structure depuis « Mes casquettes » (lot 22, ARCHITECTURE-SUITE § 7.2) : formulaire minimal (type, nom,
// départements, présentation), puis un écran qui dit que la vérification (statuts ou Kbis) se fait sur le site, avec le
// lien. La création donne la casquette Organisateur tout de suite ; la double authentification est exigée à l'entrée de
// l'espace (OrgaGate), pas ici.
import {
  Button,
  Chip,
  ChipRow,
  Plate,
  SelectField,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { orgaLabels, type StructureKind, structureKindLabels, structureKinds } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet } from "react-native";

import { siteUrl } from "@/api";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { orgaSitePath } from "@/lib/orga";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { addDepartment, normalizeDepartment } from "@/lib/settingsPatch";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { TwoFactorGate } from "./OrgaGate";

const { space2, space3 } = tokens.spacing;

type Created = { id: string; slug: string; name: string };

export function CreateStructureScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const { choose } = usePersona();
  const [kind, setKind] = useState<StructureKind>("association");
  const [name, setName] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/accueil"));
  const nameError = name.trim().length > 0 && name.trim().length < 2 ? orgaLabels.createNameError : undefined;

  function addCode() {
    const normalized = normalizeDepartment(code);
    if (!normalized) {
      setCodeError("Département inconnu : saisis son numéro (ex. 66, 2A, 974).");
      return;
    }
    setCodeError(undefined);
    setCode("");
    setDepartments((cur) => addDepartment(cur, normalized));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const s = await api.createStructure({
        kind,
        name: name.trim(),
        description: description.trim() || null,
        departments,
      });
      // Les casquettes sont relues : la nouvelle structure y est (propriétaire), et la double authentification exigée aussi.
      await refreshMe();
      setCreated({ id: s.id, slug: s.slug, name: s.name });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <FlowScreen title={orgaLabels.createDoneTitle} facts={created.name} onClose={close}>
        <Plate style={styles.block} testID="orga-created">
          <Text variant="posterM" color={t.color.plateInk}>
            {created.name}
          </Text>
          <Text variant="body" color={t.color.plateMuted}>
            {orgaLabels.createDoneBody}
          </Text>
        </Plate>
        {me?.twoFactorRequired ? <TwoFactorGate primary={false} /> : null}
        <Button
          variant="primary"
          icon="staff"
          next
          onPress={() => choose({ kind: "organizer", structureId: created.id })}
          fullWidth
          testID="orga-created-open"
        >
          {orgaLabels.createOpenOrga}
        </Button>
        <Button
          variant="plate"
          icon="export"
          onPress={() => void Linking.openURL(siteUrl(orgaSitePath(created.slug, "/structure")))}
          fullWidth
          testID="orga-created-verify"
        >
          {orgaLabels.createVerifyOnSite}
        </Button>
      </FlowScreen>
    );
  }

  return (
    <FlowScreen title={orgaLabels.createTitle} onClose={close}>
      <SelectField
        label={orgaLabels.createKind}
        value={kind}
        onValueChange={(v) => setKind(v as StructureKind)}
        options={structureKinds.map((k) => ({ value: k, label: structureKindLabels[k] }))}
      />
      <TextField
        label={orgaLabels.createName}
        value={name}
        onChangeText={setName}
        maxLength={80}
        error={nameError}
        testID="orga-create-name"
      />
      <Plate style={styles.block}>
        <Text variant="label" color={t.color.plateMuted}>
          {orgaLabels.createDepartments}
        </Text>
        {departments.length > 0 ? (
          <ChipRow>
            {departments.map((d) => (
              <Chip
                key={d}
                surface="plate"
                selected
                accessibilityLabel={`Retirer le département ${d}`}
                onPress={() => setDepartments((cur) => cur.filter((x) => x !== d))}
              >
                {`${d} ✕`}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
        <TextField
          label="Ajouter un département"
          value={code}
          onChangeText={(v) => {
            setCode(v);
            setCodeError(undefined);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
          onSubmitEditing={addCode}
          help={orgaLabels.createDepartmentsHelp}
          error={codeError}
        />
        <Button variant="plate" icon="add" disabled={code.trim() === ""} onPress={addCode} fullWidth>
          {orgaLabels.createDepartmentsAdd}
        </Button>
      </Plate>
      <TextField
        label={orgaLabels.createDescription}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={2000}
      />
      <Muted variant="caption">{orgaLabels.createDoneBody}</Muted>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="primary"
        icon="add"
        loading={busy}
        disabled={name.trim().length < 2 || busy}
        onPress={() => void submit()}
        fullWidth
        testID="orga-create-submit"
      >
        {orgaLabels.createSubmit}
      </Button>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
