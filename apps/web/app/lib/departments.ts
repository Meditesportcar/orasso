// Lecture du champ « Départements » d'un formulaire du site (`DepartmentsField`, /app/preferences et /app/moi).
// Pur : testé seul. Trois formes de formulaire possibles, une seule règle :
// - avec JavaScript, la liste pose `departmentBoxOrder` : le champ texte `departments` est tenu à jour (carte, liste,
//   saisie) et fait foi, le premier est le favori ;
// - sans JavaScript, `departmentBoxes` (marqueur) est là mais pas `departmentBoxOrder` : les cases `departmentBox`
//   cochées font foi (rien de coché = liste vide) ; le texte, resté à sa valeur d'origine, est ignoré (sinon on ne
//   pourrait jamais décocher). L'ordre enregistré (`departmentInitial`, favori en tête) est conservé, les décochés
//   sont retirés, les nouveaux choix s'ajoutent à la fin (lot M6, tour 3) ;
// - sans marqueur (appel direct) : le champ texte seul.

/** « 66, 11 ; 2a » → ["66", "11", "2A"] (sans doublon). */
export function parseDepartmentText(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}

export function readDepartmentsField(form: FormData): string[] {
  if (!form.has("departmentBoxOrder") && form.has("departmentBoxes")) {
    const checked = [...new Set(form.getAll("departmentBox").map((d) => String(d).trim().toUpperCase()))].filter(
      Boolean,
    );
    const initial = parseDepartmentText(String(form.get("departmentInitial") ?? ""));
    const kept = initial.filter((d) => checked.includes(d));
    return [...kept, ...checked.filter((d) => !kept.includes(d))];
  }
  return parseDepartmentText(String(form.get("departments") ?? ""));
}
