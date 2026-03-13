const folders = [
  {
    href: "/dashboard/asset",
    label: "자산관리",
    icon: "🪙",
    desc: "총자산 · 포트폴리오 · 순자산",
    color: "folder-amber",
  },
  {
    href: "/dashboard/cards",
    label: "카드혜택",
    icon: "💳",
    desc: "카드 비교 · 혜택 검색",
    color: "folder-blue",
  },
  {
    href: "/dashboard/issues",
    label: "실시간 이슈",
    icon: "🔥",
    desc: "트렌드 TOP 20 · AI 분석",
    color: "folder-red",
  },
  {
    href: "/dashboard/game",
    label: "게임",
    icon: "🎮",
    desc: "코인런 · 스코어 도전!",
    color: "folder-purple",
  },
  {
    href: "/dashboard/setting",
    label: "설정",
    icon: "⚙️",
    desc: "계정 · 알림 · 보안 설정",
    color: "folder-gray",
  },
];

export default function DashboardPage() {
  return (
    <div className="folder-room">
      <p className="folder-room-title">나의 서류함</p>
      <div className="folder-grid">
        {folders.map((f) => (
          <a key={f.href} href={f.href} className={`folder ${f.color}`}>
            <div className="folder-tab">{f.label}</div>
            <div className="folder-face">
              <span className="folder-icon-lg">{f.icon}</span>
              <strong className="folder-name">{f.label}</strong>
              <p className="folder-desc">{f.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
