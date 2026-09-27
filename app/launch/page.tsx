import Link from "next/link";
import { config } from "@/lib/config.ts";
import { formatUsd } from "@/lib/money.ts";
import { CopyButton } from "@/components/CopyButton.tsx";
import { BioBuilder } from "@/components/BioBuilder.tsx";

export const dynamic = "force-dynamic";

export default function Launch() {
  const share = config.recipientShareBps / 100;
  const handle = config.detect.handle;
  const minutes = Math.max(1, Math.round(config.detect.intervalMs / 60_000));
  return (
    <div className="docs">
      <h1>Launch on long.xyz, pay any X account</h1>
      <p className="muted">
        You launch on app.long.xyz as usual. Two fields tell {config.appName} where the fees go. Your token is a normal long.xyz
        token: listed on app.long.xyz and everywhere long.xyz tokens show up.
      </p>

      <ol className="guide">
        <li>
          <h3>Start a launch on app.long.xyz</h3>
          <p>
            Open{" "}
            <a href="https://app.long.xyz" target="_blank" rel="noreferrer">
              app.long.xyz
            </a>
            , create a token, and fill in the name, ticker, image and pair as usual.
          </p>
        </li>
        <li>
          <h3>Send the fees to {config.appName}</h3>
          <p>In the fee receiver field, enter:</p>
          {handle ? (
            <div className="copy-row">
              <code>@{handle}</code>
              <CopyButton text={`@${handle}`} />
            </div>
          ) : (
            <p className="notice">The operator hasn&apos;t set {config.appName}&apos;s X account yet (LONGPAID_X_HANDLE).</p>
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
          <h3>Launch</h3>
          <p>
            {config.appName} picks the token up on its own within about {minutes} min. Check it with the{" "}
            <Link href="/check">eligibility checker</Link>. From then on {share}% of its creator fees are credited to the account, and
            payouts start once it has earned {formatUsd(config.milestones.list[0])}.
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
