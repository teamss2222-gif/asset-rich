"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "개요", icon: "🏠" },
  { href: "/dashboard/asset", label: "자산관리", icon: "🪙" },
  { href: "/dashboard/cards", label: "카드혜택", icon: "💳" },
  { href: "/dashboard/dictionary", label: "국어사전", icon: "📚" },
  { href: "/dashboard/game", label: "게임", icon: "🎮" },
  { href: "/dashboard/setting", label: "설정", icon: "🔧" },
];

export function DashboardSidebar({ username }: { username: string }) {
  const pathname = usePathname();

  return (
    <aside className="dash-sidebar">
      <div className="dash-sidebar-header">
        <p className="dash-title">My Workspace</p>
        <p className="dash-subtitle">{username} 님</p>
      </div>

      <nav className="dash-sidebar-nav" aria-label="도메인 메뉴">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`dash-sidebar-item${isActive ? " active" : ""}`}
            >
              <span className="dash-sidebar-icon">{item.icon}</span>
              <span className="dash-sidebar-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="dash-sidebar-footer">
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          ← 서류함
        </Link>
      </div>
    </aside>
  );
}
