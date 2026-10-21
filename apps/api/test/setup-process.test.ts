import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("deux processus ignorent UPLOADS_DIR externe et isolent la même clé de fichier", async () => {
  const external = await mkdtemp(join(tmpdir(), "orasso-uploads-external-"));
  const key = `isolation/${randomUUID()}.txt`;
  const run = async (id: string, command: string, value = "") => {
    const result = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        new URL("./fixtures/resolve-typescript.mjs", import.meta.url).href,
        fileURLToPath(new URL("./fixtures/storage-probe.ts", import.meta.url)),
        command,
        key,
        value,
      ],
      {
        env: { ...process.env, VITEST_POOL_ID: id, DATA_DIR: external, UPLOADS_DIR: external },
        timeout: 30_000,
      },
    );
    return JSON.parse(result.stdout.trim()) as { storageDir: string; data: string | null };
  };
  let paths: string[] = [];
  try {
    const [a, b] = await Promise.all([run("1", "put", "premier"), run("2", "put", "second")]);
    paths = [a.storageDir, b.storageDir].map((dir) => join(dir, key));
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    expect(a.storageDir).toBe(resolve(root, ".data/test/1/storage"));
    expect(b.storageDir).toBe(resolve(root, ".data/test/2/storage"));
    expect(a.data).toBe("premier");
    expect(b.data).toBe("second");
    expect((await run("1", "remove")).data).toBeNull();
    expect(await readFile(paths[1]!, "utf8")).toBe("second");
    expect(await readdir(external)).toEqual([]);
  } finally {
    for (const path of paths) await rm(path, { force: true });
    await rm(external, { recursive: true, force: true });
  }
});
