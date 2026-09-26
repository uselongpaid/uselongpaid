// Chain the site runs on. Defaults to Robinhood Chain mainnet; override with NEXT_PUBLIC_* for testnet.
// Safe to import from client components (only NEXT_PUBLIC_ variables).

export const chain = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 4663),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || "Robinhood Chain",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: (process.env.NEXT_PUBLIC_EXPLORER_URL || "https://robinhoodchain.blockscout.com").replace(/\/$/, ""),
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

export const appName = process.env.NEXT_PUBLIC_APP_NAME || "LongPaid";
