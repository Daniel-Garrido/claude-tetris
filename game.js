'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// ---- Skins ----
// Cada skin define su paleta (por tema claro/oscuro), el color de la rejilla
// y su propia función de dibujo de bloque. Cambiar de skin sólo sustituye
// estas referencias: no hace falta recargar la página.

const SKIN_STORAGE_KEY = 'tetris-skin';
const DEFAULT_SKIN = 'retro';

// Traza un rectángulo con esquinas redondeadas (sin depender de ctx.roundRect)
function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Patrón fijo de 5×5 "píxeles" para la textura del skin pixel art:
// 1 = brillo, 2 = sombra, 0 = color base.
const PIXEL_PATTERN = [
  [1, 1, 1, 1, 0],
  [1, 0, 0, 1, 2],
  [1, 0, 1, 0, 2],
  [1, 0, 0, 0, 2],
  [0, 2, 2, 2, 2],
];

// Orden de colores: [vacío, I, O, T, S, Z, J, L]
const SKINS = {
  retro: {
    label: 'Retro',
    colors: {
      dark: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d'],
      // Paleta con más contraste para el modo claro
      light: [null, '#00acc1', '#f9a825', '#8e24aa', '#43a047', '#e53935', '#1e88e5', '#fb8c00'],
    },
    grid: null, // null = usa --grid del tema
    drawBlock(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },

  neon: {
    label: 'Neon',
    // Fondo siempre negro: misma paleta en ambos temas
    colors: {
      dark: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff1744', '#2979ff', '#ff9100'],
    },
    grid: '#12121e',
    drawBlock(context, px, py, size, color) {
      const alpha = context.globalAlpha;
      context.save();
      context.shadowColor = color;
      context.shadowBlur = 14;
      // relleno tenue + contorno brillante
      context.globalAlpha = alpha * 0.35;
      context.fillStyle = color;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.globalAlpha = alpha;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      context.restore();
    },
  },

  pastel: {
    label: 'Pastel',
    colors: {
      dark: [null, '#a8e6ef', '#fdf1a7', '#d7b8f3', '#b8e8c4', '#f7b2bd', '#b3cdf6', '#fdd0a8'],
      light: [null, '#7fd3e0', '#f7dc6f', '#c39be8', '#94d6a6', '#f28da0', '#8fb3ee', '#f9b57f'],
    },
    grid: null,
    drawBlock(context, px, py, size, color) {
      const r = size * 0.25;
      roundedRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.12)';
      context.lineWidth = 1;
      context.stroke();
      // brillo suave arriba a la izquierda
      roundedRectPath(context, px + 6, py + 5, size * 0.4, size * 0.2, size * 0.1);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fill();
    },
  },

  pixel: {
    label: 'Pixel art',
    colors: {
      dark: [null, '#3fc5d6', '#f2c230', '#a64fc2', '#5fb85f', '#d94c4c', '#5d8fd8', '#ef8f2f'],
      light: [null, '#1fa5b6', '#d9a514', '#8a32a8', '#3f9a3f', '#c13232', '#3a70c0', '#d8761a'],
    },
    grid: null,
    drawBlock(context, px, py, size, color) {
      const n = PIXEL_PATTERN.length;
      const cell = size / n;
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = PIXEL_PATTERN[r][c];
          if (!v) continue;
          context.fillStyle = v === 1 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
          // Coordenadas enteras para mantener los "píxeles" nítidos
          const x0 = Math.round(px + c * cell), y0 = Math.round(py + r * cell);
          const x1 = Math.round(px + (c + 1) * cell), y1 = Math.round(py + (r + 1) * cell);
          context.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
      // contorno oscuro de 1px
      context.strokeStyle = 'rgba(0,0,0,0.55)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
    },
  },
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');

const skinSelect = document.getElementById('skin-select');

let theme = 'dark';
let skin = SKINS[DEFAULT_SKIN];
let gridColor = '#22222e';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const palette = (theme === 'light' && skin.colors.light) || skin.colors.dark;
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, palette[colorIndex]);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // lockPiece() puede haber terminado la partida: endGame() no puede cancelar
  // el frame que ya se está ejecutando, así que no se programa el siguiente.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) return; // las flechas cambian la opción del selector
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function setTheme(newTheme) {
  theme = newTheme;
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  themeBtn.setAttribute('aria-pressed', String(isLight));
  themeBtn.setAttribute('aria-label', isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeBtn.textContent = isLight ? '🌙' : '☀️';
  refreshVisuals();
}

// Recalcula los colores que dependen de tema/skin y repinta de inmediato
// (el bucle está detenido en pausa / game over)
function refreshVisuals() {
  gridColor = skin.grid || getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  draw();
  drawNext();
}

function loadSkin() {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    if (saved && SKINS[saved]) return saved;
  } catch { /* localStorage no disponible */ }
  return DEFAULT_SKIN;
}

function setSkin(name) {
  if (!SKINS[name]) name = DEFAULT_SKIN;
  skin = SKINS[name];
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  try { localStorage.setItem(SKIN_STORAGE_KEY, name); } catch { /* ignorar */ }
  refreshVisuals();
}

for (const [key, def] of Object.entries(SKINS)) {
  skinSelect.add(new Option(def.label, key));
}

skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // devolver el teclado al juego
});

themeBtn.addEventListener('click', () => {
  setTheme(theme === 'light' ? 'dark' : 'light');
  themeBtn.blur(); // que Space siga siendo la caída
});

init();
setSkin(loadSkin());
setTheme('dark');
