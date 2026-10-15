import { afterAll, describe, expect, it } from "vitest";

import { app } from "./app";
import { pool } from "./db/client";

afterAll(async () => {
  await pool.end();
});

describe("GET /api/health", () => {
  it("répond OK quand la base répond", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });
});
