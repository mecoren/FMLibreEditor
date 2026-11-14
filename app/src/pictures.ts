// Pictures from the user's graphics packs (club logos, faces, flags), served by the app's
// `fmgfx` protocol. In a plain browser there are none, and every picture falls back.

import { call, inTauri } from "./api";
import type { GraphicsInfo } from "./types";

/** What a picture shows: a club's logo, a person's face, a nation's flag or a competition's logo. */
export type PictureKind = "club" | "face" | "flag" | "competition";

/**
 * The address of a picture, or null when there can be none (no id, or no app to serve it). The app answers
 * 404 for a picture no pack has, so an <img> using it needs a fallback for its error event.
 *
 * `generation` goes in the query, which the app ignores: a picture asked for again after the graphics folder was
 * changed has a new address, so the web view does not answer it from what it kept of the old folder.
 */
export function pictureUrl(kind: PictureKind, id: number | null | undefined, generation = 0): string | null {
  if (!inTauri || id === null || id === undefined) {
    return null;
  }
  // Tauri serves custom protocols as http://<scheme>.localhost on Windows and <scheme>://localhost elsewhere.
  const windows = navigator.userAgent.includes("Windows");
  const query = generation === 0 ? "" : `?v=${generation}`;
  return windows ? `http://fmgfx.localhost/${kind}/${id}${query}` : `fmgfx://localhost/${kind}/${id}${query}`;
}

/** Where the graphics packs are and how many pictures they hold. */
export const graphicsInfo = () => call<GraphicsInfo>("graphics_info");

/**
 * Sets the folder the packs are read from, or with null goes back to the default. The app keeps the choice and reads
 * the packs again, so the answer says `ready` false until it is done.
 */
export const setGraphicsFolder = (folder: string | null) =>
  call<GraphicsInfo>("set_graphics_folder", { folder });
