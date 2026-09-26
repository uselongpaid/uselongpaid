// Runs once when the server starts. Keeps scanning long.xyz for launches routed to LongPaid, so new tokens
// show up without a separate cron job. Set LONG_SYNC_INTERVAL_MS=0 to turn it off.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { config } = await import("./lib/config.ts");
  if (!config.detect.intervalMs || config.detect.feeWallets.length === 0) return;
  const { runLaunchSync } = await import("./lib/detect.ts");
  const tick = async () => {
    try {
      const r = await runLaunchSync();
      if (r.registered.length || r.needsHandle.length || r.errors.length) {
        console.log(
          `[long.xyz sync] blocks ${r.from}-${r.to}: ${r.registered.length} registered, ${r.needsHandle.length} need a handle` +
            (r.errors.length ? `, errors: ${r.errors.join("; ")}` : ""),
        );
      }
    } catch (e) {
      console.error("[long.xyz sync]", (e as Error).message);
    }
  };
  setTimeout(tick, 10_000);
  setInterval(tick, config.detect.intervalMs);
}
