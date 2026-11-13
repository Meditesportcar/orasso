// Les sources du Fil, une par fichier (ARCHITECTURE-R7 § 2.4). Un lot suivant remplace le fichier réservé qui le
// concerne (`spotMeetup`, `memory`, `sponsored` : aujourd'hui `null`) ; cette liste n'a pas à changer.
import { source as events } from "./events";
import { source as feedPosts } from "./feedPosts";
import { source as lineups } from "./lineups";
import { source as memory } from "./memory";
import { source as pros } from "./pros";
import { source as spotMeetup } from "./spotMeetup";
import type { FeedSource } from "./types";
import { source as vehicles } from "./vehicles";
import { source as voteResults } from "./voteResults";

/**
 * Sources qui alimentent le classement. `sponsored` (R7k1) n'en fait pas partie : elle s'insère par `insertSponsored`.
 * Vague R8 (lot R8d) : la source `announcements` n'y est plus, les annonces publiques sont des publications du journal de
 * l'événement et entrent par `feedPosts` ; le genre de carte `announcement` reste dans l'union (l'APK en ligne le connaît).
 */
const all: unknown[] = [events, vehicles, lineups, voteResults, pros, feedPosts, spotMeetup, memory];
export const rankedSources = all.filter((s) => s !== null) as FeedSource[];
