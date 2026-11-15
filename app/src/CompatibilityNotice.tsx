// The notice under the masthead when the game is a version FMLibreEditor has no profile for and editing it was not
// allowed yet, or some of the checks it makes before writing did not pass: what that leaves out and how much of it fit,
// the way to edit anyway or to look for a newer version, and Copy diagnostics for a bug report.

import { CopyDiagnostics } from "./CopyDiagnostics";
import { describeGame } from "./format";
import { CHECK_NAMES, compatibilityText, updateText } from "./labels";
import type { ConnectionInfo } from "./types";

const text = compatibilityText;

/**
 * Nothing while every check passed and the game is a version the editor knows, or one it was allowed to edit (Edit
 * anyway takes the notice away). Otherwise the version (with Edit anyway and Check for updates) and the checks that did
 * not pass: the in-game date apart, as it only takes the ages away; the others leave what they cover read-only, and say
 * how many of what they sampled fit. Copy diagnostics either way.
 */
export function CompatibilityNotice(props: {
  connection: ConnectionInfo;
  busy: boolean;
  onAllow: () => void;
  onCheckUpdates: () => void;
}) {
  const { connection, busy, onAllow, onCheckUpdates } = props;
  const failed = connection.health.results.filter((result) => !result.passed);
  // Once editing a version without a profile is allowed, only the checks that did not pass are left to tell.
  const unknown = !connection.knownBuild && !connection.editable;
  if (!unknown && failed.length === 0) {
    return null;
  }
  const noDate = failed.some((result) => result.check === "gameDate");
  const locked = failed
    .filter((result) => result.check !== "gameDate")
    .map((result) => text.failedCheck(CHECK_NAMES[result.check], result.fit, result.sampled));
  return (
    <div className="compatibility-notice" role="status">
      <div className="compatibility-text">
        <strong>{unknown ? text.unknownBuild(describeGame(connection.game)) : text.failedTitle}</strong>
        {unknown && <p>{text.unknownBuildText}</p>}
        {noDate && <p>{text.noDate}</p>}
        {locked.length > 0 && <p>{text.failed(text.join(locked))}</p>}
        {!unknown && <p>{text.reloadHint}</p>}
      </div>
      <span className="update-actions">
        {unknown && connection.writable && (
          <button type="button" className="primary" title={text.allowTitle} disabled={busy} onClick={onAllow}>
            {text.allow}
          </button>
        )}
        {unknown && (
          <button type="button" onClick={onCheckUpdates}>
            {updateText.check}
          </button>
        )}
        <CopyDiagnostics />
      </span>
    </div>
  );
}
