"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ══════════════════════════════════════
   ⚽ PIXEL SOCCER – 1P vs CPU
   ══════════════════════════════════════ */

const W = 1280;
const H = 720;
const GROUND_Y = H - 50;
const GRAVITY = 0.35;
const BALL_R = 14;
const PLAYER_W = 40;
const PLAYER_H = 56;
const MOVE_SP = 4.5;
const JUMP_F = -10;
const GOAL_W = 16;
const GOAL_H = 140;
const GOAL_TOP = GROUND_Y - GOAL_H;
const WIN_SCORE = 5;
const KICK_POWER = 9;

/* NES palette */
const SKY = "#5C94FC";
const GRASS = "#00A800";
const GRASS_LT = "#30D830";
const GOAL_COLOR = "#FCFCFC";
const BALL_W = "#FCFCFC";
const BALL_BLK = "#383838";
const P1_COLOR = "#E40058";
const P2_COLOR = "#0058F8";
const BLACK = "#000000";
const WHITE = "#FCFCFC";

interface Obj { x: number; y: number; vx: number; vy: number; }
interface Player extends Obj { onGround: boolean; }

interface SState {
  ball: Obj;
  p1: Player;
  p2: Player;
  score1: number;
  score2: number;
  paused: boolean;
  winner: 0 | 1 | 2;
  frame: number;
  goalFlash: number;
}

function initState(): SState {
  return {
    ball: { x: W / 2, y: GROUND_Y - BALL_R - 80, vx: 0, vy: 0 },
    p1: { x: 200, y: GROUND_Y - PLAYER_H, vx: 0, vy: 0, onGround: true },
    p2: { x: W - 200 - PLAYER_W, y: GROUND_Y - PLAYER_H, vx: 0, vy: 0, onGround: true },
    score1: 0, score2: 0, paused: true, winner: 0, frame: 0, goalFlash: 0,
  };
}

function resetBall(s: SState) {
  s.ball = { x: W / 2, y: GROUND_Y - BALL_R - 80, vx: 0, vy: 0 };
  s.p1.x = 200; s.p1.y = GROUND_Y - PLAYER_H;
  s.p2.x = W - 200 - PLAYER_W; s.p2.y = GROUND_Y - PLAYER_H;
  s.paused = true;
}

function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c; ctx.fillRect(~~x, ~~y, ~~w, ~~h);
}
function drawText(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, sz: number, c: string) {
  ctx.fillStyle = c; ctx.font = `bold ${sz}px 'DungGeunMo', monospace`; ctx.textAlign = "center"; ctx.fillText(t, ~~x, ~~y); ctx.textAlign = "start";
}
function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(~~x, ~~y, r, 0, Math.PI * 2); ctx.fill();
}

export default function SoccerGame({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SState>(initState());
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const [scores, setScores] = useState([0, 0]);
  const [winner, setWinner] = useState(0);

  const restart = useCallback(() => { stateRef.current = initState(); setScores([0, 0]); setWinner(0); }, []);

  /* ── Touch helpers ── */
  const pressKey   = (code: string) => keysRef.current.add(code);
  const releaseKey = (code: string) => keysRef.current.delete(code);
  const triggerSpace = () => {
    const s = stateRef.current;
    if (s.winner) { restart(); return; }
    if (s.paused) { s.paused = false; }
  };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        const s = stateRef.current;
        if (s.winner) { restart(); return; }
        if (s.paused) { s.paused = false; }
      }
    };
    const ku = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [restart]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const loop = () => {
      const s = stateRef.current;
      const keys = keysRef.current;
      s.frame++;
      if (s.goalFlash > 0) s.goalFlash--;

      if (!s.winner && !s.paused) {
        /* ── P1 ── */
        if (keys.has("KeyA")) s.p1.x -= MOVE_SP;
        if (keys.has("KeyD")) s.p1.x += MOVE_SP;
        if (keys.has("KeyW") && s.p1.onGround) { s.p1.vy = JUMP_F; s.p1.onGround = false; }
        s.p1.x = Math.max(0, Math.min(W - PLAYER_W, s.p1.x));
        s.p1.vy += GRAVITY; s.p1.y += s.p1.vy;
        if (s.p1.y >= GROUND_Y - PLAYER_H) { s.p1.y = GROUND_Y - PLAYER_H; s.p1.vy = 0; s.p1.onGround = true; }

        /* ── CPU ── */
        const target = s.ball.x - PLAYER_W / 2;
        const dist = target - s.p2.x;
        if (Math.abs(dist) > 8) s.p2.x += (dist > 0 ? 1 : -1) * MOVE_SP * 0.8;
        s.p2.x = Math.max(0, Math.min(W - PLAYER_W, s.p2.x));
        // CPU jump to intercept
        if (s.ball.y < GROUND_Y - 120 && Math.abs(s.ball.x - s.p2.x - PLAYER_W / 2) < 60 && s.p2.onGround && s.ball.x > W / 3) {
          s.p2.vy = JUMP_F; s.p2.onGround = false;
        }
        s.p2.vy += GRAVITY; s.p2.y += s.p2.vy;
        if (s.p2.y >= GROUND_Y - PLAYER_H) { s.p2.y = GROUND_Y - PLAYER_H; s.p2.vy = 0; s.p2.onGround = true; }

        /* ── Ball ── */
        s.ball.vy += GRAVITY * 0.55;
        s.ball.vx *= 0.998; // slight air friction
        s.ball.x += s.ball.vx;
        s.ball.y += s.ball.vy;

        // Ground bounce
        if (s.ball.y + BALL_R >= GROUND_Y) {
          s.ball.y = GROUND_Y - BALL_R;
          s.ball.vy = -Math.abs(s.ball.vy) * 0.6;
          s.ball.vx *= 0.9;
        }
        // Ceiling
        if (s.ball.y - BALL_R < 0) { s.ball.y = BALL_R; s.ball.vy = Math.abs(s.ball.vy); }
        // Walls
        if (s.ball.x - BALL_R < 0) { s.ball.x = BALL_R; s.ball.vx = Math.abs(s.ball.vx); }
        if (s.ball.x + BALL_R > W) { s.ball.x = W - BALL_R; s.ball.vx = -Math.abs(s.ball.vx); }

        // Goal post collision (top bar)
        // Left goal
        if (s.ball.x - BALL_R < GOAL_W && s.ball.y + BALL_R > GOAL_TOP && s.ball.y - BALL_R < GOAL_TOP + 8) {
          s.ball.vy = -Math.abs(s.ball.vy);
        }
        // Right goal
        if (s.ball.x + BALL_R > W - GOAL_W && s.ball.y + BALL_R > GOAL_TOP && s.ball.y - BALL_R < GOAL_TOP + 8) {
          s.ball.vy = -Math.abs(s.ball.vy);
        }

        // Player-ball collision
        for (const p of [s.p1, s.p2]) {
          const dx = s.ball.x - (p.x + PLAYER_W / 2);
          const dy = s.ball.y - (p.y + PLAYER_H / 3);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < BALL_R + PLAYER_W / 2) {
            const angle = Math.atan2(dy, dx);
            s.ball.vx = Math.cos(angle) * KICK_POWER;
            s.ball.vy = Math.sin(angle) * KICK_POWER - 3;
            s.ball.x = p.x + PLAYER_W / 2 + Math.cos(angle) * (BALL_R + PLAYER_W / 2 + 2);
          }
        }

        // Goal detection
        // Left goal (CPU scores / P2 scores)
        if (s.ball.x - BALL_R <= GOAL_W && s.ball.y > GOAL_TOP && s.ball.y < GROUND_Y) {
          s.score2++; s.goalFlash = 40;
          setScores([s.score1, s.score2]);
          if (s.score2 >= WIN_SCORE) { s.winner = 2; setWinner(2); } else resetBall(s);
        }
        // Right goal (P1 scores)
        if (s.ball.x + BALL_R >= W - GOAL_W && s.ball.y > GOAL_TOP && s.ball.y < GROUND_Y) {
          s.score1++; s.goalFlash = 40;
          setScores([s.score1, s.score2]);
          if (s.score1 >= WIN_SCORE) { s.winner = 1; setWinner(1); } else resetBall(s);
        }
      }

      /* ── DRAW ── */
      drawRect(ctx, 0, 0, W, H, SKY);
      // Grass
      drawRect(ctx, 0, GROUND_Y, W, H - GROUND_Y, GRASS);
      // Grass stripes
      for (let gx = 0; gx < W; gx += 80) {
        drawRect(ctx, gx, GROUND_Y, 40, H - GROUND_Y, GRASS_LT);
      }
      drawRect(ctx, 0, GROUND_Y, W, 4, "#005800");

      // Goals
      // Left goal
      drawRect(ctx, 0, GOAL_TOP, GOAL_W, GOAL_H, GOAL_COLOR);
      drawRect(ctx, 0, GOAL_TOP, GOAL_W + 4, 6, GOAL_COLOR);
      drawRect(ctx, GOAL_W, GOAL_TOP, 4, GOAL_H, GOAL_COLOR);
      // net pattern
      for (let ny = GOAL_TOP + 12; ny < GROUND_Y; ny += 12) drawRect(ctx, 2, ny, GOAL_W - 2, 1, "#C0C0C0");
      for (let nx = 4; nx < GOAL_W; nx += 8) drawRect(ctx, nx, GOAL_TOP, 1, GOAL_H, "#C0C0C0");

      // Right goal
      drawRect(ctx, W - GOAL_W, GOAL_TOP, GOAL_W, GOAL_H, GOAL_COLOR);
      drawRect(ctx, W - GOAL_W - 4, GOAL_TOP, GOAL_W + 4, 6, GOAL_COLOR);
      drawRect(ctx, W - GOAL_W - 4, GOAL_TOP, 4, GOAL_H, GOAL_COLOR);
      for (let ny = GOAL_TOP + 12; ny < GROUND_Y; ny += 12) drawRect(ctx, W - GOAL_W + 2, ny, GOAL_W - 4, 1, "#C0C0C0");
      for (let nx = W - GOAL_W + 4; nx < W; nx += 8) drawRect(ctx, nx, GOAL_TOP, 1, GOAL_H, "#C0C0C0");

      // Center line
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = WHITE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2, GROUND_Y); ctx.lineTo(W / 2, GOAL_TOP - 40); ctx.stroke();
      ctx.setLineDash([]);
      // Center circle
      ctx.beginPath(); ctx.arc(W / 2, GROUND_Y - 60, 50, 0, Math.PI * 2); ctx.stroke();

      // Players
      // P1
      drawRect(ctx, s.p1.x, s.p1.y, PLAYER_W, PLAYER_H, P1_COLOR);
      drawRect(ctx, s.p1.x + 6, s.p1.y + 6, 10, 6, WHITE);
      drawRect(ctx, s.p1.x + 12, s.p1.y + 8, 3, 3, BLACK);
      drawRect(ctx, s.p1.x + 2, s.p1.y + PLAYER_H - 14, PLAYER_W - 4, 12, "#A80020");
      // P2
      drawRect(ctx, s.p2.x, s.p2.y, PLAYER_W, PLAYER_H, P2_COLOR);
      drawRect(ctx, s.p2.x + PLAYER_W - 16, s.p2.y + 6, 10, 6, WHITE);
      drawRect(ctx, s.p2.x + PLAYER_W - 16, s.p2.y + 8, 3, 3, BLACK);
      drawRect(ctx, s.p2.x + 2, s.p2.y + PLAYER_H - 14, PLAYER_W - 4, 12, "#003090");

      // Ball (soccer pattern)
      drawCircle(ctx, s.ball.x, s.ball.y, BALL_R, BALL_W);
      // Pentagon pattern
      for (let a = 0; a < 5; a++) {
        const ang = (a * Math.PI * 2) / 5 + s.frame * 0.03;
        drawCircle(ctx, s.ball.x + Math.cos(ang) * 7, s.ball.y + Math.sin(ang) * 7, 4, BALL_BLK);
      }

      // Score bar
      drawRect(ctx, 0, 0, W, 40, "rgba(0,0,0,0.4)");
      drawText(ctx, `P1: ${s.score1}`, W / 4, 28, 20, P1_COLOR);
      drawText(ctx, `CPU: ${s.score2}`, W * 3 / 4, 28, 20, P2_COLOR);
      drawText(ctx, `FIRST TO ${WIN_SCORE}`, W / 2, 28, 16, WHITE);

      // Labels
      drawText(ctx, "P1", s.p1.x + PLAYER_W / 2, s.p1.y - 8, 14, P1_COLOR);
      drawText(ctx, "CPU", s.p2.x + PLAYER_W / 2, s.p2.y - 8, 14, P2_COLOR);

      // Goal flash
      if (s.goalFlash > 0 && s.goalFlash % 6 < 3) {
        drawText(ctx, "⚽ GOAL!", W / 2, H / 2, 36, "#F8D830");
      }

      if (s.paused && !s.winner) {
        drawRect(ctx, 0, 0, W, H, "rgba(0,0,0,0.4)");
        drawText(ctx, "⚽ PIXEL SOCCER", W / 2, H / 2 - 50, 28, "#F8D830");
        drawText(ctx, "A/D 이동 · W 점프", W / 2, H / 2, 20, WHITE);
        drawText(ctx, "SPACE 킥오프!", W / 2, H / 2 + 35, 18, "#F8D830");
      }

      if (s.winner) {
        drawRect(ctx, 0, 0, W, H, "rgba(0,0,0,0.6)");
        drawText(ctx, s.winner === 1 ? "🎉 P1 승리!" : "😢 CPU 승리!", W / 2, H / 2 - 20, 28, s.winner === 1 ? "#F8D830" : P2_COLOR);
        drawText(ctx, "SPACE 로 재시작", W / 2, H / 2 + 30, 16, WHITE);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [restart]);

  return (
    <div className="game-container">
      <div className="game-header">
        <button className="btn btn-sm" onClick={onBack} style={{ marginBottom: "0.5rem" }}>← 게임 목록</button>
        <h1>⚽ PIXEL SOCCER</h1>
        <p>CPU를 이겨라! {WIN_SCORE}골 먼저 넣으면 승리!</p>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="game-canvas" tabIndex={0} />

      {/* ── Touch Controls ── */}
      <div className="game-touch-pad">
        <div className="game-touch-left">
          <button
            className="game-touch-btn"
            onTouchStart={e => { e.preventDefault(); pressKey("KeyA"); }}
            onTouchEnd={() => releaseKey("KeyA")}
            onTouchCancel={() => releaseKey("KeyA")}
          >◄</button>
          <button
            className="game-touch-btn"
            onTouchStart={e => { e.preventDefault(); pressKey("KeyD"); }}
            onTouchEnd={() => releaseKey("KeyD")}
            onTouchCancel={() => releaseKey("KeyD")}
          >►</button>
        </div>
        <div className="game-touch-right">
          <button
            className="game-touch-btn game-touch-jump"
            onTouchStart={e => { e.preventDefault(); pressKey("KeyW"); }}
            onTouchEnd={() => releaseKey("KeyW")}
            onTouchCancel={() => releaseKey("KeyW")}
          >↑ 점프</button>
          <button
            className="game-touch-btn game-touch-action"
            onTouchStart={e => { e.preventDefault(); triggerSpace(); }}
            onTouchEnd={() => releaseKey("Space")}
            onTouchCancel={() => releaseKey("Space")}
          >▶ 킵오프</button>
        </div>
      </div>
      <div className="game-controls">
        <div className="game-score-display">
          <span>P1: <strong style={{ color: "#E40058" }}>{scores[0]}</strong></span>
          <span>CPU: <strong style={{ color: "#0058F8" }}>{scores[1]}</strong></span>
        </div>
        {winner > 0 && <button className="btn btn-primary" onClick={restart}>다시 하기</button>}
        <p className="game-help">⌨️ A/D 이동 · W 점프 · SPACE 킵오프 &nbsp;| ️📱 터치 패드 지원</p>
      </div>
    </div>
  );
}
