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
const comboEl = document.getElementById('combo');
const overlayStats = document.getElementById('overlay-stats');
const newRecordEl = document.getElementById('new-record');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsSection = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const bestComboBox = document.getElementById('best-combo-box');
const maxLinesBox = document.getElementById('max-lines-box');
const resetBtn = document.getElementById('reset-records');

let theme = 'dark';
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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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

// mode: 'start' | 'pause' | 'gameover'
function showOverlay(mode, rank = -1) {
  const isOver = mode === 'gameover';
  overlayTitle.textContent = { start: 'TETRIS', pause: 'PAUSA', gameover: 'GAME OVER' }[mode];
  overlayTitle.className = mode;
  overlayScore.textContent = isOver ? `Puntuación: ${score.toLocaleString()}` : '';
  overlayStats.textContent = isOver ? `Líneas: ${lines} · Mejor combo: ${maxCombo}` : '';
  overlayStats.classList.toggle('hidden', !isOver);

  newRecordEl.textContent = rank !== -1 ? `¡Nuevo récord! Puesto #${rank + 1}` : '';
  newRecordEl.classList.toggle('hidden', rank === -1);
  nameForm.classList.toggle('hidden', !pendingRecord);

  recordsSection.classList.toggle('hidden', mode === 'pause');
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

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay('pause');
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
  commitPendingRecord(); // si reinicia sin pulsar "Guardar", el récord no se pierde
  started = true;
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
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
  // Escribiendo el nombre: las teclas no controlan el juego
  if (e.target === nameInput) return;
  if (!started) {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startGame(); }
    return;
  }
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
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  // Repintar de inmediato (el bucle está detenido en pausa / game over)
  draw();
  drawNext();
}

themeBtn.addEventListener('click', () => {
  setTheme(theme === 'light' ? 'dark' : 'light');
  themeBtn.blur(); // que Space siga siendo la caída
});

// Pantalla de inicio: tablero vacío y tabla de récords
board = createBoard();
score = lines = combo = maxCombo = 0;
level = 1;
updateHUD();
setTheme('dark');
showOverlay('start');
