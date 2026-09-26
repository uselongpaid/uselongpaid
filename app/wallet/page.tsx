import { chain } from "@/lib/chain.ts";
import { WalletLinker } from "@/components/WalletLinker.tsx";

export default function WalletPage() {
  return (
    <div className="docs">
      <h1>Your payout wallet</h1>
      <p className="muted">
        Connect a wallet on {chain.name}, link your X account, and your share of creator fees is paid to it automatically at every
        milestone.
      </p>
      <WalletLinker />
    </div>
  );
}
