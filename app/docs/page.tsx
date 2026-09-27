import { config } from "@/lib/config.ts";
import { describeMilestones } from "@/lib/milestones.ts";

export const dynamic = "force-dynamic";

export default function Docs() {
  const share = config.recipientShareBps / 100;
  return (
    <div className="docs">
      <h1>Docs</h1>
      <p className="muted">
        How {config.appName} routes {config.launchpad.name} creator fees to X accounts.
      </p>

      <h2 id="overview">Overview</h2>
      <p>
        Tokens launched on {config.launchpad.name} ({config.launchpad.network}) earn creator fees from trading. When a token sends
        its creator fees to the {config.appName} wallet, we claim them and credit them to the X account in the token&apos;s bio.
        The account owner doesn&apos;t need a wallet or a sign-up.
      </p>

      <h2 id="launch">Launching a token</h2>
      <ol>
        <li>
          Create the token on <a href={config.launchpad.launchUrl}>{config.launchpad.name}</a> as usual.
        </li>
        <li>
          Send its creator fees to the {config.appName} wallet
          {config.feeWallet ? (
            <>
              : <code>{config.feeWallet}</code>
            </>
          ) : null}
          .
        </li>
        <li>
          Write who earns them in the token bio: <code>fees @alice</code>. <code>fees to @alice</code>,{" "}
          <code>fee send @alice</code> and <code>fees: @alice</code> work too.
        </li>
        <li>
          Launch, then post the token address and tag <code>@{config.detect.handle || "uselongpaid"}</code> on X. The team checks
          on-chain that the fees really reach {config.appName} and adds the token; the bio only says who gets them.
        </li>
      </ol>

      <h2 id="split">Fee split</h2>
      <ul>
        <li>
          <strong>{share}%</strong> is credited to the X account.
        </li>
        <li>
          <strong>{100 - share}%</strong> buys back and burns the protocol token. Rounding dust also goes to the burn.
        </li>
      </ul>

      <h2 id="flow">Where the money goes</h2>
      <ol>
        <li>The token trades on {config.launchpad.name}. Creator fees build up in the {config.appName} wallet.</li>
        <li>
          The team claims each token's fees on-chain regularly and records the claim with its transaction signature, which is
          checked on-chain.
        </li>
        <li>
          Each claim is split: {share}% is credited to the X account in the token's metadata, {100 - share}% buys back and burns.
        </li>
        <li>
          Everything after the claim is automatic: when the account crosses a milestone, its balance is sent in dollars
          {config.payoutProvider === "erc20"
            ? " to the wallet linked to that X account"
            : config.payoutProvider === "xmoney"
              ? " to that X account through X Money"
              : " to that X account"}
          .
        </li>
      </ol>

      <h2 id="payouts">Payouts</h2>
      <p>
        An account's share builds up as fees are claimed. Each time its lifetime earnings cross a milestone (
        {describeMilestones(config.milestones)}), the full unpaid balance is paid out in dollars. If a payout fails (for
        example, the account can't receive money yet), the amount goes back to the balance and goes out with the next
        milestone.
      </p>
      {config.payoutProvider === "xmoney" && (
        <p>
          Payouts are sent in dollars through X Money, straight to the @handle, from {config.appName}&apos;s X Money balance. The
          account owner doesn&apos;t need to connect a wallet or sign up. If an account can&apos;t receive X Money yet, the payout
          goes back to its balance and is sent with the next milestone.
        </p>
      )}
      {config.payoutProvider === "erc20" && (
        <p>
          To receive payouts, <a href="/wallet">connect a wallet</a> on {config.chain.name}, sign a message, and post the code it
          gives you from your X account. Once the team confirms the post, payouts are sent to that wallet as a dollar stablecoin,
          automatically. Until then your payouts wait for you; nothing is lost.
        </p>
      )}

      <h2 id="opt-out">Opting out</h2>
      <p>
        Anyone can put any handle in token metadata, so account owners can opt out. After that, no money is credited to them:
        fees from tokens naming their handle are burned in full. To opt out, contact the team from your X account.
      </p>

      <h2 id="api">API</h2>
      <pre>{`GET  /api/stats                     totals
GET  /api/tokens?sort=fees|new&q=   tokens routing fees
GET  /api/profile/:handle           account, tokens, payouts, claims

# Operator endpoints (Authorization: Bearer $CRON_SECRET)
POST /api/cron/distribute           send queued payouts (run from cron)
POST /api/cron/claim                automatic mode only: claim + distribute
GET  /api/admin/payouts?status=queued
POST /api/admin/payouts             {"id": 1, "ok": true, "ref": "x-money-ref"}
POST /api/admin/opt-out             {"handle": "alice", "optedOut": true}`}</pre>
    </div>
  );
}
