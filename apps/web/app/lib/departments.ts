// Lecture du champ « Départements » d'un formulaire du site (`DepartmentsField`, /app/preferences et /app/moi).
// Pur : testé seul. Trois formes de formulaire possibles, une seule règle :
// - avec JavaScript, la liste pose `departmentBoxOrder` : le champ texte `departments` est tenu à jour (carte, liste,
//   saisie) et fait foi, le premier est le favori ;
// - sans JavaScript, `departmentBoxes` (marqueur) est là mais pas `departmentBoxOrder` : les cases `departmentBox`
//   cochées font foi (rien de coché = liste vide), dans l'ordre de la liste ; le texte, resté à sa valeur d'origine,
//   est ignoré (sinon on ne pourrait jamais décocher) ;
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
    return [...new Set(form.getAll("departmentBox").map((d) => String(d).trim().toUpperCase()))].filter(Boolean);
  }
  return parseDepartmentText(String(form.get("departments") ?? ""));
}
