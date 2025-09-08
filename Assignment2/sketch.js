/**
 * Mondrian-style interactive grid
 * - mousePressed(): randomizes grid + colors (shows them immediately)
 * - mouseReleased(): ONLY move lines back (no color while moving),
 *                    then refill original colors AFTER the lines arrive.
 */

// ----- Canvas & style -----
const W = 820, H = 600;
const LINE_W = 8;
const MARGIN = 10;

// ----- Grid state (live) -----
let vLines = [];         // current vertical line x-positions (no edges)
let hLines = [];         // current horizontal line y-positions (no edges)
let cells  = [];         // rectangles for the *current* grid

// ----- Original (target) composition -----
let originalV = [];
let originalH = [];
let originalColorsMap = new Map();  // Map<cellIndex, p5.Color> for the original grid
let originalColorTargets = [];      // [{pcx, pcy, col}] anchors to build original map

// ----- Random (shown only while mouse is down) -----
let randomColorsMap = new Map();    // Map<cellIndex, p5.Color>

// ----- Transition (morph) -----
let mode = "original";              // "original" | "randomized" | "transition"
const TRANSITION_MS = 1100;         // morph duration (ms)
let tStart = 0;
let vStart = [];                    // starting randomized lines at release
let hStart = [];

/* ======================================================= */
function setup() {
  createCanvas(W, H);
  pixelDensity(1);
  strokeCap(SQUARE);

  // 1) Hand-tuned original grid (approximation of reference image)
  originalV = [  90, 320, 360, 560 ];
  originalH = [  90, 250, 290, 380, 540 ];

  // 2) Activate original grid
  vLines = originalV.slice();
  hLines = originalH.slice();
  recomputeCells();

  // 3) Define the original colored regions via percentage anchors
  originalColorTargets = [
    { pcx: 0.24, pcy: 0.63, col: color( 25,  80, 180) }, // big blue (bottom-left)
    { pcx: 0.83, pcy: 0.22, col: color( 25,  80, 180) }, // blue (upper-right)
    { pcx: 0.06, pcy: 0.05, col: color(210,  25,  45) }, // red (top-left strip)
    { pcx: 0.51, pcy: 0.78, col: color(210,  25,  45) }, // red (bottom-center)
    { pcx: 0.38, pcy: 0.18, col: color(245, 205,  35) }, // yellow (upper-mid)
    { pcx: 0.90, pcy: 0.92, col: color(245, 205,  35) }, // yellow (bottom-right)
  ];

  // Build the original color map once (for the *original* exact grid)
  originalColorsMap = colorMapFromTargets(originalColorTargets, originalV, originalH);
}

function draw() {
  background(255);

  if (mode === "transition") {
    // Progress 0..1 with easing
    const u = constrain((millis() - tStart) / TRANSITION_MS, 0, 1);
    const t = easeInOutCubic(u);

    // 1) Interpolate lines
    const vCurr = lerpArray(vStart, originalV, t);
    const hCurr = lerpArray(hStart, originalH, t);

    // 2) Draw ONLY the moving grid (no color during transition)
    drawGrid(vCurr, hCurr);

    // 3) Finish transition → switch to full original state (colors will appear next frame)
    if (u >= 1) {
      vLines = originalV.slice();
      hLines = originalH.slice();
      cells  = computeCellsFor(vLines, hLines);
      mode = "original";
    }
    return;
  }

  // ----- Normal rendering -----
  if (mode === "randomized") {
    // While mouse is down: show randomized colors on the randomized grid
    drawColorsFromMap(randomColorsMap, vLines, hLines);
  } else {
    // Original mode: paint the original colors
    drawColorsFromMap(originalColorsMap, vLines, hLines);
  }
  drawGrid(vLines, hLines);
}

/* ======================== Interaction ======================== */

function mousePressed() {
  // Randomized grid with the same line counts
  vLines = makeRandomLines(originalV.length, W, MARGIN, 60);
  hLines = makeRandomLines(originalH.length, H, MARGIN, 60);
  recomputeCells();

  // Randomly color as many cells as there are original targets (keeps palette size)
  const palette = originalColorTargets.map(o => o.col);
  const indices = [...cells.keys()];
  shuffleInPlace(indices);

  randomColorsMap.clear();
  for (let i = 0; i < palette.length && i < indices.length; i++) {
    randomColorsMap.set(indices[i], palette[i % palette.length]);
  }

  mode = "randomized";
}

function mouseReleased() {
  // Start morph: remember starting lines; during morph, we draw only lines
  vStart = vLines.slice();
  hStart = hLines.slice();
  tStart = millis();
  mode = "transition";
}

/* ========================= Rendering ========================= */

function drawGrid(vArr, hArr) {
  stroke(0);
  strokeWeight(LINE_W);
  for (const x of [0, ...vArr, W]) line(x, 0, x, H);
  for (const y of [0, ...hArr, H]) line(0, y, W, y);
}

function drawColorsFromMap(map, vArr, hArr) {
  const xs = [0, ...vArr.slice().sort((a,b)=>a-b), W];
  const ys = [0, ...hArr.slice().sort((a,b)=>a-b), H];
  noStroke();
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const idx = j * (xs.length - 1) + i;
      const col = map.get(idx);
      if (!col) continue;
      fill(col);
      rect(xs[i], ys[j], xs[i+1]-xs[i], ys[j+1]-ys[j]);
    }
  }
}

/* ====================== Grid bookkeeping ===================== */

function recomputeCells() {
  cells = computeCellsFor(vLines, hLines);
}

function computeCellsFor(vArr, hArr) {
  const xs = [0, ...vArr.slice().sort((a,b)=>a-b), W];
  const ys = [0, ...hArr.slice().sort((a,b)=>a-b), H];
  const out = [];
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      out.push({
        x: xs[i],
        y: ys[j],
        w: xs[i+1] - xs[i],
        h: ys[j+1] - ys[j],
        i, j
      });
    }
  }
  return out;
}

/* =========================== Utilities ======================= */

function makeRandomLines(count, span, margin, minGap) {
  const picks = [];
  let tries = 0, triesLimit = 5000;
  while (picks.length < count && tries < triesLimit) {
    tries++;
    const x = random(margin + LINE_W, span - margin - LINE_W);
    if (picks.every(p => Math.abs(p - x) >= minGap)) picks.push(x);
  }
  picks.sort((a,b)=>a-b);
  return picks;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = floor(random(i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function lerpArray(a, b, t) {
  const out = new Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = lerp(a[i], b[i], t);
  return out;
}

function colorMapFromTargets(targets, vArr, hArr) {
  const xs = [0, ...vArr.slice().sort((a,b)=>a-b), W];
  const ys = [0, ...hArr.slice().sort((a,b)=>a-b), H];
  const m = new Map();
  for (const t of targets) {
    const x = constrain(t.pcx, 0, 1) * W;
    const y = constrain(t.pcy, 0, 1) * H;
    const i = xIndexFor(x, xs);
    const j = yIndexFor(y, ys);
    const idx = j * (xs.length - 1) + i;
    m.set(idx, t.col);
  }
  return m;
}

function xIndexFor(x, xs) {
  for (let i = 0; i < xs.length - 1; i++) if (x >= xs[i] && x < xs[i+1]) return i;
  return xs.length - 2;
}
function yIndexFor(y, ys) {
  for (let j = 0; j < ys.length - 1; j++) if (y >= ys[j] && y < ys[j+1]) return j;
  return ys.length - 2;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
}
