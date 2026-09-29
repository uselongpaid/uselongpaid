import Link from "next/link";
import type { Metadata } from "next";
import { config } from "@/lib/config.ts";

export const metadata: Metadata = { title: `${config.appName} · CA coming soon` };

/** uselongpaid.xyz/ca: no coin CA is published on the site. */
export default function Ca() {
  return (
    <div className="docs" style={{ textAlign: "center", padding: "80px 0" }}>
      <div className="eyebrow" style={{ justifyContent: "center" }}>
        <span className="dot" /> {config.appName} coin
      </div>
      <h1>CA coming soon</h1>
      <p className="muted">
        The official contract address will be posted on{" "}
        {config.detect.handle ? (
          <a href={`https://x.com/${config.detect.handle}`} target="_blank" rel="noreferrer">
            @{config.detect.handle}
          </a>
        ) : (
          "X"
        )}
        . Don&apos;t trust a CA from anywhere else.
      </p>
      <p>
        <Link href="/">Back to {config.appName}</Link>
      </p>
    </div>
  );
}
