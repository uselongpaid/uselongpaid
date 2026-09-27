import type { PayoutProvider } from "./types.ts";

/**
 * Pays X accounts in dollars through X Money, from LongPaid's own pre-funded X Money balance.
 * X Money has no public API, so payouts queue up automatically and the operator sends each one to the @handle
 * in the X app, then marks it sent in /admin. Recipients don't connect anything.
 */
export class XMoneyPayoutProvider implements PayoutProvider {
  readonly name = "xmoney";
  readonly retrySafe = true;
  async send() {
    return null;
  }
}
