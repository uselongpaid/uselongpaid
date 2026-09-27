// Reading Solana transactions without sending them: what a launch costs the signing wallet, and whether a transaction
// coming back from the browser is the one that was prepared, signed by the right wallet.
import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";

export const BASE_FEE_PER_SIGNATURE = 5000n;

type Ix = { programId: PublicKey; keys: PublicKey[]; data: Uint8Array };

function u32(d: Uint8Array, o: number): number {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(o, true);
}
function u64(d: Uint8Array, o: number): bigint {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(o, true);
}

/** Accepts legacy and v0 transactions, base64 or raw bytes. */
export function decodeTx(input: string | Uint8Array): VersionedTransaction | Transaction {
  const bytes = typeof input === "string" ? Buffer.from(input, "base64") : input;
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

/** Top-level instructions with resolved account keys. Address-lookup-table accounts can't be resolved offline and are skipped. */
export function instructions(tx: VersionedTransaction | Transaction): Ix[] {
  if (tx instanceof Transaction) {
    return tx.instructions.map((i) => ({ programId: i.programId, keys: i.keys.map((k) => k.pubkey), data: i.data }));
  }
  const m = tx.message;
  const keys = m.staticAccountKeys;
  return m.compiledInstructions.map((i) => ({
    programId: keys[i.programIdIndex],
    keys: i.accountKeyIndexes.map((k) => keys[k]).filter(Boolean),
    data: i.data,
  }));
}

export function feePayer(tx: VersionedTransaction | Transaction): PublicKey | null {
  if (tx instanceof Transaction) return tx.feePayer ?? tx.instructions[0]?.keys.find((k) => k.isSigner)?.pubkey ?? null;
  return tx.message.staticAccountKeys[0] ?? null;
}

function signatureCount(tx: VersionedTransaction | Transaction): bigint {
  return BigInt(tx instanceof Transaction ? tx.signatures.length || 1 : tx.message.header.numRequiredSignatures);
}

/** Base fee plus the priority fee the compute-budget instructions ask for. */
export function networkFee(tx: VersionedTransaction | Transaction): bigint {
  const ixs = instructions(tx);
  let price = 0n;
  let limit: bigint | null = null;
  for (const i of ixs) {
    if (!i.programId.equals(ComputeBudgetProgram.programId)) continue;
    if (i.data[0] === 2 && i.data.length >= 5) limit = BigInt(u32(i.data, 1));
    if (i.data[0] === 3 && i.data.length >= 9) price = u64(i.data, 1);
  }
  const units = limit ?? 200_000n * BigInt(ixs.filter((i) => !i.programId.equals(ComputeBudgetProgram.programId)).length);
  return BASE_FEE_PER_SIGNATURE * signatureCount(tx) + (price * units + 999_999n) / 1_000_000n;
}

/**
 * Lamports the transaction takes from `payer` through top-level System Program instructions (transfer, create account),
 * plus the network fee when `payer` pays it. Lamports moved inside other programs' CPIs aren't visible here; the
 * launcher simulates the transaction before signing to catch those.
 */
export function lamportsOut(tx: VersionedTransaction | Transaction, payer: PublicKey): bigint {
  let total = 0n;
  for (const i of instructions(tx)) {
    if (!i.programId.equals(SystemProgram.programId) || i.data.length < 12) continue;
    const kind = u32(i.data, 0);
    if ((kind === 0 || kind === 2) && i.keys[0]?.equals(payer)) total += u64(i.data, 4);
    if (kind === 3 && i.keys[0]?.equals(payer)) {
      const seedLen = Number(u64(i.data, 36));
      total += u64(i.data, 44 + seedLen);
    }
  }
  if (feePayer(tx)?.equals(payer)) total += networkFee(tx);
  return total;
}

/** The bytes a wallet signs. Two transactions with the same message differ only in their signatures. */
export function messageBytes(tx: VersionedTransaction | Transaction): Uint8Array {
  return tx instanceof Transaction ? tx.serializeMessage() : tx.message.serialize();
}

/** True when the transaction carries a (non-empty) signature from `signer`. */
export function signedBy(tx: VersionedTransaction | Transaction, signer: PublicKey): boolean {
  if (tx instanceof Transaction) {
    const s = tx.signatures.find((x) => x.publicKey.equals(signer));
    return Boolean(s?.signature && s.signature.some((b) => b !== 0));
  }
  const i = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).findIndex((k) => k.equals(signer));
  return i >= 0 && tx.signatures[i].some((b) => b !== 0);
}

export const LAMPORTS_PER_SOL = 1_000_000_000n;
export function formatSol(lamports: bigint | number): string {
  const n = Number(lamports) / 1e9;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 6 })} SOL`;
}
