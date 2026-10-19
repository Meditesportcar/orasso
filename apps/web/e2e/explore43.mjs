import { chromium } from "@playwright/test";

// Exploration locale du lot 43 (jamais commitée) : node e2e/explore43.mjs <email> <casquette|-> <route> <fichier> [theme]
const [email, kind, route, out, theme = "beton"] = process.argv.slice(2);
const APP = "http://localhost:8281";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
const page = await ctx.newPage();
page.setDefaultTimeout(240000);
page.on("console", (m) => m.type() === "error" && console.log("console.error", m.text().slice(0, 300)));
await page.goto("/");
await page.evaluate((t) => {
  localStorage.setItem("orasso.onboarded", "1");
  localStorage.setItem("orasso.theme", t);
}, theme);
await page.goto("/auth");
await page.waitForTimeout(4000);
await page.getByLabel("E-mail").fill(email);
await page.getByLabel("Mot de passe", { exact: true }).first().fill("orasso-demo-2026");
await page.getByRole("button", { name: "Me connecter" }).click();
await page.waitForURL(/accueil|scanner|candidatures|direct|missions/, { timeout: 90000 });
if (kind !== "-") {
  await page.goto("/moi");
  await page.waitForTimeout(3000);
  await page.getByTestId(`casquette-${kind}`).first().click();
  await page.waitForTimeout(3000);
}
await page.goto(route);
await page.waitForTimeout(6000);
await page.screenshot({
  path: `C:/Users/DELL/AppData/Local/Temp/claude/C--Users-DELL-Orasso/f2bbd0fb-ea70-4aa7-b2b7-2f2a5c4242ab/scratchpad/${out}.png`,
  fullPage: true,
});
await browser.close();
