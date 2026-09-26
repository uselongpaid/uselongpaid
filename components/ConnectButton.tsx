"use client";

import Link from "next/link";
import { chain } from "@/lib/chain.ts";
import { short, useWallet } from "./WalletProvider.tsx";

/** Header button: connect, switch to the site's chain, or show the connected address. */
export function ConnectButton() {
  const w = useWallet();
  if (!w.address) {
    return (
      <button className="btn btn-small" type="button" onClick={w.connect} disabled={w.connecting}>
        {w.connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  if (!w.onRightChain) {
    return (
      <button className="btn btn-small btn-danger" type="button" onClick={w.switchChain}>
        Switch to {chain.name}
      </button>
    );
  }
  return (
    <Link href="/wallet" className="wallet-chip" title={w.address}>
      <span className="chain-dot" /> {short(w.address)}
    </Link>
  );
}
