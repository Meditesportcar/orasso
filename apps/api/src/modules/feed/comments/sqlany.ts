// `col = any($1::type[])` : un seul paramètre tableau, quel que soit le nombre de valeurs (un `inArray` envoie un paramètre
// par valeur et PostgreSQL en refuse plus de 65 535). Lot R8k1, tour 10.
import { type AnyColumn, type SQL, sql } from "drizzle-orm";

export function anyOf(column: AnyColumn, values: readonly string[], type: "uuid" | "text"): SQL {
  return type === "uuid"
    ? sql`${column} = any(${sql.param([...values])}::uuid[])`
    : sql`${column} = any(${sql.param([...values])}::text[])`;
}
