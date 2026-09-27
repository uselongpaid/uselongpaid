// Where a token's creator fees go, drawn as a flow. Pure SVG on wide screens, a vertical list on phones.

type IconName = "chart" | "claim" | "dollar" | "wallet" | "user" | "flame";

function Icon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "chart":
      return (
        <g {...common}>
          <polyline points="3 17 9 11 13 15 21 7" />
          <polyline points="15 7 21 7 21 13" />
        </g>
      );
    case "claim":
      return (
        <g {...common}>
          <path d="M12 3v11" />
          <path d="M7 9.5l5 5 5-5" />
          <path d="M5 20h14" />
        </g>
      );
    case "dollar":
      return (
        <g {...common}>
          <path d="M12 2.5v19" />
          <path d="M16.5 6.5H10a3.25 3.25 0 0 0 0 6.5h4a3.25 3.25 0 0 1 0 6.5H7" />
        </g>
      );
    case "wallet":
      return (
        <g {...common}>
          <rect x="3" y="6" width="18" height="14" rx="3" />
          <path d="M3 10h18" />
          <path d="M16 15h2" />
          <path d="M7 6V4.5h10V6" />
        </g>
      );
    case "user":
      return (
        <g {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
        </g>
      );
    case "flame":
      return (
        <g {...common}>
          <path d="M12 22c3.9 0 7-2.9 7-6.8 0-3.6-2.6-5.7-3.8-9.2-1.8 1.6-2.7 3.4-2.7 5.4-1.2-.8-2-2.2-2.2-3.9C7.5 9.8 5 12.3 5 15.2 5 19.1 8.1 22 12 22z" />
        </g>
      );
  }
}

type Node = { x: number; y: number; icon: IconName; label: string[]; tone?: "burn" | "hot" };

export function FeeFlow({ share, handle, launchpad, network }: { share: number; handle: string; launchpad: string; network: string }) {
  const burn = 100 - share;
  const nodes: Node[] = [
    { x: 80, y: 180, icon: "chart", label: [`${launchpad} on`, network] },
    { x: 290, y: 180, icon: "claim", label: ["Fees", "claimed"] },
    { x: 510, y: 90, icon: "dollar", label: ["Converted", "to dollars"], tone: "hot" },
    { x: 750, y: 90, icon: "wallet", label: ["Sent to X Money", `balance @${handle}`] },
    { x: 990, y: 90, icon: "user", label: ["Sent to", "X user"] },
    { x: 510, y: 280, icon: "flame", label: ["Bought back", "and burned"], tone: "burn" },
  ];
  return (
    <div className="feeflow">
      <svg className="feeflow-svg" viewBox="0 0 1080 360" role="img" aria-label={`Fees claimed from ${launchpad} on ${network}: ${share}% converted to dollars and sent through X Money to the handle in the bio, ${burn}% bought back and burned.`}>
        <g className="ff-lines">
          <path d="M112 180H258" />
          <path d="M322 180C400 180 400 90 478 90" className="ff-main" />
          <path d="M542 90H718" className="ff-main" />
          <path d="M782 90H958" className="ff-main" />
          <path d="M322 180C400 180 400 280 478 280" className="ff-burn" />
        </g>
        <g className="ff-flow" aria-hidden="true">
          <path d="M112 180H258" />
          <path d="M322 180C400 180 400 90 478 90" />
          <path d="M542 90H718" />
          <path d="M782 90H958" />
          <path d="M322 180C400 180 400 280 478 280" className="ff-flow-burn" />
        </g>
        <text x="410" y="82" className="ff-pct">{share}%</text>
        <text x="410" y="306" className="ff-pct ff-pct-burn">{burn}%</text>
        {nodes.map((n) => (
          <g key={n.label.join(" ")} className={`ff-node${n.tone ? ` ff-${n.tone}` : ""}`}>
            <circle cx={n.x} cy={n.y} r="38" className="ff-ring" />
            <circle cx={n.x} cy={n.y} r="31" className="ff-core" />
            <g transform={`translate(${n.x - 12} ${n.y - 12})`} className="ff-icon">
              <Icon name={n.icon} />
            </g>
            <text x={n.x} y={n.y + 62} className="ff-label">
              {n.label.map((line, i) => (
                <tspan key={line} x={n.x} dy={i === 0 ? 0 : 18}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        ))}
      </svg>

      <ol className="feeflow-list">
        <li>
          <span className="ffl-icon">
            <svg viewBox="0 0 24 24" width="20" height="20"><Icon name="chart" /></svg>
          </span>
          {launchpad} on {network}
        </li>
        <li>
          <span className="ffl-icon">
            <svg viewBox="0 0 24 24" width="20" height="20"><Icon name="claim" /></svg>
          </span>
          Fees claimed
        </li>
        <li className="ffl-branch">
          <span className="ffl-pct">{share}%</span>
          <span className="ffl-icon">
            <svg viewBox="0 0 24 24" width="20" height="20"><Icon name="dollar" /></svg>
          </span>
          Converted to dollars → X Money balance @{handle} → sent to the X user
        </li>
        <li className="ffl-branch ffl-burn">
          <span className="ffl-pct">{burn}%</span>
          <span className="ffl-icon">
            <svg viewBox="0 0 24 24" width="20" height="20"><Icon name="flame" /></svg>
          </span>
          Bought back and burned
        </li>
      </ol>
    </div>
  );
}
