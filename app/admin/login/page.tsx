import { adminEnabled } from "@/lib/admin.ts";

export const dynamic = "force-dynamic";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="docs" style={{ maxWidth: 420 }}>
      <h1>Admin</h1>
      {!adminEnabled() ? (
        <p className="notice">Admin is off. Set ADMIN_PASSWORD and SESSION_SECRET on the server.</p>
      ) : (
        <form action="/api/admin/login" method="post" className="stack">
          {error === "wrong" && <p className="notice error">Wrong password.</p>}
          <label className="field">
            <span>Password</span>
            <input type="password" name="password" autoComplete="current-password" required autoFocus />
          </label>
          <button className="btn" type="submit">
            Sign in
          </button>
        </form>
      )}
    </div>
  );
}
