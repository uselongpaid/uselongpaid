import "server-only";
import { config } from "./config.ts";
import { db } from "./server.ts";
import { ViemLaunchReader, fetchMetadata } from "./long/reader.ts";
import { resolveAsset, syncLaunches, type SyncOptions, type SyncReport } from "./long/sync.ts";

let running: Promise<SyncReport> | null = null;

export function detectionEnabled(): boolean {
  return config.detect.feeWallets.length > 0;
}

function syncOptions(): SyncOptions {
  return {
    feeWallets: config.detect.feeWallets,
    excludeHandles: config.detect.handle ? [config.detect.handle] : [],
    chainId: config.chain.id,
    startBlock: config.detect.startBlock,
  };
}

/** Reads a detected launch's metadata now and registers it if the bio names a handle. */
export function resolveDetected(asset: string): Promise<SyncReport> {
  return resolveAsset(db(), fetchMetadata, syncOptions(), asset);
}

/** One scan of long.xyz's factory. Concurrent callers share the run in progress. */
export function runLaunchSync(): Promise<SyncReport> {
  if (!detectionEnabled()) return Promise.reject(new Error("set LONGPAID_FEE_WALLETS first"));
  running ??= syncLaunches(db(), new ViemLaunchReader(config.long.rpcUrl, config.detect.factory), fetchMetadata, {
    feeWallets: config.detect.feeWallets,
    excludeHandles: config.detect.handle ? [config.detect.handle] : [],
    chainId: config.chain.id,
    startBlock: config.detect.startBlock,
  }).finally(() => {
    running = null;
  });
  return running;
}
