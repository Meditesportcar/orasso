import { expect, test } from "@playwright/test";
import { apiOrLoaderData, hasNoBody, OWNER_PSEUDO, type ResponseLike, watchOwnerLeak } from "./ownerLeak";

// Le contrôle de confidentialité (`ownerLeak.ts`) s'éprouve hors navigateur, sur de fausses réponses : il doit échouer quand un corps attendu
// reste illisible ou arrive après le délai, et quand un marqueur du titulaire s'y trouve. `legacyDone` est l'ancien contrôle des recettes
// R9i (partie 2), gardé ici pour montrer qu'il laissait passer ces cas.
const MARKERS = [OWNER_PSEUDO, "leo@orasso.local", "11111111-2222-4333-8444-555555555555"];

type Fake = Partial<Omit<ResponseLike, "url">> & { url?: string };

function fakePage() {
  let listener: (r: ResponseLike) => void = () => undefined;
  return {
    page: {
      on: (_e: "response", l: (r: ResponseLike) => void) => {
        listener = l;
      },
    },
    emit: (r: Fake) =>
      listener({
        url: () => r.url ?? "http://x.test/api/ok",
        status: r.status ?? (() => 200),
        headers: r.headers ?? (() => ({})),
        text: r.text ?? (async () => "{}"),
      }),
  };
}
const body = (text: string): Fake => ({ text: async () => text });
const late = (text: string, ms: number): Fake => ({
  text: () => new Promise<string>((r) => setTimeout(() => r(text), ms)),
});

/** L'ancien contrôle, tel qu'il était (délai et erreur de lecture => `""`, `texts.length > 0`). */
async function legacyDone(f: ReturnType<typeof fakePage>, emit: () => void, timeoutMs: number) {
  const reads: Promise<string>[] = [];
  f.page.on("response", (res) => {
    if (!res.url().includes("/api/")) return;
    if (res.headers()["content-type"]?.includes("event-stream")) return;
    reads.push(
      Promise.race([
        res.text().catch(() => ""),
        new Promise<string>((resolve) => setTimeout(() => resolve(""), timeoutMs)),
      ]),
    );
  });
  emit();
  const texts = await Promise.all(reads);
  expect(texts.length).toBeGreaterThan(0);
  expect(texts.filter((t) => t.includes(OWNER_PSEUDO))).toEqual([]);
}

test("ancien contrôle : une réponse qui porte le pseudo, lue après le délai, passait à tort", async () => {
  const f = fakePage();
  // Ne lève pas : le contrôle « réussit » alors que la réponse portait le pseudo du titulaire.
  await legacyDone(f, () => f.emit(late(`{"by":"${OWNER_PSEUDO}"}`, 300)), 50);
});

test("nouveau contrôle : la même réponse (corps lu après le délai) fait échouer", async () => {
  const f = fakePage();
  const w = watchOwnerLeak(f.page, { markers: MARKERS, readTimeoutMs: 50 });
  f.emit(body('{"ok":true}'));
  f.emit(late(`{"by":"${OWNER_PSEUDO}"}`, 300));
  await expect(w.done()).rejects.toThrow(/n'ont pas pu être lues/);
});

test("une erreur de lecture du corps fait échouer (l'ancien contrôle la comptait comme une chaîne vide)", async () => {
  const f = fakePage();
  const w = watchOwnerLeak(f.page, { markers: MARKERS });
  f.emit(body('{"ok":true}'));
  f.emit({ text: () => Promise.reject(new Error("Target closed")) });
  await expect(w.done()).rejects.toThrow(/n'ont pas pu être lues/);
});

test("une réponse lue qui porte le pseudo, l'e-mail ou l'identifiant du titulaire fait échouer", async () => {
  for (const leak of [OWNER_PSEUDO, "LEO@orasso.local", MARKERS[2] as string]) {
    const f = fakePage();
    const w = watchOwnerLeak(f.page, { markers: MARKERS });
    f.emit(body('{"ok":true}'));
    f.emit(body(`{"x":"${leak}"}`));
    await expect(w.done()).rejects.toThrow(/portent le pseudo/);
  }
});

test("seules les réponses sans corps attendues (204, 304, redirection) et les flux sont écartées", async () => {
  expect([204, 205, 304, 301, 302, 307, 101].every(hasNoBody)).toBe(true);
  expect([200, 201, 400, 403, 404, 500].some(hasNoBody)).toBe(false);
  const f = fakePage();
  const w = watchOwnerLeak(f.page, { markers: MARKERS });
  const unreadable = () => Promise.reject(new Error("pas de corps"));
  f.emit({ status: () => 204, text: unreadable });
  f.emit({ status: () => 304, text: unreadable });
  f.emit({ status: () => 302, text: unreadable });
  f.emit({
    headers: () => ({ "content-type": "text/event-stream" }),
    text: () => new Promise<string>(() => undefined),
  });
  f.emit(body('{"ok":true}'));
  await expect(w.done()).resolves.toBeUndefined();
});

test("un refus 403 est un corps attendu : illisible, il fait échouer", async () => {
  const f = fakePage();
  const w = watchOwnerLeak(f.page, { markers: MARKERS });
  f.emit(body('{"ok":true}'));
  f.emit({ status: () => 403, text: () => Promise.reject(new Error("fermé")) });
  await expect(w.done()).rejects.toThrow(/n'ont pas pu être lues/);
});

test("aucun corps lu (rien que des réponses vides ou sans corps) : le contrôle échoue", async () => {
  const f = fakePage();
  const w = watchOwnerLeak(f.page, { markers: MARKERS });
  f.emit({ status: () => 204 });
  f.emit(body(""));
  await expect(w.done()).rejects.toThrow(/aucun corps de réponse lu/);
  const g = fakePage();
  await expect(watchOwnerLeak(g.page, { markers: MARKERS }).done()).rejects.toThrow(/aucun corps de réponse lu/);
});

test("le site écoute aussi les données des chargeurs (*.data) ; l'appli seulement /api/", async () => {
  const data = "http://x.test/app/messages/abc.data";
  expect(apiOrLoaderData(data)).toBe(true);
  expect(apiOrLoaderData("http://x.test/api/me")).toBe(true);
  expect(apiOrLoaderData("http://x.test/app/messages")).toBe(false);
  const f = fakePage();
  const w = watchOwnerLeak(f.page, { markers: MARKERS, match: apiOrLoaderData });
  f.emit(body('{"ok":true}'));
  f.emit({ url: data, ...body(`[{"by":"${OWNER_PSEUDO}"}]`) });
  await expect(w.done()).rejects.toThrow(/portent le pseudo/);
});
