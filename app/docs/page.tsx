import { config } from "@/lib/config.ts";
import { describeMilestones } from "@/lib/milestones.ts";

export const dynamic = "force-dynamic";

export default function Docs() {
  const share = config.recipientShareBps / 100;
  return (
    <div className="docs">
      <h1>Docs</h1>
      <p className="muted">How {config.appName} routes long.xyz creator fees to X accounts.</p>

      <h2 id="overview">Overview</h2>
      <p>
        Tokens launched on long.xyz earn creator fees from trading. When a token names the {config.appName} treasury as its
        creator-fee beneficiary, we claim those fees on-chain and credit them to the X account in the token's metadata. The
        account owner doesn't need a wallet or a sign-up.
      </p>

      <h2 id="launch">Launching a token</h2>
      <ol>
        <li>
          Create the token on <a href="https://app.long.xyz">app.long.xyz</a> as usual.
        </li>
        <li>
          Set the fee receiver to <code>@{config.detect.handle || "longpaid"}</code>. long.xyz then pays the creator fees to{" "}
          {config.appName}.
        </li>
        <li>
          Write who earns them in the token bio: <code>fees @alice</code>. <code>fees to @alice</code>,{" "}
          <code>fee send @alice</code> and <code>fees: @alice</code> work too.
        </li>
        <li>
          Launch. {config.appName} scans every long.xyz launch and picks yours up within a few minutes. It checks the launch
          transaction itself, so only tokens whose fees really reach {config.appName} are counted; the bio only says who gets
          them.
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
        <li>The token trades on long.xyz. Creator fees build up for our treasury.</li>
        <li>
          The team claims each token's fees on-chain regularly and records the claim with its transaction hash, which is checked
          on-chain. Claiming on every trade would cost more in gas than quiet tokens earn.
        </li>
        <li>
          Each claim is split: {share}% is credited to the X account in the token's metadata, {100 - share}% buys back and burns.
        </li>
        <li>
          Everything after the claim is automatic: when the account crosses a milestone, its balance is sent in dollars
          {config.payoutProvider === "erc20" ? " to the wallet linked to that X account" : " to that X account"}.
        </li>
      </ol>

      <h2 id="payouts">Payouts</h2>
      <p>
        An account's share builds up as fees are claimed. Each time its lifetime earnings cross a milestone (
        {describeMilestones(config.milestones)}), the full unpaid balance is paid out in dollars. If a payout fails (for
        example, the account can't receive money yet), the amount goes back to the balance and goes out with the next
        milestone.
      </p>
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
