// The scout report of a player the scout found: a card drawn as a picture (see `scoutReportCanvas.ts`), which can be
// saved to the exports folder as the picture or as a PDF page, or copied to share, and a way on to players like him.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { call } from "./api";
import { describeError } from "./format";
import { scoutingText } from "./labels";
import { pdfOf } from "./reportPdf";
import { playerDetails, type ReportFormat, saveScoutReport } from "./scoutApi";
import { drawReport, pngOf } from "./scoutReportCanvas";
import type { ReportAsk } from "./ScoutParts";
import type { ExportReport, FmDate, PlayerSummary, Role } from "./types";
import { useModal } from "./useModal";

const text = scoutingText.report;

interface ScoutReportProps extends ReportAsk {
  roles: Role[];
  gameDate: FmDate | null;
  onSimilar: (player: PlayerSummary) => void;
  onClose: () => void;
}

/** Where the picture stands: being drawn, drawn (with its address to show), or failed. */
type Drawn = { state: "drawing" } | { state: "done"; canvas: HTMLCanvasElement; url: string } | { state: "failed"; error: string };

export function ScoutReport({ pick, roles, gameDate, onSimilar, onClose }: ScoutReportProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useModal(dialog, true, onClose);
  useEffect(() => {
    dialog.current?.focus();
  }, []);

  const player = pick.suggestion.player;
  const [drawn, setDrawn] = useState<Drawn>({ state: "drawing" });
  const [saved, setSaved] = useState<ExportReport | null>(null);
  /** The format being saved, while it is. */
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const role = (phase: Role["phase"], key: string | null) =>
      roles.find((r) => r.phase === phase && r.key === key);
    (async () => {
      const details = await playerDetails(player.uid);
      const canvas = await drawReport({
        pick,
        details,
        inPossession: role("inPossession", pick.suggestion.inPossessionRole),
        outOfPossession: role("outOfPossession", pick.suggestion.outOfPossessionRole),
        gameDate,
      });
      const url = URL.createObjectURL(await pngOf(canvas));
      if (live) {
        setDrawn({ state: "done", canvas, url });
      } else {
        URL.revokeObjectURL(url);
      }
    })().catch((e) => live && setDrawn({ state: "failed", error: describeError(e) }));
    return () => {
      live = false;
    };
  }, [pick, roles, gameDate, player.uid]);

  // The picture's address is let go with the dialog.
  useEffect(() => () => (drawn.state === "done" ? URL.revokeObjectURL(drawn.url) : undefined), [drawn]);

  const save = async (format: ReportFormat) => {
    if (drawn.state !== "done") {
      return;
    }
    setBusy(format);
    setNote(null);
    try {
      const bytes =
        format === "pdf" ? await pdfOf(drawn.canvas) : new Uint8Array(await (await pngOf(drawn.canvas)).arrayBuffer());
      setSaved(await saveScoutReport(player.uid, bytes, format));
    } catch (e) {
      setNote(text.failed(describeError(e)));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (drawn.state !== "done") {
      return;
    }
    setNote(null);
    try {
      const blob = await pngOf(drawn.canvas);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setNote(text.copied);
    } catch (e) {
      setNote(text.copyFailed(describeError(e)));
    }
  };

  const reveal = async (command: "open_export" | "show_export") => {
    if (saved) {
      try {
        await call(command, { path: saved.path });
      } catch (e) {
        setNote(describeError(e));
      }
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
    >
      <div
        ref={dialog}
        className="modal scout-report"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={drawn.state === "drawing" || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={titleId}>{text.title(player.name)}</h2>
          <p className="compare-hint">{text.hint}</p>
        </header>

        <div className="modal-body">
          {drawn.state === "drawing" && (
            <p className="compare-status" role="status">
              {text.making}
            </p>
          )}
          {drawn.state === "failed" && (
            <div className="banner" role="alert">
              {text.failed(drawn.error)}
            </div>
          )}
          {drawn.state === "done" && (
            <img className="scout-report-card" src={drawn.url} alt={text.alt(player.name)} />
          )}
        </div>

        <footer className="modal-foot">
          <button
            type="button"
            className="primary"
            disabled={drawn.state !== "done" || busy !== null}
            onClick={() => void save("png")}
          >
            {busy === "png" ? text.saving : text.save}
          </button>
          <button type="button" disabled={drawn.state !== "done" || busy !== null} onClick={() => void save("pdf")}>
            {busy === "pdf" ? text.saving : text.savePdf}
          </button>
          <button type="button" disabled={drawn.state !== "done"} onClick={() => void copy()}>
            {text.copy}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onSimilar(player);
            }}
          >
            {text.similar}
          </button>
          <span className="scout-report-status" role="status">
            {saved && (
              <>
                {text.saved(saved.file)}{" "}
                <button type="button" className="link-button" onClick={() => void reveal("open_export")}>
                  {text.open}
                </button>{" "}
                <button type="button" className="link-button" onClick={() => void reveal("show_export")}>
                  {text.show}
                </button>
              </>
            )}
            {note && <span>{note}</span>}
          </span>
          <button type="button" className="scout-report-close" onClick={onClose}>
            {text.close}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
