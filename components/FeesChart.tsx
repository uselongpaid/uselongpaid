"use client";

import { useState } from "react";

type Point = { day: string; micros: number };

const W = 720;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 48 };
const GAP = 2;

function usd(micros: number, digits = 2) {
  return (micros / 1_000_000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function niceMax(v: number) {
  if (v <= 0) return 1_000_000;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function label(day: string) {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Single-series bar chart of fees claimed per day, with a hover tooltip per bar. */
export function FeesChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.every((d) => d.micros === 0)) {
    return <div className="empty">No fees claimed in the last {data.length} days yet.</div>;
  }
  const max = niceMax(Math.max(...data.map((d) => d.micros)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.max(2, slot - GAP * 2);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fees claimed per day" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="axis">
              {usd(t, 0)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * slot + GAP;
          const h = Math.max(0, y(0) - y(d.micros));
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
              {/* Hit target covers the whole column, not just the bar. */}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  className={hover === i ? "bar active" : "bar"}
                  d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`}
                />
              )}
              {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="axis">
                  {label(d.day)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="baseline" />
      </svg>
      {hover !== null && (
        <div
          className="tooltip"
          style={{ left: `${((PAD.left + hover * slot + slot / 2) / W) * 100}%`, top: `${(y(data[hover].micros) / H) * 100}%` }}
        >
          <div className="muted">{label(data[hover].day)}</div>
          <strong>{usd(data[hover].micros)}</strong>
        </div>
      )}
      <details className="table-view">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th className="num">Fees claimed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <td>{label(d.day)}</td>
                <td className="num">{usd(d.micros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
