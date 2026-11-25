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

const comboEl = document.getElementById('combo');
const overlayStats = document.getElementById('overlay-stats');
const newRecordEl = document.getElementById('new-record');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const bestComboBox = document.getElementById('best-combo-box');
const maxLinesBox = document.getElementById('max-lines-box');
const resetBtn = document.getElementById('reset-records');

const skinSelect = document.getElementById('skin-select');

let theme = 'dark';
let skin = SKINS[DEFAULT_SKIN];
let gridColor = '#22222e';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// combo = piezas consecutivas que han completado al menos una línea
let combo = 0, maxCombo = 0;
let started = false;

// ---- Tabla de récords (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const DEFAULT_NAME = 'Anónimo';

let records = loadRecords();
let pendingRecord = false;  // la partida terminada entra en el top y falta guardar el nombre
let highlightIndex = -1;    // fila a resaltar en la tabla (récord recién guardado)
let newBestCombo = false, newMaxLines = false;

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.top)) {
      return {
        top: data.top
          .filter(r => r && Number.isFinite(r.score))
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_RECORDS),
        bestCombo: Number(data.bestCombo) || 0,
        maxLines: Number(data.maxLines) || 0,
      };
    }
  } catch { /* datos corruptos o localStorage no disponible */ }
  return emptyRecords();
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch { /* localStorage lleno o bloqueado: los récords duran solo esta sesión */ }
}

// Posición (0-based) que ocuparía una puntuación en el top, o -1 si no entra.
// Ante empate gana el récord más antiguo.
function rankFor(s) {
  if (s <= 0) return -1;
  const i = records.top.findIndex(r => s > r.score);
  if (i !== -1) return i;
  return records.top.length < MAX_RECORDS ? records.top.length : -1;
}

function commitPendingRecord() {
  if (!pendingRecord) return;
  pendingRecord = false;
  const rank = rankFor(score);
  if (rank === -1) return;
  const name = nameInput.value.trim() || DEFAULT_NAME;
  records.top.splice(rank, 0, { name, score, lines, combo: maxCombo, date: Date.now() });
  records.top.length = Math.min(records.top.length, MAX_RECORDS);
  highlightIndex = rank;
  saveRecords();
}

function renderRecords() {
  const rows = records.top.map(r => ({ ...r }));
  let hl = highlightIndex;
  if (pendingRecord) {
    // Fila provisional mientras el jugador escribe su nombre
    hl = rankFor(score);
    rows.splice(hl, 0, { name: nameInput.value.trim() || '???', score, lines, combo: maxCombo });
    rows.length = Math.min(rows.length, MAX_RECORDS);
  }

  recordsBody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'empty';
    td.textContent = 'Sin récords todavía';
    tr.append(td);
    recordsBody.append(tr);
  }
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === hl) tr.className = 'highlight';
    for (const v of [i + 1, r.name, r.score.toLocaleString(), r.lines ?? 0, r.combo ?? 0]) {
      const td = document.createElement('td');
      td.textContent = v; // textContent: el nombre nunca se interpreta como HTML
      tr.append(td);
    }
    recordsBody.append(tr);
  });

  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
  bestComboBox.classList.toggle('highlight', newBestCombo);
  maxLinesBox.classList.toggle('highlight', newMaxLines);
}

let resetArmed = false, resetTimer;
function resetRecords() {
  // Doble clic para confirmar, sin diálogos modales
  if (!resetArmed) {
    resetArmed = true;
    resetBtn.textContent = '¿Seguro? Pulsa otra vez';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(disarmReset, 3000);
    return;
  }
  disarmReset();
  records = emptyRecords();
  highlightIndex = -1;
  newBestCombo = newMaxLines = false;
  saveRecords();
  renderRecords();
}

function disarmReset() {
  resetArmed = false;
  clearTimeout(resetTimer);
  resetBtn.textContent = 'Borrar récords';
}

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
  if (!cleared) {
    combo = 0;
  } else {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = speedFor(level);
  }
  updateHUD();
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
  comboEl.textContent = combo;
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

  if (!current) return; // pantalla de inicio: aún no hay pieza

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
  if (!next) return;
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

  // Estadísticas globales: se actualizan en cada partida, entre o no en el top
  newBestCombo = maxCombo > records.bestCombo;
  newMaxLines = lines > records.maxLines;
  if (newBestCombo) records.bestCombo = maxCombo;
  if (newMaxLines) records.maxLines = lines;
  saveRecords();

  highlightIndex = -1;
  const rank = rankFor(score);
  pendingRecord = rank !== -1;
  showOverlay('gameover', rank);
}

// mode: 'start' | 'gameover' (la pausa tiene su propio menú)
function showOverlay(mode, rank = -1) {
  const isOver = mode === 'gameover';
  overlayTitle.textContent = { start: 'TETRIS', gameover: 'GAME OVER' }[mode];
  overlayTitle.className = mode;
  overlayScore.textContent = isOver ? `Puntuación: ${score.toLocaleString()}` : '';
  overlayStats.textContent = isOver ? `Líneas: ${lines} · Mejor combo: ${maxCombo}` : '';
  overlayStats.classList.toggle('hidden', !isOver);

  newRecordEl.textContent = rank !== -1 ? `¡Nuevo récord! Puesto #${rank + 1}` : '';
  newRecordEl.classList.toggle('hidden', rank === -1);
  nameForm.classList.toggle('hidden', !pendingRecord);

  if (mode === 'start') newBestCombo = newMaxLines = false;
  disarmReset();
  renderRecords();

  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  overlay.classList.remove('hidden');

  if (pendingRecord) {
    nameInput.value = '';
    nameInput.focus();
  }
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
  commitPendingRecord(); // si reinicia sin pulsar "Guardar", el récord no se pierde
  started = true;
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxCombo = 0;
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
  // Escribiendo el nombre: las teclas no controlan el juego
  if (e.target === nameInput) return;
  if (e.target === skinSelect) return; // las flechas cambian la opción del selector
  if (!started) {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startGame(); }
    return;
  }
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

function startGame() {
  init();
  restartBtn.blur(); // que Space no vuelva a "pulsar" el botón
}

restartBtn.addEventListener('click', startGame);
resetBtn.addEventListener('click', () => {
  resetRecords();
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPendingRecord();
  nameInput.blur();
  nameForm.classList.add('hidden');
  renderRecords();
});
// Vista previa del nombre en la fila resaltada mientras se escribe
nameInput.addEventListener('input', renderRecords);

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

setStartLevel(startLevel);
// Pantalla de inicio: tablero vacío y tabla de récords
board = createBoard();
score = lines = combo = maxCombo = 0;
level = startLevel;
updateHUD();
setSkin(loadSkin());
setTheme('dark');
showOverlay('start');
