// Linking an X handle to a payout wallet, without X sign-in:
//   1. The owner connects a wallet and signs `linkMessage` (free, no transaction).
//   2. They post `verificationCode(signature)` from the X account.
//   3. An admin checks that post and approves; payouts then go to the wallet automatically.
// The signature proves wallet control; the post proves X account control. Neither alone is enough.
import { keccak256 } from "viem";

export type LinkFields = { appName: string; handle: string; wallet: string; chainId: number; issuedAt: string };

export function linkMessage(f: LinkFields): string {
  return [
    `${f.appName}: link payout wallet`,
    "",
    `X account: @${f.handle}`,
    `Wallet: ${f.wallet}`,
    `Chain ID: ${f.chainId}`,
    `Issued at: ${f.issuedAt}`,
    "",
    "Signing is free and doesn't send a transaction.",
  ].join("\n");
}

/** Short code the owner posts from their X account; derived from the signature so it can't be reused elsewhere. */
export function verificationCode(signature: string): string {
  return "LP-" + keccak256(signature as `0x${string}`).slice(2, 10).toUpperCase();
}

export function tweetText(code: string, appName: string): string {
  return `Verifying my ${appName} payout wallet: ${code}`;
}

/** Accepts x.com / twitter.com status links posted by `handle`. Returns the canonical URL or null. */
export function parseTweetUrl(input: string, handle: string): string | null {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/i);
  if (!m || m[1].toLowerCase() !== handle.toLowerCase()) return null;
  return `https://x.com/${m[1]}/status/${m[2]}`;
}
