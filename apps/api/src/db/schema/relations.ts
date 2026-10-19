// Relations Drizzle (requêtes relationnelles `db.query.*.findMany({ with })`) : sans effet sur les migrations.
import { relations } from "drizzle-orm";

import { applications } from "./applications";
import { user } from "./auth";
import { events, eventZones } from "./events";
import { mediaContents, mediaProfiles } from "./media";
import { categories, profiles } from "./profiles";
import { structures } from "./structures";
import {
  plateTransferRequests,
  vehicleCategories,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehiclePhotos,
  vehicles,
} from "./vehicles";

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  make: one(vehicleMakes, { fields: [vehicles.makeId], references: [vehicleMakes.id] }),
  model: one(vehicleModels, { fields: [vehicles.modelId], references: [vehicleModels.id] }),
  generation: one(vehicleGenerations, { fields: [vehicles.generationId], references: [vehicleGenerations.id] }),
  photos: many(vehiclePhotos),
  categories: many(vehicleCategories),
  pendingTransfer: one(plateTransferRequests, {
    fields: [vehicles.pendingTransferId],
    references: [plateTransferRequests.id],
  }),
}));

export const vehiclePhotosRelations = relations(vehiclePhotos, ({ one }) => ({
  vehicle: one(vehicles, { fields: [vehiclePhotos.vehicleId], references: [vehicles.id] }),
}));

export const vehicleCategoriesRelations = relations(vehicleCategories, ({ one }) => ({
  vehicle: one(vehicles, { fields: [vehicleCategories.vehicleId], references: [vehicles.id] }),
  category: one(categories, { fields: [vehicleCategories.categoryId], references: [categories.id] }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  structure: one(structures, { fields: [events.structureId], references: [structures.id] }),
  zones: many(eventZones),
}));

export const eventZonesRelations = relations(eventZones, ({ one }) => ({
  event: one(events, { fields: [eventZones.eventId], references: [events.id] }),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  event: one(events, { fields: [applications.eventId], references: [events.id] }),
  vehicle: one(vehicles, { fields: [applications.vehicleId], references: [vehicles.id] }),
  zone: one(eventZones, { fields: [applications.zoneId], references: [eventZones.id] }),
  user: one(user, { fields: [applications.userId], references: [user.id] }),
  profile: one(profiles, { fields: [applications.userId], references: [profiles.userId] }),
  mediaProfile: one(mediaProfiles, { fields: [applications.mediaProfileId], references: [mediaProfiles.id] }),
}));

// Lot 45 : contenus d'un média.
export const mediaContentsRelations = relations(mediaContents, ({ one }) => ({
  mediaProfile: one(mediaProfiles, { fields: [mediaContents.mediaProfileId], references: [mediaProfiles.id] }),
  event: one(events, { fields: [mediaContents.eventId], references: [events.id] }),
}));
