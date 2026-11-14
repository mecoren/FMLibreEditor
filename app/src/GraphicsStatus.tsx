import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { graphicsText as text } from "./labels";
import { retryMissingPictures } from "./Picture";
import { graphicsInfo, setGraphicsFolder } from "./pictures";
import "./styles/graphics-folder.css";
import type { GraphicsCounts, GraphicsInfo } from "./types";

/** How often the app is asked while it is still reading the packs, and for how long at most. */
const POLL_MS = 1000;
const POLL_FOR_MS = 20_000;

/** What the colophon knows about the packs. `info` is null when the app could not say, or never finished reading. */
type Graphics = { phase: "asking" } | { phase: "reading" } | { phase: "known"; info: GraphicsInfo | null };

/**
 * Asks the app about the graphics packs. It reads them in the background when it starts, which takes under a second,
 * so while it says it is not ready the question is repeated every second, for twenty at most. Pictures asked for in
 * the meantime were answered 404, so they are told to ask again once the packs are ready.
 *
 * `reload` asks again from the start: the graphics folder settings call it once the app has taken another folder.
 */
function useGraphics(): [Graphics, () => void] {
  const [graphics, setGraphics] = useState<Graphics>({ phase: "asking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUpAt = Date.now() + POLL_FOR_MS;
    // Whether an answer said "not ready": only then can a picture have been asked for too early.
    let waited = false;

    const ask = async () => {
      let info: GraphicsInfo | null = null;
      try {
        info = await graphicsInfo();
      } catch {
        // No answer: there is nothing to wait for, and the packs cannot be shown.
      }
      if (cancelled) {
        return;
      }
      if (info !== null && !info.ready && Date.now() < giveUpAt) {
        waited = true;
        setGraphics({ phase: "reading" });
        timer = setTimeout(ask, POLL_MS);
        return;
      }
      if (waited && info?.ready) {
        retryMissingPictures();
      }
      setGraphics({ phase: "known", info: info?.ready ? info : null });
    };
    void ask();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attempt]);

  const reload = () => {
    setGraphics({ phase: "asking" });
    setAttempt((attempt) => attempt + 1);
  };
  return [graphics, reload];
}

/** Whether the packs hold any picture at all. */
const hasPictures = (counts: GraphicsCounts): boolean =>
  counts.clubLogos + counts.faces + counts.flags + counts.competitionLogos > 0;

/**
 * The graphics folder the packs are read from: a folder button beside the pack note, which opens a box to type the
 * folder in, use the default again, and see where the folder in use came from. The choice is kept by the app (see
 * `set_graphics_folder`), so that the packs are read from it after a restart.
 */
function GraphicsFolderSettings({
  info,
  onSaved,
  label,
}: {
  info: GraphicsInfo | null;
  onSaved: () => void;
  /** Whether the button says what it opens: it does while there are no pictures, where it is the way out. */
  label: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The box starts with the folder the user chose, empty while the default is used: the default is in the placeholder.
  const show = (next: boolean) => {
    setOpen(next);
    if (next) {
      setValue(info?.chosen ?? "");
      setError(null);
    }
  };

  const save = async (folder: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await setGraphicsFolder(folder);
      setOpen(false);
      onSaved();
    } catch {
      setError(text.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const folder = value.trim();
    void save(folder === "" ? null : folder);
  };

  const source =
    info?.source === "user"
      ? text.sourceUser
      : info?.source === "environment"
        ? text.sourceEnvironment
        : info?.source === "default"
          ? text.sourceDefault
          : null;
  const warning =
    error ??
    (info === null || info.root === null
      ? null
      : !info.exists
        ? text.missing
        : info.ready && !hasPictures(info.counts)
          ? text.empty
          : null);
  const cannotSave = busy || info?.savable === false;
  // The box takes a red edge when the folder it names is not there, or when the choice could not be kept.
  const invalid = error !== null || (info !== null && info.root !== null && !info.exists);

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="graphics-folder-toggle"
          aria-label={text.folderLabel}
          title={text.folderLabel}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2.5 5.7A1.7 1.7 0 0 1 4.2 4h3.1l1.5 1.7h7A1.7 1.7 0 0 1 17.5 7.4v6.9A1.7 1.7 0 0 1 15.8 16H4.2a1.7 1.7 0 0 1-1.7-1.7z" />
          </svg>
          {label && <span>{text.folderLabel}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={6} className="graphics-folder">
        <h2 className="graphics-folder-title">{text.folderLabel}</h2>
        <p className="graphics-folder-hint">{text.folderHint}</p>
        {info?.defaultRoot && <code className="graphics-folder-default">{info.defaultRoot}</code>}
        <form onSubmit={submit}>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={info?.defaultRoot ?? text.folderPlaceholder}
            aria-label={text.folderLabel}
            aria-invalid={invalid}
            spellCheck={false}
            autoComplete="off"
            className="text-sm"
            disabled={busy || info?.savable === false}
          />
          <div className="graphics-folder-actions">
            <Button type="submit" size="sm" className="skin" disabled={cannotSave}>
              {text.save}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="skin"
              disabled={cannotSave || (!info?.chosen && info?.source !== "user")}
              onClick={() => void save(null)}
            >
              {text.useDefault}
            </Button>
          </div>
        </form>
        {source && <p className="graphics-folder-source">{source}</p>}
        {warning && (
          <p className="graphics-folder-warning" role="alert">
            {warning}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * What the graphics packs hold, for the colophon at the foot of the window: how many club logos, flags and faces, or
 * that there are no packs. Where packs go, and the folder they are read from, are in the hover text.
 */
export function GraphicsStatus() {
  const [graphics, reload] = useGraphics();
  if (graphics.phase === "asking") {
    return null;
  }
  const info = graphics.phase === "known" ? graphics.info : null;
  return (
    <>
      {graphics.phase === "reading" ? (
        <p className="sidebar-note">{text.reading}</p>
      ) : info !== null && hasPictures(info.counts) ? (
        <p className="sidebar-note" title={info.root ?? undefined}>
          {text.summary(info.counts)}
        </p>
      ) : (
        <p className="sidebar-note" title={[text.noneHint, info?.root].filter(Boolean).join("\n")}>
          {text.none}
        </p>
      )}
      <GraphicsFolderSettings
        info={info}
        onSaved={reload}
        label={info === null || !hasPictures(info.counts)}
      />
    </>
  );
}
