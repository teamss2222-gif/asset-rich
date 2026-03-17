export default function AssetLoading() {
  return (
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ height: "1.2rem", width: "120px", borderRadius: "6px", background: "rgba(255,255,255,0.08)", animation: "pulse 1.4s ease-in-out infinite" }} />
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 220px", height: "220px", borderRadius: "50%", background: "rgba(255,255,255,0.06)", animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ flex: 1, minWidth: "200px", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {[180, 140, 160, 120, 150].map((w, i) => (
            <div key={i} style={{ height: "1rem", width: `${w}px`, borderRadius: "4px", background: "rgba(255,255,255,0.07)", animation: "pulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
    </div>
  );
}
