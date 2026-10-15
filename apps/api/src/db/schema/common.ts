// Colonnes et types communs aux tables métier (ARCHITECTURE.md, conventions générales).
import { customType, timestamp } from "drizzle-orm/pg-core";

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Horodatage avec fuseau, nullable. */
export const tstz = (name: string) => timestamp(name, { withTimezone: true });

/** Octets bruts (secrets, sels). */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
