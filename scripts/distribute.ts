// Sends every queued payout through the configured provider. Run it from cron (e.g. every 10 minutes)
// so accounts that link a wallet later, or payouts that waited on a top-up, go out without anyone stepping in.
import { config } from "../lib/config.ts";
import { openDb } from "../lib/db.ts";
import { distributePending } from "../lib/distribute.ts";
import { createPayoutProvider } from "../lib/providers.ts";

const report = await distributePending(openDb(config.databasePath), createPayoutProvider());
console.log(JSON.stringify(report, null, 2));
if (report.errors.length || report.needsReview.length) process.exitCode = 1;
