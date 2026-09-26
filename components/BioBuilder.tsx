"use client";

import { useState } from "react";
import { CopyButton } from "./CopyButton.tsx";

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

function clean(input: string): string {
  const s = input.trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([^/?#\s]+)/i);
  return (url ? url[1] : s).replace(/^@/, "");
}

/** Builds the bio line that tells LongPaid which X account gets the fees. */
export function BioBuilder({ ownHandle }: { ownHandle: string }) {
  const [raw, setRaw] = useState("");
  const handle = clean(raw);
  const valid = HANDLE_RE.test(handle) && handle.toLowerCase() !== ownHandle.toLowerCase();
  const line = `fees @${valid ? handle : "yourhandle"}`;
  return (
    <div className="builder">
      <label className="field">
        <span>X account that gets the fees</span>
        <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="@handle or x.com/handle" autoComplete="off" />
      </label>
      {raw && !valid && (
        <p className="field-error">
          {handle.toLowerCase() === ownHandle.toLowerCase() && ownHandle
            ? "That's LongPaid's own account. Put the account that should earn the fees."
            : "That isn't a valid X handle: 1–15 letters, numbers or underscores."}
        </p>
      )}
      <div className="copy-row">
        <div>
          <div className="copy-label">Put this in the token bio / description</div>
          <code>{line}</code>
        </div>
        <CopyButton text={line} />
      </div>
    </div>
  );
}
