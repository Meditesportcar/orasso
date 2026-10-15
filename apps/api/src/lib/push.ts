// Notifications Expo Push : lots de 100, jeton invalide → appareil révoqué. Inactif en test.
import { inArray } from "drizzle-orm";

import { db } from "../db/client";
import { devices } from "../db/schema";
import { env } from "../env";
import { now } from "./deps";

export type PushMessage = { to: string; title: string; body: string; data?: Record<string, unknown> };
type Ticket = { status: "ok" | "error"; details?: { error?: string } };

export const push = {
  /** Renvoie le nombre de messages acceptés par Expo. */
  async send(messages: PushMessage[]): Promise<number> {
    if (env.NODE_ENV === "test" || messages.length === 0) return 0;
    let accepted = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      try {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          body: JSON.stringify(batch.map((m) => ({ ...m, sound: "default" }))),
        });
        const { data } = (await res.json()) as { data?: Ticket[] };
        const dead: string[] = [];
        data?.forEach((ticket, j) => {
          if (ticket.status === "ok") accepted++;
          else if (ticket.details?.error === "DeviceNotRegistered" && batch[j]) dead.push(batch[j].to);
        });
        if (dead.length) {
          await db.update(devices).set({ revokedAt: now() }).where(inArray(devices.expoPushToken, dead));
        }
      } catch (error) {
        console.error("Expo Push :", error);
      }
    }
    return accepted;
  },
};
