"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ══════════════════════════════════════
   🎮 COIN RUN – 8-bit Mario-style game
   ══════════════════════════════════════ */

/* ── Constants ── */
const W = 640;
const H = 360;
const GRAVITY = 0.55;
const JUMP_FORCE = -10;
const SPEED = 3.5;
const GROUND_Y = H - 48;
const PIPE_W = 48;
const PIPE_GAP_MIN = 140;
const PIPE_GAP_MAX = 200;
const COIN_SIZE = 20;

/* ── Mario palette ── */
const SKY = "#5C94FC";
const GROUND_COLOR = "#C84C0C";
const GROUND_TOP = "#E09C48";
const PIPE_GREEN = "#00A800";
const PIPE_DK = "#005800";
const COIN_GOLD = "#F8D830";
const COIN_DK = "#A87820";
const MARIO_RED = "#E40058";
const SKIN = "#FCBCB0";
const BLACK = "#000000";
const WHITE = "#FCFCFC";
const CLOUD_WHITE = "#F8F8F8";
const BLOCK_COLOR = "#F8D878";

/* ── Types ── */
interface Pipe {
  x: number;
  h: number; // height of the pipe (from ground up)
  passed: boolean;
}

interface Coin {
  x: number;
  y: number;
  collected: boolean;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
}

interface GameState {
  playerX: number;
  playerY: number;
  playerVy: number;
  isOnGround: boolean;
  pipes: Pipe[];
  coins: Coin[];
  clouds: Cloud[];
  score: number;
  distance: number;
  gameOver: boolean;
  started: boolean;
  frameCount: number;
}

function createInitialState(): GameState {
  const clouds: Cloud[] = [];
  for (let i = 0; i < 5; i++) {
    clouds.push({
      x: Math.random() * W + i * 200,
      y: 30 + Math.random() * 60,
      w: 50 + Math.random() * 40,
    });
  }
  return {
    playerX: 80,
    playerY: GROUND_Y - 32,
    playerVy: 0,
    isOnGround: true,
    pipes: [],
    coins: [],
    clouds,
    score: 0,
    distance: 0,
    gameOver: false,
    started: false,
    frameCount: 0,
  };
}

/* ── Draw helpers ── */
function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

function drawPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px 'DungGeunMo', monospace`;
  ctx.textAlign = "center";
  ctx.fillText(text, Math.floor(x), Math.floor(y));
  ctx.textAlign = "start";
}

/* ── Draw Mario character (pixel art) ── */
function drawMario(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const px = 4; // pixel size
  // Hat
  drawRect(ctx, x + px * 1, y, px * 4, px, MARIO_RED);
  drawRect(ctx, x, y + px, px * 6, px, MARIO_RED);
  // Face
  drawRect(ctx, x + px, y + px * 2, px * 4, px, SKIN);
  drawRect(ctx, x, y + px * 3, px * 6, px, SKIN);
  // Eyes
  drawRect(ctx, x + px * 2, y + px * 2, px, px, BLACK);
  drawRect(ctx, x + px * 4, y + px * 2, px, px, BLACK);
  // Body (overalls)
  drawRect(ctx, x + px, y + px * 4, px * 4, px * 2, MARIO_RED);
  drawRect(ctx, x, y + px * 4, px, px * 2, SKIN); // left arm
  drawRect(ctx, x + px * 5, y + px * 4, px, px * 2, SKIN); // right arm
  // Legs (animate)
  if (frame % 2 === 0) {
    drawRect(ctx, x + px, y + px * 6, px * 2, px * 2, "#0058F8");
    drawRect(ctx, x + px * 3, y + px * 6, px * 2, px * 2, "#0058F8");
  } else {
    drawRect(ctx, x, y + px * 6, px * 2, px * 2, "#0058F8");
    drawRect(ctx, x + px * 4, y + px * 6, px * 2, px * 2, "#0058F8");
  }
}

/* ── Draw pipe ── */
function drawPipe(ctx: CanvasRenderingContext2D, x: number, h: number) {
  // Pipe body
  drawRect(ctx, x + 4, GROUND_Y - h, PIPE_W - 8, h, PIPE_GREEN);
  drawRect(ctx, x + 4, GROUND_Y - h, 6, h, PIPE_DK); // left shadow
  // Pipe lip
  drawRect(ctx, x, GROUND_Y - h, PIPE_W, 12, PIPE_GREEN);
  drawRect(ctx, x, GROUND_Y - h, PIPE_W, 3, PIPE_DK);
  drawRect(ctx, x, GROUND_Y - h, 3, 12, PIPE_DK);
}

/* ── Draw coin ── */
function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const blink = Math.floor(frame / 8) % 4;
  const w = blink === 0 ? COIN_SIZE : blink === 2 ? COIN_SIZE * 0.4 : COIN_SIZE * 0.7;
  const cx = x + (COIN_SIZE - w) / 2;
  drawRect(ctx, cx, y, w, COIN_SIZE, COIN_GOLD);
  drawRect(ctx, cx, y, w, 3, COIN_DK);
  // $ sign
  if (w > 10) {
    drawPixelText(ctx, "$", x + COIN_SIZE / 2, y + COIN_SIZE - 4, 12, COIN_DK);
  }
}

/* ── Draw cloud ── */
function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  drawRect(ctx, x + 8, y, w - 16, 12, CLOUD_WHITE);
  drawRect(ctx, x, y + 6, w, 14, CLOUD_WHITE);
  drawRect(ctx, x + 4, y + 16, w - 8, 6, CLOUD_WHITE);
}

export default function GamePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(createInitialState());
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayOver, setDisplayOver] = useState(false);
  const [highScore, setHighScore] = useState(0);

  const resetGame = useCallback(() => {
    stateRef.current = createInitialState();
    stateRef.current.started = true;
    setDisplayOver(false);
    setDisplayScore(0);
  }, []);

  /* ── Input ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        const s = stateRef.current;
        if (!s.started) {
          s.started = true;
        }
        if (s.gameOver) {
          resetGame();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [resetGame]);

  /* ── Touch support ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleTouch = (e: TouchEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      if (!s.started) {
        s.started = true;
        return;
      }
      if (s.gameOver) {
        resetGame();
        return;
      }
      if (s.isOnGround) {
        s.playerVy = JUMP_FORCE;
        s.isOnGround = false;
      }
    };
    canvas.addEventListener("touchstart", handleTouch, { passive: false });
    return () => canvas.removeEventListener("touchstart", handleTouch);
  }, [resetGame]);

  /* ── Game loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Load high score
    try {
      const saved = localStorage.getItem("coinrun_highscore");
      if (saved) setHighScore(parseInt(saved, 10));
    } catch { /* ignore */ }

    const loop = () => {
      const s = stateRef.current;
      const keys = keysRef.current;

      /* ── UPDATE ── */
      if (s.started && !s.gameOver) {
        s.frameCount++;

        // Jump
        if ((keys.has("Space") || keys.has("ArrowUp")) && s.isOnGround) {
          s.playerVy = JUMP_FORCE;
          s.isOnGround = false;
        }

        // Physics
        s.playerVy += GRAVITY;
        s.playerY += s.playerVy;

        if (s.playerY >= GROUND_Y - 32) {
          s.playerY = GROUND_Y - 32;
          s.playerVy = 0;
          s.isOnGround = true;
        }

        s.distance += SPEED;

        // Spawn pipes
        const lastPipe = s.pipes[s.pipes.length - 1];
        const gap = PIPE_GAP_MIN + Math.random() * (PIPE_GAP_MAX - PIPE_GAP_MIN);
        if (!lastPipe || lastPipe.x < W - gap) {
          const h = 30 + Math.random() * 80;
          s.pipes.push({ x: W + 20, h, passed: false });
          // Spawn coin above pipe
          s.coins.push({
            x: W + 20 + PIPE_W / 2 - COIN_SIZE / 2,
            y: GROUND_Y - h - 40 - Math.random() * 60,
            collected: false,
          });
          // Random extra floating coin
          if (Math.random() > 0.5) {
            s.coins.push({
              x: W + 20 + gap / 2,
              y: GROUND_Y - 80 - Math.random() * 100,
              collected: false,
            });
          }
        }

        // Move pipes & coins
        for (const pipe of s.pipes) {
          pipe.x -= SPEED;
          if (!pipe.passed && pipe.x + PIPE_W < s.playerX) {
            pipe.passed = true;
            s.score += 1;
          }
        }
        for (const coin of s.coins) {
          coin.x -= SPEED;
        }

        // Move clouds
        for (const cloud of s.clouds) {
          cloud.x -= SPEED * 0.3;
          if (cloud.x + cloud.w < 0) {
            cloud.x = W + Math.random() * 100;
            cloud.y = 25 + Math.random() * 60;
          }
        }

        // Cleanup
        s.pipes = s.pipes.filter((p) => p.x > -PIPE_W);
        s.coins = s.coins.filter((c) => c.x > -COIN_SIZE && !c.collected);

        // Collision with pipes
        const px = s.playerX;
        const py = s.playerY;
        const pw = 24;
        const ph = 32;
        for (const pipe of s.pipes) {
          if (
            px + pw > pipe.x + 6 &&
            px < pipe.x + PIPE_W - 6 &&
            py + ph > GROUND_Y - pipe.h
          ) {
            s.gameOver = true;
            setDisplayOver(true);
            if (s.score > highScore) {
              setHighScore(s.score);
              try { localStorage.setItem("coinrun_highscore", String(s.score)); } catch { /* ignore */ }
            }
          }
        }

        // Coin collection
        for (const coin of s.coins) {
          if (
            !coin.collected &&
            px + pw > coin.x &&
            px < coin.x + COIN_SIZE &&
            py + ph > coin.y &&
            py < coin.y + COIN_SIZE
          ) {
            coin.collected = true;
            s.score += 5;
          }
        }

        setDisplayScore(s.score);
      }

      /* ── DRAW ── */
      // Sky
      drawRect(ctx, 0, 0, W, H, SKY);

      // Clouds
      for (const cloud of s.clouds) {
        drawCloud(ctx, cloud.x, cloud.y, cloud.w);
      }

      // Hills (decorative)
      ctx.fillStyle = "#00A800";
      for (let i = 0; i < 3; i++) {
        const hx = ((i * 280 - (s.distance * 0.2) % 840 + 840) % 840) - 60;
        ctx.beginPath();
        ctx.moveTo(hx, GROUND_Y);
        ctx.lineTo(hx + 60, GROUND_Y - 45);
        ctx.lineTo(hx + 120, GROUND_Y);
        ctx.fill();
      }

      // Ground
      drawRect(ctx, 0, GROUND_Y, W, H - GROUND_Y, GROUND_COLOR);
      drawRect(ctx, 0, GROUND_Y, W, 6, GROUND_TOP);
      // Ground pattern (bricks)
      ctx.fillStyle = "#A03000";
      for (let gx = 0; gx < W; gx += 24) {
        const offset = Math.floor(gx / 24) % 2 === 0 ? 0 : 12;
        drawRect(ctx, gx, GROUND_Y + 24 + offset, 23, 1, "#A03000");
        drawRect(ctx, gx + 12, GROUND_Y + 12, 1, 36, "#A03000");
      }

      // Pipes
      for (const pipe of s.pipes) {
        drawPipe(ctx, pipe.x, pipe.h);
      }

      // Coins
      for (const coin of s.coins) {
        if (!coin.collected) {
          drawCoin(ctx, coin.x, coin.y, s.frameCount);
        }
      }

      // Mario
      const walkFrame = s.isOnGround ? Math.floor(s.frameCount / 6) : 1;
      drawMario(ctx, s.playerX, s.playerY, walkFrame);

      // UI: Score
      drawRect(ctx, 0, 0, W, 32, "rgba(0,0,0,0.4)");
      drawPixelText(ctx, `SCORE: ${s.score}`, 100, 22, 16, WHITE);
      drawPixelText(ctx, `HI: ${Math.max(s.score, highScore)}`, W - 100, 22, 16, COIN_GOLD);
      drawPixelText(ctx, `${Math.floor(s.distance / 50)}m`, W / 2, 22, 14, WHITE);

      // Start screen
      if (!s.started) {
        drawRect(ctx, 0, 0, W, H, "rgba(0,0,0,0.5)");
        drawPixelText(ctx, "🎮 COIN RUN", W / 2, H / 2 - 40, 28, COIN_GOLD);
        drawPixelText(ctx, "SPACE / 탭 으로 점프!", W / 2, H / 2 + 10, 16, WHITE);
        drawPixelText(ctx, "파이프를 피하고 코인을 모아라!", W / 2, H / 2 + 40, 14, CLOUD_WHITE);
      }

      // Game over
      if (s.gameOver) {
        drawRect(ctx, 0, 0, W, H, "rgba(0,0,0,0.6)");
        drawPixelText(ctx, "GAME OVER", W / 2, H / 2 - 30, 28, MARIO_RED);
        drawPixelText(ctx, `SCORE: ${s.score}`, W / 2, H / 2 + 10, 20, COIN_GOLD);
        drawPixelText(ctx, "SPACE / 탭 으로 재시작", W / 2, H / 2 + 45, 14, WHITE);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [highScore, resetGame]);

  return (
    <div className="game-container">
      <div className="game-header">
        <h1>🎮 COIN RUN</h1>
        <p>파이프를 점프로 넘고, 코인을 모아 최고 점수를 달성하세요!</p>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="game-canvas"
        tabIndex={0}
      />
      <div className="game-controls">
        <div className="game-score-display">
          <span>현재 점수: <strong>{displayScore}</strong></span>
          <span>최고 기록: <strong>{highScore}</strong></span>
        </div>
        {displayOver && (
          <button className="btn btn-primary" onClick={resetGame}>
            다시 하기
          </button>
        )}
        <p className="game-help">
          ⌨️ SPACE / ↑ 점프 &nbsp;|&nbsp; 📱 화면 탭 점프
        </p>
      </div>
    </div>
  );
}
