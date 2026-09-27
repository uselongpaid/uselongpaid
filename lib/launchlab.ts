// Building a stonkfun.xyz launch directly on Raydium LaunchLab. stonkfun's own launch endpoint is off; its docs say to
// build LaunchLab's initialize_with_token_2022 against a StonkFun platform config, and stonkfun adopts every pool
// carrying its platform id within a minute or two.
//
// The curve parameters are the ones StonkFun's platform allows: its curve-rule account on chain lists them, and the
// LaunchLab program rejects anything else, so a wrong value fails the transaction instead of launching something odd.

import BN from "bn.js";
import {
  ComputeBudgetProgram,
  type Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  LAUNCHPAD_PROGRAM,
  LaunchpadConfig,
  PlatformConfig,
  PlatformCurveRule,
  getPdaLaunchpadAuth,
  getPdaLaunchpadConfigId,
  getPdaLaunchpadPoolId,
  getPdaLaunchpadVaultId,
  getPdaPlatformAllowConfig,
  getPdaPlatformCurveRule,
  initializeWithToken2022,
} from "@raydium-io/raydium-sdk-v2";

/** StonkFun's standard platform config (no transfer fee on the new mint). */
export const STONKFUN_STANDARD_PLATFORM = "4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7";

// LaunchpadCurveRuleField / LaunchpadCurveRuleOp from the SDK.
const F = { CurveType: 0, MigrateType: 1, MigrateCpmmFeeOn: 2, Supply: 3, TotalSellA: 4, TotalFundRaisingB: 5, TotalLockedAmount: 6, CliffPeriod: 7, UnlockPeriod: 8, BaseTokenProgram: 9, TransferFeeEnabled: 10 } as const;
const OP = { Eq: 0, Gte: 1, Lte: 2, Neq: 3 } as const;

export type Constraint = { field: number; op: number; value: bigint };

export type CurveParams = {
  curveType: number;
  migrateType: "amm" | "cpmm";
  creatorFeeOn: number;
  supply: bigint;
  totalSellA: bigint;
  totalFundRaisingB: bigint;
  totalLockedAmount: bigint;
  cliffPeriod: bigint;
  unlockPeriod: bigint;
};

/** Suggestions from stonkfun's /launchlab/pricing; any missing value falls back to the rule or the defaults. */
export type PricingHints = Partial<Pick<CurveParams, "supply" | "totalSellA" | "totalFundRaisingB">> & { configId?: string };

export const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);
/** stonkfun's documented shape: 1,000,000,000 supply, 793,100,000 sold on the curve. */
const DEFAULTS = { supply: 1_000_000_000n * UNIT, totalSellA: 793_100_000n * UNIT };

function holds(c: Constraint, v: bigint): boolean {
  if (c.op === OP.Eq) return v === c.value;
  if (c.op === OP.Gte) return v >= c.value;
  if (c.op === OP.Lte) return v <= c.value;
  if (c.op === OP.Neq) return v !== c.value;
  return true;
}

/**
 * Picks curve parameters that satisfy one of the platform's rule groups (any group may match). Values pinned by an
 * Eq constraint win; then stonkfun's pricing hints; then the documented defaults, clamped into any min/max range.
 */
export function chooseParams(groups: Constraint[][], hints: PricingHints, config: { curveType: number; minFundRaisingB: bigint }): CurveParams {
  const tries = groups.length ? groups : [[]];
  const errors: string[] = [];
  for (const g of tries) {
    const pick = (field: number, fallback: bigint): bigint => {
      const eq = g.find((c) => c.field === field && c.op === OP.Eq);
      if (eq) return eq.value;
      let v = fallback;
      for (const c of g.filter((c) => c.field === field)) {
        if (c.op === OP.Gte && v < c.value) v = c.value;
        if (c.op === OP.Lte && v > c.value) v = c.value;
      }
      return v;
    };
    const supply = pick(F.Supply, hints.supply ?? DEFAULTS.supply);
    const p: CurveParams = {
      curveType: config.curveType,
      migrateType: pick(F.MigrateType, 1n) === 0n ? "amm" : "cpmm",
      creatorFeeOn: Number(pick(F.MigrateCpmmFeeOn, 0n)),
      supply,
      totalSellA: pick(F.TotalSellA, hints.totalSellA ?? DEFAULTS.totalSellA),
      totalFundRaisingB: pick(F.TotalFundRaisingB, hints.totalFundRaisingB ?? config.minFundRaisingB),
      totalLockedAmount: pick(F.TotalLockedAmount, 0n),
      cliffPeriod: pick(F.CliffPeriod, 0n),
      unlockPeriod: pick(F.UnlockPeriod, 0n),
    };
    const actual: Record<number, bigint> = {
      [F.CurveType]: BigInt(p.curveType),
      [F.MigrateType]: p.migrateType === "amm" ? 0n : 1n,
      [F.MigrateCpmmFeeOn]: BigInt(p.creatorFeeOn),
      [F.Supply]: p.supply,
      [F.TotalSellA]: p.totalSellA,
      [F.TotalFundRaisingB]: p.totalFundRaisingB,
      [F.TotalLockedAmount]: p.totalLockedAmount,
      [F.CliffPeriod]: p.cliffPeriod,
      [F.UnlockPeriod]: p.unlockPeriod,
      [F.BaseTokenProgram]: 1n, // Token-2022
      [F.TransferFeeEnabled]: 0n, // standard launch
    };
    const broken = g.filter((c) => c.field in actual && !holds(c, actual[c.field]));
    if (!broken.length && p.totalFundRaisingB > 0n) return p;
    errors.push(broken.map((c) => `field ${c.field} op ${c.op} ${c.value}`).join(", ") || "no raise target");
  }
  throw new Error(`No curve parameters fit StonkFun's rules for this pair (${errors.join(" | ")}).`);
}

const bn = (v: bigint) => new BN(v.toString());
const big = (v: { toString(): string }) => BigInt(v.toString());

export type BuiltLaunch = { tx: VersionedTransaction; mint: PublicKey; pool: PublicKey; params: CurveParams };

/**
 * Builds the launch transaction for `wallet` (payer and creator). It comes back signed by the new mint's keypair
 * only; the wallet adds its signature in the browser. The mint key is thrown away afterwards: it has no authority
 * once the pool exists.
 */
export async function buildLaunch(
  conn: Connection,
  o: { wallet: PublicKey; quoteMint: PublicKey; platformId?: PublicKey; name: string; symbol: string; uri: string; hints?: PricingHints; priorityMicroLamports?: number },
): Promise<BuiltLaunch> {
  const program = LAUNCHPAD_PROGRAM;
  const platformId = o.platformId ?? new PublicKey(STONKFUN_STANDARD_PLATFORM);
  const hints = o.hints ?? {};

  const [mintBAcc, platformAcc] = await conn.getMultipleAccountsInfo([o.quoteMint, platformId]);
  if (!mintBAcc) throw new Error("That pair's mint doesn't exist on Solana.");
  if (!platformAcc || !platformAcc.owner.equals(program)) throw new Error("StonkFun's platform config wasn't found on LaunchLab.");
  const platform = PlatformConfig.decode(platformAcc.data);

  // Global config for this quote mint: stonkfun's hint, else the constant-product config LaunchLab derives for it.
  const candidates = hints.configId ? [new PublicKey(hints.configId)] : [0, 1, 2, 3].map((i) => getPdaLaunchpadConfigId(program, o.quoteMint, 0, i).publicKey);
  const accs = await conn.getMultipleAccountsInfo(candidates);
  const idx = accs.findIndex((a) => a && a.owner.equals(program) && LaunchpadConfig.decode(a.data).mintB.equals(o.quoteMint));
  if (idx < 0) throw new Error("LaunchLab has no launch config for that pair.");
  const configId = candidates[idx];
  const config = LaunchpadConfig.decode(accs[idx]!.data);

  let groups: Constraint[][] = [];
  const curveRuleId = platform.restrictCurveParam ? getPdaPlatformCurveRule(program, platformId, configId).publicKey : undefined;
  if (curveRuleId) {
    const ruleAcc = await conn.getAccountInfo(curveRuleId);
    if (!ruleAcc) throw new Error("StonkFun doesn't allow launches against that pair.");
    groups = PlatformCurveRule.decode(ruleAcc.data).groups.map((g) => g.constraints.map((c) => ({ field: c.field, op: c.op, value: big(c.value) })));
  }
  const allowConfig = platform.restrictGlobalConfig ? getPdaPlatformAllowConfig(program, platformId, configId).publicKey : undefined;
  const params = chooseParams(groups, hints, { curveType: config.curveType, minFundRaisingB: big(config.minFundRaisingB) });

  const mint = Keypair.generate();
  const pool = getPdaLaunchpadPoolId(program, mint.publicKey, o.quoteMint).publicKey;
  const ix = initializeWithToken2022(
    program,
    o.wallet,
    o.wallet,
    configId,
    platformId,
    getPdaLaunchpadAuth(program).publicKey,
    pool,
    mint.publicKey,
    o.quoteMint,
    getPdaLaunchpadVaultId(program, pool, mint.publicKey).publicKey,
    getPdaLaunchpadVaultId(program, pool, o.quoteMint).publicKey,
    mintBAcc.owner,
    DECIMALS,
    o.name,
    o.symbol,
    o.uri,
    {
      ...(params.curveType === 1 ? { type: "FixedCurve" as const } : params.curveType === 2 ? { type: "LinearCurve" as const } : { type: "ConstantCurve" as const, totalSellA: bn(params.totalSellA) }),
      migrateType: params.migrateType,
      supply: bn(params.supply),
      totalFundRaisingB: bn(params.totalFundRaisingB),
    },
    bn(params.totalLockedAmount),
    bn(params.cliffPeriod),
    bn(params.unlockPeriod),
    params.creatorFeeOn,
    undefined,
    allowConfig,
    curveRuleId,
  );

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: o.wallet,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: o.priorityMicroLamports ?? 100_000 }),
      ix,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([mint]);
  return { tx, mint: mint.publicKey, pool, params };
}
