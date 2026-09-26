// Automatic mode only (FEE_SOURCE=longxyz): discovers tokens, claims their fees on-chain, then distributes.
// In the default manual mode the dev records claims in /admin instead.
import { config } from "../lib/config.ts";
import { openDb } from "../lib/db.ts";
import { runClaimCycle } from "../lib/claimer.ts";
import { LongXyzFeeSource } from "../lib/sources/longxyz.ts";
import { createPayoutProvider } from "../lib/providers.ts";

if (config.feeSource !== "longxyz") {
  console.error("FEE_SOURCE is manual: record claims in /admin, and run `npm run distribute` to send payouts.");
  process.exit(1);
}
const report = await runClaimCycle(openDb(config.databasePath), new LongXyzFeeSource(config.long), createPayoutProvider(), {
  recipientShareBps: config.recipientShareBps,
  milestones: config.milestones,
});
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
