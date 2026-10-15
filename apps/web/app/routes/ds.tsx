import {
  AppBar,
  Button,
  badgeStatuses,
  Cascade,
  CheckboxField,
  Chip,
  ChipRow,
  Counters,
  Cover,
  Credit,
  FloatingMark,
  Ground,
  Icon,
  iconNames,
  Loader,
  Logo,
  Monogram,
  Park,
  Plate,
  PosterCard,
  Reveal,
  ScanResult,
  SelectField,
  StatusBadge,
  TabBar,
  TextField,
  type ThemeId,
  type ThemePreference,
  ThemeScope,
  useTheme,
  VehicleCard,
  VehicleThumb,
} from "@orasso/design-system/web";
import { type ReactNode, useState } from "react";
import { useSearchParams } from "react-router";

import type { Route } from "./+types/ds";
import "./ds.css";

// Page de démonstration du système de design (lot 03) : chaque composant dans les deux thèmes, à comparer aux
// aperçus de docs/design-system/components/<Nom>/preview.html. Non liée, non référencée.
export function meta(_: Route.MetaArgs) {
  return [{ title: "Système de design" }, { name: "robots", content: "noindex, nofollow" }];
}

// Photos de démonstration : des aplats dégradés (le vrai contenu vient des photos de véhicules).
const demoPhoto = (
  <div
    style={{
      width: "100%",
      height: "100%",
      background: "radial-gradient(ellipse at 30% 30%, #4a4232 0, #24211c 60%, #17181b 100%)",
    }}
  />
);

const themes: ThemeId[] = ["beton", "sable"];

/** Une section : le même contenu rendu dans Béton et dans Sable, sur le fond vivant de chaque thème. */
function Section({
  id,
  title,
  note,
  children,
  surface = "ground",
}: {
  id: string;
  title: string;
  note?: string;
  children: (theme: ThemeId) => ReactNode;
  /** `ground` : sur le fond vivant ; `surface` : sur une surface (aperçus qui s'y posent). */
  surface?: "ground" | "surface";
}) {
  // ?only=<id> n'affiche qu'une section, ?theme=beton|sable qu'un thème : comparaison avec l'aperçu d'origine.
  const [params] = useSearchParams();
  const only = params.get("only");
  const oneTheme = params.get("theme");
  if (only && only !== id) return null;
  return (
    <section id={id} className="ds-section">
      <h2 className="ds-h2">{title}</h2>
      {note && <p className="ds-note">{note}</p>}
      <div className="ds-pair">
        {themes
          .filter((theme) => !oneTheme || oneTheme === theme)
          .map((theme) => (
            <ThemeScope key={theme} theme={theme} className="ds-panel" data-panel={`${id}-${theme}`}>
              <div className="ds-panel__label">{theme === "beton" ? "Béton mouillé" : "Sable"}</div>
              {surface === "ground" ? (
                <Ground animated className="ds-panel__ground">
                  <div className="ds-panel__body">{children(theme)}</div>
                </Ground>
              ) : (
                <div className="ds-panel__surface">
                  <div className="ds-panel__body">{children(theme)}</div>
                </div>
              )}
            </ThemeScope>
          ))}
      </div>
    </section>
  );
}

/** Cadre de téléphone : 390 px, coins de l'écran à radius-xl. */
function Phone({ children, height }: { children: ReactNode; height?: number }) {
  return (
    <div className="ds-phone" style={height ? { height } : undefined}>
      {children}
    </div>
  );
}

function ThemeSwitch() {
  const { preference, theme, setPreference } = useTheme();
  const options: Array<[ThemePreference, string]> = [
    ["beton", "Béton"],
    ["sable", "Sable"],
    ["auto", "Auto"],
  ];
  return (
    // biome-ignore lint/a11y/useSemanticElements: groupe de pastilles-boutons, pas un fieldset de formulaire
    <div className="ds-switch" role="group" aria-label="Thème de la page">
      {options.map(([value, label]) => (
        <Chip key={value} selected={preference === value} onClick={() => setPreference(value)}>
          {label}
        </Chip>
      ))}
      <span className="o-t-meta ds-switch__now">thème actif : {theme}</span>
    </div>
  );
}

const fan = (
  <Counters
    items={[
      { value: 34, label: "restantes" },
      { value: 116, label: "retenus" },
      { value: 27, label: "à trier" },
      { value: 12, label: "attente" },
      { value: 9, label: "refusés" },
    ]}
    active={2}
  />
);

export default function DesignSystemDemo() {
  const [count, setCount] = useState(27);
  const [tab, setTab] = useState("garage");
  const [sortTab, setSortTab] = useState("sort");
  const [chip, setChip] = useState("JDM");
  const [checked, setChecked] = useState(true);
  const [scanKey, setScanKey] = useState(0);
  const [params] = useSearchParams();
  return (
    <ThemeScopeRoot only={Boolean(params.get("only"))}>
      <header className="ds-top" hidden={Boolean(params.get("only"))}>
        <Logo width={120} />
        <h1 className="o-t-poster-l ds-title">Système de design</h1>
        <p className="o-t-body ds-lead">
          Les composants du système de design v1 (gelé le 15/10/2026), en Béton mouillé et en Sable. Page de recette du
          lot 03 : chaque aperçu se compare à docs/design-system/components/&lt;Nom&gt;/preview.html.
        </p>
        <ThemeSwitch />
        <nav className="ds-index o-t-meta" aria-label="Composants">
          {[
            "ground",
            "brand",
            "icons",
            "button",
            "chip",
            "statusbadge",
            "plate",
            "field",
            "counters",
            "postercard",
            "vehiclecard",
            "scanresult",
            "appbar",
            "tabbar",
            "motion",
            "cover",
          ].map((id) => (
            <a key={id} href={`#${id}`}>
              {id}
            </a>
          ))}
        </nav>
      </header>

      <Section
        id="ground"
        title="Ground"
        note="Cinq couches et un grain. Le halo respire, les phares passent, le faisceau balaie."
      >
        {() => (
          <Phone height={300}>
            <Ground animated variant="screen" className="ds-fill" />
          </Phone>
        )}
      </Section>

      <Section
        id="brand"
        title="Brand"
        note="Trois ancres : l'en-tête (marque à gauche), la signature de l'objet principal, le site."
      >
        {() => (
          <div className="ds-stack">
            <Phone>
              <AppBar kind="home" avatar={<span className="ds-avatar" />} />
              <AppBar kind="flow" title="Candidater" />
            </Phone>
            <Phone height={120}>
              <div className="ds-hero">
                <FloatingMark kind="mark" />
                <FloatingMark kind="close" />
                <Credit />
              </div>
            </Phone>
            <div className="ds-row">
              <Logo width={128} />
              <Monogram />
              <Loader size={72} />
            </div>
          </div>
        )}
      </Section>

      <Section
        id="icons"
        title="Icons"
        surface="surface"
        note="32 pictogrammes en trait de 2 px, plus quelques ajouts (Direct, œil)."
      >
        {() => (
          <div className="ds-icons">
            {iconNames.map((name) => (
              <figure key={name}>
                <Icon name={name} />
                <figcaption className="o-t-label">{name}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Section>

      <Section id="button" title="Button" note="Un seul principal par écran. Toujours une icône à gauche.">
        {() => (
          <div className="ds-stack">
            <div className="ds-row">
              <Button icon="qr" next>
                Mode jour J
              </Button>
              <Button variant="secondary" icon="heart">
                Suivre
              </Button>
              <Button variant="plate" icon="close">
                Me désister
              </Button>
              <Button variant="plate" tone="dashed" icon="close">
                Refuser
              </Button>
              <Button variant="plate" tone="wait" icon="wait">
                Attente
              </Button>
              <Button variant="close" label="Fermer" />
              <Button variant="alert" icon="alert">
                Alerte
              </Button>
              <Button icon="check" loading>
                Retenir
              </Button>
              <Button icon="qr" disabled>
                Désactivé
              </Button>
              <Button variant="secondary" icon="export" shortcut="E">
                Exporter
              </Button>
            </div>
            <div className="ds-row ds-on-poster">
              <Button variant="poster" icon="qr">
                Ouvrir mon QR
              </Button>
            </div>
            <div className="ds-row">
              <Button variant="plate" icon="close" layout="column" tone="dashed">
                Refuser
              </Button>
              <Button variant="plate" icon="wait" layout="column" tone="wait">
                Attente
              </Button>
              <Button icon="check" layout="column">
                Retenir
              </Button>
            </div>
            <div className="ds-row">
              <Button variant="rescue" icon="plate" height={72}>
                Plaque
              </Button>
              <Button variant="rescue" icon="express" height={72}>
                Express
              </Button>
              <Button variant="rescue" icon="skip" height={72} dashed>
                Sans scan
              </Button>
              <Button variant="rescue" icon="list" height={56}>
                Liste
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section id="chip" title="Chip" surface="surface" note="Sur surface et sur plaque ; accent, vérifié.">
        {() => (
          <div className="ds-stack">
            <ChipRow>
              {["JDM", "Youngtimer", "Sportive", "Motos"].map((label) => (
                <Chip key={label} selected={chip === label} onClick={() => setChip(label)}>
                  {label}
                </Chip>
              ))}
              <Chip variant="accent">60 km</Chip>
              <Chip variant="accent">Zone JDM</Chip>
              <Chip variant="verified">Structure vérifiée</Chip>
              <Chip variant="verified">Certifié</Chip>
            </ChipRow>
            <Plate className="ds-chips-plate">
              <Chip surface="plate" selected>
                Véhicules
              </Chip>
              <Chip surface="plate">Prestataires · 3</Chip>
              <Chip surface="plate">Liste d'attente · 12</Chip>
              <Chip surface="plate" variant="accent">
                JDM
              </Chip>
              <Chip surface="plate">Youngtimer</Chip>
            </Plate>
          </div>
        )}
      </Section>

      <Section
        id="statusbadge"
        title="StatusBadge"
        surface="surface"
        note="Les sept états, lisibles sans leur couleur."
      >
        {() => (
          <div className="ds-stack">
            <div className="ds-row">
              {badgeStatuses.map((status) => (
                <StatusBadge key={status} status={status} rank={status === "waitlist" ? 4 : undefined} />
              ))}
            </div>
            <Plate className="ds-row">
              <StatusBadge status="waitlist" rank={4} onPlate />
              <StatusBadge status="pending" onPlate />
              <StatusBadge status="onsite" onPlate />
            </Plate>
          </div>
        )}
      </Section>

      <Section id="plate" title="Plate" note="La plaque graphite : la carte du téléphone, dans les deux thèmes.">
        {() => (
          <Phone height={380}>
            <div className="ds-screen">
              <Plate className="ds-profile">
                <span className="ds-avatar ds-avatar--big" />
                <div className="ds-profile__text">
                  <div className="o-t-poster-l">Damien_66</div>
                  <div className="o-t-body ds-small">Pyrénées-Orientales · 12 événements</div>
                  <div className="ds-row">
                    <Chip surface="plate" variant="accent">
                      JDM
                    </Chip>
                    <Chip surface="plate">Youngtimer</Chip>
                  </div>
                </div>
                <Credit />
              </Plate>
              <Plate className="ds-compact">
                <b>Compte public</b>
                <span className="ds-accent">Aperçu →</span>
              </Plate>
              <Plate kind="label" className="o-t-label">
                Véhicules actifs · 2
              </Plate>
              <div className="ds-row ds-actions">
                <Button variant="plate" tone="dashed" icon="close" layout="column">
                  Refuser
                </Button>
                <Button variant="plate" tone="wait" icon="wait" layout="column">
                  Attente
                </Button>
                <Button icon="check" layout="column">
                  Retenir
                </Button>
              </div>
              <Plate kind="note" className="o-t-caption ds-center">
                Glisse la carte ou appuie · décision immédiate · annuler 5 s
              </Plate>
            </div>
          </Phone>
        )}
      </Section>

      <Section
        id="field"
        title="Field"
        surface="surface"
        note="Champ, sélection fermée, case à cocher ; aide, erreur, focus."
      >
        {() => (
          <div className="ds-form">
            <TextField
              label="Plaque d'immatriculation"
              defaultValue="AB-123-CD"
              help="Jamais publique. Visible par l'organisateur seulement."
            />
            <TextField
              label="E-mail"
              type="email"
              defaultValue="damien@orasso.fr"
              error="Cette adresse est déjà utilisée."
            />
            <TextField label="Mot de passe" type="password" revealable defaultValue="motdepasse-demo" />
            <SelectField
              label="Génération"
              defaultValue="e36"
              options={[
                { value: "other", label: "Autre" },
                { value: "e36", label: "E36 (1990–2000)" },
                { value: "e46", label: "E46" },
              ]}
            />
            <CheckboxField
              label="Suivre MéditeSportCar — tu recevras ses consignes et ses prochains événements."
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <CheckboxField label="Newsletter Orasso" />
          </div>
        )}
      </Section>

      <Section
        id="counters"
        title="Counters"
        note="Rangée de chiffres stables ; une seule cellule active. Le chiffre glisse de 10 px, rien ne défile."
      >
        {() => (
          <div className="ds-stack">
            {fan}
            <Counters
              variant="surface"
              size="site"
              items={[
                { value: count, label: "à trier" },
                { value: 116, label: "retenus" },
                { value: 12, label: "attente" },
              ]}
              active={0}
            />
            <div className="ds-row">
              <Button variant="plate" icon="undo" onClick={() => setCount((n) => n + 1)}>
                Un de plus
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section id="postercard" title="PosterCard" note="La seule carte claire de l'écran. En Sable elle s'inverse.">
        {() => (
          <div className="ds-stack">
            <div className="ds-poster-wrap">
              <PosterCard
                label="Prochain accès · J-2"
                title={
                  <>
                    Nocturne
                    <br />
                    de Canet
                  </>
                }
                facts="Sam 17 oct · 19 h · Zone JDM · 21°"
                photo={demoPhoto}
                action={{ label: "Mode jour J", icon: "qr", next: true }}
                status="retained"
              />
            </div>
            <div className="ds-row ds-posters">
              <PosterCard
                label="Candidature"
                title="Expo Rivesaltes"
                facts="Dim 25 oct"
                status="pending"
                credit={false}
                reveal={false}
              />
              <PosterCard
                label="Événement"
                title="Rassemblement du port"
                facts="Sam 7 nov"
                status="cancelled"
                credit={false}
                reveal={false}
              />
              <PosterCard
                label="Météo"
                title="Nocturne"
                facts="Sam 14 nov"
                status="uncertain"
                credit={false}
                reveal={false}
              />
            </div>
          </div>
        )}
      </Section>

      <Section
        id="vehiclecard"
        title="VehicleCard"
        note="Une plaque dans les deux thèmes ; la vignette pour Autour de moi."
      >
        {() => (
          <div className="ds-row ds-top-align">
            <VehicleCard
              first
              photo={demoPhoto}
              certified
              photoCount={6}
              name="Nissan 200SX S14"
              year={1996}
              power="250 ch"
              categories={[{ label: "JDM", highlighted: true }, { label: "Youngtimer" }, { label: "Préparée" }]}
              facts="8 événements · dernier : Nocturne de Canet"
            />
            <VehicleThumb photo={demoPhoto} title="Expo Rivesaltes" meta="Dim 25 oct · 12 km · 40 pl." />
          </div>
        )}
      </Section>

      <Section id="scanresult" title="ScanResult" note="OK (moutarde), déjà entré (crème), refusé (rouge). Sans vert.">
        {() => (
          <div className="ds-stack">
            <ScanResult
              key={scanKey}
              state="ok"
              vehicle="Nissan 200SX"
              pseudo="Damien_66"
              zone="JDM"
              time="il y a 4 s"
            />
            <ScanResult state="duplicate" vehicle="Toyota Supra" pseudo="Kenji_66" zone="JDM" time="19:12" />
            <ScanResult state="refused" reason="QR inconnu ou autre événement" />
            <div className="ds-row">
              <Button variant="plate" icon="undo" onClick={() => setScanKey((n) => n + 1)}>
                Rejouer
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section id="appbar" title="AppBar" note="En-tête de métal brossé : Accueil, écran, écran de flux.">
        {() => (
          <Phone>
            <AppBar kind="home" notificationCount={3} avatar={<span className="ds-avatar" />} />
            <AppBar kind="page" title="Mon garage" notificationCount={3} avatar={<span className="ds-avatar" />} />
            <AppBar
              kind="page"
              title="Tri"
              facts="Nocturne de Canet · MéditeSportCar · J-2"
              searchOn
              avatar={<span className="ds-avatar ds-avatar--msc">MSC</span>}
              avatarDot
            />
            <AppBar
              kind="flow"
              title="Scan accueil · Canet"
              facts="Liste à jour 17:02 · hors ligne OK"
              counter="62 / 116"
            />
          </Phone>
        )}
      </Section>

      <Section id="tabbar" title="TabBar" note="Cinq onglets ; l'Accès (ou le Tri) au milieu en pastille inclinée.">
        {() => (
          <div className="ds-stack">
            <Phone>
              <TabBar set="fan" active={tab} onSelect={setTab} />
            </Phone>
            <Phone>
              <TabBar
                set="organizer"
                active={sortTab}
                onSelect={setSortTab}
                tabs={[
                  { id: "live", label: "Direct", icon: "live" },
                  { id: "events", label: "Événements", icon: "calendar" },
                  { id: "sort", label: "Tri", icon: "check", center: true },
                  { id: "inbox", label: "Boîte", icon: "inbox", dot: true },
                  { id: "staff", label: "Staff", icon: "staff" },
                ]}
              />
            </Phone>
          </div>
        )}
      </Section>

      <Section
        id="motion"
        title="Motion"
        note="Tout se gare : entrée, cascade, coupe à 10°. Avec « réduire les animations », tout devient un fondu rapide."
      >
        {() => (
          <div className="ds-stack">
            <Cascade className="ds-cascade">
              {[
                "Kenji_66 · Toyota Supra",
                "Lina_34 · Honda S2000",
                "Marc_66 · BMW E36",
                "Sam_11 · Mazda MX-5",
                "Eva_66 · Alpine A110",
              ].map((row) => (
                <Plate key={row} className="ds-compact">
                  {row}
                </Plate>
              ))}
            </Cascade>
            <div className="ds-row">
              <Park className="ds-motion-chip">
                <StatusBadge status="retained" />
              </Park>
              <Reveal className="ds-reveal">
                <div className="o-t-poster-m">Cut 10°</div>
              </Reveal>
              <span className="ds-loader-demo">
                <Loader size={24} />
              </span>
            </div>
          </div>
        )}
      </Section>

      <Section id="cover" title="Cover" surface="surface">
        {() => (
          <div className="ds-scroll-x">
            <Cover />
          </div>
        )}
      </Section>
    </ThemeScopeRoot>
  );
}

// Le fond de la page suit le thème actif (data-theme de <html>) : un simple conteneur suffit.
function ThemeScopeRoot({ children, only }: { children: ReactNode; only: boolean }) {
  return (
    <main className="ds-page" data-only={only || undefined}>
      {children}
    </main>
  );
}
