// Copy diagnostics, at the foot of the window and in the notice under the masthead: puts the report the Rust side
// builds from the connection as it is now (`diagnostics`) on the clipboard, to paste into a bug report. The button says
// Copied for a moment, and beside it why the report could not be copied, if it could not.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { call } from "./api";
import { describeError } from "./format";
import { diagnosticsText as text } from "./labels";

/** How long the button says Copied. */
const COPIED_MS = 2000;

/**
 * Copies the report. The clipboard is written to while the click still counts: macOS's web view only lets a page write
 * to it then, and the report takes a moment to build, so the write is handed the report to come. Where the web view
 * cannot take a report to come, the report is written once it is there.
 */
async function copyReport() {
  const report = call<string>("diagnostics");
  try {
    const blob = report.then((text) => new Blob([text], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
  } catch {
    await navigator.clipboard.writeText(await report);
  }
}

export function CopyDiagnostics(props: { className?: string; variant?: "outline" | "link" }) {
  const variant = props.variant ?? "outline";
  const [phase, setPhase] = useState<"idle" | "copying" | "copied">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "copied") {
      return;
    }
    const timer = window.setTimeout(() => setPhase("idle"), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const copy = async () => {
    setPhase("copying");
    setError(null);
    try {
      await copyReport();
      setPhase("copied");
    } catch (e) {
      setError(text.failed(describeError(e)));
      setPhase("idle");
    }
  };

  return (
    <span className="copy-diagnostics">
      <Button
        type="button"
        variant={variant}
        size={variant === "link" ? "xs" : "sm"}
        className={cn(
          variant === "link" && "h-auto p-0 text-sm leading-[inherit] font-normal text-link underline",
          props.className,
        )}
        title={text.copyTitle}
        disabled={phase === "copying"}
        onClick={() => void copy()}
      >
        {phase === "copied" ? text.copied : text.copy}
      </Button>
      {error && (
        <span className="copy-diagnostics-error" role="alert" title={error}>
          {error}
        </span>
      )}
    </span>
  );
}
