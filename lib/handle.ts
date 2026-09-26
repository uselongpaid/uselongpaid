// X handles: 1–15 chars, letters, digits, underscore.
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export function normalizeHandle(input: string): string | null {
  let s = input.trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([^/?#\s]+)/i);
  if (url) s = url[1];
  s = s.replace(/^@/, "");
  if (!HANDLE_RE.test(s)) return null;
  return s.toLowerCase();
}

export type TokenMetadata = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  twitter?: string;
  x?: string;
  [key: string]: unknown;
};

/**
 * Finds the X account a token routes its fees to.
 * Checked in order: an explicit `feeRecipient` / `x` / `twitter` field,
 * then a "fees: @handle" (or "fees to @handle") marker in the description.
 */
export function handleFromMetadata(meta: TokenMetadata): string | null {
  for (const key of ["feeRecipient", "x", "twitter"]) {
    const v = meta[key];
    if (typeof v === "string") {
      const h = normalizeHandle(v);
      if (h) return h;
    }
  }
  if (typeof meta.description === "string") {
    const m = meta.description.match(/fees?\s*(?:to|:|->|→)\s*@([A-Za-z0-9_]{1,15})\b/i);
    if (m) return normalizeHandle(m[1]);
  }
  return null;
}

/** Metadata fields where launchpads put a token's bio / description. */
const BIO_FIELDS = ["description", "bio", "about", "desc"] as const;

/**
 * Finds the X account a bio assigns the fees to: "fees @alice", "fees to @alice", "fee send @alice",
 * "send fees to @alice", "fees: @alice", "fees → @alice". Handles in `exclude` (our own account, which
 * is the long.xyz fee receiver) are skipped, so "fees → @longpaid, fees @alice" still finds alice.
 */
export function feeHandleFromText(text: string, exclude: string[] = []): string | null {
  const skip = new Set(exclude.map((h) => h.replace(/^@/, "").toLowerCase()));
  const re = /\b(?:send\s+)?fees?(?:\s+(?:send|sent|go|goes|paid))?(?:\s+(?:to|for))?\s*[:=\-–→>]*\s*@([A-Za-z0-9_]{1,15})\b/gi;
  for (const m of text.matchAll(re)) {
    const h = normalizeHandle(m[1]);
    if (h && !skip.has(h)) return h;
  }
  return null;
}

/** The fee handle from a token's metadata: an explicit `feeRecipient` field, else a marker in its bio. */
export function feeHandleFromMetadata(meta: TokenMetadata, exclude: string[] = []): string | null {
  const skip = new Set(exclude.map((h) => h.replace(/^@/, "").toLowerCase()));
  if (typeof meta.feeRecipient === "string") {
    const h = normalizeHandle(meta.feeRecipient);
    if (h && !skip.has(h)) return h;
  }
  for (const f of BIO_FIELDS) {
    const v = meta[f];
    if (typeof v === "string") {
      const h = feeHandleFromText(v, exclude);
      if (h) return h;
    }
  }
  return null;
}
