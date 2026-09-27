// Token addresses and transaction ids for both networks the ledger has held: Solana (base58, case-sensitive) and EVM
// (0x hex, stored lowercase). Anything that stores or looks up an address goes through `normalizeAddress`.

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const SOL_ADDRESS = new RegExp(`^${BASE58}{32,44}$`);
const SOL_SIGNATURE = new RegExp(`^${BASE58}{64,90}$`);
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_TX = /^0x[0-9a-fA-F]{64}$/;

export const isSolanaAddress = (s: string) => SOL_ADDRESS.test(s);
export const isEvmAddress = (s: string) => EVM_ADDRESS.test(s);
export const isTokenAddress = (s: string) => isSolanaAddress(s) || isEvmAddress(s);
export const isTxId = (s: string) => SOL_SIGNATURE.test(s) || EVM_TX.test(s);

/** Base58 is case-sensitive, so only EVM hex is lowercased. */
export function normalizeAddress(s: string): string {
  const t = s.trim();
  return t.startsWith("0x") ? t.toLowerCase() : t;
}
export const normalizeTxId = normalizeAddress;
