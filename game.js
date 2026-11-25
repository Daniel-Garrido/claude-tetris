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

let theme = 'dark';
let gridColor = '#22222e';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

// ---- Records: estado por partida ----
let combo, maxComboThisGame, recordSaved, onStartScreen = false;

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
  const linesBefore = lines;
  merge();
  clearLines();
  updateCombo(lines > linesBefore);
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

  // En la pantalla de inicio no hay pieza activa: solo el tablero vacío
  if (!current) return;

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
  showGameOverRecords();
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
  // Reiniciar sin escribir nombre no debe perder un record del top 5
  if (gameOver && !recordSaved) saveCurrentRecord();
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  combo = 0;
  maxComboThisGame = 0;
  recordSaved = false;
  onStartScreen = false;
  startScreen.classList.add('hidden');
  goRecords.classList.add('rec-hidden');
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Lo que se escribe en el campo de nombre no controla el juego
  if (e.target instanceof HTMLInputElement) return;
  if (onStartScreen) {
    // Enter empieza la partida (salvo sobre un botón, que ya hace su propio clic)
    if (e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      init();
    }
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

// ---- Tabla de records (localStorage) ----
const RECORDS_KEY = 'tetris.records';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

const startScreen = document.getElementById('start-screen');
const startRecordsList = document.getElementById('start-records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const resetConfirm = document.getElementById('reset-confirm');
const resetYesBtn = document.getElementById('reset-yes-btn');
const resetNoBtn = document.getElementById('reset-no-btn');
const goRecords = document.getElementById('go-records');
const goRecordsMsg = document.getElementById('go-records-msg');
const goRecordsList = document.getElementById('go-records-list');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const homeBtn = document.getElementById('home-btn');

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function loadRecords() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(RECORDS_KEY));
  } catch (err) {
    return emptyRecords();
  }
  if (!data || typeof data !== 'object') return emptyRecords();
  const top = (Array.isArray(data.top) ? data.top : [])
    .filter(e => e && typeof e === 'object')
    .map(e => ({
      name: String(e.name ?? '').slice(0, NAME_MAX) || 'Anónimo',
      score: toCount(e.score),
      lines: toCount(e.lines),
      level: toCount(e.level) || 1,
      date: typeof e.date === 'string' ? e.date : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
  return { top, bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
}

function saveRecords(rec) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rec));
  } catch (err) {
    // Sin almacenamiento disponible (modo privado, cuota...): se ignora
  }
}

function updateCombo(clearedLines) {
  if (clearedLines) {
    combo++;
    if (combo > maxComboThisGame) maxComboThisGame = combo;
  } else {
    combo = 0;
  }
}

// Posición en la que entraría `value` (tras los empates existentes), o -1
function rankFor(top, value) {
  if (value <= 0) return -1;
  let i = 0;
  while (i < top.length && top[i].score >= value) i++;
  return i < MAX_RECORDS ? i : -1;
}

// Pinta la lista con textContent (nunca innerHTML) para evitar XSS
function renderRecordsList(listEl, top, highlightIndex) {
  listEl.replaceChildren();
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aún no hay records';
    listEl.appendChild(li);
    return;
  }
  top.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === highlightIndex) li.classList.add('highlight');
    if (entry.date) {
      const d = new Date(entry.date);
      if (!isNaN(d)) li.title = d.toLocaleString('es');
    }
    const cells = [
      ['rec-pos', `${i + 1}.`],
      ['rec-name', entry.name],
      ['rec-score', entry.score.toLocaleString()],
      ['rec-lines', `${entry.lines}L N${entry.level}`],
    ];
    for (const [cls, text] of cells) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      li.appendChild(span);
    }
    listEl.appendChild(li);
  });
}

function renderStartScreen() {
  const rec = loadRecords();
  renderRecordsList(startRecordsList, rec.top, -1);
  bestComboEl.textContent = rec.bestCombo;
  maxLinesEl.textContent = rec.maxLines;
}

function showStartScreen() {
  init();
  cancelAnimationFrame(animId);
  current = null; // tablero vacío, sin pieza activa
  onStartScreen = true;
  resetConfirm.classList.add('rec-hidden');
  resetRecordsBtn.classList.remove('rec-hidden');
  renderStartScreen();
  startScreen.classList.remove('hidden');
  draw();
}

function showGameOverRecords() {
  // Las estadísticas globales se actualizan siempre, entre o no en el top
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxComboThisGame);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);

  const rank = rankFor(rec.top, score);
  goRecords.classList.remove('rec-hidden');
  if (rank >= 0) {
    // Vista previa con la puntuación actual resaltada hasta que se guarde
    const preview = rec.top.slice();
    preview.splice(rank, 0, { name: '???', score, lines, level, date: '' });
    renderRecordsList(goRecordsList, preview.slice(0, MAX_RECORDS), rank);
    goRecordsMsg.textContent = `¡Nuevo record! Puesto ${rank + 1} del top ${MAX_RECORDS}`;
    nameInput.value = '';
    nameForm.classList.remove('rec-hidden');
    nameInput.focus();
  } else {
    renderRecordsList(goRecordsList, rec.top, -1);
    goRecordsMsg.textContent = `Mejor combo: ${maxComboThisGame} · Líneas: ${lines}`;
    nameForm.classList.add('rec-hidden');
  }
}

function saveCurrentRecord() {
  if (!gameOver || recordSaved) return;
  const rec = loadRecords();
  const rank = rankFor(rec.top, score);
  if (rank < 0) return;
  const name = nameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo';
  rec.top.splice(rank, 0, { name, score, lines, level, date: new Date().toISOString() });
  rec.top = rec.top.slice(0, MAX_RECORDS);
  saveRecords(rec);
  recordSaved = true;
  nameInput.blur();
  nameForm.classList.add('rec-hidden');
  goRecordsMsg.textContent = `¡Guardado! Puesto ${rank + 1}`;
  renderRecordsList(goRecordsList, rec.top, rank);
}

// El campo recibe el foco al terminar la partida: si el jugador seguía pulsando
// Space, esos espacios no deben llenar el nombre (sin espacios iniciales)
nameInput.addEventListener('input', () => {
  const trimmed = nameInput.value.replace(/^\s+/, '');
  if (trimmed !== nameInput.value) nameInput.value = trimmed;
});

nameForm.addEventListener('submit', e => {
  e.preventDefault(); // Enter en el campo o clic en Guardar
  saveCurrentRecord();
});

homeBtn.addEventListener('click', () => {
  homeBtn.blur();
  showStartScreen();
});

window.addEventListener('beforeunload', () => {
  if (gameOver && !recordSaved) saveCurrentRecord();
});

playBtn.addEventListener('click', () => {
  playBtn.blur();
  init();
});

resetRecordsBtn.addEventListener('click', () => {
  resetRecordsBtn.classList.add('rec-hidden');
  resetConfirm.classList.remove('rec-hidden');
  resetNoBtn.focus();
});

resetNoBtn.addEventListener('click', () => {
  resetConfirm.classList.add('rec-hidden');
  resetRecordsBtn.classList.remove('rec-hidden');
  resetNoBtn.blur();
});

resetYesBtn.addEventListener('click', () => {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (err) {
    // ignorado
  }
  resetConfirm.classList.add('rec-hidden');
  resetRecordsBtn.classList.remove('rec-hidden');
  resetYesBtn.blur();
  renderStartScreen();
});

showStartScreen();
setTheme('dark');
