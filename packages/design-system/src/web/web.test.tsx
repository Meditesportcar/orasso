import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { battle, bezier, curve, duration, olive, park, shake } from "../motion";
import {
  AppBar,
  BigTitle,
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
  Outlined,
  PosterCard,
  ScanResult,
  SelectField,
  StatusBadge,
  TabBar,
  TextField,
  tabSets,
  tokensV2Overlay,
  VehicleCard,
  VehicleThumb,
} from "./index";
import { brandArt } from "../native/brandArt";
import {
  CarTopArt,
  CenterTabO,
  EmptyState,
  OLoader,
  OpeningBattle,
  SendBurst,
  SendProgress,
  StampDrop,
} from "./components/Olive";
import { departmentPosition, readThemeCookie, resolveTheme, serverTheme, themeInitScript } from "./theme";

const componentsDir = resolve(import.meta.dirname, "components");
const files = readdirSync(componentsDir).filter((f) => /\.(tsx?|css)$/.test(f));

describe("composants : aucune valeur en dur", () => {
  it("pas de couleur hexadécimale, rgb(a)/hsl ni de durée dans src/web/components", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(resolve(componentsDir, file), "utf8");
      text.split("\n").forEach((line, i) => {
        if (/(^|[^&\w/])#[0-9a-fA-F]{3,8}\b/.test(line.replace(/url\(#[^)]*\)/g, "")))
          offenders.push(`${file}:${i + 1} couleur hexadécimale`);
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
  it("le O vivant et le fond battle (lot 39) : mêmes durées et opacités", () => {
    expect(css).toContain(`--olive-open: ${olive.open}ms;`);
    expect(css).toContain(`--olive-park: ${olive.park}ms;`);
    expect(css).toContain(`--olive-orbit: ${olive.orbit}ms;`);
    expect(css).toMatch(new RegExp(`:root \\{[\\s\\S]*--battle-opacity: ${battle.opacity.beton};`));
    expect(css).toMatch(new RegExp(`\\[data-theme="sable"\\] \\{\\s*--battle-opacity: ${battle.opacity.sable};`));
    expect([olive.open, olive.park, olive.orbit]).toEqual([3000, 320, 1400]);
    expect(battle.gap).toEqual([9000, 14000]);
  });
  it("réduction des animations : tout est un fondu de --timing-fast", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-name: o-fade !important/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-duration: var\(--timing-fast\) !important/);
  });
});

describe("thème", () => {
  const perpignan = { lat: 42.6, lng: 2.52 };
  it("Béton par défaut ; auto suit le soleil (lot 38) ; cookie lu côté serveur", () => {
    expect(readThemeCookie(null)).toBe("beton");
    expect(readThemeCookie("a=b; orasso-theme=sable")).toBe("sable");
    expect(readThemeCookie("orasso-theme=violet")).toBe("beton");
    // Un cookie mal encodé ne fait pas d'erreur (rendu serveur).
    expect(readThemeCookie("orasso-theme=%E0")).toBe("beton");
    expect(resolveTheme("auto", { now: new Date("2026-10-19T12:00:00+02:00"), ...perpignan })).toBe("sable");
    expect(resolveTheme("auto", { now: new Date("2026-10-19T23:59:00+02:00"), ...perpignan })).toBe("beton");
    expect(resolveTheme("sable", { now: new Date("2026-10-19T23:59:00+02:00"), ...perpignan })).toBe("sable");
    expect(serverTheme("auto")).toBe("beton");
    expect(serverTheme("sable")).toBe("sable");
    expect(departmentPosition("zz")).toEqual({ lat: 48.85, lng: 2.35 });
    expect(themeInitScript).toContain("orasso-theme");
    expect(themeInitScript).toContain("orasso-dept");
  });

  it("le script d'init pose le même thème que resolveTheme, à midi et à minuit", () => {
    const run = (cookie: string, nowMs: number) => {
      const attrs: Record<string, string> = {};
      const fakeDocument = { cookie, documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
      const fakeDate = { now: () => nowMs };
      const storage = { getItem: () => null };
      new Function("document", "localStorage", "Date", themeInitScript)(fakeDocument, storage, fakeDate);
      return attrs["data-theme"];
    };
    const noon = Date.parse("2026-10-19T12:00:00+02:00");
    const midnight = Date.parse("2026-10-19T00:00:00+02:00");
    expect(run("orasso-theme=auto; orasso-dept=66", noon)).toBe("sable");
    expect(run("orasso-theme=auto; orasso-dept=66", midnight)).toBe("beton");
    expect(run("orasso-theme=auto", noon)).toBe("sable");
    expect(run("orasso-theme=sable", midnight)).toBe("sable");
    expect(run("", noon)).toBe("beton");
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
    expect(
      html(
        <Button variant="plate" tone="wait" icon="wait">
          Attente
        </Button>,
      ),
    ).toContain("o-button--wait");
    expect(html(<Button variant="close" label="Fermer" />)).toContain('aria-label="Fermer"');
    expect(
      html(
        <Button icon="next" href="/x">
          Aller
        </Button>,
      ),
    ).toMatch(/<a [^>]*href="\/x"/);
    const loading = html(
      <Button icon="check" loading>
        Retenir
      </Button>,
    );
    expect(loading).toContain("disabled");
    expect(loading).toContain("o-olive");
  });

  it("Chip, StatusBadge, Counters", () => {
    expect(
      html(
        <Chip selected onClick={() => {}}>
          JDM
        </Chip>,
      ),
    ).toContain('aria-pressed="true"');
    expect(html(<StatusBadge status="waitlist" rank={4} />)).toContain("Liste d&#x27;attente · 4e");
    expect(html(<StatusBadge status="refused" />)).toContain("o-badge--refused");
    const counters = html(
      <Counters
        items={[
          { value: 34, label: "restantes" },
          { value: 27, label: "à trier" },
        ]}
        active={1}
      />,
    );
    expect(counters.match(/is-active/g)?.length).toBe(1);
  });

  it("Field : étiquette liée, erreur annoncée, « Autre » en dernier", () => {
    const field = html(<TextField label="Plaque" id="p" error="Plaque invalide" />);
    expect(field).toContain('for="p"');
    expect(field).toContain('aria-invalid="true"');
    expect(field).toContain('role="alert"');
    const select = html(
      <SelectField
        label="Génération"
        id="g"
        options={[
          { value: "o", label: "Autre" },
          { value: "e36", label: "E36" },
        ]}
      />,
    );
    expect(select.indexOf("E36")).toBeLessThan(select.indexOf("Autre"));
    expect(html(<CheckboxField label="Newsletter Orasso" />)).toContain('type="checkbox"');
  });

  it("PosterCard : bandeau, bouton sur affiche, une seule signature", () => {
    const card = html(
      <PosterCard
        label="Prochain accès · J-2"
        title={
          <>
            Nocturne
            <br />
            de Canet
          </>
        }
        facts="Sam 17 oct"
        status="retained"
        action={{ label: "Mode jour J", icon: "qr", next: true }}
      />,
    );
    expect(card).toContain("Retenue");
    expect(card).toContain("o-button--poster");
    expect(card.match(/o-credit /g)?.length).toBe(1);
  });

  it("VehicleCard : nom jamais tronqué, catégorie mise en avant", () => {
    const card = html(
      <VehicleCard
        name="Nissan 200SX S14"
        year={1996}
        power="250 ch"
        certified
        categories={[{ label: "JDM", highlighted: true }]}
      />,
    );
    expect(card).toContain("o-never-truncate");
    expect(card).toContain("o-chip--lit");
    expect(html(<VehicleThumb title="Expo Rivesaltes" meta="Dim 25 oct" />)).toContain("o-thumb");
  });

  it("ScanResult : trois états, sans vert, refusé secoué", () => {
    expect(
      html(<ScanResult state="ok" vehicle="Nissan 200SX" pseudo="Damien_66" zone="JDM" time="il y a 4 s" />),
    ).toContain("o-scan--ok");
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

  it("DA v2 : six barres, le O au centre, barre tab, BigTitle, contour", () => {
    const sets = ["exhibitor", "visitor", "pro", "provider", "media", "organizer"] as const;
    for (const set of sets) {
      const items = tabSets[set];
      expect(items.length, set).toBe(5);
      expect(items[2]?.center && items[2]?.o, set).toBe(true);
      const bar = html(<TabBar set={set} active={items[0]?.id ?? ""} />);
      expect(bar.match(/is-o(?=[" ])/g)?.length, set).toBe(1);
      expect(bar).toContain("o-center-o");
    }
    expect(tabSets.fan).toBe(tabSets.exhibitor);
    expect(tabSets.organizer.map((t) => t.label)).toEqual(["Événements", "Tri", "Direct", "Équipe", "Structure"]);
    for (const icon of ["ticket", "stamp", "briefcase", "shop", "press", "gallery", "badge", "o"]) {
      expect(iconNames).toContain(icon);
    }
    const top = html(<AppBar kind="tab" persona={{ logoUrl: null, label: "MéditeSportCar" }} inboxCount={3} />);
    expect(top).toContain("o-logo");
    expect(top).toContain('aria-label="Boîte"');
    expect(top).toContain('aria-label="MéditeSportCar"');
    expect(top).not.toContain("o-monogram");
    const title = html(<BigTitle title="Mon garage" label="3 véhicules" />);
    expect(title).toContain("o-bigtitle__title");
    expect(title).toContain("3 véhicules");
    expect(html(<Outlined on="photo">J-6</Outlined>)).toContain("o-onphoto");
    expect(html(<Outlined on="ground">19 h</Outlined>)).toContain("o-onbg");
    expect(tokensV2Overlay.length).toBeGreaterThan(20);
  });

  it("le O vivant (lot 39) : chaque variante se rend côté serveur", () => {
    const loader = html(<OLoader size={72} />);
    expect(loader).toContain('role="progressbar"');
    expect(loader).toContain("is-loading");
    expect(loader).toContain("animateMotion");
    expect(html(<OLoader size={24} done />)).toContain("is-parked");
    expect(html(<OpeningBattle />)).toContain("o-opening__letters");
    const send = html(<SendProgress progress={0.4} />);
    expect(send).toContain('aria-valuenow="40"');
    expect(send).toContain("--p:0.4");
    expect(html(<SendBurst />)).toContain("Candidature envoyée");
    const empty = html(<EmptyState title="Aucune sortie" text="Rien pour l'instant." />);
    expect(empty).toContain("o-empty__spot");
    expect(empty).toContain("Aucune sortie");
    expect(html(<StampDrop seed={4} shape="square" />)).toContain("o-stamp__ring");
    expect(html(<StampDrop seed={4} />)).toBe(html(<StampDrop seed={4} />));
    expect(html(<CenterTabO active />)).toContain("is-parked");
    expect(html(<CenterTabO active={false} />)).toContain("is-out");
    expect(html(<Ground variant="battle" />)).toContain("o-ground__battle");
    expect(html(<Ground variant="battle" still />)).not.toContain("o-anim-ambient-breath");
    // Le dessin de la voiture vue de dessus : même géométrie que le fichier du site (généré par le même script).
    const svg = readFileSync(resolve(import.meta.dirname, "assets/car-top.svg"), "utf8");
    expect(svg).toContain(brandArt.carTop.body);
    expect(html(<svg aria-hidden="true"><CarTopArt /></svg>)).toContain(brandArt.carTop.body);
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
