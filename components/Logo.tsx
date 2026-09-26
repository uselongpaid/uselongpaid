/** Brand mark: a rounded black tile with a white "L" and a coin. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="62" height="62" rx="16" fill="#000000" stroke="#2a2a2a" strokeWidth="2" />
      <path d="M22 15V45H44" fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="43" cy="22" r="6.5" fill="#ffffff" />
    </svg>
  );
}
