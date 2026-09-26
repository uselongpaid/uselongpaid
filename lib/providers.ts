// Builds the configured payout provider. Shared by the web app and the CLI scripts.
import { config } from "./config.ts";
import { Erc20PayoutProvider } from "./payouts/erc20.ts";
import { ManualPayoutProvider } from "./payouts/manual.ts";
import { WebhookPayoutProvider } from "./payouts/webhook.ts";
import type { PayoutProvider } from "./payouts/types.ts";

let cached: PayoutProvider | undefined;

export function createPayoutProvider(): PayoutProvider {
  if (cached) return cached;
  switch (config.payoutProvider) {
    case "erc20":
      return (cached = new Erc20PayoutProvider(config.erc20));
    case "webhook":
      return (cached = new WebhookPayoutProvider(config.payoutWebhookUrl, config.payoutWebhookSecret));
    default:
      return (cached = new ManualPayoutProvider());
  }
}
