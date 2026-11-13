import { invoke } from "@tauri-apps/api/core";

/** True inside the Tauri app; false in a plain browser, where fixtures stand in for the game. */
export const inTauri = "__TAURI_INTERNALS__" in window;

/** True in a development build: its settings menu offers the sample data, game or no game. */
export const devBuild = import.meta.env.DEV;

/** Where a development build keeps whether the sample data stands in for the game. */
const SAMPLE_KEY = "fmlibre.sampleData";

/**
 * Whether a development build shows the sample data of `dev/mock.ts` instead of the game. It is read once, as the
 * setting reloads the window to take effect.
 */
export const sampleData = devBuild && readSampleData();

function readSampleData(): boolean {
  try {
    return window.localStorage.getItem(SAMPLE_KEY) === "on";
  } catch {
    return false;
  }
}

/** Keeps whether the sample data stands in for the game, for the reload that takes it into use. */
export function setSampleData(on: boolean): void {
  try {
    window.localStorage.setItem(SAMPLE_KEY, on ? "on" : "off");
  } catch {
    // Not kept: the choice lasts until the window is closed, and the reload starts the game again.
  }
}

/** Calls a Rust command, or its fixture stand-in when the UI runs in a plain browser or on the sample data. */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri && !sampleData) {
    return invoke<T>(command, args);
  }
  const { mockInvoke } = await import("./dev/mock");
  return mockInvoke<T>(command, args);
}
