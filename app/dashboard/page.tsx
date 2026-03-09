import { auth, signOut } from "../../auth";

export default async function DashboardPage() {
  const session = await auth();
  const userName = session?.user?.name ?? "Asset user";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">SIGNED IN</p>
        <h1 className="auth-title">Welcome, {userName}.</h1>
        <p className="auth-subtitle">
          This is a protected page. Only authenticated users can see this dashboard.
        </p>

        <div className="auth-row">
          <a className="btn btn-ghost" href="/">
            Back home
          </a>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button className="btn btn-primary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
