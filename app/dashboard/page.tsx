const folders = [
  {
    href: "/dashboard/asset",
    label: "자산관리",
    icon: "🪙",
    desc: "총자산 · 포트폴리오 · 순자산",
    color: "folder-amber",
  },
  {
    href: "/dashboard/budget",
    label: "예산",
    icon: "⭐",
    desc: "월간 예산 · 카테고리별 지출",
    color: "folder-green",
  },
  {
    href: "/dashboard/goal",
    label: "목표",
    icon: "🍄",
    desc: "저축/투자 목표 · 달성률",
    color: "folder-red",
  },
  {
    href: "/dashboard/calendar",
    label: "캘린더",
    icon: "🏰",
    desc: "결제일 · 급여일 · 자동이체",
    color: "folder-blue",
  },
  {
    href: "/dashboard/report",
    label: "리포트",
    icon: "🔥",
    desc: "소비 패턴 · 재무 지표 분석",
    color: "folder-purple",
  },
  {
    href: "/dashboard/document",
    label: "문서",
    icon: "📦",
    desc: "영수증 · 증빙 파일 보관함",
    color: "folder-teal",
  },
  {
    href: "/dashboard/finance",
    label: "금융상품",
    icon: "💰",
    desc: "예금 · 적금 · 대출 비교",
    color: "folder-amber",
  },
  {
    href: "/dashboard/game",
    label: "게임",
    icon: "🎮",
    desc: "코인런 · 스코어 도전!",
    color: "folder-red",
  },
  {
    href: "/dashboard/setting",
    label: "설정",
    icon: "🔧",
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
