// Network the site runs on. Defaults to Solana (tokens launched on stonkfun.xyz); the EVM fields are only used by the
// optional wallet-payout mode.
// Safe to import from client components (only NEXT_PUBLIC_ variables).

export const chain = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 4663),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || "Solana",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: (process.env.NEXT_PUBLIC_EXPLORER_URL || "https://solscan.io").replace(/\/$/, ""),
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

export const appName = process.env.NEXT_PUBLIC_APP_NAME || "LongPaid";
