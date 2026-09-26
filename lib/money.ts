// All money is stored as integer micro-dollars (1 USD = 1_000_000) to avoid float drift.
export const MICROS = 1_000_000;

export function usdToMicros(usd: number): number {
  return Math.round(usd * MICROS);
}

export function formatUsd(micros: number): string {
  const usd = micros / MICROS;
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Splits a claim. The recipient share is rounded down so rounding dust goes to the burn. */
export function splitClaim(micros: number, recipientShareBps: number) {
  if (!Number.isInteger(micros) || micros < 0) throw new Error("amount must be a non-negative integer");
  if (recipientShareBps < 0 || recipientShareBps > 10_000) throw new Error("share must be 0..10000 bps");
  const recipient = Math.floor((micros * recipientShareBps) / 10_000);
  return { recipient, burn: micros - recipient };
}

/** Converts an on-chain amount (bigint in base units) to micro-dollars. */
export function tokenAmountToMicros(amount: bigint, decimals: number, usdPrice: number): number {
  const scale = 10n ** BigInt(decimals);
  const priceMicros = BigInt(usdToMicros(usdPrice));
  return Number((amount * priceMicros) / scale);
}

/** Parses a dollar amount typed by a person ("12", "12.5", "0.000001") into micro-dollars. */
export function parseUsd(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const m = s.match(/^(\d{1,12})(?:\.(\d{1,6}))?$/);
  if (!m) return null;
  return Number(m[1]) * MICROS + Number((m[2] ?? "").padEnd(6, "0"));
}
