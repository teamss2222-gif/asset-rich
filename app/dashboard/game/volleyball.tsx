"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ══════════════════════════════════════
   🏐 PIXEL VOLLEYBALL – 1P vs CPU
   ══════════════════════════════════════ */

const W = 1280;
const H = 720;
const GRAVITY = 0.4;
const NET_W = 8;
const NET_H = 200;
const NET_X = W / 2 - NET_W / 2;
const NET_Y = H - 60 - NET_H;
const GROUND_Y = H - 60;
const BALL_R = 18;
const PLAYER_W = 48;
const PLAYER_H = 64;
const JUMP_FORCE = -11;
const MOVE_SPEED = 5;
const WIN_SCORE = 7;

/* NES palette */
const SKY = "#5C94FC";
const GROUND = "#00A800";
const GROUND_DK = "#005800";
const NET_COLOR = "#FCFCFC";
const BALL_COLOR = "#F8D830";
const BALL_DK = "#A87820";
const P1_COLOR = "#E40058";
const P2_COLOR = "#0058F8";
const BLACK = "#000000";
const WHITE = "#FCFCFC";
const SAND = "#E8A048";

interface BallState {
  x: number; y: number; vx: number; vy: number;
}

interface PlayerState {
  x: number; y: number; vy: number; onGround: boolean;
}

interface VState {
  ball: BallState;
  p1: PlayerState;
  p2: PlayerState;
  score1: number;
  score2: number;
  serving: 1 | 2;
  paused: boolean;
  winner: 0 | 1 | 2;
  frame: number;
}

function createState(): VState {
  return {
    ball: { x: 200, y: 200, vx: 0, vy: 0 },
    p1: { x: 200, y: GROUND_Y - PLAYER_H, vy: 0, onGround: true },
    p2: { x: W - 200 - PLAYER_W, y: GROUND_Y - PLAYER_H, vy: 0, onGround: true },
    score1: 0, score2: 0, serving: 1, paused: true, winner: 0, frame: 0,
  };
}

function resetBall(s: VState) {
  s.paused = true;
  if (s.serving === 1) {
    s.ball = { x: 200, y: 200, vx: 0, vy: 0 };
  } else {
    s.ball = { x: W - 200, y: 200, vx: 0, vy: 0 };
  }
}

function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

function drawText(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, sz: number, c: string) {
  ctx.fillStyle = c;
  ctx.font = `bold ${sz}px 'DungGeunMo', monospace`;
  ctx.textAlign = "center";
  ctx.fillText(t, Math.floor(x), Math.floor(y));
  ctx.textAlign = "start";
}

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(Math.floor(x), Math.floor(y), r, 0, Math.PI * 2);
  ctx.fill();
}

export default function VolleyballGame({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<VState>(createState());
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const [scores, setScores] = useState([0, 0]);
  const [winner, setWinner] = useState(0);

  const restartGame = useCallback(() => {
    stateRef.current = createState();
    setScores([0, 0]);
    setWinner(0);
  }, []);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        const s = stateRef.current;
        if (s.winner) { restartGame(); return; }
        if (s.paused) { s.paused = false; s.ball.vy = -6; s.ball.vx = s.serving === 1 ? 4 : -4; }
      }
    };
    const ku = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [restartGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const loop = () => {
      const s = stateRef.current;
      const keys = keysRef.current;
      s.frame++;

      if (!s.winner && !s.paused) {
        /* ── P1 movement (A/D + W jump) ── */
        if (keys.has("KeyA") && s.p1.x > 0) s.p1.x -= MOVE_SPEED;
        if (keys.has("KeyD") && s.p1.x + PLAYER_W < NET_X) s.p1.x += MOVE_SPEED;
        if (keys.has("KeyW") && s.p1.onGround) { s.p1.vy = JUMP_FORCE; s.p1.onGround = false; }
        s.p1.vy += GRAVITY;
        s.p1.y += s.p1.vy;
        if (s.p1.y >= GROUND_Y - PLAYER_H) { s.p1.y = GROUND_Y - PLAYER_H; s.p1.vy = 0; s.p1.onGround = true; }

        /* ── CPU (P2) AI ── */
        const cpuTarget = s.ball.x > W / 2 ? s.ball.x - PLAYER_W / 2 : W - 200 - PLAYER_W;
        if (s.p2.x + PLAYER_W / 2 < cpuTarget - 10) s.p2.x += MOVE_SPEED * 0.85;
        else if (s.p2.x + PLAYER_W / 2 > cpuTarget + 10) s.p2.x -= MOVE_SPEED * 0.85;
        s.p2.x = Math.max(NET_X + NET_W, Math.min(W - PLAYER_W, s.p2.x));
        // CPU jump when ball is close
        if (s.ball.x > W / 2 && s.ball.y < GROUND_Y - 150 && Math.abs(s.ball.x - s.p2.x - PLAYER_W / 2) < 80 && s.p2.onGround) {
          s.p2.vy = JUMP_FORCE;
          s.p2.onGround = false;
        }
        s.p2.vy += GRAVITY;
        s.p2.y += s.p2.vy;
        if (s.p2.y >= GROUND_Y - PLAYER_H) { s.p2.y = GROUND_Y - PLAYER_H; s.p2.vy = 0; s.p2.onGround = true; }

        /* ── Ball physics ── */
        s.ball.vy += GRAVITY * 0.6;
        s.ball.x += s.ball.vx;
        s.ball.y += s.ball.vy;

        // Wall bounce
        if (s.ball.x - BALL_R < 0) { s.ball.x = BALL_R; s.ball.vx = Math.abs(s.ball.vx); }
        if (s.ball.x + BALL_R > W) { s.ball.x = W - BALL_R; s.ball.vx = -Math.abs(s.ball.vx); }
        if (s.ball.y - BALL_R < 0) { s.ball.y = BALL_R; s.ball.vy = Math.abs(s.ball.vy); }

        // Net collision
        if (s.ball.y + BALL_R > NET_Y && s.ball.x + BALL_R > NET_X && s.ball.x - BALL_R < NET_X + NET_W) {
          if (s.ball.vy > 0 && s.ball.y - BALL_R < NET_Y) {
            s.ball.y = NET_Y - BALL_R;
            s.ball.vy = -Math.abs(s.ball.vy) * 0.7;
          } else {
            s.ball.vx = s.ball.x < W / 2 ? -Math.abs(s.ball.vx) : Math.abs(s.ball.vx);
          }
        }

        // Player collision (both)
        for (const p of [s.p1, s.p2]) {
          const dx = s.ball.x - (p.x + PLAYER_W / 2);
          const dy = s.ball.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < BALL_R + PLAYER_W / 2 && dy < PLAYER_H / 2) {
            const angle = Math.atan2(dy, dx);
            const speed = Math.sqrt(s.ball.vx ** 2 + s.ball.vy ** 2);
            const newSpeed = Math.max(speed, 7);
            s.ball.vx = Math.cos(angle) * newSpeed;
            s.ball.vy = Math.sin(angle) * newSpeed - 2;
            s.ball.x = p.x + PLAYER_W / 2 + Math.cos(angle) * (BALL_R + PLAYER_W / 2 + 1);
            s.ball.y = p.y + Math.sin(angle) * (BALL_R + PLAYER_W / 2 + 1);
          }
        }

        // Ground = score
        if (s.ball.y + BALL_R >= GROUND_Y) {
          if (s.ball.x < W / 2) {
            s.score2++;
            s.serving = 1;
          } else {
            s.score1++;
            s.serving = 2;
          }
          setScores([s.score1, s.score2]);
          if (s.score1 >= WIN_SCORE) { s.winner = 1; setWinner(1); }
          else if (s.score2 >= WIN_SCORE) { s.winner = 2; setWinner(2); }
          else resetBall(s);
        }
      }

      /* ── DRAW ── */
      drawRect(ctx, 0, 0, W, H, SKY);
      // Sand ground
      drawRect(ctx, 0, GROUND_Y, W, H - GROUND_Y, SAND);
      drawRect(ctx, 0, GROUND_Y, W, 4, GROUND);
      // Net
      drawRect(ctx, NET_X, NET_Y, NET_W, NET_H + 4, NET_COLOR);
      drawRect(ctx, NET_X - 4, NET_Y - 4, NET_W + 8, 8, NET_COLOR);
      // Net pattern
      for (let ny = NET_Y + 16; ny < GROUND_Y; ny += 16) {
        drawRect(ctx, NET_X, ny, NET_W, 2, "#C0C0C0");
      }

      // Players
      // P1 (red)
      drawRect(ctx, s.p1.x, s.p1.y, PLAYER_W, PLAYER_H, P1_COLOR);
      drawRect(ctx, s.p1.x + 8, s.p1.y + 8, 12, 8, WHITE); // eye
      drawRect(ctx, s.p1.x + 16, s.p1.y + 10, 4, 4, BLACK);
      drawRect(ctx, s.p1.x + 4, s.p1.y + PLAYER_H - 16, PLAYER_W - 8, 14, "#A80020");
      // P2 (blue)
      drawRect(ctx, s.p2.x, s.p2.y, PLAYER_W, PLAYER_H, P2_COLOR);
      drawRect(ctx, s.p2.x + PLAYER_W - 20, s.p2.y + 8, 12, 8, WHITE);
      drawRect(ctx, s.p2.x + PLAYER_W - 20, s.p2.y + 10, 4, 4, BLACK);
      drawRect(ctx, s.p2.x + 4, s.p2.y + PLAYER_H - 16, PLAYER_W - 8, 14, "#003090");

      // Ball
      drawCircle(ctx, s.ball.x, s.ball.y, BALL_R, BALL_COLOR);
      drawCircle(ctx, s.ball.x - 3, s.ball.y - 3, BALL_R - 6, BALL_DK);
      // Ball stripe
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.ball.x, s.ball.y, BALL_R - 2, -0.5, 0.5);
      ctx.stroke();

      // Score
      drawRect(ctx, 0, 0, W, 40, "rgba(0,0,0,0.4)");
      drawText(ctx, `P1: ${s.score1}`, W / 4, 28, 20, P1_COLOR);
      drawText(ctx, `CPU: ${s.score2}`, W * 3 / 4, 28, 20, P2_COLOR);
      drawText(ctx, `FIRST TO ${WIN_SCORE}`, W / 2, 28, 16, WHITE);

      // Labels
      drawText(ctx, "P1", s.p1.x + PLAYER_W / 2, s.p1.y - 8, 14, P1_COLOR);
      drawText(ctx, "CPU", s.p2.x + PLAYER_W / 2, s.p2.y - 8, 14, P2_COLOR);

      if (s.paused && !s.winner) {
        drawRect(ctx, 0, 0, W, H, "rgba(0,0,0,0.4)");
        drawText(ctx, "🏐 PIXEL VOLLEYBALL", W / 2, H / 2 - 50, 28, BALL_COLOR);
        drawText(ctx, "A/D 이동 · W 점프", W / 2, H / 2, 20, WHITE);
        drawText(ctx, "SPACE 서브!", W / 2, H / 2 + 35, 18, BALL_COLOR);
      }

      if (s.winner) {
        drawRect(ctx, 0, 0, W, H, "rgba(0,0,0,0.6)");
        drawText(ctx, s.winner === 1 ? "🎉 P1 승리!" : "😢 CPU 승리!", W / 2, H / 2 - 20, 28, s.winner === 1 ? BALL_COLOR : P2_COLOR);
        drawText(ctx, "SPACE 로 재시작", W / 2, H / 2 + 30, 16, WHITE);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [restartGame]);

  return (
    <div className="game-container">
      <div className="game-header">
        <button className="btn btn-sm" onClick={onBack} style={{ marginBottom: "0.5rem" }}>← 게임 목록</button>
        <h1>🏐 PIXEL VOLLEYBALL</h1>
        <p>CPU를 이겨라! {WIN_SCORE}점 먼저 따면 승리!</p>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="game-canvas" tabIndex={0} />
      <div className="game-controls">
        <div className="game-score-display">
          <span>P1: <strong style={{ color: "#E40058" }}>{scores[0]}</strong></span>
          <span>CPU: <strong style={{ color: "#0058F8" }}>{scores[1]}</strong></span>
        </div>
        {winner > 0 && <button className="btn btn-primary" onClick={restartGame}>다시 하기</button>}
        <p className="game-help">⌨️ A/D 이동 · W 점프 · SPACE 서브</p>
      </div>
    </div>
  );
}
