export type PayoutResult = { ok: true; ref: string } | { ok: false; reason: string };

export type PayoutRequest = {
  id: number;
  handle: string;
  amountMicros: number;
  /** Wallet the account owner linked, if any. */
  wallet: string | null;
};

export type SendHooks = {
  /** Called as soon as a transaction or request reference exists, before waiting for it to settle. */
  onBroadcast?: (ref: string) => void;
};

/** Sends dollars to an X account. */
export interface PayoutProvider {
  readonly name: string;
  /**
   * True when calling send() again after it threw can't pay twice (the receiver dedupes).
   * When false, a payout whose send() threw is held for an admin to check before any retry.
   */
  readonly retrySafe: boolean;
  /** Returns null when the payout can't be sent yet (no wallet, or settled by hand); it stays queued. */
  send(payout: PayoutRequest, hooks?: SendHooks): Promise<PayoutResult | null>;
}
