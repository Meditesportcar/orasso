// Écran de recette du système de design natif (lot 04) : chaque composant dans Béton et dans Sable, à comparer
// aux aperçus de docs/design-system/components/<Nom>/preview.html. Route cachée /_ds (non liée).
// ?only=<composant> n'affiche qu'une section, ?theme=beton|sable qu'un thème (comparaison avec l'aperçu).

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
  OpeningLogo,
  Park,
  Plate,
  PosterCard,
  Reveal,
  ScanResult,
  SelectField,
  Sheet,
  StatusBadge,
  TabBar,
  Text,
  TextField,
  type ThemeId,
  type ThemePreference,
  ThemeScope,
  type ThemeTokens,
  useTheme,
  VehicleCard,
  VehicleThumb,
} from "@orasso/design-system/native";
import { useLocalSearchParams } from "expo-router";
import { type ReactNode, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Segments } from "@/ui/Segments";

import { OliveContent } from "./Olive";
import { V2Content } from "./V2";

const themes: ThemeId[] = ["beton", "sable"];

const sections = [
  "v2",
  "olive",
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
] as const;

/** Photos de démonstration : des dégradés faits des jetons du thème (le vrai contenu vient des photos de véhicules). */
function photoOf(t: ThemeTokens) {
  return { placeholder: `linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)` };
}

function Panel({
  theme,
  surface,
  children,
}: {
  theme: ThemeId;
  surface: boolean;
  children: (t: ThemeTokens) => ReactNode;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.panel} testID={`panel-${theme}`}>
      <Text variant="label" color={t.color.inkMuted} style={styles.panelLabel}>
        {theme === "beton" ? "Béton mouillé" : "Sable"}
      </Text>
      {surface ? (
        <View style={[styles.surface, { backgroundColor: t.color.surface }]}>
          <View style={styles.body}>{children(t)}</View>
        </View>
      ) : (
        <Ground animated>
          <View style={styles.body}>{children(t)}</View>
        </Ground>
      )}
    </View>
  );
}

/** Une section : le même contenu rendu dans Béton et dans Sable, sur le fond vivant de chaque thème. */
function Section({
  id,
  title,
  note,
  surface = false,
  children,
}: {
  id: (typeof sections)[number];
  title: string;
  note?: string;
  surface?: boolean;
  children: (t: ThemeTokens) => ReactNode;
}) {
  const params = useLocalSearchParams<{ only?: string; theme?: string }>();
  const { t } = useTheme();
  if (params.only && params.only !== id) return null;
  return (
    <View style={styles.section} testID={`section-${id}`}>
      <View style={styles.head}>
        <Text variant="posterM" color={t.color.ink}>
          {title}
        </Text>
        {note ? (
          <Text variant="caption" color={t.color.inkMuted} style={styles.note}>
            {note}
          </Text>
        ) : null}
      </View>
      {themes
        .filter((theme) => !params.theme || params.theme === theme)
        .map((theme) => (
          <ThemeScope key={theme} theme={theme}>
            <Panel theme={theme} surface={surface}>
              {children}
            </Panel>
          </ThemeScope>
        ))}
    </View>
  );
}

/** Cadre de téléphone : un écran de 390 px de large, coins à radius-xl, qui rogne son contenu. */
function Phone({ children, height }: { children: ReactNode; height?: number }) {
  const { t } = useTheme();
  return <View style={[styles.phone, { backgroundColor: t.color.ground, height }]}>{children}</View>;
}

function ThemeSwitch() {
  const { preference, theme, setPreference } = useTheme();
  const { t } = useTheme();
  const options: [ThemePreference, string][] = [
    ["beton", "Béton"],
    ["sable", "Sable"],
    ["auto", "Automatique"],
  ];
  return (
    <View style={styles.switch}>
      <Segments items={options.map(([id, label]) => ({ id, label }))} value={preference} onChange={setPreference} />
      <Text variant="meta" color={t.color.inkMuted}>
        thème actif : {theme}
      </Text>
    </View>
  );
}

function Avatar({ big = false, label }: { big?: boolean; label?: string }) {
  const { t } = useTheme();
  return (
    <View
      style={[
        styles.avatar,
        big && styles.avatarBig,
        { backgroundColor: label ? t.color.night : t.color.surfaceRaised, borderColor: t.color.accent },
      ]}
    >
      {label ? (
        <Text variant="credit" color={t.color.accent}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export default function DesignSystemDemo() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ only?: string }>();
  const { t } = useTheme();
  const [count, setCount] = useState(27);
  const [tab, setTab] = useState("garage");
  const [sortTab, setSortTab] = useState("sort");
  const [chip, setChip] = useState("JDM");
  const [checked, setChecked] = useState(true);
  const [newsletter, setNewsletter] = useState(false);
  const [generation, setGeneration] = useState("e36");
  const [scanKey, setScanKey] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [flash, setFlash] = useState(false);
  const [openingKey, setOpeningKey] = useState(0);

  return (
    <View style={[styles.page, { backgroundColor: t.color.ground }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      >
        {!params.only && (
          <View style={styles.top}>
            <Logo width={120} />
            <Text variant="posterL" color={t.color.ink}>
              Système de design natif
            </Text>
            <Text variant="body" color={t.color.inkMuted}>
              Les composants du système de design v1 (gelé le 15/10/2026) en React Native, en Béton mouillé et en Sable.
              Recette du lot 04 : chaque aperçu se compare à docs/design-system/components/&lt;Nom&gt;/preview.html.
            </Text>
            <ThemeSwitch />
          </View>
        )}

        <Section
          id="v2"
          title="DA v2 (lot 38)"
          note="Surcouche de jetons et raisons, contour sur photo et sur fond, barre du haut v2, grands titres sur une ligne, barres des six profils."
        >
          {(theme) => <V2Content t={theme} />}
        </Section>

        <Section
          id="olive"
          title="Le O vivant (lot 39)"
          note="La voiture du logo devient l'indicateur d'Orasso : drift continu pendant un chargement, garée dans le O quand c'est fini. Huit variantes et le fond animé « battle »."
        >
          {(theme) => <OliveContent t={theme} />}
        </Section>

        <Section
          id="ground"
          title="Ground"
          note="Cinq couches et un grain. Le halo respire, les phares passent, le faisceau balaie."
        >
          {() => (
            <Phone height={300}>
              <Ground animated variant="screen" />
            </Phone>
          )}
        </Section>

        <Section
          id="brand"
          title="Brand"
          note="Trois ancres : l'en-tête (marque à gauche), la signature de l'objet principal, le site."
        >
          {() => (
            <View style={styles.stack}>
              <Phone>
                <AppBar kind="home" avatar={<Avatar />} />
                <AppBar kind="flow" title="Candidater" />
              </Phone>
              <Phone height={120}>
                <FloatingMark kind="mark" />
                <FloatingMark kind="close" />
                <Credit />
              </Phone>
              <View style={styles.row}>
                <Logo width={128} />
                <Monogram />
                <Loader size={72} />
              </View>
              <View style={styles.row}>
                <Button variant="plate" icon="undo" onPress={() => setOpeningKey((n) => n + 1)}>
                  Rejouer l'ouverture
                </Button>
              </View>
              <OpeningLogo key={openingKey} width={240} />
            </View>
          )}
        </Section>

        <Section
          id="icons"
          title="Icons"
          surface
          note="32 pictogrammes en trait de 2 px, plus quelques ajouts (Direct, œil)."
        >
          {(t) => (
            <View style={styles.icons}>
              {iconNames.map((name) => (
                <View key={name} style={styles.iconCell}>
                  <Icon name={name} color={t.color.ink} />
                  <Text variant="label" color={t.color.inkMuted}>
                    {name}
                  </Text>
                </View>
              ))}
              <Text variant="credit" color={t.color.inkFaint}>
                {t.id}
              </Text>
            </View>
          )}
        </Section>

        <Section id="button" title="Button" note="Un seul principal par écran. Toujours une icône à gauche.">
          {() => (
            <View style={styles.stack}>
              <View style={styles.row}>
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
              </View>
              <View style={styles.row}>
                <Button variant="poster" icon="qr">
                  Ouvrir mon QR
                </Button>
              </View>
              <View style={styles.row}>
                <Button variant="plate" icon="close" layout="column" tone="dashed">
                  Refuser
                </Button>
                <Button variant="plate" icon="wait" layout="column" tone="wait">
                  Attente
                </Button>
                <Button icon="check" layout="column">
                  Retenir
                </Button>
              </View>
              <View style={styles.row}>
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
              </View>
            </View>
          )}
        </Section>

        <Section id="chip" title="Chip" surface note="Sur surface et sur plaque ; accent, vérifié.">
          {() => (
            <View style={styles.stack}>
              <ChipRow>
                <Segments
                  items={["JDM", "Youngtimer", "Sportive", "Motos"].map((id) => ({ id, label: id }))}
                  value={chip}
                  onChange={setChip}
                />
                <Chip variant="accent">60 km</Chip>
                <Chip variant="accent">Zone JDM</Chip>
                <Chip variant="verified">Structure vérifiée</Chip>
                <Chip variant="verified">Certifié</Chip>
              </ChipRow>
              <Plate style={styles.chipsPlate}>
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
            </View>
          )}
        </Section>

        <Section id="statusbadge" title="StatusBadge" surface note="Les sept états, lisibles sans leur couleur.">
          {() => (
            <View style={styles.stack}>
              <View style={styles.row}>
                {badgeStatuses.map((status) => (
                  <StatusBadge key={status} status={status} rank={status === "waitlist" ? 4 : undefined} />
                ))}
              </View>
              <Plate style={styles.row}>
                <StatusBadge status="waitlist" rank={4} onPlate />
                <StatusBadge status="pending" onPlate />
                <StatusBadge status="onsite" onPlate />
              </Plate>
            </View>
          )}
        </Section>

        <Section id="plate" title="Plate" note="La plaque graphite : la carte du téléphone, dans les deux thèmes.">
          {(t) => (
            <View style={styles.stack}>
              <Plate style={styles.profile}>
                <Avatar big />
                <View style={styles.profileText}>
                  <Text variant="posterL" color={t.color.plateInk}>
                    Damien_66
                  </Text>
                  <Text variant="body" color={t.color.plateMuted} style={styles.small}>
                    Pyrénées-Orientales · 12 événements
                  </Text>
                  <View style={styles.row}>
                    <Chip surface="plate" variant="accent">
                      JDM
                    </Chip>
                    <Chip surface="plate">Youngtimer</Chip>
                  </View>
                </View>
                <Credit />
              </Plate>
              <Plate style={styles.compact}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  Compte public
                </Text>
                <Text variant="bodyStrong" color={t.color.accent}>
                  Aperçu →
                </Text>
              </Plate>
              <Plate kind="label">
                <Text variant="label" color={t.color.plateInk}>
                  Véhicules actifs · 2
                </Text>
              </Plate>
              <View style={styles.actions}>
                <Button variant="plate" tone="dashed" icon="close" layout="column">
                  Refuser
                </Button>
                <Button variant="plate" tone="wait" icon="wait" layout="column">
                  Attente
                </Button>
                <Button icon="check" layout="column">
                  Retenir
                </Button>
              </View>
              <Plate kind="note">
                <Text variant="caption" color={t.color.plateMuted} style={styles.center}>
                  Glisse la carte ou appuie · décision immédiate · annuler 5 s
                </Text>
              </Plate>
            </View>
          )}
        </Section>

        <Section id="field" title="Field" surface note="Champ, sélection fermée, case à cocher ; aide, erreur, focus.">
          {() => (
            <View style={styles.form}>
              <TextField
                label="Plaque d'immatriculation"
                defaultValue="AB-123-CD"
                help="Jamais publique. Visible par l'équipe organisatrice seulement."
              />
              <TextField
                label="E-mail"
                keyboardType="email-address"
                defaultValue="damien@orasso.fr"
                error="Cette adresse est déjà utilisée."
              />
              <TextField label="Mot de passe" secureTextEntry revealable defaultValue="motdepasse-demo" />
              <SelectField
                label="Génération"
                value={generation}
                onValueChange={setGeneration}
                options={[
                  { value: "other", label: "Autre" },
                  { value: "e36", label: "E36 (1990–2000)" },
                  { value: "e46", label: "E46" },
                ]}
              />
              <CheckboxField
                label="Suivre MéditeSportCar — tu recevras ses consignes et ses prochains événements."
                checked={checked}
                onChange={setChecked}
              />
              <CheckboxField label="Newsletter Orasso" checked={newsletter} onChange={setNewsletter} />
              <Plate>
                <TextField label="Pseudo (sur plaque)" defaultValue="Damien_66" />
              </Plate>
            </View>
          )}
        </Section>

        <Section
          id="counters"
          title="Counters"
          note="Rangée de chiffres stables ; une seule cellule active. Le chiffre glisse de 10 px, rien ne défile."
        >
          {() => (
            <View style={styles.stack}>
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
              <View style={styles.row}>
                <Button variant="plate" icon="undo" onPress={() => setCount((n) => n + 1)}>
                  Un de plus
                </Button>
              </View>
            </View>
          )}
        </Section>

        <Section id="postercard" title="PosterCard" note="La seule carte claire de l'écran. En Sable elle s'inverse.">
          {(t) => (
            <View style={styles.stack}>
              <PosterCard
                label="Prochain accès · J-2"
                title={"Nocturne\nde Canet"}
                facts="Sam 17 oct · 19 h · Zone JDM · 21°"
                photo={photoOf(t)}
                action={{ label: "Mode jour J", icon: "qr", next: true }}
                status="retained"
              />
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
            </View>
          )}
        </Section>

        <Section
          id="vehiclecard"
          title="VehicleCard"
          note="Une plaque dans les deux thèmes ; la vignette pour Autour de moi."
        >
          {(t) => (
            <View style={styles.stack}>
              <VehicleCard
                first
                photo={photoOf(t)}
                certified
                photoCount={6}
                name="Nissan 200SX S14"
                year={1996}
                power="250 ch"
                categories={[{ label: "JDM", highlighted: true }, { label: "Youngtimer" }, { label: "Préparée" }]}
                facts="8 événements · dernier : Nocturne de Canet"
              />
              <VehicleThumb photo={photoOf(t)} title="Expo Rivesaltes" meta="Dim 25 oct · 12 km · 40 pl." />
            </View>
          )}
        </Section>

        <Section
          id="scanresult"
          title="ScanResult"
          note="OK (moutarde), déjà entré (crème), refusé (rouge). Sans vert."
        >
          {() => (
            <View style={styles.stack}>
              <ScanResult
                key={scanKey}
                state="ok"
                vehicle="Nissan 200SX"
                pseudo="Damien_66"
                zone="JDM"
                time="il y a 4 s"
                sound={false}
              />
              <ScanResult
                key={`d${scanKey}`}
                state="duplicate"
                vehicle="Toyota Supra"
                pseudo="Kenji_66"
                zone="JDM"
                time="19:12"
                sound={false}
              />
              <ScanResult key={`r${scanKey}`} state="refused" reason="QR inconnu ou autre événement" sound={false} />
              <View style={styles.row}>
                <Button variant="plate" icon="undo" onPress={() => setScanKey((n) => n + 1)}>
                  Rejouer
                </Button>
                <Button variant="plate" icon="qr" onPress={() => setFlash(true)}>
                  Plein écran
                </Button>
              </View>
              {flash && (
                <Phone height={320}>
                  <ScanResult
                    fullscreen
                    state="ok"
                    vehicle="Nissan 200SX"
                    pseudo="Damien_66"
                    zone="JDM"
                    sound={false}
                    onReturn={() => setFlash(false)}
                  />
                </Phone>
              )}
            </View>
          )}
        </Section>

        <Section id="appbar" title="AppBar" note="En-tête de métal brossé : Accueil, écran, écran de flux.">
          {() => (
            <Phone>
              <AppBar kind="home" notificationCount={3} avatar={<Avatar />} />
              <AppBar kind="page" title="Mon garage" notificationCount={3} avatar={<Avatar />} />
              <AppBar
                kind="page"
                title="Tri"
                facts="Nocturne de Canet · MéditeSportCar · J-2"
                searchOn
                avatar={<Avatar label="MSC" />}
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
            <View style={styles.stack}>
              <Phone>
                <TabBar set="exhibitor" active={tab} onSelect={setTab} />
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
            </View>
          )}
        </Section>

        <Section
          id="motion"
          title="Motion"
          note="Tout se gare : entrée, cascade, coupe à 10°, feuille. Avec « réduire les animations », tout devient un fondu rapide."
        >
          {(t) => (
            <View style={styles.stack}>
              <Cascade style={styles.cascade}>
                {[
                  "Kenji_66 · Toyota Supra",
                  "Lina_34 · Honda S2000",
                  "Marc_66 · BMW E36",
                  "Sam_11 · Mazda MX-5",
                  "Eva_66 · Alpine A110",
                ].map((row) => (
                  <Plate key={row} style={styles.compact}>
                    <Text variant="bodyStrong" color={t.color.plateInk}>
                      {row}
                    </Text>
                  </Plate>
                ))}
              </Cascade>
              <View style={styles.row}>
                <Park>
                  <StatusBadge status="retained" />
                </Park>
                <Reveal>
                  <Plate kind="label">
                    <Text variant="posterM" color={t.color.plateInk}>
                      Cut 10°
                    </Text>
                  </Plate>
                </Reveal>
                <Loader size={24} />
                <Button variant="plate" icon="list" onPress={() => setSheet(true)}>
                  Feuille
                </Button>
              </View>
              <Phone height={260}>
                <Sheet visible={sheet} onClose={() => setSheet(false)} accessibilityLabel="Feuille d'action">
                  <Text variant="title" color={t.color.ink}>
                    Mon QR d'accès
                  </Text>
                  <Button icon="check" onPress={() => setSheet(false)} style={styles.sheetButton}>
                    Compris
                  </Button>
                </Sheet>
              </Phone>
            </View>
          )}
        </Section>

        <Section id="cover" title="Cover" surface>
          {() => <Cover />}
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { gap: 32 },
  top: { gap: 12, alignItems: "flex-start", paddingHorizontal: 16 },
  section: { gap: 8 },
  head: { paddingHorizontal: 16, gap: 4 },
  note: { marginBottom: 4 },
  panel: { gap: 6, marginTop: 8 },
  panelLabel: { paddingLeft: 18 },
  surface: { overflow: "hidden" },
  body: { padding: 16, gap: 12 },
  phone: { overflow: "hidden", borderRadius: 30, position: "relative", marginHorizontal: -16 },
  stack: { gap: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  actions: { flexDirection: "row", gap: 8 },
  switch: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  icons: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  iconCell: { width: 72, alignItems: "center", gap: 4 },
  chipsPlate: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  profile: { flexDirection: "row", gap: 12, minHeight: 120 },
  profileText: { flex: 1, gap: 6 },
  small: { fontSize: 13, lineHeight: 18 },
  compact: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  center: { textAlign: "center" },
  form: { gap: 16 },
  cascade: { gap: 8 },
  sheetButton: { marginTop: 12 },
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  avatarBig: { width: 64, height: 64, borderRadius: 32 },
});
