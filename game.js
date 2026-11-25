'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

// Paleta con más contraste para el modo claro
const COLORS_LIGHT = [
  null,
  '#00acc1', // I
  '#f9a825', // O
  '#8e24aa', // T
  '#43a047', // S
  '#e53935', // Z
  '#1e88e5', // J
  '#fb8c00', // L
];

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
const pauseMenu = document.getElementById('pause-menu');
const menuMain = document.getElementById('menu-main');
const menuControls = document.getElementById('menu-controls');
const startLevelEl = document.getElementById('start-level');
const levelDownBtn = pauseMenu.querySelector('[data-action="level-down"]');
const levelUpBtn = pauseMenu.querySelector('[data-action="level-up"]');

const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 10; // a partir del 11 la velocidad ya es la máxima
const START_LEVEL_KEY = 'tetris.startLevel';

let startLevel = loadStartLevel();

// Teclas pulsadas ahora mismo, y las que seguían pulsadas al cerrar el menú:
// estas se ignoran hasta soltarlas, para que una tecla mantenida (o su
// autorepetición) no mueva la pieza al volver al juego.
const heldKeys = new Set();
let blockedKeys = new Set();

let theme = 'dark';
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
    level = startLevel + Math.floor(lines / 10);
    dropInterval = speedFor(level);
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
  const color = (theme === 'light' ? COLORS_LIGHT : COLORS)[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
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

function speedFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function loadStartLevel() {
  let saved = NaN;
  try { saved = parseInt(localStorage.getItem(START_LEVEL_KEY), 10); } catch {}
  return Number.isInteger(saved) && saved >= MIN_START_LEVEL && saved <= MAX_START_LEVEL
    ? saved : MIN_START_LEVEL;
}

function setStartLevel(value) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, value));
  startLevelEl.textContent = startLevel;
  levelDownBtn.disabled = startLevel === MIN_START_LEVEL;
  levelUpBtn.disabled = startLevel === MAX_START_LEVEL;
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch {}
}

// ---- Menú de pausa ----

function showMenuView(view) {
  menuMain.classList.toggle('hidden', view !== 'main');
  menuControls.classList.toggle('hidden', view !== 'controls');
  const focusTarget = view === 'main'
    ? menuMain.querySelector('[data-action="resume"]')
    : menuControls.querySelector('[data-action="back"]');
  focusTarget.focus();
}

function openPauseMenu() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  pauseMenu.classList.remove('hidden');
  showMenuView('main');
}

function closePauseMenu() {
  if (!paused) return;
  pauseMenu.classList.add('hidden');
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  blockedKeys = new Set(heldKeys);
  paused = false;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function menuFocusables() {
  const view = menuMain.classList.contains('hidden') ? menuControls : menuMain;
  return [...view.querySelectorAll('button:not(:disabled)')];
}

function moveMenuFocus(step) {
  const items = menuFocusables();
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const nextIndex = i === -1 ? 0 : (i + step + items.length) % items.length;
  items[nextIndex].focus();
}

function handleMenuKey(e) {
  switch (e.code) {
    case 'KeyP':
      e.preventDefault();
      closePauseMenu();
      break;
    case 'Escape':
      e.preventDefault();
      if (menuControls.classList.contains('hidden')) closePauseMenu();
      else showMenuView('main');
      break;
    case 'ArrowDown':
    case 'Tab':
      e.preventDefault();
      moveMenuFocus(e.code === 'Tab' && e.shiftKey ? -1 : 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      moveMenuFocus(-1);
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      if (document.activeElement?.classList.contains('step-btn')) {
        setStartLevel(startLevel + (e.code === 'ArrowRight' ? 1 : -1));
        // si el botón enfocado se ha deshabilitado, pasar el foco al otro
        if (document.activeElement.disabled || document.activeElement === document.body) {
          (levelDownBtn.disabled ? levelUpBtn : levelDownBtn).focus();
        }
      }
      break;
    case 'Space':
    case 'Enter':
      // Dejar que el botón enfocado lo active; si no hay foco, no hacer scroll
      if (!(document.activeElement instanceof HTMLButtonElement)) e.preventDefault();
      break;
  }
}

pauseMenu.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'resume':     closePauseMenu(); break;
    case 'restart':    init(); break;
    case 'controls':   showMenuView('controls'); break;
    case 'back':       showMenuView('main'); break;
    case 'level-down': setStartLevel(startLevel - 1); break;
    case 'level-up':   setStartLevel(startLevel + 1); break;
  }
  // Un botón de nivel que llega al límite se deshabilita y pierde el foco
  if (btn.disabled) (btn === levelDownBtn ? levelUpBtn : levelDownBtn).focus();
});

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
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = speedFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  blockedKeys = new Set(heldKeys);
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  blockedKeys.delete(e.code);
});

// Si la ventana pierde el foco no llegarán los keyup: olvidar el estado
window.addEventListener('blur', () => {
  heldKeys.clear();
  blockedKeys.clear();
});

document.addEventListener('keydown', e => {
  heldKeys.add(e.code);
  // Menú abierto: ninguna tecla llega al juego
  if (paused) { handleMenuKey(e); return; }
  if (gameOver) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) openPauseMenu();
    return;
  }
  if (blockedKeys.has(e.code)) {
    if (e.code === 'Space') e.preventDefault();
    return;
  }
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
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  // Repintar de inmediato (el bucle está detenido en pausa / game over)
  draw();
  drawNext();
}

themeBtn.addEventListener('click', () => {
  setTheme(theme === 'light' ? 'dark' : 'light');
  themeBtn.blur(); // que Space siga siendo la caída
});

setStartLevel(startLevel);
init();
setTheme('dark');
