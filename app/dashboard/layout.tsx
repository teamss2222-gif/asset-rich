import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "../../lib/session";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const username = await readSession();
  if (!username) {
    redirect("/");
  }

  return (
    <div className="dash-shell">
      <header className="dash-topbar">
        <Link href="/dashboard" className="dash-topbar-brand">🎮 ASSET LAB</Link>
        <span className="dash-topbar-user">{username} 님</span>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">← 서류함</Link>
      </header>
      <main className="dash-main">{children}</main>
    </div>
  );
}
