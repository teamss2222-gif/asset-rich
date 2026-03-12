"use client";

import { useState } from "react";
import CoinRunGame from "./coin-run";
import VolleyballGame from "./volleyball";
import SoccerGame from "./soccer";

type GameId = "menu" | "coinrun" | "volleyball" | "soccer";

const GAMES = [
  { id: "coinrun" as const, icon: "🪙", name: "COIN RUN", desc: "파이프를 넘고 코인을 모아라!", color: "#F8D830" },
  { id: "volleyball" as const, icon: "🏐", name: "VOLLEYBALL", desc: "CPU와 비치발리볼 대결!", color: "#FCFCFC" },
  { id: "soccer" as const, icon: "⚽", name: "SOCCER", desc: "CPU를 이기고 골을 넣어라!", color: "#00A800" },
];

export default function GamePage() {
  const [current, setCurrent] = useState<GameId>("menu");

  if (current === "coinrun") return <CoinRunGame onBack={() => setCurrent("menu")} />;
  if (current === "volleyball") return <VolleyballGame onBack={() => setCurrent("menu")} />;
  if (current === "soccer") return <SoccerGame onBack={() => setCurrent("menu")} />;

  return (
    <div className="game-container">
      <div className="game-header">
        <h1>🎮 GAME CENTER</h1>
        <p>플레이할 게임을 선택하세요!</p>
      </div>
      <div className="game-select-grid">
        {GAMES.map((g) => (
          <button
            key={g.id}
            className="game-select-card"
            onClick={() => setCurrent(g.id)}
          >
            <span className="game-select-icon">{g.icon}</span>
            <span className="game-select-name" style={{ color: g.color }}>{g.name}</span>
            <span className="game-select-desc">{g.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
