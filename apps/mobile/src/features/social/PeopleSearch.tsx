// Explorer, segment « Personnes et crews » (lot 17) : recherche par pseudo ou véhicule, filtres département, centre
// d'intérêt et grade. Les crews sont juste en dessous (lot 19). Comptes supprimés et suspendus : jamais
// dans les résultats ; un compte privé n'est trouvable que par ce qu'il montre à tous.
import { Button, SelectField, TextField, tokens } from "@orasso/design-system/native";
import {
  departments,
  gradeLabels,
  grades,
  hasPeopleSearchCriteria,
  type PeopleSearchPage,
  socialLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { PersonRow } from "./PersonRow";

const { space3 } = tokens.spacing;

export function PeopleSearch() {
  const router = useRouter();
  const categories = useApi(() => api.categories(), [], { cacheKey: "ref.categories" });
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [grade, setGrade] = useState("");
  const [page, setPage] = useState<PeopleSearchPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);

  const criteria = { q: q.trim(), department, categoryId, grade };
  const searchable = hasPeopleSearchCriteria(criteria);

  const load = useCallback(async () => {
    const id = ++request.current;
    if (!hasPeopleSearchCriteria({ q: q.trim(), department, categoryId, grade })) {
      setPage(null);
      setError(null);
      return;
    }
    try {
      const result = await api.searchPeople({
        q: q.trim() || undefined,
        department: department || undefined,
        categoryId: categoryId || undefined,
        grade: grade || undefined,
      });
      if (id !== request.current) return;
      setPage(result);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
  }, [q, department, categoryId, grade]);

  // Recherche différée : on attend une pause de frappe avant d'interroger l'API.
  useEffect(() => {
    const timer = setTimeout(() => void load(), q ? 350 : 0);
    return () => clearTimeout(timer);
  }, [q, load]);

  async function more() {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await api.searchPeople({
        q: q.trim() || undefined,
        department: department || undefined,
        categoryId: categoryId || undefined,
        grade: grade || undefined,
        cursor: page.nextCursor,
      });
      setPage({ items: [...page.items, ...next.items], nextCursor: next.nextCursor });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <View style={styles.col} testID="people-search">
      <TextField
        label={socialLabels.searchPeople}
        placeholder={socialLabels.searchPeoplePlaceholder}
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="people-q"
      />
      <SelectField
        label={socialLabels.filterDepartment}
        value={department}
        onValueChange={setDepartment}
        options={[{ value: "", label: "Tous" }, ...departments.map((d) => ({ value: d, label: d }))]}
      />
      <SelectField
        label={socialLabels.filterInterest}
        value={categoryId}
        onValueChange={setCategoryId}
        options={[
          { value: "", label: "Tous" },
          ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.label })),
        ]}
      />
      <SelectField
        label={socialLabels.filterGrade}
        value={grade}
        onValueChange={setGrade}
        options={[
          { value: "", label: socialLabels.filterAnyGrade },
          ...grades.map((g) => ({ value: g, label: gradeLabels[g] })),
        ]}
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {!searchable ? <Muted variant="body">{socialLabels.searchPeopleIdle}</Muted> : null}
      {searchable && page && page.items.length === 0 ? (
        <Muted variant="body">{socialLabels.searchPeopleEmpty}</Muted>
      ) : null}
      {page?.items.map((person) => (
        <PersonRow key={person.userId} person={person} onChanged={() => void load()} />
      ))}
      {page?.nextCursor ? (
        <Button variant="secondary" icon="add" loading={loadingMore} onPress={() => void more()} fullWidth>
          Voir plus
        </Button>
      ) : null}

      <Button variant="plate" icon="profile" onPress={() => router.push("/amis")} fullWidth>
        {socialLabels.myFriends}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
});
