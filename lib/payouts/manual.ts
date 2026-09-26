import type { PayoutProvider } from "./types.ts";

/**
 * Leaves payouts queued. An operator sends them (for example through X Money)
 * and marks each one paid or failed from the admin page or the API.
 */
export class ManualPayoutProvider implements PayoutProvider {
  readonly name = "manual";
  readonly retrySafe = true;
  async send() {
    return null;
  }
}
