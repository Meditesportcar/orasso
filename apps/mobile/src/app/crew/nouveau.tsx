// Créer un crew (lot 19) : nom, description, département. La personne en devient le chef ; la discussion du crew est
// créée. Le logo s'ajoute ensuite depuis la fiche.
import { Button, Plate, SelectField, TextField, tokens } from "@orasso/design-system/native";
import { CREW_DESCRIPTION_MAX, crewLabels, departments } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space3 } = tokens.spacing;

export default function NewCrew() {
  const router = useRouter();
  const { me } = useSession();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState(me?.profile.departments[0] ?? "66");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/garage"));
  return (
    <FlowScreen title={crewLabels.createCrew} onClose={close}>
      <Muted variant="body">{crewLabels.createCrewHint}</Muted>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Plate style={styles.plate}>
        <TextField label={crewLabels.name} value={name} onChangeText={setName} maxLength={40} testID="crew-name" />
        <TextField
          label={crewLabels.description}
          value={description}
          onChangeText={setDescription}
          maxLength={CREW_DESCRIPTION_MAX}
          placeholder={crewLabels.descriptionPlaceholder}
          multiline
          help={`${description.length} / ${CREW_DESCRIPTION_MAX}`}
        />
        <SelectField
          label={crewLabels.department}
          options={departments.map((d) => ({ value: d, label: d }))}
          value={department}
          onValueChange={setDepartment}
        />
      </Plate>
      <Button
        icon="crew"
        loading={busy}
        disabled={name.trim().length < 3}
        fullWidth
        testID="crew-create"
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const crew = await api.createCrew({
              name: name.trim(),
              description: description.trim() || null,
              department,
            });
            router.replace(`/crew/${crew.slug}`);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {crewLabels.createCrew}
      </Button>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  plate: { gap: space3, padding: space3 },
});
