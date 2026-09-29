// long.xyz's LongLaunchFactory on Robinhood Chain (verified source on Blockscout). Only the pieces LongPaid reads:
// the LaunchMetadata event (every launch, with its tokenURI) and the launch() calldata (to see who receives fees).
// LongPaid never calls launch(): users launch on app.long.xyz, and we detect the tokens that send fees to us.
import { decodeFunctionData, type Address, type Hex } from "viem";

const CREATE_PARAMS = {
  type: "tuple",
  name: "data",
  internalType: "struct IAirlock.CreateParams",
  components: [
    { name: "initialSupply", type: "uint256", internalType: "uint256" },
    { name: "numTokensToSell", type: "uint256", internalType: "uint256" },
    { name: "numeraire", type: "address", internalType: "address" },
    { name: "tokenFactory", type: "address", internalType: "address" },
    { name: "tokenFactoryData", type: "bytes", internalType: "bytes" },
    { name: "governanceFactory", type: "address", internalType: "address" },
    { name: "governanceFactoryData", type: "bytes", internalType: "bytes" },
    { name: "poolInitializer", type: "address", internalType: "address" },
    { name: "poolInitializerData", type: "bytes", internalType: "bytes" },
    { name: "liquidityMigrator", type: "address", internalType: "address" },
    { name: "liquidityMigratorData", type: "bytes", internalType: "bytes" },
    { name: "integrator", type: "address", internalType: "address" },
    { name: "salt", type: "bytes32", internalType: "bytes32" },
  ],
} as const;

export const FACTORY_ABI = [
  {
    type: "event",
    name: "LaunchMetadata",
    anonymous: false,
    inputs: [
      { indexed: true, name: "asset", type: "address", internalType: "address" },
      { indexed: true, name: "launcher", type: "address", internalType: "address" },
      {
        indexed: false,
        name: "details",
        type: "tuple",
        internalType: "struct ILongLaunchFactory.LaunchDetails",
        components: [
          { name: "numeraire", type: "address", internalType: "address" },
          { name: "integrator", type: "address", internalType: "address" },
          { name: "poolInitializer", type: "address", internalType: "address" },
          { name: "liquidityMigrator", type: "address", internalType: "address" },
          { name: "governance", type: "address", internalType: "address" },
          { name: "timelock", type: "address", internalType: "address" },
          { name: "migrationPool", type: "address", internalType: "address" },
          { name: "initialSupply", type: "uint256", internalType: "uint256" },
          { name: "numTokensToSell", type: "uint256", internalType: "uint256" },
          { name: "name", type: "string", internalType: "string" },
          { name: "symbol", type: "string", internalType: "string" },
          { name: "tokenURI", type: "string", internalType: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "launch",
    stateMutability: "nonpayable",
    inputs: [
      CREATE_PARAMS,
      {
        type: "tuple",
        name: "auth",
        internalType: "struct ILongLaunchFactory.LaunchAuthorization",
        components: [
          { name: "launcher", type: "address", internalType: "address" },
          { name: "paramsHash", type: "bytes32", internalType: "bytes32" },
          { name: "expectedAsset", type: "address", internalType: "address" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
        ],
      },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [
      { name: "asset", type: "address", internalType: "address" },
      { name: "pool", type: "address", internalType: "address" },
      { name: "governance", type: "address", internalType: "address" },
      { name: "timelock", type: "address", internalType: "address" },
      { name: "migrationPool", type: "address", internalType: "address" },
    ],
  },
] as const;

export const DEFAULT_FACTORY = "0x1Eef016F22A943abC7DD11422EDeE9D235942104";

export type LaunchedToken = {
  asset: Address;
  launcher: Address;
  name: string;
  symbol: string;
  tokenURI: string;
  numeraire: Address;
  txHash: Hex;
  blockNumber: bigint;
};

/** The pool data (which carries the fee beneficiaries) from a launch() transaction's input. */
export function poolDataFromLaunchInput(input: Hex): Hex {
  const { functionName, args } = decodeFunctionData({ abi: FACTORY_ABI, data: input });
  if (functionName !== "launch") throw new Error("not a launch() call");
  return args[0].poolInitializerData;
}

/**
 * Which LongPaid fee wallet a launch transaction routes fees to, if any. Decodes launch(CreateParams, …) when the
 * call matches the known ABI; any other entry point long.xyz uses (a newer launch function, a router, a multicall)
 * is checked by looking for the wallet ABI-encoded (left-padded to 32 bytes) anywhere in the calldata.
 */
export function feeWalletInLaunch(input: Hex, wallets: string[]): string | null {
  try {
    return poolDataIncludes(poolDataFromLaunchInput(input), wallets);
  } catch {
    const hex = input.toLowerCase().replace(/^0x/, "");
    for (const w of wallets) {
      const padded = "0".repeat(24) + w.toLowerCase().replace(/^0x/, "");
      for (let i = hex.indexOf(padded); i !== -1; i = hex.indexOf(padded, i + 1)) {
        if (i % 2 === 0) return w;
      }
    }
    return null;
  }
}

/**
 * True when one of `wallets` is written in the pool data as a full 32-byte word. That's how the fee
 * beneficiaries are encoded; a bare substring match could hit unrelated bytes, a word match can't.
 */
export function poolDataIncludes(poolData: Hex, wallets: string[]): string | null {
  const words = new Set(poolData.slice(2).toLowerCase().match(/.{64}/g) ?? []);
  for (const w of wallets) {
    const word = w.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    if (words.has(word)) return w;
  }
  return null;
}

const GATEWAYS = (
  process.env.IPFS_GATEWAYS ||
  "https://ipfs.io/ipfs/,https://dweb.link/ipfs/,https://gateway.pinata.cloud/ipfs/,https://w3s.link/ipfs/,https://nftstorage.link/ipfs/,https://4everland.io/ipfs/"
)
  .split(",")
  .map((g) => g.trim().replace(/\/?$/, "/"))
  .filter(Boolean);

const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/.*)?$/;

/**
 * HTTP URLs to try for a tokenURI. IPFS content (ipfs://…, a bare CID, or any gateway URL with /ipfs/<cid>) is tried
 * on several public gateways, because a single gateway is often slow or rate-limits servers.
 */
export function metadataUrls(uri: string): string[] {
  const u = uri.trim();
  let path: string | null = null;
  if (u.startsWith("ipfs://")) path = u.slice("ipfs://".length).replace(/^ipfs\//, "");
  else if (CID.test(u)) path = u;
  else if (/^https?:\/\//.test(u)) {
    const m = u.match(/\/ipfs\/([^?#]+)/);
    if (!m) return [u];
    path = m[1];
    return [...new Set([u, ...GATEWAYS.map((g) => g + path)])];
  }
  return path ? GATEWAYS.map((g) => g + path) : [];
}
