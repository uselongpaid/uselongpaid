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

const GATEWAYS = (process.env.IPFS_GATEWAYS || "https://ipfs.io/ipfs/,https://dweb.link/ipfs/")
  .split(",")
  .map((g) => g.trim())
  .filter(Boolean);

/** HTTP URLs to try for a tokenURI (ipfs:// goes through public gateways). */
export function metadataUrls(uri: string): string[] {
  const u = uri.trim();
  if (u.startsWith("ipfs://")) {
    const path = u.slice("ipfs://".length).replace(/^ipfs\//, "");
    return GATEWAYS.map((g) => g.replace(/\/?$/, "/") + path);
  }
  if (/^https?:\/\//.test(u)) return [u];
  return [];
}
