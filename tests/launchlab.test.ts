import { test } from "node:test";
import assert from "node:assert/strict";
import BN from "bn.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { LAUNCHPAD_PROGRAM, LaunchpadConfig, PlatformConfig, getPdaLaunchpadConfigId, getPdaPlatformCurveRule } from "@raydium-io/raydium-sdk-v2";
import { buildLaunch, STONKFUN_STANDARD_PLATFORM } from "../lib/launchlab.ts";

test("buildLaunch makes a LaunchLab launch under StonkFun's platform, paid by the wallet", async () => {
  const quote = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const platformId = new PublicKey(STONKFUN_STANDARD_PLATFORM);
  const cfgId = getPdaLaunchpadConfigId(LAUNCHPAD_PROGRAM, quote, 0, 0).publicKey;
  const z = PublicKey.default;
  const cfg = Buffer.alloc(LaunchpadConfig.span);
  LaunchpadConfig.encode({ index: 0, tradeFeeRate: new BN(0), mintB: quote, epoch: new BN(0), curveType: 0, migrateFee: new BN(0), maxShareFeeRate: new BN(0), minSupplyA: new BN(0), maxLockRate: new BN(0), minSellRateA: new BN(0), minMigrateRateA: new BN(0), minFundRaisingB: new BN(30_000_000), protocolFeeOwner: z, migrateFeeOwner: z, migrateToAmmWallet: z, migrateToCpmmWallet: z } as never, cfg);
  const plat = Buffer.alloc(PlatformConfig.span);
  PlatformConfig.encode({ name: Array(64).fill(0), feeRate: new BN(10000), epoch: new BN(0), creatorFeeRate: new BN(0), platformClaimFeeWallet: z, platformLockNftWallet: z, platformScale: new BN(0), creatorScale: new BN(0), burnScale: new BN(0), web: Array(256).fill(0), img: Array(256).fill(0), cpConfigId: z, transferFeeExtensionAuth: z, platformVestingWallet: z, platformVestingScale: new BN(0), platformCpCreator: z, restrictGlobalConfig: 0, restrictCurveParam: 0, curveRuleManager: z } as never, plat);
  const acct = (data: Buffer, owner = LAUNCHPAD_PROGRAM) => ({ data, owner, lamports: 1, executable: false });
  const conn = {
    async getMultipleAccountsInfo(keys: PublicKey[]) {
      return keys.map((k) => (k.equals(quote) ? acct(Buffer.alloc(82), new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")) : k.equals(platformId) ? acct(plat) : k.equals(cfgId) ? acct(cfg) : null));
    },
    async getAccountInfo() { return null; },
    async getLatestBlockhash() { return { blockhash: "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi", lastValidBlockHeight: 1 }; },
  };
  const wallet = Keypair.generate().publicKey;
  const b = await buildLaunch(conn as never, { wallet, quoteMint: quote, name: "Moon", symbol: "MOON", uri: "https://site/m.json", hints: { totalFundRaisingB: 85_000_000n } });
  const ix = b.tx.message.compiledInstructions.at(-1)!;
  const keys = b.tx.message.staticAccountKeys;
  assert.ok(keys[ix.programIdIndex].equals(LAUNCHPAD_PROGRAM));
  assert.ok(keys[0].equals(wallet), "wallet pays");
  assert.ok(keys.some((k) => k.equals(b.mint)));
  assert.ok(keys.some((k) => k.equals(platformId)), "stonkfun platform id in the launch");
  assert.equal(b.params.totalFundRaisingB, 85_000_000n);
  assert.equal(b.tx.signatures.filter((s) => s.some((x) => x !== 0)).length, 1, "only the mint has signed");

});
