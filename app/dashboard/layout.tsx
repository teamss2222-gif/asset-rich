import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "../../lib/session";
import { LogoutButton } from "../ui/logout-button";
import { FolderNav } from "../ui/folder-nav";

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
        <Link href="/dashboard" className="dash-topbar-brand">ASSET LAB</Link>
        <Link href="/dashboard" className="dash-topbar-back">← 서류함</Link>
        <span className="dash-topbar-user">{username} 님</span>
        <LogoutButton />
      </header>
      <FolderNav>{children}</FolderNav>
    </div>
  );
}
