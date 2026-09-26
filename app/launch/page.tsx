import Link from "next/link";
import { config } from "@/lib/config.ts";
import { formatUsd } from "@/lib/money.ts";
import { CopyButton } from "@/components/CopyButton.tsx";
import { MetadataBuilder } from "@/components/MetadataBuilder.tsx";

export const dynamic = "force-dynamic";

export default function Launch() {
  const treasury = config.long.treasury;
  const share = config.recipientShareBps / 100;
  return (
    <div className="docs">
      <h1>Launch a token that pays an X account</h1>
      <p className="muted">Four steps on long.xyz. Takes about two minutes.</p>

      <ol className="guide">
        <li>
          <h3>Start a launch on long.xyz</h3>
          <p>
            Open <a href="https://app.long.xyz" target="_blank" rel="noreferrer">app.long.xyz</a>, start creating a token,
            and fill in the name, symbol and image as usual.
          </p>
        </li>
        <li>
          <h3>Set the creator-fee beneficiary to our treasury</h3>
          {treasury ? (
            <div className="copy-row">
              <code className="addr">{treasury}</code>
              <CopyButton text={treasury} />
            </div>
          ) : (
            <p className="notice">The operator hasn't set a treasury address yet (TREASURY_ADDRESS).</p>
          )}
          <p className="muted">Check the address carefully. Fees sent anywhere else can't be routed.</p>
        </li>
        <li>
          <h3>Name the X account in the metadata</h3>
          <MetadataBuilder />
        </li>
        <li>
          <h3>Launch, then check it</h3>
          <p>
            After launch, send the token address to the team and check it with the <Link href="/check">eligibility checker</Link>.
            Once it's added, {share}% of its creator fees go to the account. The first payout goes out once the account has earned{" "}
            {formatUsd(config.milestones.list[0])}.
          </p>
        </li>
      </ol>
      <p className="muted" style={{ fontSize: 14 }}>
        Anyone named in a token can opt out. Please only name accounts that want to receive fees. The account owner collects
        payouts by <Link href="/wallet">connecting a wallet</Link>.
      </p>
    </div>
  );
}
