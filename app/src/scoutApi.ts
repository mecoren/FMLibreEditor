// The Scouting tab's own commands beyond the advice (see `editing.ts` for those): the lists of opportunities, players
// like a given one, saving a scout report, and the club's youth intakes with the cities a city of birth can be set to.
// All of them only read the game.

import { invoke } from "@tauri-apps/api/core";
import { call, inTauri } from "./api";
import type {
  City,
  ExportReport,
  Opportunities,
  OpportunityRequest,
  PlayerDetails,
  Similar,
  SimilarRequest,
  YouthIntakes,
} from "./types";

/** The players of one list of opportunities, and how many every list holds. */
export const scoutingOpportunities = (request: OpportunityRequest) =>
  call<Opportunities>("scouting_opportunities", { request });

/** Players like the player `request.uid`, most alike first. */
export const scoutingSimilar = (request: SimilarRequest) => call<Similar>("scouting_similar", { request });

/** Everything the profile shows of a player: what a comparison and a report are made from. */
export const playerDetails = (uid: number) => call<PlayerDetails>("player_details", { uid });

/** What a scout report is saved as: its picture, or a PDF page with the picture on it. */
export type ReportFormat = "png" | "pdf";

/**
 * Saves a scout report to a new file in the exports folder, named after the player `uid`. The file goes as the
 * request's body, not as JSON.
 */
export async function saveScoutReport(uid: number, bytes: Uint8Array, format: ReportFormat): Promise<ExportReport> {
  if (!inTauri) {
    const { mockInvoke } = await import("./dev/mock");
    return mockInvoke<ExportReport>("save_scout_report", { uid, format, size: bytes.byteLength });
  }
  return invoke<ExportReport>("save_scout_report", bytes, {
    headers: { "x-fmlibre-player": String(uid), "x-fmlibre-format": format },
  });
}

/** The youth intakes of the club `club`, or of the user's club when none is given, the newest first. */
export const youthIntakes = (club: number | null) => call<YouthIntakes>("youth_intakes", { club });

/** The cities the players of the save were born in, by name: what a city of birth can be set to. */
export const birthCities = () => call<City[]>("birth_cities");
