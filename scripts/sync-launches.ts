// Scans long.xyz's factory once for launches whose fees go to LongPaid. `npm run sync-launches`
import { config } from "../lib/config.ts";
import { openDb } from "../lib/db.ts";
import { ViemLaunchReader, fetchMetadata } from "../lib/long/reader.ts";
import { syncLaunches } from "../lib/long/sync.ts";

if (!config.detect.feeWallets.length) {
  console.error("Set LONGPAID_FEE_WALLETS to the wallet long.xyz pays LongPaid's fees to.");
  process.exit(1);
}
const report = await syncLaunches(openDb(config.databasePath), new ViemLaunchReader(config.long.rpcUrl, config.detect.factory), fetchMetadata, {
  feeWallets: config.detect.feeWallets,
  excludeHandles: config.detect.handle ? [config.detect.handle] : [],
  chainId: config.chain.id,
  startBlock: config.detect.startBlock,
});
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
