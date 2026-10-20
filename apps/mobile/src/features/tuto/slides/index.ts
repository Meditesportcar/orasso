// Les illustrations de chaque tuto, dans l'ordre des diapos de `tutoSlides` (même nombre, vérifié par les tests).
import type { MainProfile } from "@orasso/shared";
import type { ComponentType } from "react";

import { exhibitorSlides } from "./exhibitor";
import { mediaSlides } from "./media";
import { organizerSlides } from "./organizer";
import { proSlides } from "./pro";
import { providerSlides } from "./provider";
import { visitorSlides } from "./visitor";

export const tutoIllustrations: Record<MainProfile, readonly ComponentType[]> = {
  exhibitor: exhibitorSlides,
  visitor: visitorSlides,
  pro: proSlides,
  organizer: organizerSlides,
  provider: providerSlides,
  media: mediaSlides,
};
