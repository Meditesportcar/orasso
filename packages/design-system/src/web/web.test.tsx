import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bezier, curve, duration, park, shake } from "../motion";
import {
  AppBar,
  Button,
  CheckboxField,
  Chip,
  Counters,
  Cover,
  Ground,
  Icon,
  iconNames,
  Logo,
  Monogram,
  PosterCard,
  ScanResult,
  SelectField,
  StatusBadge,
  TabBar,
  TextField,
  VehicleCard,
  VehicleThumb,
} from "./index";
import { readThemeCookie, resolveTheme, serverTheme, themeInitScript } from "./theme";

const componentsDir = resolve(import.meta.dirname, "components");
const files = readdirSync(componentsDir).filter((f) => /\.(tsx?|css)$/.test(f));

describe("composants : aucune valeur en dur", () => {
  it("pas de couleur hexadécimale, rgb(a)/hsl ni de durée dans src/web/components", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(resolve(componentsDir, file), "utf8");
      text.split("\n").forEach((line, i) => {
        if (/(^|[^&\w/])#[0-9a-fA-F]{3,8}\b/.test(line.replace(/url\(#[^)]*\)/g, ""))) offenders.push(`${file}:${i + 1} couleur hexadécimale`);
        if (/\b(rgba?|hsla?|oklch)\(/.test(line)) offenders.push(`${file}:${i + 1} couleur fonctionnelle`);
        if (/\b\d+(\.\d+)?\s?(ms|s)\b/.test(line)) offenders.push(`${file}:${i + 1} durée`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("mouvement : motion.ts et motion.css s'accordent", () => {
  const css = readFileSync(resolve(import.meta.dirname, "motion.css"), "utf8");
  const px = (name: string) => Number.parseFloat(css.match(new RegExp(`--${name}: ([\\d.]+)px;`))?.[1] ?? "NaN");
  it("distances, durée de fondu croisé, échelle d'appui, secousse", () => {
    expect(px("park-overshoot")).toBe(park.overshoot);
    expect(px("park-overshoot-switch")).toBe(park.overshootSwitch);
    expect(px("park-from")).toBe(park.from);
    expect(px("park-screen-from")).toBe(park.screenFrom);
    expect(px("park-tab-rise")).toBe(park.tabRise);
    expect(px("park-counter-slide")).toBe(park.counterSlide);
    expect(px("shake-amplitude")).toBe(shake.amplitude);
    expect(css).toContain(`--timing-screen-out: ${duration.screenOut}ms;`);
    expect(css).toContain(`--press-scale: ${park.pressScale};`);
    expect(css).toContain(`--shake-duration: ${shake.duration}ms;`);
  });
  it("durées et courbes viennent des jetons", () => {
    expect([duration.fast, duration.base, duration.poster, duration.scan]).toEqual([120, 220, 420, 1000]);
    expect(curve.park).toBe("cubic-bezier(.12,.75,.25,1)");
    expect(bezier.park).toEqual([0.12, 0.75, 0.25, 1]);
  });
  it("réduction des animations : tout est un fondu de --timing-fast", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-name: o-fade !important/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-duration: var\(--timing-fast\) !important/);
  });
});

describe("thème", () => {
  it("Béton par défaut ; auto suit le mode clair ; cookie lu côté serveur", () => {
    expect(readThemeCookie(null)).toBe("beton");
    expect(readThemeCookie("a=b; orasso-theme=sable")).toBe("sable");
    expect(readThemeCookie("orasso-theme=violet")).toBe("beton");
    expect(resolveTheme("auto", true)).toBe("sable");
    expect(resolveTheme("auto", false)).toBe("beton");
    expect(serverTheme("auto")).toBe("beton");
    expect(themeInitScript).toContain("orasso-theme");
  });
});

describe("rendu serveur des composants", () => {
  const html = (node: React.ReactElement) => renderToStaticMarkup(node);

  it("toute icône du jeu se rend, décorative par défaut", () => {
    for (const name of iconNames) expect(html(<Icon name={name} />)).toContain('aria-hidden="true"');
    expect(iconNames.length).toBeGreaterThanOrEqual(32);
  });

  it("Button : variantes, icône, lien, chargement, fermer", () => {
    expect(html(<Button icon="qr">Mode jour J</Button>)).toContain("o-button--primary");
    expect(html(<Button variant="plate" tone="wait" icon="wait">Attente</Button>)).toContain("o-button--wait");
    expect(html(<Button variant="close" label="Fermer" />)).toContain('aria-label="Fermer"');
    expect(html(<Button icon="next" href="/x">Aller</Button>)).toMatch(/<a [^>]*href="\/x"/);
    const loading = html(<Button icon="check" loading>Retenir</Button>);
    expect(loading).toContain("disabled");
    expect(loading).toContain("o-loader");
  });

  it("Chip, StatusBadge, Counters", () => {
    expect(html(<Chip selected onClick={() => {}}>JDM</Chip>)).toContain('aria-pressed="true"');
    expect(html(<StatusBadge status="waitlist" rank={4} />)).toContain("Liste d&#x27;attente · 4e");
    expect(html(<StatusBadge status="refused" />)).toContain("o-badge--refused");
    const counters = html(<Counters items={[{ value: 34, label: "restantes" }, { value: 27, label: "à trier" }]} active={1} />);
    expect(counters.match(/is-active/g)?.length).toBe(1);
  });

  it("Field : étiquette liée, erreur annoncée, « Autre » en dernier", () => {
    const field = html(<TextField label="Plaque" id="p" error="Plaque invalide" />);
    expect(field).toContain('for="p"');
    expect(field).toContain('aria-invalid="true"');
    expect(field).toContain('role="alert"');
    const select = html(
      <SelectField label="Génération" id="g" options={[{ value: "o", label: "Autre" }, { value: "e36", label: "E36" }]} />,
    );
    expect(select.indexOf("E36")).toBeLessThan(select.indexOf("Autre"));
    expect(html(<CheckboxField label="Newsletter Orasso" />)).toContain('type="checkbox"');
  });

  it("PosterCard : bandeau, bouton sur affiche, une seule signature", () => {
    const card = html(
      <PosterCard label="Prochain accès · J-2" title={<>Nocturne<br />de Canet</>} facts="Sam 17 oct" status="retained" action={{ label: "Mode jour J", icon: "qr", next: true }} />,
    );
    expect(card).toContain("Retenue");
    expect(card).toContain("o-button--poster");
    expect(card.match(/o-credit /g)?.length).toBe(1);
  });

  it("VehicleCard : nom jamais tronqué, catégorie mise en avant", () => {
    const card = html(<VehicleCard name="Nissan 200SX S14" year={1996} power="250 ch" certified categories={[{ label: "JDM", highlighted: true }]} />);
    expect(card).toContain("o-never-truncate");
    expect(card).toContain("o-chip--lit");
    expect(html(<VehicleThumb title="Expo Rivesaltes" meta="Dim 25 oct" />)).toContain("o-thumb");
  });

  it("ScanResult : trois états, sans vert, refusé secoué", () => {
    expect(html(<ScanResult state="ok" vehicle="Nissan 200SX" pseudo="Damien_66" zone="JDM" time="il y a 4 s" />)).toContain("o-scan--ok");
    expect(html(<ScanResult state="duplicate" time="19:12" />)).toContain("Déjà entré");
    const refused = html(<ScanResult state="refused" reason="QR inconnu" />);
    expect(refused).toContain("o-anim-scan-refused");
    expect(refused).not.toContain("o-credit");
  });

  it("AppBar, TabBar", () => {
    const home = html(<AppBar kind="home" avatar="MSC" />);
    expect(home).toContain("o-logo");
    const flow = html(<AppBar kind="flow" title="Scan accueil" counter="62 / 116" />);
    expect(flow).toContain('aria-label="Fermer"');
    expect(flow).toContain("o-monogram");
    const tabs = html(<TabBar set="fan" active="garage" />);
    expect(tabs).toContain('aria-current="page"');
    expect(tabs.match(/is-center/g)?.length).toBe(1);
    expect(html(<TabBar set="organizer" active="sort" />)).toContain("Tri");
  });

  it("Ground, Logo, Monogram, Cover", () => {
    const ground = html(<Ground animated>contenu</Ground>);
    expect(ground).toContain("o-anim-ambient-breath");
    expect(ground).toContain("o-grain--beton");
    expect(ground).toContain("o-grain--sable");
    expect(html(<Ground>x</Ground>)).not.toContain("o-anim-ambient");
    expect(html(<Logo />)).toContain("o-brand-img--dark");
    expect(html(<Monogram tone="light" />)).not.toContain("o-brand-img--dark");
    expect(html(<Cover />)).toContain("Orasso");
  });
});
