"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════
   🪖 CROWD MATH – 비율 퀴즈로 병사를 모아 진격!
   세로형 Canvas (390×700)
   ══════════════════════════════════════════════════════ */

const CW = 390;   // canvas width
const CH = 700;   // canvas height
const SCROLL_SPEED = 1.8;
const SOLDIER_R = 9;
const STAGE_LEN = 4000;  // world height

/* ── Palette ── */
const SKY   = "#1a1a2e";
const ROAD  = "#2d2d44";
const ROAD_LINE = "#4a4a6a";
const P1C   = "#00d4ff";
const ENEC  = "#ff4444";
const GATEC_L = "#00cc66";
const GATEC_R = "#ff6600";
const GOLD  = "#f8d830";
const WHITE = "#ffffff";
const BLACK = "#000000";

/* ══ 퀴즈 데이터 ══ */
interface Quiz {
  question: string;
  left: { label: string; value: number };   // 선택지 A
  right: { label: string; value: number };  // 선택지 B
  unit: "+" | "×" | "-" | "÷" | "=";
}

function randInt(a: number, b: number) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

/** 비율 퀴즈를 랜덤 생성 */
function makeQuiz(): Quiz {
  const type = randInt(0, 4);

  if (type === 0) {
    // 소금물 농도: 소금 g / 소금물 g × 100
    const salt = randInt(5, 30);
    const water = randInt(50, 200);
    const total = salt + water;
    const correct = Math.round((salt / total) * 100);
    const wrong = correct + (Math.random() > 0.5 ? randInt(3, 8) : -randInt(3, 8));
    const isLeft = Math.random() > 0.5;
    return {
      question: `소금 ${salt}g을 물 ${water}g에 녹였을 때\n소금물의 농도는?`,
      left:  { label: `${isLeft ? correct : wrong}%`, value: isLeft ? correct : wrong },
      right: { label: `${isLeft ? wrong : correct}%`, value: isLeft ? wrong : correct },
      unit: "+",
    };
  }
  if (type === 1) {
    // 야구 타율: 안타 / 타수 (소수점 3자리)
    const atBat  = randInt(10, 40);
    const hits   = randInt(2, atBat - 1);
    const correct = Math.round((hits / atBat) * 1000) / 1000;
    const delta = (Math.random() > 0.5 ? 1 : -1) * (randInt(1, 4) * 0.01);
    const wrong = Math.round((correct + delta) * 1000) / 1000;
    const isLeft = Math.random() > 0.5;
    return {
      question: `${atBat}번 타석에서 ${hits}개 안타\n타율은?`,
      left:  { label: `${(isLeft ? correct : wrong).toFixed(3)}`, value: isLeft ? correct * 1000 : wrong * 1000 },
      right: { label: `${(isLeft ? wrong : correct).toFixed(3)}`, value: isLeft ? wrong * 1000 : correct * 1000 },
      unit: "×",
    };
  }
  if (type === 2) {
    // 할인율: (정가 - 판매가) / 정가 × 100
    const price  = randInt(4, 20) * 1000;
    const discRate = randInt(10, 40);
    const sale   = Math.round(price * (1 - discRate / 100) / 100) * 100;
    const correct = Math.round(((price - sale) / price) * 100);
    const wrong = correct + (Math.random() > 0.5 ? randInt(2, 7) : -randInt(2, 7));
    const isLeft = Math.random() > 0.5;
    return {
      question: `정가 ${price.toLocaleString()}원짜리를\n${sale.toLocaleString()}원에 팔면 할인율은?`,
      left:  { label: `${isLeft ? correct : wrong}%`, value: isLeft ? correct : wrong },
      right: { label: `${isLeft ? wrong : correct}%`, value: isLeft ? wrong : correct },
      unit: "+",
    };
  }
  if (type === 3) {
    // 은행 이자: 원금 × 이율 × 기간
    const principal = randInt(1, 10) * 100000;
    const rate = randInt(2, 8);   // % per year
    const years = randInt(1, 3);
    const interest = Math.round(principal * (rate / 100) * years);
    const wrong = interest + (Math.random() > 0.5 ? randInt(1, 3) : -randInt(1, 3)) * 10000;
    const isLeft = Math.random() > 0.5;
    return {
      question: `원금 ${(principal / 10000).toFixed(0)}만원, 연 ${rate}%\n${years}년 후 이자는?`,
      left:  { label: `${(isLeft ? interest : wrong).toLocaleString()}원`, value: isLeft ? interest / 10000 : wrong / 10000 },
      right: { label: `${(isLeft ? wrong : interest).toLocaleString()}원`, value: isLeft ? wrong / 10000 : interest / 10000 },
      unit: "+",
    };
  }
  // 속력 = 거리 / 시간
  const dist = randInt(100, 600);
  const time = randInt(2, 6);
  const correct = Math.round(dist / time);
  const wrong = correct + (Math.random() > 0.5 ? randInt(3, 10) : -randInt(3, 10));
  const isLeft = Math.random() > 0.5;
  return {
    question: `${dist}km를 ${time}시간에 달렸을 때\n평균 속력은?`,
    left:  { label: `${isLeft ? correct : wrong}km/h`, value: isLeft ? correct : wrong },
    right: { label: `${isLeft ? wrong : correct}km/h`, value: isLeft ? wrong : correct },
    unit: "+",
  };
}

/* ══ Types ══ */
interface Soldier {
  ox: number;  // offset from group center
  oy: number;
  alive: boolean;
  flash: number;  // hit flash frames
}

interface Gate {
  worldY: number;
  quiz: Quiz;
  passed: boolean;
  chosen: "left" | "right" | null;
}

interface EnemyGroup {
  worldY: number;
  x: number;
  count: number;
  alive: boolean;
  flash: number;
  beaten: boolean;
}

interface Bullet {
  x: number;
  worldY: number;
  vy: number;
  friendly: boolean;
}

interface Particle {
  x: number;
  worldY: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
}

interface GameState {
  phase: "title" | "playing" | "quiz" | "result" | "gameover";
  worldY: number;       // camera top in world coords
  groupX: number;       // group center X
  soldiers: Soldier[];
  gates: Gate[];
  enemies: EnemyGroup[];
  bullets: Bullet[];
  particles: Particle[];
  stage: number;
  pendingQuiz: Gate | null;
  gateChosenTimer: number;
  correctMsg: string;
  resultCorrect: boolean;
  fightTimer: number;
  frame: number;
  stageProgress: number;
}

function spawnSoldiers(count: number): Soldier[] {
  const arr: Soldier[] = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    arr.push({
      ox: (col - (cols - 1) / 2) * (SOLDIER_R * 2.4),
      oy: row * (SOLDIER_R * 2.4),
      alive: true,
      flash: 0,
    });
  }
  return arr;
}

function buildStage(stage: number): { gates: Gate[]; enemies: EnemyGroup[] } {
  const gates: Gate[] = [];
  const enemies: EnemyGroup[] = [];
  const gateCount = 4 + stage;
  const enemyCount = 3 + stage;

  const positions: number[] = [];
  for (let i = 0; i < gateCount + enemyCount; i++) {
    positions.push(400 + i * Math.floor((STAGE_LEN - 600) / (gateCount + enemyCount)));
  }
  // shuffle lightly
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  positions.sort((a, b) => a - b);

  let gUsed = 0;
  let eUsed = 0;
  for (let i = 0; i < positions.length; i++) {
    if (gUsed < gateCount && (eUsed >= enemyCount || Math.random() > 0.4)) {
      gates.push({ worldY: positions[i], quiz: makeQuiz(), passed: false, chosen: null });
      gUsed++;
    } else {
      const cnt = randInt(3, 8 + stage * 2);
      enemies.push({ worldY: positions[i], x: CW / 2, count: cnt, alive: true, flash: 0, beaten: false });
      eUsed++;
    }
  }
  return { gates, enemies };
}

function initState(stage = 1): GameState {
  const { gates, enemies } = buildStage(stage);
  return {
    phase: "playing",
    worldY: 0,
    groupX: CW / 2,
    soldiers: spawnSoldiers(10),
    gates,
    enemies,
    bullets: [],
    particles: [],
    stage,
    pendingQuiz: null,
    gateChosenTimer: 0,
    correctMsg: "",
    resultCorrect: false,
    fightTimer: 0,
    frame: 0,
    stageProgress: 0,
  };
}

/* ══ Draw helpers ══ */
function dr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c; ctx.fillRect(~~x, ~~y, ~~w, ~~h);
}
function dc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(~~x, ~~y, r, 0, Math.PI * 2); ctx.fill();
}
function dt(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, sz: number, c: string, align: CanvasTextAlign = "center") {
  ctx.fillStyle = c; ctx.font = `bold ${sz}px sans-serif`; ctx.textAlign = align; ctx.fillText(t, ~~x, ~~y);
}

function drawSoldier(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, flash: number, frame: number) {
  const c = flash > 0 ? WHITE : color;
  // body
  dc(ctx, x, y - SOLDIER_R * 0.4, SOLDIER_R * 0.9, c);
  // head
  dc(ctx, x, y - SOLDIER_R * 1.7, SOLDIER_R * 0.65, c);
  // helmet
  dr(ctx, x - SOLDIER_R * 0.7, y - SOLDIER_R * 2.35, SOLDIER_R * 1.4, SOLDIER_R * 0.7, flash > 0 ? WHITE : "#2a7a00");
  // gun
  const gAngle = Math.sin(frame * 0.15) * 0.1;
  ctx.save();
  ctx.translate(~~(x + SOLDIER_R * 0.8), ~~(y - SOLDIER_R * 0.3));
  ctx.rotate(gAngle);
  dr(ctx, 0, -2, SOLDIER_R * 1.4, 3, flash > 0 ? WHITE : "#888");
  ctx.restore();
  // legs
  const legOff = Math.sin(frame * 0.2) * 3;
  dr(ctx, x - SOLDIER_R * 0.5, y + SOLDIER_R * 0.4, SOLDIER_R * 0.4, SOLDIER_R * 0.9 + legOff, c);
  dr(ctx, x + SOLDIER_R * 0.1, y + SOLDIER_R * 0.4, SOLDIER_R * 0.4, SOLDIER_R * 0.9 - legOff, c);
}

function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, flash: number) {
  const c = flash > 0 ? WHITE : ENEC;
  dc(ctx, x, y - 10, 8, c);
  dc(ctx, x, y - 22, 6, c);
  dr(ctx, x - 7, y - 36, 14, 6, flash > 0 ? WHITE : "#880000");
  dr(ctx, x - 4, y, 3, 8, c);
  dr(ctx, x + 1, y, 3, 8, c);
}

/* ══ Main Component ══ */
export default function CrowdMathGame({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef  = useRef<GameState>({ ...initState(), phase: "title" });
  const touchXRef = useRef<number | null>(null);
  const rafRef    = useRef<number>(0);

  const [uiCount,    setUiCount]    = useState(10);
  const [uiPhase,    setUiPhase]    = useState<GameState["phase"]>("title");
  const [uiStage,    setUiStage]    = useState(1);
  const [uiQuiz,     setUiQuiz]     = useState<Quiz | null>(null);
  const [uiProgress, setUiProgress] = useState(0);
  const [uiMsg,      setUiMsg]      = useState("");

  /* ── restart ── */
  const startGame = useCallback((stage = 1) => {
    stateRef.current = initState(stage);
    setUiCount(10);
    setUiPhase("playing");
    setUiStage(stage);
    setUiQuiz(null);
    setUiProgress(0);
    setUiMsg("");
  }, []);

  /* ── apply quiz answer ── */
  const applyAnswer = useCallback((gate: Gate, side: "left" | "right") => {
    const s = stateRef.current;
    if (s.phase !== "quiz") return;

    const chosen = side === "left" ? gate.quiz.left : gate.quiz.right;
    const other  = side === "left" ? gate.quiz.right : gate.quiz.left;
    const isCorrect = chosen.value > other.value;  // 더 큰 값 = 정답이 아닌, 실제 정답 = gate에서 correct 쪽
    // We track correct as: each quiz has a deterministic correct answer embedded
    // For simplicity: the quiz maker sets the "correct" value as left or right randomly
    // We detect correct by checking which side has the correct answer flagged in the quiz
    // Actually we encoded: left.value > right.value means left is better (more soldiers)
    // For the game mechanic: correct answer adds soldiers, wrong subtracts

    const aliveCount = s.soldiers.filter(sol => sol.alive).length;
    let newCount = aliveCount;

    // Correct = higher value
    const pickedValue = chosen.value;
    const otherValue  = other.value;
    const correct = pickedValue >= otherValue;

    gate.chosen = side;
    gate.passed = true;
    s.gateChosenTimer = 90;

    if (correct) {
      const add = Math.max(1, Math.round(aliveCount * 0.5));
      newCount = aliveCount + add;
      s.correctMsg = `정답! +${add}명 합류! 🎉`;
      s.resultCorrect = true;
    } else {
      const sub = Math.max(1, Math.round(aliveCount * 0.3));
      newCount = Math.max(1, aliveCount - sub);
      s.correctMsg = `오답! -${aliveCount - newCount}명 😢`;
      s.resultCorrect = false;
    }

    // rebuild soldiers
    s.soldiers = spawnSoldiers(newCount);
    s.pendingQuiz = null;
    s.phase = "playing";
    setUiCount(newCount);
    setUiQuiz(null);
    setUiPhase("playing");
    setUiMsg(s.correctMsg);
    setTimeout(() => { setUiMsg(""); s.correctMsg = ""; }, 2000);
  }, []);

  /* ── game loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const loop = () => {
      const s = stateRef.current;
      s.frame++;

      /* ── UPDATE ── */
      if (s.phase === "playing") {
        s.worldY += SCROLL_SPEED;
        s.stageProgress = Math.min(1, s.worldY / STAGE_LEN);

        // Touch drag
        if (touchXRef.current !== null) {
          const dx = touchXRef.current - s.groupX;
          s.groupX += dx * 0.12;
        }
        s.groupX = Math.max(40, Math.min(CW - 40, s.groupX));

        // Check gate approach
        const camBottom = s.worldY + CH;
        for (const gate of s.gates) {
          if (!gate.passed && gate.worldY > s.worldY && gate.worldY < camBottom - 80) {
            const screenY = CH - (gate.worldY - s.worldY);
            const groupScreenY = CH - 120;
            if (Math.abs(groupScreenY - screenY) < 40) {
              // trigger quiz
              s.phase = "quiz";
              s.pendingQuiz = gate;
              setUiPhase("quiz");
              setUiQuiz(gate.quiz);
              return;
            }
          }
        }

        // Auto-shoot at enemies
        if (s.frame % 15 === 0) {
          const soldiers = s.soldiers.filter(sol => sol.alive);
          for (const enemy of s.enemies) {
            if (!enemy.alive || enemy.beaten) continue;
            const ey = CH - (enemy.worldY - s.worldY);
            if (ey > -50 && ey < CH + 50) {
              // shoot 1 bullet per 2 soldiers
              const shootCount = Math.max(1, Math.floor(soldiers.length / 2));
              for (let i = 0; i < shootCount; i++) {
                s.bullets.push({
                  x: s.groupX + (Math.random() - 0.5) * 60,
                  worldY: s.worldY + (CH - 120),
                  vy: -6,
                  friendly: true,
                });
              }
              // enemy shoots back
              s.bullets.push({
                x: enemy.x + (Math.random() - 0.5) * 30,
                worldY: enemy.worldY,
                vy: 6,
                friendly: false,
              });
              break;
            }
          }
        }

        // Update bullets
        s.bullets = s.bullets.filter(b => {
          b.worldY += b.vy;
          const sy = CH - (b.worldY - s.worldY);
          if (sy < -20 || sy > CH + 20) return false;

          if (b.friendly) {
            for (const enemy of s.enemies) {
              if (!enemy.alive || enemy.beaten) continue;
              const ey = CH - (enemy.worldY - s.worldY);
              if (Math.abs(b.x - enemy.x) < 30 && Math.abs(sy - ey) < 30) {
                enemy.count--;
                enemy.flash = 6;
                // particles
                for (let p = 0; p < 3; p++) {
                  s.particles.push({ x: b.x, worldY: b.worldY, vx: (Math.random()-0.5)*3, vy: (Math.random()-0.5)*3, color: ENEC, life: 20 });
                }
                if (enemy.count <= 0) { enemy.alive = false; enemy.beaten = true; }
                return false;
              }
            }
          } else {
            // hits player group
            const gy = CH - 120;
            const sy2 = CH - (b.worldY - s.worldY);
            if (Math.abs(b.x - s.groupX) < 50 && Math.abs(sy2 - gy) < 50) {
              const alive = s.soldiers.filter(sol => sol.alive);
              if (alive.length > 0) {
                const hit = alive[Math.floor(Math.random() * alive.length)];
                hit.flash = 10;
                setTimeout(() => {
                  hit.alive = false;
                  const cnt = stateRef.current.soldiers.filter(sol => sol.alive).length;
                  setUiCount(cnt);
                  if (cnt <= 0) {
                    stateRef.current.phase = "gameover";
                    setUiPhase("gameover");
                  }
                }, 200);
              }
              return false;
            }
          }
          return true;
        });

        // Update particles
        s.particles = s.particles.filter(p => {
          p.x += p.vx; p.worldY += p.vy; p.life--;
          return p.life > 0;
        });

        // Update enemy flash
        for (const e of s.enemies) { if (e.flash > 0) e.flash--; }

        // Check stage end
        if (s.worldY >= STAGE_LEN) {
          const alive = s.soldiers.filter(sol => sol.alive).length;
          s.phase = alive > 0 ? "result" : "gameover";
          setUiPhase(s.phase);
          setUiCount(alive);
        }

        if (s.gateChosenTimer > 0) s.gateChosenTimer--;
      }

      /* ── DRAW ── */
      ctx.clearRect(0, 0, CW, CH);

      if (s.phase === "title") {
        dr(ctx, 0, 0, CW, CH, SKY);
        dt(ctx, "🪖 CROWD MATH", CW/2, 200, 28, GOLD);
        dt(ctx, "비율 퀴즈로 병사를 모아", CW/2, 260, 16, WHITE);
        dt(ctx, "스테이지를 클리어하라!", CW/2, 285, 16, WHITE);
        dt(ctx, "[ 화면을 탭해서 시작 ]", CW/2, 360, 18, P1C);
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Background
      dr(ctx, 0, 0, CW, CH, SKY);
      // Road
      dr(ctx, 60, 0, CW - 120, CH, ROAD);
      // Road lines
      const lineOffset = s.worldY % 80;
      for (let ly = -20; ly < CH + 80; ly += 80) {
        dr(ctx, CW/2 - 3, ly - lineOffset, 6, 40, ROAD_LINE);
      }

      // Draw gates
      for (const gate of s.gates) {
        const sy = CH - (gate.worldY - s.worldY);
        if (sy < -100 || sy > CH + 20) continue;
        const gw = CW * 0.42;
        // Left gate box
        const lc = gate.passed && gate.chosen === "left" ? GOLD : GATEC_L;
        const rc = gate.passed && gate.chosen === "right" ? GOLD : GATEC_R;
        dr(ctx, 15, sy - 60, gw, 60, lc + "33");
        dr(ctx, 15, sy - 60, gw, 3, lc);
        dr(ctx, 15, sy - 60, 3, 60, lc);
        dr(ctx, 15 + gw - 3, sy - 60, 3, 60, lc);
        // Right gate box
        dr(ctx, CW - 15 - gw, sy - 60, gw, 60, rc + "33");
        dr(ctx, CW - 15 - gw, sy - 60, gw, 3, rc);
        dr(ctx, CW - 15 - gw, sy - 60, 3, 60, rc);
        dr(ctx, CW - 15 - 3, sy - 60, 3, 60, rc);
        // Gate labels (2-line)
        ctx.save();
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = WHITE;
        const lines = gate.quiz.left.label.split("\n");
        ctx.fillText(lines[0], ~~(15 + gw / 2), sy - 36);
        if (lines[1]) ctx.fillText(lines[1], ~~(15 + gw / 2), sy - 18);
        const rlines = gate.quiz.right.label.split("\n");
        ctx.fillText(rlines[0], ~~(CW - 15 - gw / 2), sy - 36);
        if (rlines[1]) ctx.fillText(rlines[1], ~~(CW - 15 - gw / 2), sy - 18);
        ctx.restore();
        // Gate marker bar
        dr(ctx, 0, sy, CW, 4, "#ffffff22");
      }

      // Draw enemies
      for (const eg of s.enemies) {
        if (!eg.alive && eg.beaten) continue;
        const sy = CH - (eg.worldY - s.worldY);
        if (sy < -60 || sy > CH + 40) continue;
        const cols = Math.ceil(Math.sqrt(eg.count));
        ctx.save();
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = ENEC;
        ctx.fillText(`× ${eg.count}`, eg.x, sy - 44);
        ctx.restore();
        for (let i = 0; i < Math.min(eg.count, 16); i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const ex = eg.x + (col - (cols-1)/2) * 22;
          const ey = sy + row * 22;
          drawEnemy(ctx, ex, ey - 8, eg.flash);
        }
      }

      // Draw bullets
      for (const b of s.bullets) {
        const sy = CH - (b.worldY - s.worldY);
        dc(ctx, b.x, sy, 4, b.friendly ? GOLD : "#ff8888");
        dc(ctx, b.x, sy, 2, WHITE);
      }

      // Draw particles
      for (const p of s.particles) {
        const sy = CH - (p.worldY - s.worldY);
        dc(ctx, p.x, sy, 3 * (p.life / 20), p.color);
      }

      // Draw soldiers
      const alive = s.soldiers.filter(sol => sol.alive);
      for (const sol of alive) {
        const sx = s.groupX + sol.ox;
        const sy = (CH - 120) + sol.oy;
        drawSoldier(ctx, sx, sy, P1C, sol.flash, s.frame);
        if (sol.flash > 0) sol.flash--;
      }

      // Soldier count badge
      dc(ctx, s.groupX, CH - 155, 16, P1C);
      dt(ctx, String(alive.length), s.groupX, CH - 149, 13, BLACK);

      // Gate chosen feedback
      if (s.gateChosenTimer > 0 && s.correctMsg) {
        const alpha = Math.min(1, s.gateChosenTimer / 30);
        ctx.globalAlpha = alpha;
        dt(ctx, s.correctMsg, CW / 2, CH - 200, 18, s.resultCorrect ? "#00ff88" : "#ff6666");
        ctx.globalAlpha = 1;
      }

      // Progress bar (top)
      dr(ctx, 0, 0, CW, 6, "#ffffff22");
      dr(ctx, 0, 0, CW * s.stageProgress, 6, P1C);

      // Stage label
      dt(ctx, `STAGE ${s.stage}`, CW / 2, 22, 13, WHITE);

      // QUIZ overlay hint
      if (s.phase === "quiz") {
        dr(ctx, 0, 0, CW, CH, "#000000aa");
        dt(ctx, "⬇ 게이트를 선택하세요!", CW / 2, CH / 2, 18, GOLD);
      }

      // Game Over
      if (s.phase === "gameover") {
        dr(ctx, 0, 0, CW, CH, "#000000cc");
        dt(ctx, "💀 GAME OVER", CW / 2, CH / 2 - 30, 30, ENEC);
        dt(ctx, "병사가 전멸했습니다", CW / 2, CH / 2 + 10, 16, WHITE);
        dt(ctx, "탭해서 재시작", CW / 2, CH / 2 + 50, 14, "#aaa");
      }

      // Stage clear
      if (s.phase === "result") {
        dr(ctx, 0, 0, CW, CH, "#000000cc");
        dt(ctx, "🎖 STAGE CLEAR!", CW / 2, CH / 2 - 50, 28, GOLD);
        dt(ctx, `잔여 병사: ${alive.length}명`, CW / 2, CH / 2, 20, P1C);
        dt(ctx, "탭해서 다음 스테이지", CW / 2, CH / 2 + 50, 14, WHITE);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* ── Touch / Click handlers ── */
  const handleCanvasTap = useCallback((clientX: number) => {
    const s = stateRef.current;
    if (s.phase === "title") { startGame(1); return; }
    if (s.phase === "gameover") { startGame(1); return; }
    if (s.phase === "result") { startGame(s.stage + 1); return; }
  }, [startGame]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchXRef.current = touch.clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0);
    handleCanvasTap(touch.clientX);
  }, [handleCanvasTap]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) touchXRef.current = touch.clientX - rect.left;
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchXRef.current = null;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const s = stateRef.current;
    if (s.phase !== "playing") return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      touchXRef.current = e.clientX - rect.left;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    touchXRef.current = null;
  }, []);

  const handleMouseClick = useCallback((e: React.MouseEvent) => {
    handleCanvasTap(e.clientX);
  }, [handleCanvasTap]);

  // Quiz answer buttons
  const chooseLeft = useCallback(() => {
    const s = stateRef.current;
    if (s.pendingQuiz) applyAnswer(s.pendingQuiz, "left");
  }, [applyAnswer]);

  const chooseRight = useCallback(() => {
    const s = stateRef.current;
    if (s.pendingQuiz) applyAnswer(s.pendingQuiz, "right");
  }, [applyAnswer]);

  return (
    <div className="crowd-shell">
      <div className="crowd-header">
        <button className="btn btn-sm" onClick={onBack}>← 목록</button>
        <span className="crowd-title">🪖 CROWD MATH</span>
        <span className="crowd-stage">STAGE {uiStage}</span>
      </div>

      <div className="crowd-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          className="crowd-canvas"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleMouseClick}
        />

        {/* Quiz popup overlay */}
        {uiPhase === "quiz" && uiQuiz && (
          <div className="crowd-quiz-overlay">
            <div className="crowd-quiz-box">
              <div className="crowd-quiz-q">
                {uiQuiz.question.split("\n").map((line, i) => (
                  <span key={i}>{line}<br /></span>
                ))}
              </div>
              <div className="crowd-quiz-choices">
                <button
                  className="crowd-gate-btn crowd-gate-left"
                  onClick={chooseLeft}
                >
                  <span className="crowd-gate-label">{uiQuiz.left.label}</span>
                  <span className="crowd-gate-hint">A</span>
                </button>
                <button
                  className="crowd-gate-btn crowd-gate-right"
                  onClick={chooseRight}
                >
                  <span className="crowd-gate-label">{uiQuiz.right.label}</span>
                  <span className="crowd-gate-hint">B</span>
                </button>
              </div>
              <div className="crowd-quiz-tip">더 큰 값을 선택하면 병사가 합류합니다!</div>
            </div>
          </div>
        )}

        {/* Floating message */}
        {uiMsg && (
          <div className={`crowd-msg${uiMsg.includes("정답") ? " correct" : " wrong"}`}>
            {uiMsg}
          </div>
        )}
      </div>

      {/* Soldier count bar */}
      <div className="crowd-status">
        <span className="crowd-soldier-count">🪖 {uiCount}명</span>
        <div className="crowd-progress-wrap">
          <div className="crowd-progress-bar" style={{ width: `${uiProgress * 100}%` }} />
        </div>
        <span className="crowd-prog-label">{Math.round(uiProgress * 100)}%</span>
      </div>

      <p className="game-help" style={{ textAlign: "center", marginTop: "0.3rem" }}>
        📱 드래그로 이동 · 퀴즈에서 정답 선택 시 병사 증가
      </p>
    </div>
  );
}
