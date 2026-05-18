// Spirograph Playground
// Run from the repo root with: python3 -m http.server 8000
// Then open: http://localhost:8000/sketches/p5js/spirograph_playground/

const PALETTE_URL = "./palettes.yml";
const FALLBACK_PALETTES = [
  { name: "fallback_black_on_white", background: [255, 255, 255], points: [0, 0, 0], alpha: 190 },
];
const TWO_PI_VALUE = Math.PI * 2;
const PREVIEW_EXPORT_SIZE = 900;
const MAX_PLAYBACK_STEPS_PER_FRAME = 2400;
const MAX_TOTAL_STEPS = 10000000;
const GENERATED_TOTAL_STEPS = MAX_TOTAL_STEPS;
const SPARKLE_TRAIL_LIMIT = 180;
const MAX_REDRAW_VERTICES = 140000;
const FIT_SAMPLE_POINTS = 120000;
const MIN_DRAW_SPEED = 0.01;
const MAX_DRAW_SPEED = 1;
const DISPLAY_FRAME_RATE = 60;
const RECIPE_VERSION = 2;
const SHAPE_RANDOM_VALUE = "random";
const MIN_TRAIL_ALPHA = 150;
const PERMANENT_TRAIL_OPACITY = 0.1;
const RECENT_TRAIL_OPACITY = 0.9;
const FRESH_TRAIL_REPEATS = 1;
const RECENT_FADE_REPEATS = 6;
const RECENT_FADE_CHUNKS = 18;
const RECENT_CHUNK_VERTEX_LIMIT = 9000;
const FIXED_PIECES = [
  { id: "ring96", label: "Ring 96", radius: 96, variant: "hypotrochoid" },
  { id: "ring120", label: "Ring 120", radius: 120, variant: "hypotrochoid" },
  { id: "outer72", label: "Outer gear 72", radius: 72, variant: "epitrochoid" },
  { id: "outer96", label: "Outer gear 96", radius: 96, variant: "epitrochoid" },
];
const ROLLING_WHEELS = [
  { id: "wheel24", label: "Wheel 24", radius: 24 },
  { id: "wheel32", label: "Wheel 32", radius: 32 },
  { id: "wheel40", label: "Wheel 40", radius: 40 },
  { id: "wheel52", label: "Wheel 52", radius: 52 },
  { id: "wheel64", label: "Wheel 64", radius: 64 },
];
const PEN_HOLES = [
  { id: "nearCenter", label: "Near center", ratio: 0.34 },
  { id: "middle", label: "Middle", ratio: 0.62 },
  { id: "nearEdge", label: "Near edge", ratio: 0.88 },
  { id: "outerReach", label: "Outer reach", ratio: 1.16 },
];
const DEFAULT_SHAPE_SELECTION = {
  fixedPieceId: SHAPE_RANDOM_VALUE,
  wheelId: SHAPE_RANDOM_VALUE,
  penHoleId: SHAPE_RANDOM_VALUE,
};
const FIXED_PIECE_BY_ID = Object.fromEntries(FIXED_PIECES.map((piece) => [piece.id, piece]));
const ROLLING_WHEEL_BY_ID = Object.fromEntries(ROLLING_WHEELS.map((wheel) => [wheel.id, wheel]));
const PEN_HOLE_BY_ID = Object.fromEntries(PEN_HOLES.map((hole) => [hole.id, hole]));

let ui = {};
let palettes = FALLBACK_PALETTES.slice();
let recipe = null;
let pathPoints = emptyPathPoints();
let baseTrailLayer = null;
let recentTrailLayer = null;
let sparkLayer = null;
let sparkles = [];
let canvasSize = 720;
let currentStep = 0;
let renderedStep = 0;
let isPlaying = true;
let playDirection = 1;
let paletteLoadMessage = "Using fallback palette";

function setup() {
  pixelDensity(1);
  const canvas = createCanvas(10, 10);
  canvas.parent("canvasMount");
  canvas.elt.addEventListener("contextmenu", (event) => event.preventDefault());

  cacheUi();
  installUiEvents();
  ui.speedRange.value = formatSpeedValue(MAX_DRAW_SPEED);
  syncSpeedUi();
  resizeArtworkCanvas();

  loadPalettes().then((loadedPalettes) => {
    palettes = loadedPalettes.length > 0 ? loadedPalettes : FALLBACK_PALETTES.slice();
    paletteLoadMessage = `Loaded ${palettes.length} palettes`;
    populatePaletteSelect();
    randomizeArtwork();
  });
}

function draw() {
  if (!recipe || pathPoints.length === 0 || !baseTrailLayer || !recentTrailLayer) {
    background(245, 243, 238);
    return;
  }

  if (isPlaying) {
    advancePlayback();
  }

  const palette = activePalette();
  syncArtworkBackground(palette);
  background(...palette.background);
  image(baseTrailLayer, 0, 0);
  image(recentTrailLayer, 0, 0);
  updateSparkles();
  image(sparkLayer, 0, 0);
  syncPlaybackUi();
}

function windowResized() {
  resizeArtworkCanvas();
}

function cacheUi() {
  ui = {
    modeSelect: document.getElementById("modeSelect"),
    shapeControls: document.getElementById("shapeControls"),
    fixedPieceSelect: document.getElementById("fixedPieceSelect"),
    wheelSelect: document.getElementById("wheelSelect"),
    penHoleSelect: document.getElementById("penHoleSelect"),
    paletteSelect: document.getElementById("paletteSelect"),
    randomizeBtn: document.getElementById("randomizeBtn"),
    restartBtn: document.getElementById("restartBtn"),
    playPauseBtn: document.getElementById("playPauseBtn"),
    jumpEndBtn: document.getElementById("jumpEndBtn"),
    fullscreenBtn: document.getElementById("fullscreenBtn"),
    speedRange: document.getElementById("speedRange"),
    speedValue: document.getElementById("speedValue"),
    progressRange: document.getElementById("progressRange"),
    progressValue: document.getElementById("progressValue"),
    savePreviewBtn: document.getElementById("savePreviewBtn"),
    copyRecipeBtn: document.getElementById("copyRecipeBtn"),
    saveRecipeBtn: document.getElementById("saveRecipeBtn"),
    loadRecipeBtn: document.getElementById("loadRecipeBtn"),
    recipeBox: document.getElementById("recipeBox"),
    statusLine: document.getElementById("statusLine"),
    paletteBrowser: document.getElementById("paletteBrowser"),
    canvasStage: document.querySelector(".canvas-stage"),
    controlsPane: document.getElementById("controlsPane"),
    controlsToggleBtn: document.getElementById("controlsToggleBtn"),
    mobileRandomBtn: document.getElementById("mobileRandomBtn"),
    mobilePlayPauseBtn: document.getElementById("mobilePlayPauseBtn"),
    mobileFullscreenBtn: document.getElementById("mobileFullscreenBtn"),
  };
}

function installUiEvents() {
  ui.modeSelect.addEventListener("change", () => {
    randomizeArtwork({ mode: ui.modeSelect.value });
  });

  ui.paletteSelect.addEventListener("change", () => {
    if (!recipe) return;
    selectPalette(Number(ui.paletteSelect.value));
  });

  ui.randomizeBtn.addEventListener("click", () => randomizeArtwork());
  ui.restartBtn.addEventListener("click", restartArtwork);
  ui.playPauseBtn.addEventListener("click", togglePlayback);
  ui.jumpEndBtn.addEventListener("click", jumpToEnd);
  ui.fullscreenBtn.addEventListener("click", enterFullscreen);
  ui.mobileRandomBtn.addEventListener("click", () => randomizeArtwork());
  ui.mobilePlayPauseBtn.addEventListener("click", togglePlayback);
  ui.mobileFullscreenBtn.addEventListener("click", enterFullscreen);
  ui.controlsToggleBtn.addEventListener("click", toggleControlsDrawer);
  [ui.fixedPieceSelect, ui.wheelSelect, ui.penHoleSelect].forEach((select) => {
    select.addEventListener("change", handleShapeControlChange);
  });

  ui.speedRange.addEventListener("input", () => {
    if (recipe) {
      recipe.drawSpeed = normalizeDrawSpeed(ui.speedRange.value);
      syncRecipeBox();
    }
    syncSpeedUi();
  });

  ui.progressRange.addEventListener("input", () => {
    if (!recipe) return;
    isPlaying = false;
    currentStep = Number(ui.progressRange.value);
    playDirection = 1;
    renderTrailToStep(currentStep);
  });

  ui.savePreviewBtn.addEventListener("click", savePreview);
  ui.copyRecipeBtn.addEventListener("click", copyRecipe);
  ui.saveRecipeBtn.addEventListener("click", saveRecipe);
  ui.loadRecipeBtn.addEventListener("click", loadRecipeFromBox);
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      exitAppFullscreen();
    }
    resizeArtworkCanvas();
    syncFullscreenUi();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.canvasStage.classList.contains("is-app-fullscreen")) {
      exitAppFullscreen();
    }
  });
}

async function loadPalettes() {
  try {
    const response = await fetch(PALETTE_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Palette request failed: ${response.status}`);
    }
    return parsePaletteYaml(await response.text());
  } catch (error) {
    paletteLoadMessage = "Palette YAML unavailable";
    console.warn(error);
    return FALLBACK_PALETTES.slice();
  }
}

function parsePaletteYaml(text) {
  const parsed = [];
  let current = null;

  text.split(/\r?\n/).forEach((rawLine) => {
    let line = rawLine.trim();
    if (!line || line.startsWith("#") || line === "palettes:") return;

    if (line.startsWith("- ")) {
      pushPaletteIfValid(parsed, current);
      current = {};
      line = line.slice(2).trim();
    }

    if (!current) return;

    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) return;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key === "name") current.name = value;
    if (key === "background") current.background = parseRgb(value);
    if (key === "points") current.points = parseRgb(value);
    if (key === "alpha") current.alpha = clamp(Number(value), 0, 255);
  });

  pushPaletteIfValid(parsed, current);
  return parsed;
}

function pushPaletteIfValid(list, item) {
  if (!item) return;
  const hasRgb = Array.isArray(item.background) && Array.isArray(item.points);
  if (!item.name || !hasRgb || !Number.isFinite(item.alpha)) return;
  list.push(item);
}

function parseRgb(value) {
  const channels = value
    .replace("[", "")
    .replace("]", "")
    .split(",")
    .map((piece) => clamp(Number(piece.trim()), 0, 255));

  return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
}

function populatePaletteSelect() {
  ui.paletteSelect.innerHTML = "";
  ui.paletteBrowser.innerHTML = "";
  palettes.forEach((palette, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = palette.name;
    ui.paletteSelect.appendChild(option);

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "palette-swatch";
    swatch.dataset.paletteIndex = String(index);
    swatch.setAttribute("aria-label", `Use ${palette.name} palette`);
    swatch.innerHTML = `
      <span class="swatch-chip" aria-hidden="true"></span>
      <span class="swatch-name">${escapeHtml(palette.name)}</span>
    `;

    const chip = swatch.querySelector(".swatch-chip");
    chip.style.background = `linear-gradient(135deg, rgb(${palette.background.join(",")}) 0 49%, rgb(${palette.points.join(",")}) 51% 100%)`;

    swatch.addEventListener("click", () => selectPalette(index));
    ui.paletteBrowser.appendChild(swatch);
  });
  syncPaletteBrowser();
}

function selectPalette(paletteIndex) {
  if (!recipe) return;
  const safePaletteIndex = resolvePaletteIndex(paletteIndex);
  recipe.paletteIndex = safePaletteIndex;
  recipe.paletteName = palettes[safePaletteIndex].name;
  ui.paletteSelect.value = String(safePaletteIndex);
  syncArtworkBackground(palettes[safePaletteIndex]);
  syncPaletteBrowser();
  renderTrailToStep(currentStep);
  syncRecipeBox();
}

function randomizeArtwork(overrides = {}) {
  const mode = overrides.mode || ui.modeSelect.value || "classic";
  const paletteIndex = resolvePaletteIndex(overrides.paletteIndex ?? ui.paletteSelect.value);
  const shapeSelection = overrides.shapeSelection || readShapeSelection();
  const seed = makeRecipeSeed();
  const nextRecipe = makeRecipe({ mode, seed, paletteIndex, shapeSelection });
  applyRecipe(nextRecipe, { startPlaying: true });
}

function makeRecipe({ mode, seed, paletteIndex, shapeSelection = DEFAULT_SHAPE_SELECTION }) {
  const safeMode = mode === "epicycle" ? "epicycle" : "classic";
  const safePaletteIndex = resolvePaletteIndex(paletteIndex);
  const generated =
    safeMode === "epicycle" ? makeEpicycleParams(seed) : makeClassicParams(seed, shapeSelection);

  return {
    version: RECIPE_VERSION,
    app: "spirograph_playground",
    mode: safeMode,
    seed,
    paletteIndex: safePaletteIndex,
    paletteName: palettes[safePaletteIndex].name,
    canvas: { aspect: 1 },
    totalSteps: generated.totalSteps,
    drawSpeed: normalizeDrawSpeed(ui.speedRange.value),
    ...(generated.shape ? { shape: generated.shape } : {}),
    params: generated.params,
  };
}

function applyRecipe(nextRecipe, options = {}) {
  recipe = normalizeRecipe(nextRecipe);
  pathPoints = generatePathPoints(recipe);
  currentStep = clamp(Math.round(Number(recipe.currentStep || 0)), 0, recipe.totalSteps);
  renderedStep = 0;
  sparkles = [];
  playDirection = recipe.playDirection === -1 ? -1 : 1;
  isPlaying = options.startPlaying ?? false;

  ui.modeSelect.value = recipe.mode;
  ui.paletteSelect.value = String(recipe.paletteIndex);
  ui.speedRange.value = formatSpeedValue(recipe.drawSpeed);
  ui.progressRange.max = String(recipe.totalSteps);
  ui.progressRange.value = String(currentStep);

  syncArtworkBackground(activePalette());
  syncShapeControls();
  syncSpeedUi();
  syncPaletteBrowser();
  syncRecipeBox();
  renderTrailToStep(currentStep);
}

function normalizeRecipe(source) {
  const mode = source.mode === "epicycle" ? "epicycle" : "classic";
  const seed = Number.isFinite(Number(source.seed)) ? Number(source.seed) >>> 0 : makeRecipeSeed();
  let paletteIndex = resolvePaletteIndex(source.paletteIndex);

  if (source.paletteName) {
    const foundIndex = palettes.findIndex((palette) => palette.name === source.paletteName);
    if (foundIndex >= 0) paletteIndex = foundIndex;
  }

  const fallback = makeRecipe({ mode, seed, paletteIndex, shapeSelection: source.shape });
  const totalSteps = clamp(
    Math.round(Number(source.totalSteps || fallback.totalSteps)),
    1200,
    MAX_TOTAL_STEPS,
  );
  const drawSpeed = normalizeDrawSpeed(source.drawSpeed ?? ui.speedRange.value);
  const currentStep = clamp(Math.round(Number(source.currentStep || 0)), 0, totalSteps);
  const progressPercent = totalSteps > 0 ? roundForRecipe((currentStep / totalSteps) * 100) : 0;
  const playDirection = source.playDirection === -1 ? -1 : 1;
  const params =
    mode === "epicycle"
      ? normalizeEpicycleParams(source.params || fallback.params)
      : normalizeClassicParams(source.params || fallback.params);
  const shapeSource =
    mode === "classic"
      ? source.shape || (source.params ? shapeFromClassicParams(params) : fallback.shape)
      : null;
  const shape =
    mode === "classic"
      ? normalizeClassicShape(shapeSource || shapeFromClassicParams(params), params)
      : null;

  return {
    version: RECIPE_VERSION,
    app: "spirograph_playground",
    mode,
    seed,
    paletteIndex,
    paletteName: palettes[paletteIndex].name,
    canvas: { aspect: 1 },
    totalSteps,
    drawSpeed,
    currentStep,
    progressPercent,
    playDirection,
    ...(shape ? { shape } : {}),
    params,
  };
}

function handleShapeControlChange() {
  if (!recipe) return;
  ui.modeSelect.value = "classic";
  randomizeArtwork({ mode: "classic", shapeSelection: readShapeSelection() });
}

function readShapeSelection() {
  return {
    fixedPieceId: ui.fixedPieceSelect?.value || SHAPE_RANDOM_VALUE,
    wheelId: ui.wheelSelect?.value || SHAPE_RANDOM_VALUE,
    penHoleId: ui.penHoleSelect?.value || SHAPE_RANDOM_VALUE,
  };
}

function syncShapeControls() {
  if (!ui.shapeControls || !ui.fixedPieceSelect || !ui.wheelSelect || !ui.penHoleSelect) return;
  const classicActive = recipe?.mode === "classic";
  [ui.fixedPieceSelect, ui.wheelSelect, ui.penHoleSelect].forEach((select) => {
    select.disabled = !classicActive;
  });
  ui.shapeControls.classList.toggle("is-disabled", !classicActive);

  if (!classicActive || !recipe.shape) return;
  ui.fixedPieceSelect.value = recipe.shape.fixedPieceId;
  ui.wheelSelect.value = recipe.shape.wheelId;
  ui.penHoleSelect.value = recipe.shape.penHoleId;
}

function resolveClassicShape(selection, rng) {
  return {
    fixedPieceId: resolveShapeChoice(selection?.fixedPieceId, FIXED_PIECES, rng),
    wheelId: resolveShapeChoice(selection?.wheelId, ROLLING_WHEELS, rng),
    penHoleId: resolveShapeChoice(selection?.penHoleId, PEN_HOLES, rng),
  };
}

function resolveShapeChoice(value, definitions, rng) {
  if (value && value !== SHAPE_RANDOM_VALUE && definitions.some((item) => item.id === value)) {
    return value;
  }
  return definitions[randomInt(rng, 0, definitions.length - 1)].id;
}

function normalizeClassicShape(sourceShape, params) {
  const inferred = shapeFromClassicParams(params);
  const fixedPieceId = FIXED_PIECE_BY_ID[sourceShape?.fixedPieceId]
    ? sourceShape.fixedPieceId
    : inferred.fixedPieceId;
  const wheelId = ROLLING_WHEEL_BY_ID[sourceShape?.wheelId] ? sourceShape.wheelId : inferred.wheelId;
  const penHoleId = PEN_HOLE_BY_ID[sourceShape?.penHoleId] ? sourceShape.penHoleId : inferred.penHoleId;

  return { fixedPieceId, wheelId, penHoleId };
}

function shapeFromClassicParams(params = {}) {
  const variant = params.variant === "epitrochoid" ? "epitrochoid" : "hypotrochoid";
  const matchingPieces = FIXED_PIECES.filter((piece) => piece.variant === variant);
  const fixedPiece = closestBy(matchingPieces, params.fixedRadius || matchingPieces[0].radius, "radius");
  const wheel = closestBy(ROLLING_WHEELS, params.rollingRadius || ROLLING_WHEELS[0].radius, "radius");
  const penRatio = wheel.radius > 0 ? (params.penDistance || wheel.radius * 0.62) / wheel.radius : 0.62;
  const penHole = closestBy(PEN_HOLES, penRatio, "ratio");

  return {
    fixedPieceId: fixedPiece.id,
    wheelId: wheel.id,
    penHoleId: penHole.id,
  };
}

function normalizeClassicParams(params = {}) {
  const fixedRadius = Number(params.fixedRadius);
  const rollingRadius = Number(params.rollingRadius);
  const tMax = Number(params.tMax);
  const safeParams = {
    ...params,
    variant: params.variant === "epitrochoid" ? "epitrochoid" : "hypotrochoid",
    fixedRadius: Number.isFinite(fixedRadius) ? fixedRadius : 96,
    rollingRadius: Number.isFinite(rollingRadius) ? rollingRadius : 40,
    penDistance: Number.isFinite(Number(params.penDistance)) ? Number(params.penDistance) : 24.8,
    phase: Number.isFinite(Number(params.phase)) ? Number(params.phase) : 0,
    rotation: Number.isFinite(Number(params.rotation)) ? Number(params.rotation) : 0,
    rotationDrift: Number.isFinite(Number(params.rotationDrift)) ? Number(params.rotationDrift) : 0,
    penWobble: Number.isFinite(Number(params.penWobble)) ? Number(params.penWobble) : 0,
    wobbleFrequency: Number.isFinite(Number(params.wobbleFrequency)) ? Number(params.wobbleFrequency) : 1,
    wobblePhase: Number.isFinite(Number(params.wobblePhase)) ? Number(params.wobblePhase) : 0,
    tMax: Number.isFinite(tMax) ? tMax : TWO_PI_VALUE * 48,
  };

  if (!Number.isFinite(Number(safeParams.repeatCount)) || Number(safeParams.repeatCount) <= 0) {
    const closeTurns = clamp(
      safeParams.rollingRadius / gcd(Math.round(safeParams.fixedRadius), Math.round(safeParams.rollingRadius)),
      1,
      64,
    );
    safeParams.repeatCount = Math.max(1, Math.round(safeParams.tMax / (TWO_PI_VALUE * closeTurns)));
  }

  return safeParams;
}

function normalizeEpicycleParams(params = {}) {
  const components =
    Array.isArray(params.components) && params.components.length > 0
      ? params.components
      : [{ radius: 1, frequency: 1, phase: 0 }];
  const safeParams = {
    ...params,
    symmetry: Number.isFinite(Number(params.symmetry)) ? Number(params.symmetry) : 4,
    rotation: Number.isFinite(Number(params.rotation)) ? Number(params.rotation) : 0,
    rotationDrift: Number.isFinite(Number(params.rotationDrift)) ? Number(params.rotationDrift) : 0,
    wobbleAmount: Number.isFinite(Number(params.wobbleAmount)) ? Number(params.wobbleAmount) : 0,
    wobbleFrequency: Number.isFinite(Number(params.wobbleFrequency)) ? Number(params.wobbleFrequency) : 1,
    wobblePhase: Number.isFinite(Number(params.wobblePhase)) ? Number(params.wobblePhase) : 0,
    components,
    tMax: Number.isFinite(Number(params.tMax)) ? Number(params.tMax) : TWO_PI_VALUE * 48,
  };

  if (!Number.isFinite(Number(safeParams.repeatCount)) || Number(safeParams.repeatCount) <= 0) {
    safeParams.repeatCount = Math.max(1, Math.round(safeParams.tMax / TWO_PI_VALUE));
  }

  return safeParams;
}

function closestBy(items, value, key) {
  return items.reduce((closest, item) => {
    return Math.abs(item[key] - value) < Math.abs(closest[key] - value) ? item : closest;
  }, items[0]);
}

function makeClassicParams(seed, shapeSelection = DEFAULT_SHAPE_SELECTION) {
  const rng = mulberry32(seed);
  const shape = resolveClassicShape(shapeSelection, rng);
  const fixedPiece = FIXED_PIECE_BY_ID[shape.fixedPieceId];
  const wheel = ROLLING_WHEEL_BY_ID[shape.wheelId];
  const penHole = PEN_HOLE_BY_ID[shape.penHoleId];
  const variant = fixedPiece.variant;
  const fixedRadius = fixedPiece.radius;
  const rollingRadius = wheel.radius;

  const common = gcd(fixedRadius, rollingRadius);
  const closeTurns = clamp(rollingRadius / common, 2, 12);
  const passCount = randomInt(rng, 24, 64);
  const penDistance = rollingRadius * penHole.ratio;
  const phase = randomBetween(rng, 0, TWO_PI_VALUE);
  const rotation = randomBetween(rng, 0, TWO_PI_VALUE);
  const rotationDrift = randomBetween(rng, -TWO_PI_VALUE * 2.75, TWO_PI_VALUE * 2.75);
  const penWobble = randomBetween(rng, 0.015, 0.085);
  const wobbleFrequency = randomBetween(rng, 2.2, 9.5);
  const wobblePhase = randomBetween(rng, 0, TWO_PI_VALUE);
  const totalSteps = GENERATED_TOTAL_STEPS;

  return {
    totalSteps,
    shape,
    params: {
      variant,
      fixedRadius,
      rollingRadius,
      penDistance: roundForRecipe(penDistance),
      phase: roundForRecipe(phase),
      rotation: roundForRecipe(rotation),
      rotationDrift: roundForRecipe(rotationDrift),
      penWobble: roundForRecipe(penWobble),
      wobbleFrequency: roundForRecipe(wobbleFrequency),
      wobblePhase: roundForRecipe(wobblePhase),
      repeatCount: passCount,
      tMax: roundForRecipe(TWO_PI_VALUE * closeTurns * passCount),
    },
  };
}

function makeEpicycleParams(seed) {
  const rng = mulberry32(seed);
  const componentCount = randomInt(rng, 3, 6);
  const symmetry = randomInt(rng, 3, 9);
  const passCount = randomInt(rng, 35, 90);
  const usedFrequencies = new Set();
  const components = [];
  let radius = randomBetween(rng, 0.72, 0.96);

  for (let index = 0; index < componentCount; index += 1) {
    let frequency = index === 0 ? 1 : randomInt(rng, 2, 14);
    if (index === 1) frequency = symmetry;
    if (index === 2) frequency = symmetry + randomInt(rng, 1, 4);
    if (rng() < 0.46) frequency *= -1;

    while (usedFrequencies.has(frequency) || frequency === 0) {
      frequency += frequency > 0 ? 1 : -1;
    }
    usedFrequencies.add(frequency);

    components.push({
      radius: roundForRecipe(radius),
      frequency: roundForRecipe(frequency + randomBetween(rng, -0.18, 0.18)),
      phase: roundForRecipe(randomBetween(rng, 0, TWO_PI_VALUE)),
    });

    radius *= randomBetween(rng, 0.34, 0.62);
  }

  return {
    totalSteps: GENERATED_TOTAL_STEPS,
    params: {
      symmetry,
      rotation: roundForRecipe(randomBetween(rng, 0, TWO_PI_VALUE)),
      rotationDrift: roundForRecipe(randomBetween(rng, -TWO_PI_VALUE * 1.8, TWO_PI_VALUE * 1.8)),
      wobbleAmount: roundForRecipe(randomBetween(rng, 0.025, 0.11)),
      wobbleFrequency: roundForRecipe(randomBetween(rng, 1.5, 6.5)),
      wobblePhase: roundForRecipe(randomBetween(rng, 0, TWO_PI_VALUE)),
      components,
      repeatCount: passCount,
      tMax: roundForRecipe(TWO_PI_VALUE * passCount),
    },
  };
}

function generatePathPoints(activeRecipe) {
  return {
    length: activeRecipe.totalSteps + 1,
    fit: measurePathFit(activeRecipe),
  };
}

function measurePathFit(activeRecipe) {
  const sampleCount = Math.min(FIT_SAMPLE_POINTS, activeRecipe.totalSteps);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const progress = sample / sampleCount;
    const point = rawPointForRecipe(activeRecipe, progress);
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return makeFit(minX, maxX, minY, maxY, 0.84);
}

function makeFit(minX, maxX, minY, maxY, margin) {
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const range = Math.max(maxX - minX, maxY - minY, 0.00001);
  const scale = (2 * margin) / range;

  return {
    centerX,
    centerY,
    scale,
  };
}

function rawPointForRecipe(activeRecipe, progress) {
  return activeRecipe.mode === "epicycle"
    ? rawEpicyclePoint(activeRecipe.params, progress)
    : rawClassicPoint(activeRecipe.params, progress);
}

function rawClassicPoint(params, progress) {
  const R = params.fixedRadius;
  const r = params.rollingRadius;
  const baseD = params.penDistance;
  const wobble = params.penWobble || 0;
  const wobbleFrequency = params.wobbleFrequency || 1;
  const wobblePhase = params.wobblePhase || 0;
  const d = baseD * (1 + wobble * Math.sin(TWO_PI_VALUE * wobbleFrequency * progress + wobblePhase));
  const t = params.phase + params.tMax * progress;
  let x = 0;
  let y = 0;

  if (params.variant === "epitrochoid") {
    x = (R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t);
    y = (R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t);
  } else {
    x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
  }

  return rotatePoint({ x, y }, params.rotation + (params.rotationDrift || 0) * progress);
}

function rawEpicyclePoint(params, progress) {
  const t = params.tMax * progress;
  const wobbleAmount = params.wobbleAmount || 0;
  const wobbleFrequency = params.wobbleFrequency || 1;
  const wobblePhase = params.wobblePhase || 0;
  let x = 0;
  let y = 0;

  params.components.forEach((component, index) => {
    const angle = component.frequency * t + component.phase;
    const wobble = 1 + wobbleAmount * Math.sin(TWO_PI_VALUE * (wobbleFrequency + index * 0.37) * progress + wobblePhase);
    const radius = component.radius * wobble;
    x += radius * Math.cos(angle);
    y += radius * Math.sin(angle);
  });

  return rotatePoint({ x, y }, params.rotation + (params.rotationDrift || 0) * progress);
}

function normalizedPointAt(index) {
  if (!recipe || !pathPoints.fit) {
    return { x: 0, y: 0 };
  }

  const safeIndex = clamp(Math.floor(index), 0, Math.max(0, recipe.totalSteps));
  const progress = safeIndex / recipe.totalSteps;
  const point = rawPointForRecipe(recipe, progress);

  return {
    x: (point.x - pathPoints.fit.centerX) * pathPoints.fit.scale,
    y: (point.y - pathPoints.fit.centerY) * pathPoints.fit.scale,
  };
}

function resizeArtworkCanvas() {
  const mount = document.getElementById("canvasMount");
  const stage = document.querySelector(".canvas-stage");
  const stageWidth = stage ? stage.getBoundingClientRect().width : window.innerWidth;
  const fullscreenActive = document.fullscreenElement === stage || stage?.classList.contains("is-app-fullscreen");
  const heightLimit = fullscreenActive ? window.innerHeight : Math.max(320, window.innerHeight - 96);
  const maxCanvasSize = fullscreenActive ? 1600 : 920;
  const nextSize = clamp(Math.floor(Math.min(stageWidth, heightLimit, maxCanvasSize)), 320, maxCanvasSize);

  canvasSize = nextSize;
  resizeCanvas(canvasSize, canvasSize);
  if (mount) {
    mount.style.maxWidth = `${canvasSize}px`;
  }

  baseTrailLayer = createGraphics(canvasSize, canvasSize);
  baseTrailLayer.pixelDensity(1);
  recentTrailLayer = createGraphics(canvasSize, canvasSize);
  recentTrailLayer.pixelDensity(1);
  sparkLayer = createGraphics(canvasSize, canvasSize);
  sparkLayer.pixelDensity(1);
  renderTrailToStep(currentStep);
}

function renderTrailToStep(step) {
  if (!baseTrailLayer || !recentTrailLayer || !recipe || pathPoints.length === 0) return;
  clearTransparentLayer(baseTrailLayer);
  clearTransparentLayer(recentTrailLayer);
  drawBaseTrailToStep(step, baseTrailLayer, canvasSize);
  drawRecentTrailToStep(step, recentTrailLayer, canvasSize);
  renderedStep = step;
  clearSparkles();
  syncProgressUi();
}

function clearTransparentLayer(target) {
  target.clear();
}

function drawTrailCompositeToStep(step, target, size) {
  const palette = activePalette();
  target.push();
  target.background(...palette.background);
  target.pop();
  drawBaseTrailToStep(step, target, size);
  drawRecentTrailToStep(step, target, size);
}

function drawBaseTrailToStep(step, target, size) {
  drawBaseTrailSegment(0, step, target, size);
}

function drawBaseTrailSegment(fromStep, toStep, target, size) {
  if (!recipe || toStep <= fromStep || pathPoints.length === 0) return;
  const palette = activePalette();
  const alpha = trailAlphaForPalette(palette) * PERMANENT_TRAIL_OPACITY;
  const start = clamp(Math.floor(fromStep), 0, recipe.totalSteps);
  const end = clamp(Math.floor(toStep), 0, recipe.totalSteps);
  drawTrailRange(start, end, target, size, palette, alpha);
}

function drawRecentTrailToStep(step, target, size) {
  if (!recipe || step <= 0 || pathPoints.length === 0) return;
  const palette = activePalette();
  const end = clamp(Math.floor(step), 0, recipe.totalSteps);
  const windowSteps = recentFadeWindowSteps(recipe);
  const start = Math.max(0, end - windowSteps);
  const span = end - start;
  if (span <= 0) return;

  const targetChunkSteps = Math.max(1, repeatStepCount(recipe) * 0.25);
  const chunkCount = Math.max(1, Math.min(RECENT_FADE_CHUNKS, Math.ceil(span / targetChunkSteps)));
  const chunkSize = span / chunkCount;

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunkStart = Math.floor(start + chunkSize * chunkIndex);
    const chunkEnd = Math.min(end, Math.floor(start + chunkSize * (chunkIndex + 1)));
    if (chunkEnd <= chunkStart) continue;
    const midpoint = (chunkStart + chunkEnd) * 0.5;
    const age = end - midpoint;
    const opacity = recentTrailOpacityForAge(age, recipe);
    const alpha = trailAlphaForPalette(palette) * RECENT_TRAIL_OPACITY * opacity;
    drawTrailRange(chunkStart, chunkEnd, target, size, palette, alpha, RECENT_CHUNK_VERTEX_LIMIT);
  }
}

function drawTrailRange(start, end, target, size, palette, alpha, maxVertices = MAX_REDRAW_VERTICES) {
  if (end <= start) return;
  if (alpha <= 0.2) return;
  const darkBackground = isDarkPalette(palette);
  const coreWeight = Math.max(1.8, size / 410);

  target.push();
  target.noFill();
  target.strokeJoin(ROUND);
  target.strokeCap(ROUND);
  if (darkBackground) {
    target.drawingContext.save();
    target.drawingContext.shadowBlur = Math.max(2.5, size * 0.006);
    target.drawingContext.shadowColor = rgbaString(palette.points, Math.min(0.3, alpha / 255));
    target.stroke(...palette.points, alpha * 0.55);
    target.strokeWeight(coreWeight);
    drawPathShape(target, start, end, size, maxVertices);
    target.drawingContext.restore();
  }
  target.stroke(...palette.points, alpha);
  target.strokeWeight(coreWeight);
  drawPathShape(target, start, end, size, maxVertices);
  target.pop();
}

function advancePlayback() {
  if (!recipe) return;

  const stride = playbackStride();
  const nextStep = clamp(currentStep + playDirection * stride, 0, recipe.totalSteps);

  if (playDirection > 0) {
    drawBaseTrailSegment(currentStep, nextStep, baseTrailLayer, canvasSize);
    clearTransparentLayer(recentTrailLayer);
    drawRecentTrailToStep(nextStep, recentTrailLayer, canvasSize);
  } else {
    renderTrailToStep(nextStep);
  }

  currentStep = nextStep;
  renderedStep = nextStep;

  if (currentStep >= recipe.totalSteps) {
    playDirection = -1;
    currentStep = recipe.totalSteps;
  } else if (currentStep <= 0) {
    playDirection = 1;
    currentStep = 0;
    renderTrailToStep(0);
  }

  syncProgressUi();
}

function drawPathShape(target, start, end, size, maxVertices = MAX_REDRAW_VERTICES) {
  const step = Math.max(1, Math.ceil((end - start) / maxVertices));
  const halfSize = size * 0.5;

  target.beginShape();
  for (let index = start; index <= end; index += step) {
    const point = normalizedPointAt(index);
    target.vertex(halfSize + point.x * halfSize, halfSize + point.y * halfSize);
  }

  if ((end - start) % step !== 0) {
    const point = normalizedPointAt(end);
    target.vertex(halfSize + point.x * halfSize, halfSize + point.y * halfSize);
  }
  target.endShape();
}

function mapPathIndexToCanvas(index, size) {
  const halfSize = size * 0.5;
  const point = normalizedPointAt(index);

  return {
    x: halfSize + point.x * halfSize,
    y: halfSize + point.y * halfSize,
  };
}

function restartArtwork() {
  if (!recipe) return;
  currentStep = 0;
  playDirection = 1;
  isPlaying = true;
  sparkles = [];
  renderTrailToStep(0);
}

function togglePlayback() {
  if (!recipe) return;
  isPlaying = !isPlaying;
  syncPlaybackUi();
}

function jumpToEnd() {
  if (!recipe) return;
  currentStep = recipe.totalSteps;
  playDirection = -1;
  isPlaying = false;
  renderTrailToStep(currentStep);
}

function enterFullscreen() {
  if (!ui.canvasStage) return;

  if (ui.canvasStage.classList.contains("is-app-fullscreen")) {
    exitAppFullscreen();
    return;
  }

  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }

  if (!ui.canvasStage.requestFullscreen) {
    enterAppFullscreen();
    return;
  }

  ui.canvasStage
    .requestFullscreen()
    .then(() => {
      if (!document.fullscreenElement) {
        enterAppFullscreen();
      }
    })
    .catch(() => {
      enterAppFullscreen();
    });
}

function enterAppFullscreen() {
  ui.canvasStage.classList.add("is-app-fullscreen");
  document.body.classList.add("has-app-fullscreen");
  resizeArtworkCanvas();
  syncFullscreenUi();
}

function exitAppFullscreen() {
  ui.canvasStage.classList.remove("is-app-fullscreen");
  document.body.classList.remove("has-app-fullscreen");
  resizeArtworkCanvas();
  syncFullscreenUi();
}

function playbackStride() {
  const speed = normalizeDrawSpeed(ui.speedRange.value);
  return playbackStrideForSpeed(speed);
}

function syncSpeedUi() {
  const speed = normalizeDrawSpeed(ui.speedRange.value);
  const stepsPerSecond = playbackStrideForSpeed(speed) * DISPLAY_FRAME_RATE;
  const passSeconds = recipe ? recipe.totalSteps / stepsPerSecond : MAX_TOTAL_STEPS / stepsPerSecond;
  ui.speedValue.textContent = `${formatStepRate(stepsPerSecond)} steps/sec @60fps • ${formatDuration(passSeconds)} / pass`;
}

function playbackStrideForSpeed(speed) {
  return Math.max(1, Math.round(1 + Math.pow(speed, 2.2) * (MAX_PLAYBACK_STEPS_PER_FRAME - 1)));
}

function normalizeDrawSpeed(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return MAX_DRAW_SPEED;
  }

  const migratedValue = numericValue > MAX_DRAW_SPEED ? numericValue / 100 : numericValue;
  return roundForRecipe(clamp(migratedValue, MIN_DRAW_SPEED, MAX_DRAW_SPEED));
}

function formatSpeedValue(value) {
  return normalizeDrawSpeed(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatStepRate(value) {
  if (value >= 1000000) {
    return `${roundForRecipe(value / 1000000)}M`;
  }

  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }

  return String(Math.round(value));
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "--";

  const roundedSeconds = Math.max(1, Math.round(totalSeconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function syncProgressUi() {
  if (!recipe) return;
  ui.progressRange.max = String(recipe.totalSteps);
  ui.progressRange.value = String(currentStep);
  ui.progressValue.textContent = `${Math.round((currentStep / recipe.totalSteps) * 100)}%`;
  syncStatus();
}

function syncPlaybackUi() {
  const label = isPlaying ? "Pause" : "Play";
  ui.playPauseBtn.textContent = label;
  if (ui.mobilePlayPauseBtn) ui.mobilePlayPauseBtn.textContent = label;
}

function toggleControlsDrawer() {
  const isOpen = ui.controlsPane.classList.toggle("is-open");
  ui.controlsToggleBtn.textContent = isOpen ? "Hide controls" : "Show controls";
  ui.controlsToggleBtn.setAttribute("aria-expanded", String(isOpen));
}

function syncPaletteBrowser() {
  if (!ui.paletteBrowser || !recipe) return;
  ui.paletteBrowser.querySelectorAll(".palette-swatch").forEach((swatch) => {
    const isActive = Number(swatch.dataset.paletteIndex) === recipe.paletteIndex;
    swatch.classList.toggle("is-active", isActive);
    swatch.setAttribute("aria-pressed", String(isActive));
  });
}

function syncFullscreenUi() {
  if (!ui.fullscreenBtn) return;
  const isFullscreen = Boolean(document.fullscreenElement) || ui.canvasStage?.classList.contains("is-app-fullscreen");
  const label = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
  ui.fullscreenBtn.textContent = label;
  if (ui.mobileFullscreenBtn) ui.mobileFullscreenBtn.textContent = label;
}

function syncStatus(message) {
  if (message) {
    ui.statusLine.textContent = message;
    return;
  }

  if (!recipe) {
    ui.statusLine.textContent = paletteLoadMessage;
    return;
  }

  ui.statusLine.textContent = `${paletteLoadMessage} | ${recipe.mode} | seed ${recipe.seed}`;
}

function syncRecipeBox() {
  if (!recipe) return;
  ui.recipeBox.value = JSON.stringify(recipeForCurrentStep(), null, 2);
}

function recipeForCurrentStep() {
  const safeStep = recipe ? clamp(Math.round(currentStep), 0, recipe.totalSteps) : 0;
  const progressPercent = recipe && recipe.totalSteps > 0 ? roundForRecipe((safeStep / recipe.totalSteps) * 100) : 0;

  return {
    ...recipe,
    currentStep: safeStep,
    progressPercent,
    playDirection,
  };
}

async function copyRecipe() {
  if (!recipe) return;
  syncRecipeBox();
  const text = ui.recipeBox.value;

  try {
    await navigator.clipboard.writeText(text);
    syncStatus("Recipe copied");
  } catch (error) {
    ui.recipeBox.focus();
    ui.recipeBox.select();
    syncStatus("Recipe selected");
  }
}

function saveRecipe() {
  if (!recipe) return;
  syncRecipeBox();
  const blob = new Blob([ui.recipeBox.value], { type: "application/json" });
  downloadBlob(blob, `spirograph-recipe-${recipe.seed}.json`);
  syncStatus("Recipe saved");
}

function loadRecipeFromBox() {
  try {
    const loaded = JSON.parse(ui.recipeBox.value);
    applyRecipe(loaded, { startPlaying: false });
    syncStatus("Recipe loaded");
  } catch (error) {
    syncStatus("Recipe JSON did not load");
  }
}

function savePreview() {
  if (!recipe || pathPoints.length === 0) return;
  const preview = createGraphics(PREVIEW_EXPORT_SIZE, PREVIEW_EXPORT_SIZE);
  preview.pixelDensity(1);
  drawTrailCompositeToStep(currentStep, preview, PREVIEW_EXPORT_SIZE);
  drawPreviewCursor(preview, PREVIEW_EXPORT_SIZE);
  drawWatermark(preview, PREVIEW_EXPORT_SIZE);

  preview.canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, `spirograph-preview-${recipe.seed}.png`);
      syncStatus("Watermarked preview saved");
    }
    preview.remove();
  }, "image/png");
}

function drawPreviewCursor(target, size) {
  const palette = activePalette();
  const mapped = mapPathIndexToCanvas(currentStep, size);
  const sparkColor = sparkColorForPalette(palette);
  target.push();
  target.drawingContext.save();
  target.drawingContext.shadowBlur = Math.max(14, size * 0.02);
  target.drawingContext.shadowColor = rgbaString(sparkColor, 0.9);
  target.noFill();
  target.stroke(...sparkColor, 230);
  target.strokeWeight(2);
  target.circle(mapped.x, mapped.y, 22);
  target.fill(...sparkColor, 245);
  target.noStroke();
  target.circle(mapped.x, mapped.y, 10);
  target.drawingContext.restore();
  target.pop();
}

function drawWatermark(target, size) {
  const palette = activePalette();
  const lightBackground = luminance(palette.background) > 150;
  const fillColor = lightBackground ? [255, 255, 255, 206] : [0, 0, 0, 172];
  const textColor = lightBackground ? [32, 33, 36, 218] : [255, 255, 255, 224];
  const label = `preview | seed ${recipe.seed} | ${recipe.paletteName}`;

  target.push();
  target.noStroke();
  target.fill(...fillColor);
  target.rect(size * 0.025, size * 0.92, size * 0.95, size * 0.055, 8);
  target.fill(...textColor);
  target.textAlign(CENTER, CENTER);
  target.textSize(Math.max(13, size * 0.018));
  target.text(label, size * 0.5, size * 0.947);
  target.pop();
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function updateSparkles() {
  if (!sparkLayer || !recipe || pathPoints.length === 0) return;

  const palette = activePalette();
  sparkLayer.clear();

  if (isPlaying && currentStep > 0 && currentStep < recipe.totalSteps) {
    emitSparkles(palette);
  }

  sparkLayer.push();
  sparkLayer.blendMode(ADD);
  for (let index = sparkles.length - 1; index >= 0; index -= 1) {
    const spark = sparkles[index];
    spark.life -= 1;
    spark.x += spark.vx;
    spark.y += spark.vy;
    spark.vx *= 0.965;
    spark.vy *= 0.965;

    if (spark.life <= 0) {
      sparkles.splice(index, 1);
      continue;
    }

    const progress = spark.life / spark.maxLife;
    const alpha = 220 * progress * progress;
    sparkLayer.noStroke();
    sparkLayer.fill(...spark.color, alpha);
    sparkLayer.circle(spark.x, spark.y, spark.size * (0.45 + progress));
  }
  sparkLayer.pop();
}

function emitSparkles(palette) {
  const mapped = mapPathIndexToCanvas(currentStep, canvasSize);
  const previousMapped = mapPathIndexToCanvas(currentStep - playDirection * playbackStride(), canvasSize);
  const angle = Math.atan2(mapped.y - previousMapped.y, mapped.x - previousMapped.x);
  const count = isDarkPalette(palette) ? 2 : 2;
  const color = sparkColorForPalette(palette);

  for (let index = 0; index < count; index += 1) {
    const sideSpray = random(-1.9, 1.9);
    const speed = random(canvasSize * 0.0016, canvasSize * 0.006);
    const direction = angle + Math.PI + sideSpray;
    const life = random(12, 28);
    sparkles.push({
      x: mapped.x + random(-2, 2),
      y: mapped.y + random(-2, 2),
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      life,
      maxLife: life,
      size: random(canvasSize * 0.0013, canvasSize * 0.0036),
      color,
    });
  }

  if (sparkles.length > SPARKLE_TRAIL_LIMIT) {
    sparkles.splice(0, sparkles.length - SPARKLE_TRAIL_LIMIT);
  }
}

function clearSparkles() {
  sparkles = [];
  if (sparkLayer) {
    sparkLayer.clear();
  }
}

function isDarkPalette(palette) {
  return luminance(palette.background) < 90;
}

function sparkColorForPalette(palette) {
  return isDarkPalette(palette) ? warmSparkColor(palette.points) : palette.points;
}

function warmSparkColor(baseColor) {
  return [
    Math.round(baseColor[0] * 0.55 + 255 * 0.45),
    Math.round(baseColor[1] * 0.5 + 220 * 0.5),
    Math.round(baseColor[2] * 0.35 + 95 * 0.65),
  ];
}

function rgbaString(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function trailAlphaForPalette(palette) {
  return clamp(Math.max(MIN_TRAIL_ALPHA, Number(palette.alpha)), MIN_TRAIL_ALPHA, 220);
}

function recentFadeWindowSteps(activeRecipe) {
  return repeatStepCount(activeRecipe) * (FRESH_TRAIL_REPEATS + RECENT_FADE_REPEATS);
}

function recentTrailOpacityForAge(ageSteps, activeRecipe) {
  const freshSteps = repeatStepCount(activeRecipe) * FRESH_TRAIL_REPEATS;
  if (ageSteps <= freshSteps) return 1;

  const fadeSteps = Math.max(1, repeatStepCount(activeRecipe) * RECENT_FADE_REPEATS);
  const fadeProgress = clamp((ageSteps - freshSteps) / fadeSteps, 0, 1);
  return Math.pow(1 - fadeProgress, 1.15);
}

function repeatStepCount(activeRecipe) {
  const repeatCount = Math.max(1, Number(activeRecipe.params?.repeatCount) || inferRepeatCount(activeRecipe));
  return Math.max(1, Math.round(activeRecipe.totalSteps / repeatCount));
}

function inferRepeatCount(activeRecipe) {
  if (activeRecipe.mode === "epicycle") {
    return Math.max(1, Math.round((activeRecipe.params?.tMax || TWO_PI_VALUE) / TWO_PI_VALUE));
  }

  const params = activeRecipe.params || {};
  const closeTurns = clamp(
    (params.rollingRadius || 1) / gcd(Math.round(params.fixedRadius || 1), Math.round(params.rollingRadius || 1)),
    1,
    64,
  );
  return Math.max(1, Math.round((params.tMax || TWO_PI_VALUE) / (TWO_PI_VALUE * closeTurns)));
}

function syncArtworkBackground(palette) {
  if (!ui.canvasStage || !palette) return;
  ui.canvasStage.style.setProperty("--artwork-background", `rgb(${palette.background.join(",")})`);
}

function emptyPathPoints() {
  return {
    fit: null,
    length: 0,
  };
}

function activePalette() {
  const index = recipe ? recipe.paletteIndex : 0;
  return palettes[index] || palettes[0] || FALLBACK_PALETTES[0];
}

function resolvePaletteIndex(value) {
  const index = Number(value);
  if (Number.isInteger(index) && index >= 0 && index < palettes.length) {
    return index;
  }
  return 0;
}

function rotatePoint(point, angle) {
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  return {
    x: point.x * cosAngle - point.y * sinAngle,
    y: point.x * sinAngle + point.y * cosAngle,
  };
}

function makeRecipeSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(rng, minValue, maxValue) {
  return minValue + rng() * (maxValue - minValue);
}

function randomInt(rng, minValue, maxValue) {
  return Math.floor(randomBetween(rng, minValue, maxValue + 1));
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

function roundForRecipe(value) {
  return Math.round(value * 1000000) / 1000000;
}

function luminance(rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
