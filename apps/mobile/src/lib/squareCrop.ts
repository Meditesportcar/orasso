// Recadrage carré : le calcul vit désormais dans `@orasso/shared` (partagé avec le site, lot M1).
export {
  type CropView,
  centerCrop,
  clampView,
  cropFromView,
  cropPixels,
  displayScale,
  MAX_ZOOM,
  MIN_ZOOM,
  pinchZoom,
  previewPlacement,
  type SquareCrop,
  stepZoom,
  viewFromCrop,
  ZOOM_STEP,
} from "@orasso/shared";
