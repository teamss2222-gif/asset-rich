"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const folders = [
  { href: "/dashboard/asset",    label: "자산관리",    icon: "🪙", openIcon: "📂", color: "amber"  },
  { href: "/dashboard/cards",    label: "카드혜택",    icon: "💳", openIcon: "📂", color: "blue"   },
  { href: "/dashboard/schedule", label: "시간표",      icon: "🗓️", openIcon: "📂", color: "teal"   },
  { href: "/dashboard/issues",   label: "실시간 이슈", icon: "🔥", openIcon: "📂", color: "red"    },
  { href: "/dashboard/stock",    label: "주가 시뮬",   icon: "📊", openIcon: "📂", color: "green"  },
  { href: "/dashboard/game",     label: "게임",        icon: "🎮", openIcon: "📂", color: "purple" },
  { href: "/dashboard/habit",     label: "습관 트래커", icon: "🌿", openIcon: "📂", color: "green"  },
  { href: "/dashboard/pomodoro",  label: "뽀모도로",    icon: "⏱️", openIcon: "📂", color: "orange" },
  { href: "/dashboard/dict",      label: "사전",         icon: "📖", openIcon: "📂", color: "indigo" },
  { href: "/dashboard/setting",  label: "설정",        icon: "⚙️", openIcon: "📂", color: "gray"   },
];

export function FolderNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRoot = pathname === "/dashboard";

  if (isRoot) {
    return <main className="dash-main">{children}</main>;
  }

  return (
    <div className="fnav-shell">
      <div className="fnav-strip">
        {folders.map((f) => {
          const isActive = pathname.startsWith(f.href);
          return (
            <Link
              key={f.href}
              href={f.href}
              className={`fnav-tab fnav-tab-${f.color}${isActive ? " active" : ""}`}
            >
              <span className="fnav-tab-icon">
                {isActive ? f.openIcon : f.icon}
              </span>
              <span className="fnav-tab-label">{f.label}</span>
            </Link>
          );
        })}
      </div>
      <main className="fnav-content">{children}</main>
    </div>
  );
}
