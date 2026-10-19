// Système de design Orasso, version web (React, rendu serveur). Importer aussi la feuille de style une fois :
//   import "@orasso/design-system/web/styles.css";
export * from "../icons";
export * from "../labels";
export * from "../motion";
export { THEME_IDS, type ThemeId, tokens, tokensV2Overlay } from "../tokens";
export { AppBar, AppBarAction, type AppBarPersona, type AppBarProps } from "./components/AppBar";
export { BigTitle, type BigTitleProps } from "./components/BigTitle";
export { type BrandTone, Credit, FloatingMark, Loader, Logo, Monogram, PoweredBy } from "./components/Brand";
export { Button, type ButtonProps } from "./components/Button";
export { Chip, type ChipProps, ChipRow } from "./components/Chip";
export { type CounterItem, Counters, type CountersProps } from "./components/Counters";
export { Cover, type CoverProps } from "./components/Cover";
export {
  CheckboxField,
  type CheckboxFieldProps,
  SelectField,
  type SelectFieldProps,
  type SelectOption,
  TextField,
  type TextFieldProps,
} from "./components/Field";
export { Ground, type GroundProps } from "./components/Ground";
export { Icon, type IconProps } from "./components/Icon";
export { Cascade, Park, Reveal, ScreenTransition, type ScreenTransitionProps, TabPanel } from "./components/Motion";
export { Outlined, type OutlinedProps } from "./components/Outlined";
export { Plate, type PlateProps } from "./components/Plate";
export { PosterCard, type PosterCardProps, type PosterStatus } from "./components/PosterCard";
export { ScanResult, type ScanResultProps } from "./components/ScanResult";
export { StatusBadge, type StatusBadgeProps } from "./components/StatusBadge";
export { TabBar, type TabBarProps, type TabItem } from "./components/TabBar";
export { VehicleCard, type VehicleCardProps, VehicleThumb, type VehicleThumbProps } from "./components/VehicleCard";
export {
  DEFAULT_THEME_PREFERENCE,
  DEPT_COOKIE,
  departmentPosition,
  parseThemePreference,
  readThemeCookie,
  resolveTheme,
  SOLAR_REFRESH_MS,
  type SolarContext,
  serverTheme,
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  type ThemePreference,
  ThemeProvider,
  ThemeScope,
  ThemeScript,
  themeInitScript,
  useReducedMotion,
  useTheme,
} from "./theme";
