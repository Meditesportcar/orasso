# @orasso/design-system

Le système de design Orasso en code, d'après `docs/design-system/` (v1, gelé le 15/10/2026). Aucune valeur en dur : tout vient de `docs/design-system/tokens.json`.

## Ce qui est dans le paquet

| Chemin | Rôle |
|---|---|
| `scripts/generate-tokens.mjs` | Lit `tokens.json`, écrit `src/tokens.ts`, `src/web/tokens.css`, `src/web/typography.css`. Lancé par `build` et avant `test` (`pnpm --filter @orasso/design-system run generate`). Les sorties sont versionnées. |
| `src/tokens.ts`, `motion.ts`, `labels.ts`, `icons.ts` | Commun au site et à l'appli (lot 04), sans React : jetons des deux thèmes, durées et courbes, libellés, formes des icônes. Import : `@orasso/design-system`. |
| `src/web/` | Version web (React, rendu serveur) : thèmes, mouvement, polices, 16 composants. Import : `@orasso/design-system/web` et, une fois, `@orasso/design-system/web/styles.css`. |
| `src/web/components/` | Un composant = un `.tsx` + un `.css` (classes `o-…`). Aucune couleur ni durée en dur (un test le vérifie). |
| `scripts/build-preview-harness.mjs` | Prépare les `preview.html` d'origine pour la comparaison avec `/_ds` (sortie ignorée par Git). |

## Utiliser

```tsx
import "@orasso/design-system/web/styles.css";
import { Button, PosterCard, ThemeProvider } from "@orasso/design-system/web";

<Button icon="qr" next>Mode jour J</Button>
```

- Le thème est l'attribut `data-theme` (`beton` par défaut, `sable`) : voir `ThemeProvider`, `ThemeScript`, `readThemeCookie` (cookie `orasso-theme`, lu côté serveur : pas de flash).
- Tout bouton porte une icône (`icon` est obligatoire sauf pour la pastille ✕). Un seul bouton principal et un seul `PosterCard` par écran.
- Mouvement : classes `o-anim-*` et composants `Park`, `Cascade`, `Reveal`, `ScreenTransition`. Avec `prefers-reduced-motion`, tout devient un fondu de 120 ms.

## Version native (appli Expo)

| Chemin | Rôle |
|---|---|
| `src/native/` | Mêmes composants que le web, en React Native : `ThemeProvider`/`useTheme`, `Text`, `Ground`, `AppBar`, `TabBar`, `Button`, `Chip`, `Field`, `Plate`, `PosterCard`, `ScanResult`… Import : `@orasso/design-system/native`. |
| `src/native/fonts/` | Archivo en six instances statiques (largeur × graisse × style), générées par `scripts/generate-native-fonts.py` depuis les polices du site ; chargées par `useOrassoFonts()`. |
| `src/native/brandArt.ts` | Géométrie du logotype, du monogramme et du chargement, **générée** par `scripts/generate-native-brand.mjs` (lancé par `generate` et `test`). |
| `src/native/sounds/` | Trois sons de scan provisoires, générés par `scripts/generate-scan-sounds.mjs`. |
| `src/native/gradientCss.ts`, `noise.ts` | Lecture des dégradés CSS des jetons et bruit du grain / brossage (recalculés : `react-native-svg` ne rend pas feTurbulence). Testés sous Vitest. |

Dépendances de l'appli (`peerDependencies` optionnelles du paquet) : `react-native`, `react-native-svg`, `react-native-reanimated`, `expo-font`, `expo-audio`. Aucune valeur de couleur ou de durée dans les composants (un test le vérifie). Recette : route cachée `/_ds` de `apps/mobile`.

Les composants se voient sur la page `/_ds` du site (non liée) ; les choix faits au-delà des docs sont dans `docs/JOURNAL-DES-CHOIX.md`.
