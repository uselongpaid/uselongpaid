/** Brand mark: a rounded green tile with an "L" and a coin. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="#3ddc84" />
      <path d="M22 15V45H44" fill="none" stroke="#04130b" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="43" cy="22" r="6.5" fill="#04130b" />
    </svg>
  );
}
