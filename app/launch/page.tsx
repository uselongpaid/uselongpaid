import Link from "next/link";
import { config } from "@/lib/config.ts";
import { formatUsd } from "@/lib/money.ts";
import { CopyButton } from "@/components/CopyButton.tsx";
import { BioBuilder } from "@/components/BioBuilder.tsx";

export const dynamic = "force-dynamic";

export default function Launch() {
  const share = config.recipientShareBps / 100;
  const handle = config.detect.handle;
  const lp = config.launchpad;
  return (
    <div className="docs">
      <h1>Launch on {lp.name}, pay any X account</h1>
      <p className="muted">
        You launch on {lp.name} as usual, on {lp.network}. Two things tell {config.appName} where the fees go. Your token is a
        normal {lp.name} token: listed there and everywhere {lp.network} tokens show up.
      </p>

      <ol className="guide">
        <li>
          <h3>Start a launch on {lp.name}</h3>
          <p>
            Open{" "}
            <a href={lp.launchUrl} target="_blank" rel="noreferrer">
              {lp.name}
            </a>
            , create a token, and fill in the name, ticker, image and pair as usual.
          </p>
        </li>
        <li>
          <h3>Send the creator fees to {config.appName}</h3>
          {config.feeWallet ? (
            <>
              <p>Use the {config.appName} wallet as the creator fee wallet:</p>
              <div className="copy-row">
                <code>{config.feeWallet}</code>
                <CopyButton text={config.feeWallet} />
              </div>
            </>
          ) : (
            <p className="notice">The operator hasn&apos;t set {config.appName}&apos;s {lp.network} wallet yet (LONGPAID_FEE_WALLET).</p>
          )}
          <p className="muted">
            {config.appName} holds the fees for the account in step 3: {share}% goes to them, {100 - share}% buys back and burns.
          </p>
        </li>
        <li>
          <h3>Say who earns them in the bio</h3>
          <BioBuilder ownHandle={handle} />
        </li>
        <li>
          <h3>Launch and tag {handle ? `@${handle}` : config.appName}</h3>
          <p>
            Post the token address on X and tag {handle ? `@${handle}` : config.appName}. The team checks on-chain that the fees
            reach {config.appName} and adds the token. Check it any time with the <Link href="/check">eligibility checker</Link>.
            From then on {share}% of its creator fees are credited to the account, and payouts start once it has earned{" "}
            {formatUsd(config.milestones.list[0])}.
          </p>
        </li>
      </ol>
      <p className="muted" style={{ fontSize: 14 }}>
        {config.payoutProvider === "xmoney" ? (
          <>The account owner is paid in dollars through X Money, straight to their @handle. Nothing to connect.</>
        ) : (
          <>
            The account owner collects payouts by <Link href="/wallet">connecting a wallet</Link>.
          </>
        )}{" "}
        Anyone named in a bio can opt out; please only name accounts that want the fees.
      </p>
    </div>
  );
}
