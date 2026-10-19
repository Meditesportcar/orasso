// Les 101 départements de la liste (« Choisir dans une liste ») : métropole et Corse (les 96 de la carte), puis l'outre-mer
// (971 à 976), absent de la carte. Mêmes codes que `departments` de @orasso/shared (testé).
import { overseasDepartmentNames } from "@orasso/shared";
import { franceDepartments } from "./departments";

export type DepartmentChoice = { code: string; name: string };

export const departmentChoices: readonly DepartmentChoice[] = [
  ...franceDepartments.map(({ code, name }) => ({ code, name })),
  ...Object.entries(overseasDepartmentNames).map(([code, name]) => ({ code, name })),
];

/** Libellé d'une ligne de la liste : « 66 · Pyrénées-Orientales ». */
export const departmentLabel = ({ code, name }: DepartmentChoice) => `${code} · ${name}`;
