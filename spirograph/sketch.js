// Spirograph Playground
// Run from the repo root with: python3 -m http.server 8000
// Then open: http://localhost:8000/sketches/p5js/spirograph_playground/

const PALETTE_URL = "./palettes.yml";
const FALLBACK_PALETTES = [
  { name: "fallback_black_on_white", background: [255, 255, 255], points: [0, 0, 0] },
];
const DEFAULT_BG = [255, 255, 255];
const DEFAULT_FG = [0, 0, 0];
const TRAIL_ALPHA = 180;
const TWO_PI_VALUE = Math.PI * 2;
const PREVIEW_EXPORT_SIZE = 900;
const MAX_PLAYBACK_STEPS_PER_FRAME = 2400;
const MAX_TOTAL_STEPS = 10000000;
const GENERATED_TOTAL_STEPS = MAX_TOTAL_STEPS;
const MAX_REDRAW_VERTICES = 140000;
const FIT_SAMPLE_POINTS = 120000;
const MIN_DRAW_SPEED = 0.01;
const MAX_DRAW_SPEED = 1;
const DISPLAY_FRAME_RATE = 60;
const RECIPE_VERSION = 4;
const PERMANENT_TRAIL_OPACITY = 0.1;
const RECENT_TRAIL_OPACITY = 0.9;
const FRESH_TRAIL_REPEATS = 1;
const RECENT_FADE_REPEATS = 6;
const RECENT_FADE_CHUNKS = 18;
const RECENT_TRAIL_DECAY_REMAINDER = 0.06;
const RECENT_CHUNK_VERTEX_LIMIT = 9000;
const TRAIL_CAP_ROUND = "round";
const TRAIL_CAP_BUTT = "butt";
const PLAYBACK_PLAYING = "playing";
const PLAYBACK_PAUSED = "paused";
const PLAYBACK_ENDING = "ending";
const END_TRANSITION_MS = 1200;
const CONTROLS_WIDTH_STORAGE_KEY = "spirographPlaygroundControlsWidth";
const DEFAULT_CONTROLS_WIDTH = 360;
const MIN_CONTROLS_WIDTH = 280;
const MAX_CONTROLS_WIDTH = 520;
const MIN_CANVAS_PANE_WIDTH = 340;

// Outer (stationary) shapes — each defines a radius-vs-angle function r(t),
// giving the distance from origin to the perimeter at angle t. This drives
// the "approximate rolling" generalization of the trochoid formula.
const OUTER_SHAPES = [
  { id: "circle", label: "Circle" },
  { id: "square", label: "Square" },
  { id: "triangle", label: "Triangle" },
  { id: "star", label: "Star" },
];
const STAR_POINTS = 5;
const STAR_AMPLITUDE = 0.28;

const OUTER_SIZES = [
  { id: "size96", label: "96", radius: 96 },
  { id: "size120", label: "120", radius: 120 },
];
const OUTER_VARIANTS = [
  { id: "hypotrochoid", label: "Inside" },
  { id: "epitrochoid", label: "Outside" },
];

// Inner (rolling) shapes. Ellipse-style shapes scale the pen offset; the
// half-circle traces a folded arc for a different wheel feel.
const INNER_SHAPES = [
  { id: "circle", label: "Circle", aspectX: 1, aspectY: 1 },
  { id: "ellipseWide", label: "Oval H", aspectX: 1.4, aspectY: 0.7 },
  { id: "halfCircle", label: "Half circle", aspectX: 1, aspectY: 1 },
];

const ROLLING_WHEELS = [
  { id: "wheel24", label: "24", radius: 24 },
  { id: "wheel32", label: "32", radius: 32 },
  { id: "wheel40", label: "40", radius: 40 },
  { id: "wheel52", label: "52", radius: 52 },
  { id: "wheel64", label: "64", radius: 64 },
];
const PEN_HOLES = [
  { id: "nearCenter", label: "Near center", ratio: 0.34 },
  { id: "middle", label: "Middle", ratio: 0.62 },
  { id: "nearEdge", label: "Near edge", ratio: 0.88 },
  { id: "outerReach", label: "Outer reach", ratio: 1.16 },
];

const OUTER_SHAPE_BY_ID = Object.fromEntries(OUTER_SHAPES.map((shape) => [shape.id, shape]));
const OUTER_SIZE_BY_ID = Object.fromEntries(OUTER_SIZES.map((size) => [size.id, size]));
const OUTER_VARIANT_BY_ID = Object.fromEntries(OUTER_VARIANTS.map((variant) => [variant.id, variant]));
const INNER_SHAPE_BY_ID = Object.fromEntries(INNER_SHAPES.map((shape) => [shape.id, shape]));
const ROLLING_WHEEL_BY_ID = Object.fromEntries(ROLLING_WHEELS.map((wheel) => [wheel.id, wheel]));
const PEN_HOLE_BY_ID = Object.fromEntries(PEN_HOLES.map((hole) => [hole.id, hole]));

let ui = {};
let palettes = FALLBACK_PALETTES.slice();
let recipe = null;
let pathPoints = emptyPathPoints();
let baseTrailLayer = null;
let recentTrailLayer = null;
let canvasSize = 720;
let currentStep = 0;
let renderedStep = 0;
let playbackState = PLAYBACK_PLAYING;
let endingTransition = null;
let activePanePointerId = null;
let resizeObserver = null;
let resizeRaf = 0;

function setup() {
  pixelDensity(1);
  const canvas = createCanvas(10, 10);
  canvas.parent("canvasMount");
  canvas.elt.addEventListener("contextmenu", (event) => event.preventDefault());

  cacheUi();
  buildShapeControls();
  installUiEvents();
  installPaneResizing();
  ui.speedRange.value = formatSpeedValue(MAX_DRAW_SPEED);
  syncSpeedUi();
  resizeArtworkCanvas();

  loadPalettes().then((loadedPalettes) => {
    palettes = loadedPalettes.length > 0 ? loadedPalettes : FALLBACK_PALETTES.slice();
    buildSwatchGrids();
    randomizeArtwork();
  });
}

function uniquePaletteColors(paletteList) {
  const seen = new Map();
  paletteList.forEach((palette) => {
    [palette.background, palette.points].forEach((rgb) => {
      if (!Array.isArray(rgb) || rgb.length !== 3) return;
      const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
      if (!seen.has(key)) {
        seen.set(key, rgb.slice());
      }
    });
  });
  // Sort by luminance so the swatch row reads light-to-dark consistently.
  return Array.from(seen.values()).sort((a, b) => luminance(b) - luminance(a));
}

function buildSwatchGrids() {
  if (!ui.bgSwatchGrid || !ui.fgSwatchGrid) return;
  const colors = uniquePaletteColors(palettes);
  [ui.bgSwatchGrid, ui.fgSwatchGrid].forEach((grid) => {
    grid.innerHTML = "";
    colors.forEach((rgb) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-btn";
      btn.dataset.rgb = `${rgb[0]},${rgb[1]},${rgb[2]}`;
      btn.style.backgroundColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
      btn.setAttribute("aria-label", `Color rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      grid.appendChild(btn);
    });
  });
  syncSwatchSelection();
}

function parseSwatchRgb(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(",").map((piece) => Number(piece.trim()));
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return null;
  return parts.map((piece) => clamp(Math.round(piece), 0, 255));
}

function syncSwatchSelection() {
  if (!ui.bgSwatchGrid || !ui.fgSwatchGrid) return;
  const bgKey = recipe ? rgbKey(recipe.colors.background) : null;
  const fgKey = recipe ? rgbKey(recipe.colors.points) : null;
  markActiveSwatch(ui.bgSwatchGrid, bgKey);
  markActiveSwatch(ui.fgSwatchGrid, fgKey);
}

function markActiveSwatch(grid, activeKey) {
  grid.querySelectorAll("[data-rgb]").forEach((btn) => {
    const matches = btn.dataset.rgb === activeKey;
    btn.classList.toggle("is-active", matches);
    btn.setAttribute("aria-checked", String(matches));
  });
}

function rgbKey(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) return null;
  return `${rgb[0]},${rgb[1]},${rgb[2]}`;
}

function draw() {
  if (!recipe || pathPoints.length === 0 || !baseTrailLayer || !recentTrailLayer) {
    background(245, 243, 238);
    return;
  }

  if (playbackState === PLAYBACK_PLAYING) {
    advancePlayback();
  }

  if (playbackState === PLAYBACK_ENDING) {
    drawEndingTransition();
    return;
  }

  const colors = activeColors();
  syncArtworkBackground(colors);
  background(...colors.background);
  image(baseTrailLayer, 0, 0);
  image(recentTrailLayer, 0, 0);
}

function windowResized() {
  resizeArtworkCanvas();
}

function cacheUi() {
  ui = {
    modeSelect: document.getElementById("modeSelect"),
    shapeControls: document.getElementById("shapeControls"),
    outerShapeRow: document.getElementById("outerShapeRow"),
    outerVariantRow: document.getElementById("outerVariantRow"),
    outerSizeRow: document.getElementById("outerSizeRow"),
    innerShapeRow: document.getElementById("innerShapeRow"),
    wheelSizeRow: document.getElementById("wheelSizeRow"),
    wheelIcon: document.getElementById("wheelIcon"),
    wheelOutline: document.getElementById("wheelOutline"),
    penHoleDots: document.getElementById("penHoleDots"),
    epicycleControls: document.getElementById("epicycleControls"),
    epiSymmetryRange: document.getElementById("epiSymmetryRange"),
    epiSymmetryValue: document.getElementById("epiSymmetryValue"),
    epiWobbleAmountRange: document.getElementById("epiWobbleAmountRange"),
    epiWobbleAmountValue: document.getElementById("epiWobbleAmountValue"),
    epiWobbleFreqRange: document.getElementById("epiWobbleFreqRange"),
    epiWobbleFreqValue: document.getElementById("epiWobbleFreqValue"),
    epiRotationDriftRange: document.getElementById("epiRotationDriftRange"),
    epiRotationDriftValue: document.getElementById("epiRotationDriftValue"),
    bgSwatchGrid: document.getElementById("bgSwatchGrid"),
    fgSwatchGrid: document.getElementById("fgSwatchGrid"),
    randomizeBtn: document.getElementById("randomizeBtn"),
    restartBtn: document.getElementById("restartBtn"),
    playPauseBtn: document.getElementById("playPauseBtn"),
    jumpEndBtn: document.getElementById("jumpEndBtn"),
    fullscreenBtn: document.getElementById("fullscreenBtn"),
    fullscreenExitBtn: document.getElementById("fullscreenExitBtn"),
    speedRange: document.getElementById("speedRange"),
    speedValue: document.getElementById("speedValue"),
    progressRange: document.getElementById("progressRange"),
    progressValue: document.getElementById("progressValue"),
    savePreviewBtn: document.getElementById("savePreviewBtn"),
    copyRecipeBtn: document.getElementById("copyRecipeBtn"),
    saveRecipeBtn: document.getElementById("saveRecipeBtn"),
    loadRecipeBtn: document.getElementById("loadRecipeBtn"),
    recipeBox: document.getElementById("recipeBox"),
    appShell: document.querySelector(".app-shell"),
    canvasStage: document.querySelector(".canvas-stage"),
    paneDivider: document.getElementById("paneDivider"),
    controlsPane: document.getElementById("controlsPane"),
    controlsToggleBtn: document.getElementById("controlsToggleBtn"),
    mobileRandomBtn: document.getElementById("mobileRandomBtn"),
    mobilePlayPauseBtn: document.getElementById("mobilePlayPauseBtn"),
    mobileFullscreenBtn: document.getElementById("mobileFullscreenBtn"),
  };
}

function buildShapeControls() {
  ui.outerShapeRow.innerHTML = "";
  ui.outerVariantRow.innerHTML = "";
  ui.outerSizeRow.innerHTML = "";
  ui.innerShapeRow.innerHTML = "";
  ui.wheelSizeRow.innerHTML = "";
  ui.penHoleDots.innerHTML = "";

  OUTER_SHAPES.forEach((shape) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-btn";
    button.dataset.outerShapeId = shape.id;
    button.dataset.tooltip = shape.label;
    button.setAttribute("aria-label", `${shape.label} outer piece`);
    button.title = shape.label;
    button.innerHTML = outerShapeIconSvg(shape.id);
    ui.outerShapeRow.appendChild(button);
  });

  OUTER_VARIANTS.forEach((variant) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-btn";
    button.dataset.variantId = variant.id;
    button.dataset.tooltip = variant.label;
    button.setAttribute("aria-label", `${variant.label} (${variant.id})`);
    button.title = variant.label;
    button.innerHTML = outerVariantIconSvg(variant.id);
    ui.outerVariantRow.appendChild(button);
  });

  OUTER_SIZES.forEach((size) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "size-btn";
    button.dataset.outerSizeId = size.id;
    button.textContent = size.label;
    button.setAttribute("aria-label", `Outer radius ${size.radius}`);
    ui.outerSizeRow.appendChild(button);
  });

  INNER_SHAPES.forEach((shape) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-btn";
    button.dataset.innerShapeId = shape.id;
    button.dataset.tooltip = shape.label;
    button.setAttribute("aria-label", `${shape.label} inner wheel`);
    button.title = shape.label;
    button.innerHTML = innerShapeIconSvg(shape.id);
    ui.innerShapeRow.appendChild(button);
  });

  ROLLING_WHEELS.forEach((wheel) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "size-btn";
    button.dataset.wheelId = wheel.id;
    button.textContent = wheel.label;
    button.setAttribute("aria-label", `Wheel radius ${wheel.radius}`);
    ui.wheelSizeRow.appendChild(button);
  });

  const wheelIconRadius = 32;
  const svgNs = "http://www.w3.org/2000/svg";
  PEN_HOLES.forEach((hole) => {
    const cx = wheelIconRadius * hole.ratio;
    const dot = document.createElementNS(svgNs, "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", "0");
    dot.setAttribute("r", "3.4");
    dot.classList.add("pen-hole-dot");
    dot.dataset.penHoleId = hole.id;
    const title = document.createElementNS(svgNs, "title");
    title.textContent = hole.label;
    dot.appendChild(title);
    ui.penHoleDots.appendChild(dot);
  });
}

function outerShapeIconSvg(shapeId) {
  switch (shapeId) {
    case "square":
      return '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="6" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>';
    case "triangle":
      return '<svg viewBox="0 0 40 40" aria-hidden="true"><polygon points="20,5 34,33 6,33" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" /></svg>';
    case "star":
      return '<svg viewBox="0 0 40 40" aria-hidden="true"><polygon points="20,4 24,16 36,16 26,23 30,35 20,28 10,35 14,23 4,16 16,16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>';
    case "circle":
    default:
      return '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>';
  }
}

function outerVariantIconSvg(variantId) {
  if (variantId === "epitrochoid") {
    return '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="16" cy="20" r="9" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="29" cy="20" r="4" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>';
  }
  return '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="20" cy="20" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" /></svg>';
}

function innerShapeIconSvg(shapeId) {
  switch (shapeId) {
    case "ellipseWide":
      return '<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="20" rx="15" ry="8" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>';
    case "halfCircle":
      return '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 25 A13 13 0 0 1 33 25 L7 25 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" /></svg>';
    case "circle":
    default:
      return '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>';
  }
}

function installUiEvents() {
  ui.modeSelect.addEventListener("change", () => {
    randomizeArtwork({ mode: ui.modeSelect.value });
  });

  ui.randomizeBtn.addEventListener("click", () => randomizeArtwork());
  ui.restartBtn.addEventListener("click", restartArtwork);
  ui.playPauseBtn.addEventListener("click", togglePlayback);
  ui.jumpEndBtn.addEventListener("click", jumpToEnd);
  ui.fullscreenBtn.addEventListener("click", enterFullscreen);
  ui.fullscreenExitBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    exitAppFullscreen();
  });
  ui.mobileRandomBtn.addEventListener("click", () => randomizeArtwork());
  ui.mobilePlayPauseBtn.addEventListener("click", togglePlayback);
  ui.mobileFullscreenBtn.addEventListener("click", enterFullscreen);
  ui.controlsToggleBtn.addEventListener("click", toggleControlsDrawer);

  ui.canvasStage.addEventListener("click", handleCanvasStageTap);

  ui.outerShapeRow.addEventListener("click", (event) => {
    const target = event.target.closest("[data-outer-shape-id]");
    if (!target) return;
    applyShapeChange({ outerShapeId: target.dataset.outerShapeId });
  });
  ui.outerVariantRow.addEventListener("click", (event) => {
    const target = event.target.closest("[data-variant-id]");
    if (!target) return;
    applyShapeChange({ variantId: target.dataset.variantId });
  });
  ui.outerSizeRow.addEventListener("click", (event) => {
    const target = event.target.closest("[data-outer-size-id]");
    if (!target) return;
    applyShapeChange({ outerSizeId: target.dataset.outerSizeId });
  });
  ui.innerShapeRow.addEventListener("click", (event) => {
    const target = event.target.closest("[data-inner-shape-id]");
    if (!target) return;
    applyShapeChange({ innerShapeId: target.dataset.innerShapeId });
  });
  ui.wheelSizeRow.addEventListener("click", (event) => {
    const target = event.target.closest("[data-wheel-id]");
    if (!target) return;
    applyShapeChange({ wheelId: target.dataset.wheelId });
  });
  ui.penHoleDots.addEventListener("click", (event) => {
    const target = event.target.closest("[data-pen-hole-id]");
    if (!target) return;
    applyShapeChange({ penHoleId: target.dataset.penHoleId });
  });

  ui.epiSymmetryRange.addEventListener("input", () => applyEpicycleChange("symmetry", Number(ui.epiSymmetryRange.value)));
  ui.epiWobbleAmountRange.addEventListener("input", () => applyEpicycleChange("wobbleAmount", Number(ui.epiWobbleAmountRange.value)));
  ui.epiWobbleFreqRange.addEventListener("input", () => applyEpicycleChange("wobbleFrequency", Number(ui.epiWobbleFreqRange.value)));
  ui.epiRotationDriftRange.addEventListener("input", () => applyEpicycleChange("rotationDrift", Number(ui.epiRotationDriftRange.value) * Math.PI));

  ui.bgSwatchGrid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-rgb]");
    if (!target) return;
    applyColorChangeRgb("background", parseSwatchRgb(target.dataset.rgb));
  });
  ui.fgSwatchGrid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-rgb]");
    if (!target) return;
    applyColorChangeRgb("points", parseSwatchRgb(target.dataset.rgb));
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
    clearEndingTransition();
    playbackState = PLAYBACK_PAUSED;
    currentStep = Number(ui.progressRange.value);
    renderTrailToStep(currentStep);
    syncPlaybackUi();
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

function installPaneResizing() {
  if (!ui.appShell || !ui.paneDivider || !ui.controlsPane) return;

  const storedWidth = readStoredControlsWidth();
  if (storedWidth) {
    setControlsPaneWidth(storedWidth, { persist: false });
  }
  clampControlsPaneWidth();

  ui.paneDivider.addEventListener("pointerdown", startPaneResize);
  ui.paneDivider.addEventListener("pointermove", movePaneResize);
  ui.paneDivider.addEventListener("pointerup", endPaneResize);
  ui.paneDivider.addEventListener("pointercancel", endPaneResize);
  ui.paneDivider.addEventListener("lostpointercapture", endPaneResize);
  ui.paneDivider.addEventListener("keydown", handlePaneDividerKeydown);
  window.addEventListener("pointermove", movePaneResize);
  window.addEventListener("pointerup", endPaneResize);
  window.addEventListener("pointercancel", endPaneResize);
  window.addEventListener("blur", endPaneResize);

  window.addEventListener("resize", () => {
    clampControlsPaneWidth();
    scheduleArtworkResize();
  });

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(scheduleArtworkResize);
    resizeObserver.observe(ui.canvasStage);
    resizeObserver.observe(ui.controlsPane);
  }
}

function readStoredControlsWidth() {
  try {
    const value = Number(window.localStorage.getItem(CONTROLS_WIDTH_STORAGE_KEY));
    return Number.isFinite(value) ? value : null;
  } catch (error) {
    return null;
  }
}

function controlsPaneWidthBounds() {
  const shellWidth = ui.appShell?.getBoundingClientRect().width || window.innerWidth;
  const maxWidth = Math.max(
    MIN_CONTROLS_WIDTH,
    Math.min(MAX_CONTROLS_WIDTH, shellWidth - MIN_CANVAS_PANE_WIDTH - 24),
  );

  return {
    min: Math.min(MIN_CONTROLS_WIDTH, maxWidth),
    max: maxWidth,
  };
}

function getCurrentControlsPaneWidth() {
  const measuredWidth = ui.controlsPane?.getBoundingClientRect().width;
  if (Number.isFinite(measuredWidth) && measuredWidth > 0) return measuredWidth;

  const cssWidth = Number.parseFloat(getComputedStyle(ui.appShell).getPropertyValue("--controls-width"));
  return Number.isFinite(cssWidth) ? cssWidth : DEFAULT_CONTROLS_WIDTH;
}

function setControlsPaneWidth(width, options = {}) {
  if (!ui.appShell) return;
  const { persist = true } = options;
  const bounds = controlsPaneWidthBounds();
  const safeWidth = Number.isFinite(Number(width)) ? Number(width) : DEFAULT_CONTROLS_WIDTH;
  const nextWidth = clamp(Math.round(safeWidth), bounds.min, bounds.max);

  ui.appShell.style.setProperty("--controls-width", `${nextWidth}px`);

  if (ui.paneDivider) {
    ui.paneDivider.setAttribute("aria-valuemin", String(Math.round(bounds.min)));
    ui.paneDivider.setAttribute("aria-valuemax", String(Math.round(bounds.max)));
    ui.paneDivider.setAttribute("aria-valuenow", String(nextWidth));
  }

  if (persist) {
    try {
      window.localStorage.setItem(CONTROLS_WIDTH_STORAGE_KEY, String(nextWidth));
    } catch (error) {
      // Local storage can be unavailable under file or privacy settings.
    }
  }

  scheduleArtworkResize();
}

function clampControlsPaneWidth() {
  if (!isDesktopSplitLayout()) {
    scheduleArtworkResize();
    return;
  }

  setControlsPaneWidth(getCurrentControlsPaneWidth(), { persist: false });
}

function isDesktopSplitLayout() {
  return window.matchMedia("(min-width: 861px)").matches;
}

function startPaneResize(event) {
  if (!isDesktopSplitLayout()) return;
  endPaneResize();
  activePanePointerId = event.pointerId;
  ui.paneDivider.classList.add("is-dragging");
  document.body.classList.add("is-resizing-pane");
  ui.paneDivider.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  updateControlsPaneWidthFromPointer(event.clientX, false);
}

function movePaneResize(event) {
  if (activePanePointerId === null) return;
  if (event.pointerId !== undefined && event.pointerId !== activePanePointerId) return;
  event.preventDefault();
  updateControlsPaneWidthFromPointer(event.clientX, false);
}

function endPaneResize(event = {}) {
  const wasDragging = ui.paneDivider?.classList.contains("is-dragging");
  if (activePanePointerId === null && !wasDragging) return;
  if (event.pointerId !== undefined && activePanePointerId !== null && event.pointerId !== activePanePointerId) {
    return;
  }

  const pointerId = event.pointerId ?? activePanePointerId;
  activePanePointerId = null;
  ui.paneDivider.classList.remove("is-dragging");
  document.body.classList.remove("is-resizing-pane");
  try {
    if (pointerId !== null) {
      ui.paneDivider.releasePointerCapture?.(pointerId);
    }
  } catch (error) {
    // The pointer may already be released after cancellation.
  }
  setControlsPaneWidth(getCurrentControlsPaneWidth());
}

function updateControlsPaneWidthFromPointer(clientX, persist) {
  const shellRect = ui.appShell.getBoundingClientRect();
  setControlsPaneWidth(shellRect.right - clientX, { persist });
}

function handlePaneDividerKeydown(event) {
  if (!isDesktopSplitLayout()) return;

  const bounds = controlsPaneWidthBounds();
  const currentWidth = getCurrentControlsPaneWidth();
  const nudge = event.shiftKey ? 48 : 16;
  let nextWidth = null;

  if (event.key === "ArrowLeft") nextWidth = currentWidth + nudge;
  if (event.key === "ArrowRight") nextWidth = currentWidth - nudge;
  if (event.key === "Home") nextWidth = bounds.min;
  if (event.key === "End") nextWidth = bounds.max;
  if (nextWidth === null) return;

  event.preventDefault();
  setControlsPaneWidth(nextWidth);
}

function scheduleArtworkResize() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    resizeArtworkCanvas();
  });
}

function handleCanvasStageTap(event) {
  if (!ui.canvasStage.classList.contains("is-app-fullscreen")) return;
  if (event.target.closest(".fullscreen-toolbar")) return;
  ui.canvasStage.classList.toggle("controls-visible");
}

async function loadPalettes() {
  try {
    const response = await fetch(PALETTE_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Palette request failed: ${response.status}`);
    }
    return parsePaletteYaml(await response.text());
  } catch (error) {
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
  });

  pushPaletteIfValid(parsed, current);
  return parsed;
}

function pushPaletteIfValid(list, item) {
  if (!item) return;
  const hasRgb = Array.isArray(item.background) && Array.isArray(item.points);
  if (!item.name || !hasRgb) return;
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

function randomizeArtwork(overrides = {}) {
  const mode = overrides.mode || ui.modeSelect.value || "classic";
  const seed = makeRecipeSeed();
  const colors = overrides.colors || pickRandomColors(seed);
  const shapeSelection = overrides.shapeSelection;
  const nextRecipe = makeRecipe({ mode, seed, colors, shapeSelection });
  applyRecipe(nextRecipe, { startPlaying: true });
}

function pickRandomColors(seed, avoidColors = null) {
  if (palettes.length === 0) {
    return { background: DEFAULT_BG.slice(), points: DEFAULT_FG.slice() };
  }
  const avoidBgKey = avoidColors ? rgbKey(avoidColors.background) : null;
  const avoidPointKey = avoidColors ? rgbKey(avoidColors.points) : null;
  const candidates =
    avoidBgKey || avoidPointKey
      ? palettes.filter((palette) => {
          return rgbKey(palette.background) !== avoidBgKey || rgbKey(palette.points) !== avoidPointKey;
        })
      : palettes;
  const paletteChoices = candidates.length > 0 ? candidates : palettes;
  const rng = mulberry32(seed ^ 0xa1b2c3d4);
  const choice = paletteChoices[Math.floor(rng() * paletteChoices.length) % paletteChoices.length];
  return {
    background: choice.background.slice(),
    points: choice.points.slice(),
  };
}

function makeRecipe({ mode, seed, colors, shapeSelection }) {
  const safeMode = mode === "epicycle" ? "epicycle" : "classic";
  const safeColors = normalizeColors(colors);
  const generated =
    safeMode === "epicycle" ? makeEpicycleParams(seed) : makeClassicParams(seed, shapeSelection);

  return {
    version: RECIPE_VERSION,
    app: "spirograph_playground",
    mode: safeMode,
    seed,
    colors: safeColors,
    canvas: { aspect: 1 },
    totalSteps: generated.totalSteps,
    drawSpeed: normalizeDrawSpeed(ui.speedRange.value),
    ...(generated.shape ? { shape: generated.shape } : {}),
    params: generated.params,
  };
}

function applyRecipe(nextRecipe, options = {}) {
  clearEndingTransition();
  recipe = normalizeRecipe(nextRecipe);
  pathPoints = generatePathPoints(recipe);
  currentStep = clamp(Math.round(Number(recipe.currentStep || 0)), 0, recipe.totalSteps);
  renderedStep = 0;
  playbackState = options.startPlaying ? PLAYBACK_PLAYING : PLAYBACK_PAUSED;

  ui.modeSelect.value = recipe.mode;
  ui.speedRange.value = formatSpeedValue(recipe.drawSpeed);
  ui.progressRange.max = String(recipe.totalSteps);
  ui.progressRange.value = String(currentStep);
  syncSwatchSelection();

  syncArtworkBackground(recipe.colors);
  syncShapeControls();
  syncEpicycleControls();
  syncSpeedUi();
  syncRecipeBox();
  renderTrailToStep(currentStep);
  syncProgressUi();
  syncPlaybackUi();
  syncFullscreenUi();
}

function normalizeRecipe(source) {
  const mode = source.mode === "epicycle" ? "epicycle" : "classic";
  const seed = Number.isFinite(Number(source.seed)) ? Number(source.seed) >>> 0 : makeRecipeSeed();
  const colors = colorsFromRecipeSource(source, seed);
  const fallback = makeRecipe({ mode, seed, colors, shapeSelection: source.shape });
  const totalSteps = clamp(
    Math.round(Number(source.totalSteps || fallback.totalSteps)),
    1200,
    MAX_TOTAL_STEPS,
  );
  const drawSpeed = normalizeDrawSpeed(source.drawSpeed ?? ui.speedRange.value);
  const currentStepValue = clamp(Math.round(Number(source.currentStep || 0)), 0, totalSteps);
  const progressPercent = totalSteps > 0 ? roundForRecipe((currentStepValue / totalSteps) * 100) : 0;
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
    colors,
    canvas: { aspect: 1 },
    totalSteps,
    drawSpeed,
    currentStep: currentStepValue,
    progressPercent,
    ...(shape ? { shape } : {}),
    params,
  };
}

function colorsFromRecipeSource(source, seed) {
  if (source.colors && Array.isArray(source.colors.background) && Array.isArray(source.colors.points)) {
    return normalizeColors(source.colors);
  }
  if (source.paletteName) {
    const found = palettes.find((palette) => palette.name === source.paletteName);
    if (found) return normalizeColors({ background: found.background, points: found.points });
  }
  if (Number.isInteger(source.paletteIndex) && palettes[source.paletteIndex]) {
    const palette = palettes[source.paletteIndex];
    return normalizeColors({ background: palette.background, points: palette.points });
  }
  return pickRandomColors(seed);
}

function normalizeColors(colors) {
  const background = Array.isArray(colors?.background) ? clampRgb(colors.background) : DEFAULT_BG.slice();
  const points = Array.isArray(colors?.points) ? clampRgb(colors.points) : DEFAULT_FG.slice();
  return { background, points };
}

function clampRgb(rgb) {
  return [0, 1, 2].map((i) => clamp(Math.round(Number(rgb[i]) || 0), 0, 255));
}

function applyShapeChange(partial) {
  if (!recipe || recipe.mode !== "classic") return;
  const nextShape = { ...recipe.shape, ...partial };
  const generated = makeClassicParams(recipe.seed, nextShape);
  recipe.shape = generated.shape;
  recipe.params = generated.params;
  pathPoints = generatePathPoints(recipe);
  currentStep = clamp(currentStep, 0, recipe.totalSteps);
  syncShapeControls();
  syncRecipeBox();
  renderTrailToStep(currentStep);
  syncProgressUi();
}

function applyEpicycleChange(key, value) {
  if (!recipe || recipe.mode !== "epicycle") return;
  recipe.params = normalizeEpicycleParams({ ...recipe.params, [key]: value });
  pathPoints = generatePathPoints(recipe);
  currentStep = clamp(currentStep, 0, recipe.totalSteps);
  syncEpicycleControls();
  syncRecipeBox();
  renderTrailToStep(currentStep);
  syncProgressUi();
}

function applyColorChange(channel, hexValue) {
  const rgb = hexToRgb(hexValue);
  if (!rgb) return;
  applyColorChangeRgb(channel, rgb);
}

function applyColorChangeRgb(channel, rgb) {
  if (!recipe || !Array.isArray(rgb) || rgb.length !== 3) return;
  recipe.colors = normalizeColors({ ...recipe.colors, [channel]: rgb });
  syncArtworkBackground(recipe.colors);
  syncSwatchSelection();
  renderTrailToStep(currentStep);
  syncRecipeBox();
}

function syncShapeControls() {
  if (!ui.shapeControls) return;
  const classicActive = recipe?.mode === "classic";
  ui.shapeControls.classList.toggle("is-disabled", !classicActive);
  ui.shapeControls.hidden = !classicActive;
  ui.epicycleControls.hidden = classicActive;

  if (!classicActive || !recipe.shape) return;

  markActiveButtons(ui.outerShapeRow, "outerShapeId", recipe.shape.outerShapeId);
  markActiveButtons(ui.outerVariantRow, "variantId", recipe.shape.variantId);
  markActiveButtons(ui.outerSizeRow, "outerSizeId", recipe.shape.outerSizeId);
  markActiveButtons(ui.innerShapeRow, "innerShapeId", recipe.shape.innerShapeId);
  markActiveButtons(ui.wheelSizeRow, "wheelId", recipe.shape.wheelId);

  ui.penHoleDots.querySelectorAll("[data-pen-hole-id]").forEach((dot) => {
    const matches = dot.dataset.penHoleId === recipe.shape.penHoleId;
    dot.classList.toggle("is-active", matches);
  });

  // Update wheel preview to reflect inner ellipse vs. circle.
  const innerShape = INNER_SHAPE_BY_ID[recipe.shape.innerShapeId] || INNER_SHAPES[0];
  if (ui.wheelOutline) {
    ui.wheelOutline.setAttribute("rx", String(32 * innerShape.aspectX));
    ui.wheelOutline.setAttribute("ry", String(32 * innerShape.aspectY));
  }
}

function markActiveButtons(row, datasetKey, activeValue) {
  if (!row) return;
  const datasetAttr = `data-${datasetKey.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
  row.querySelectorAll(`[${datasetAttr}]`).forEach((btn) => {
    const matches = btn.dataset[datasetKey] === activeValue;
    btn.classList.toggle("is-active", matches);
    btn.setAttribute("aria-pressed", String(matches));
  });
}

function syncEpicycleControls() {
  if (!ui.epicycleControls) return;
  const epicycleActive = recipe?.mode === "epicycle";
  ui.epicycleControls.hidden = !epicycleActive;
  if (!epicycleActive || !recipe.params) return;

  const symmetry = Math.round(Number(recipe.params.symmetry) || 4);
  const wobbleAmount = Number(recipe.params.wobbleAmount) || 0;
  const wobbleFreq = Number(recipe.params.wobbleFrequency) || 1;
  const driftPi = (Number(recipe.params.rotationDrift) || 0) / Math.PI;

  ui.epiSymmetryRange.value = String(clamp(symmetry, 3, 9));
  ui.epiSymmetryValue.textContent = String(clamp(symmetry, 3, 9));
  ui.epiWobbleAmountRange.value = String(clamp(wobbleAmount, 0, 0.2));
  ui.epiWobbleAmountValue.textContent = wobbleAmount.toFixed(2);
  ui.epiWobbleFreqRange.value = String(clamp(wobbleFreq, 0.5, 8));
  ui.epiWobbleFreqValue.textContent = wobbleFreq.toFixed(1);
  ui.epiRotationDriftRange.value = String(clamp(driftPi, -10, 10));
  ui.epiRotationDriftValue.textContent = driftPi.toFixed(1);
}

// Recipes from v3 used `shape.fixedPieceId` (e.g. "ring96", "outer72"). Map
// these onto the new outer-shape / outer-size / variant axes so old saves
// still load.
const LEGACY_FIXED_PIECE_MAP = {
  ring96: { outerSizeId: "size96", variantId: "hypotrochoid" },
  ring120: { outerSizeId: "size120", variantId: "hypotrochoid" },
  outer72: { outerSizeId: "size96", variantId: "epitrochoid" },
  outer96: { outerSizeId: "size96", variantId: "epitrochoid" },
};

function normalizeOuterShapeId(shapeId, fallback = "circle") {
  if (OUTER_SHAPE_BY_ID[shapeId]) return shapeId;
  if (shapeId === "hexagon") return "triangle";
  return OUTER_SHAPE_BY_ID[fallback] ? fallback : null;
}

function normalizeInnerShapeId(shapeId, fallback = "circle") {
  if (INNER_SHAPE_BY_ID[shapeId]) return shapeId;
  if (shapeId === "ellipseTall") return "halfCircle";
  return INNER_SHAPE_BY_ID[fallback] ? fallback : null;
}

function normalizeClassicShape(sourceShape, params) {
  const inferred = shapeFromClassicParams(params);
  const legacy = sourceShape?.fixedPieceId ? LEGACY_FIXED_PIECE_MAP[sourceShape.fixedPieceId] : null;

  const outerShapeId = normalizeOuterShapeId(sourceShape?.outerShapeId, inferred.outerShapeId);
  const outerSizeId = OUTER_SIZE_BY_ID[sourceShape?.outerSizeId]
    ? sourceShape.outerSizeId
    : legacy?.outerSizeId || inferred.outerSizeId;
  const variantId = OUTER_VARIANT_BY_ID[sourceShape?.variantId]
    ? sourceShape.variantId
    : legacy?.variantId || inferred.variantId;
  const innerShapeId = normalizeInnerShapeId(sourceShape?.innerShapeId, inferred.innerShapeId);
  const wheelId = ROLLING_WHEEL_BY_ID[sourceShape?.wheelId] ? sourceShape.wheelId : inferred.wheelId;
  const penHoleId = PEN_HOLE_BY_ID[sourceShape?.penHoleId] ? sourceShape.penHoleId : inferred.penHoleId;

  return { outerShapeId, outerSizeId, variantId, innerShapeId, wheelId, penHoleId };
}

function shapeFromClassicParams(params = {}) {
  const variantId = params.variant === "epitrochoid" ? "epitrochoid" : "hypotrochoid";
  const outerShapeId = normalizeOuterShapeId(params.outerShapeId, "circle");
  const outerSize = closestBy(OUTER_SIZES, params.fixedRadius || OUTER_SIZES[0].radius, "radius");
  const innerShapeId = normalizeInnerShapeId(params.innerShapeId, "circle");
  const wheel = closestBy(ROLLING_WHEELS, params.rollingRadius || ROLLING_WHEELS[0].radius, "radius");
  const penRatio = wheel.radius > 0 ? (params.penDistance || wheel.radius * 0.62) / wheel.radius : 0.62;
  const penHole = closestBy(PEN_HOLES, penRatio, "ratio");

  return {
    outerShapeId,
    outerSizeId: outerSize.id,
    variantId,
    innerShapeId,
    wheelId: wheel.id,
    penHoleId: penHole.id,
  };
}

function normalizeClassicParams(params = {}) {
  const fixedRadius = Number(params.fixedRadius);
  const rollingRadius = Number(params.rollingRadius);
  const tMax = Number(params.tMax);
  const outerShapeId = normalizeOuterShapeId(params.outerShapeId, "circle");
  const innerShape = INNER_SHAPE_BY_ID[normalizeInnerShapeId(params.innerShapeId, "circle")] || INNER_SHAPES[0];
  const safeFixedRadius = Number.isFinite(fixedRadius) ? fixedRadius : 96;
  const aspectX = Number.isFinite(Number(params.innerAspectX))
    ? Number(params.innerAspectX)
    : innerShape.aspectX;
  const aspectY = Number.isFinite(Number(params.innerAspectY))
    ? Number(params.innerAspectY)
    : innerShape.aspectY;
  const outerMeanRadius = Number.isFinite(Number(params.outerMeanRadius))
    ? Number(params.outerMeanRadius)
    : computeOuterMeanRadius(outerShapeId, safeFixedRadius);

  const safeParams = {
    ...params,
    variant: params.variant === "epitrochoid" ? "epitrochoid" : "hypotrochoid",
    fixedRadius: safeFixedRadius,
    rollingRadius: Number.isFinite(rollingRadius) ? rollingRadius : 40,
    penDistance: Number.isFinite(Number(params.penDistance)) ? Number(params.penDistance) : 24.8,
    phase: Number.isFinite(Number(params.phase)) ? Number(params.phase) : 0,
    rotation: Number.isFinite(Number(params.rotation)) ? Number(params.rotation) : 0,
    rotationDrift: Number.isFinite(Number(params.rotationDrift)) ? Number(params.rotationDrift) : 0,
    penWobble: Number.isFinite(Number(params.penWobble)) ? Number(params.penWobble) : 0,
    wobbleFrequency: Number.isFinite(Number(params.wobbleFrequency)) ? Number(params.wobbleFrequency) : 1,
    wobblePhase: Number.isFinite(Number(params.wobblePhase)) ? Number(params.wobblePhase) : 0,
    tMax: Number.isFinite(tMax) ? tMax : TWO_PI_VALUE * 48,
    outerShapeId,
    innerShapeId: innerShape.id,
    innerAspectX: aspectX,
    innerAspectY: aspectY,
    outerMeanRadius: roundForRecipe(outerMeanRadius),
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

function makeClassicParams(seed, shapeSelection) {
  const rng = mulberry32(seed);
  const shape = resolveClassicShapeSelection(shapeSelection, rng);
  const outerSize = OUTER_SIZE_BY_ID[shape.outerSizeId];
  const wheel = ROLLING_WHEEL_BY_ID[shape.wheelId];
  const penHole = PEN_HOLE_BY_ID[shape.penHoleId];
  const innerShape = INNER_SHAPE_BY_ID[shape.innerShapeId];
  const variant = shape.variantId === "epitrochoid" ? "epitrochoid" : "hypotrochoid";
  const fixedRadius = outerSize.radius;
  const rollingRadius = wheel.radius;
  const outerMeanRadius = computeOuterMeanRadius(shape.outerShapeId, fixedRadius);

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
      outerShapeId: shape.outerShapeId,
      innerShapeId: innerShape.id,
      innerAspectX: innerShape.aspectX,
      innerAspectY: innerShape.aspectY,
      outerMeanRadius: roundForRecipe(outerMeanRadius),
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

function resolveClassicShapeSelection(selection, rng) {
  const selectedOuterShapeId = normalizeOuterShapeId(selection?.outerShapeId, null);
  const selectedInnerShapeId = normalizeInnerShapeId(selection?.innerShapeId, null);
  const outerShapeId = selectedOuterShapeId || OUTER_SHAPES[randomInt(rng, 0, OUTER_SHAPES.length - 1)].id;
  const outerSizeId = OUTER_SIZE_BY_ID[selection?.outerSizeId]
    ? selection.outerSizeId
    : OUTER_SIZES[randomInt(rng, 0, OUTER_SIZES.length - 1)].id;
  const variantId = OUTER_VARIANT_BY_ID[selection?.variantId]
    ? selection.variantId
    : OUTER_VARIANTS[randomInt(rng, 0, OUTER_VARIANTS.length - 1)].id;
  const innerShapeId = selectedInnerShapeId || INNER_SHAPES[randomInt(rng, 0, INNER_SHAPES.length - 1)].id;
  const wheelId = ROLLING_WHEEL_BY_ID[selection?.wheelId]
    ? selection.wheelId
    : ROLLING_WHEELS[randomInt(rng, 0, ROLLING_WHEELS.length - 1)].id;
  const penHoleId = PEN_HOLE_BY_ID[selection?.penHoleId]
    ? selection.penHoleId
    : PEN_HOLES[randomInt(rng, 0, PEN_HOLES.length - 1)].id;
  return { outerShapeId, outerSizeId, variantId, innerShapeId, wheelId, penHoleId };
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

// Generalized trochoid: replaces the constant outer radius R with a
// shape-dependent function R_outer(t), and the unit pen offset with an
// inner-shape modulation. This is "approximate rolling" — the inner center
// traces the outer perimeter exactly, while the inner's rotation rate uses the
// outer's *mean* radius so closure ratios match the classic case.
function rawClassicPoint(params, progress) {
  const r = params.rollingRadius;
  const Rmean = Number.isFinite(Number(params.outerMeanRadius))
    ? Number(params.outerMeanRadius)
    : params.fixedRadius;
  const innerShapeId = params.innerShapeId || "circle";
  const aspectX = Number.isFinite(Number(params.innerAspectX)) ? Number(params.innerAspectX) : 1;
  const aspectY = Number.isFinite(Number(params.innerAspectY)) ? Number(params.innerAspectY) : 1;
  const baseD = params.penDistance;
  const wobble = params.penWobble || 0;
  const wobbleFrequency = params.wobbleFrequency || 1;
  const wobblePhase = params.wobblePhase || 0;
  const d = baseD * (1 + wobble * Math.sin(TWO_PI_VALUE * wobbleFrequency * progress + wobblePhase));
  const t = params.phase + params.tMax * progress;
  const Rt = outerRadiusAt(t, params);

  let cx;
  let cy;
  let phi;
  let penX;
  let penY;
  let x;
  let y;

  if (params.variant === "epitrochoid") {
    cx = (Rt + r) * Math.cos(t);
    cy = (Rt + r) * Math.sin(t);
    phi = ((Rmean + r) / r) * t;
    ({ x: penX, y: penY } = innerPenOffset(innerShapeId, d, phi, aspectX, aspectY));
    x = cx - penX;
    y = cy - penY;
  } else {
    cx = (Rt - r) * Math.cos(t);
    cy = (Rt - r) * Math.sin(t);
    phi = ((Rmean - r) / r) * t;
    ({ x: penX, y: penY } = innerPenOffset(innerShapeId, d, phi, aspectX, aspectY));
    x = cx + penX;
    y = cy - penY;
  }

  return rotatePoint({ x, y }, params.rotation + (params.rotationDrift || 0) * progress);
}

function innerPenOffset(innerShapeId, distance, angle, aspectX, aspectY) {
  if (innerShapeId === "halfCircle") {
    const folded = positiveModulo(angle, TWO_PI_VALUE);
    const arcAngle = folded <= Math.PI ? folded : TWO_PI_VALUE - folded;
    return {
      x: distance * Math.cos(arcAngle),
      y: distance * (Math.sin(arcAngle) - 0.5),
    };
  }

  return {
    x: distance * aspectX * Math.cos(angle),
    y: distance * aspectY * Math.sin(angle),
  };
}

function outerRadiusAt(t, params) {
  const R = params.fixedRadius;
  const shapeId = params.outerShapeId || "circle";
  return R * outerRadiusUnit(t, shapeId);
}

// Returns the perimeter radius for a unit-scale outer shape at angle t.
function outerRadiusUnit(t, shapeId) {
  switch (shapeId) {
    case "square": {
      const c = Math.abs(Math.cos(t));
      const s = Math.abs(Math.sin(t));
      const denom = Math.max(c, s);
      return denom > 1e-6 ? 1 / denom : 1;
    }
    case "triangle": {
      // Regular triangle: radius from center to perimeter, smooth between vertices.
      const sector = TWO_PI_VALUE / 3;
      const half = sector * 0.5;
      const wedge = positiveModulo(t, sector);
      const denom = Math.cos(wedge - half);
      return denom > 1e-6 ? Math.cos(half) / denom : 1;
    }
    case "star": {
      // Smooth rosette star: r = 1 + amp * cos(N * t).
      return 1 + STAR_AMPLITUDE * Math.cos(STAR_POINTS * t);
    }
    case "circle":
    default:
      return 1;
  }
}

function computeOuterMeanRadius(outerShapeId, fixedRadius) {
  const samples = 256;
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    const t = (i / samples) * TWO_PI_VALUE;
    sum += outerRadiusUnit(t, outerShapeId);
  }
  return fixedRadius * (sum / samples);
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
  const stageRect = stage ? stage.getBoundingClientRect() : null;
  const stageWidth = stageRect?.width || window.innerWidth;
  const stageHeight = stageRect?.height || window.innerHeight - 96;
  const fullscreenActive = document.fullscreenElement === stage || stage?.classList.contains("is-app-fullscreen");
  const heightLimit = fullscreenActive ? window.innerHeight : Math.max(320, stageHeight);
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
  renderTrailToStep(currentStep);
}

function renderTrailToStep(step) {
  if (!baseTrailLayer || !recentTrailLayer || !recipe || pathPoints.length === 0) return;
  clearTransparentLayer(baseTrailLayer);
  clearTransparentLayer(recentTrailLayer);
  drawBaseTrailToStep(step, baseTrailLayer, canvasSize);
  drawRecentTrailToStep(step, recentTrailLayer, canvasSize);
  renderedStep = step;
  syncProgressUi();
}

function clearTransparentLayer(target) {
  target.clear();
}

function drawTrailCompositeToStep(step, target, size, colors = activeColors()) {
  target.push();
  target.background(...colors.background);
  target.pop();
  drawBaseTrailToStep(step, target, size, colors);
  drawRecentTrailToStep(step, target, size, colors);
}

function drawBaseTrailToStep(step, target, size, colors = activeColors()) {
  drawBaseTrailSegment(0, step, target, size, colors);
}

function drawBaseTrailSegment(fromStep, toStep, target, size, colors = activeColors()) {
  if (!recipe || toStep <= fromStep || pathPoints.length === 0) return;
  const alpha = TRAIL_ALPHA * PERMANENT_TRAIL_OPACITY;
  const start = clamp(Math.floor(fromStep), 0, recipe.totalSteps);
  const end = clamp(Math.floor(toStep), 0, recipe.totalSteps);
  drawTrailRange(start, end, target, size, colors, alpha, { cap: TRAIL_CAP_BUTT });
}

function drawRecentTrailSegment(fromStep, toStep, target, size, colors = activeColors()) {
  if (!recipe || toStep <= fromStep || pathPoints.length === 0) return;
  const alpha = TRAIL_ALPHA * RECENT_TRAIL_OPACITY;
  const start = clamp(Math.floor(fromStep), 0, recipe.totalSteps);
  const end = clamp(Math.floor(toStep), 0, recipe.totalSteps);
  drawTrailRange(start, end, target, size, colors, alpha, { cap: TRAIL_CAP_BUTT });
}

function fadeRecentTrailLayer(stepDelta, target, size) {
  if (!recipe || !target || stepDelta <= 0) return;
  const windowSteps = Math.max(1, recentFadeWindowSteps(recipe));
  const fadeAlpha = 255 * (1 - Math.pow(RECENT_TRAIL_DECAY_REMAINDER, stepDelta / windowSteps));
  if (fadeAlpha <= 0) return;

  target.push();
  target.drawingContext.save();
  target.drawingContext.globalCompositeOperation = "destination-out";
  target.noStroke();
  target.fill(0, 0, 0, fadeAlpha);
  target.rect(0, 0, size, size);
  target.drawingContext.restore();
  target.pop();
}

function drawRecentTrailToStep(step, target, size, colors = activeColors()) {
  if (!recipe || pathPoints.length === 0) return;
  const focusStep = clamp(Math.floor(step), 0, recipe.totalSteps);
  const windowSteps = recentFadeWindowSteps(recipe);
  const start = Math.max(0, focusStep - windowSteps);
  const end = focusStep;
  const peakStep = end;

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
    const age = Math.abs(peakStep - midpoint);
    const opacity = recentTrailOpacityForAge(age, recipe);
    const alpha = TRAIL_ALPHA * RECENT_TRAIL_OPACITY * opacity;
    drawTrailRange(chunkStart, chunkEnd, target, size, colors, alpha, {
      cap: TRAIL_CAP_BUTT,
      maxVertices: RECENT_CHUNK_VERTEX_LIMIT,
    });
  }
}

function drawTrailRange(start, end, target, size, colors, alpha, options = {}) {
  if (end <= start) return;
  if (alpha <= 0.2) return;
  const { cap = TRAIL_CAP_ROUND, maxVertices = MAX_REDRAW_VERTICES } = options;
  const coreWeight = Math.max(3.6, size / 205);

  target.push();
  target.noFill();
  target.strokeJoin(ROUND);
  target.stroke(...colors.points, alpha);
  target.strokeWeight(coreWeight);
  target.drawingContext.lineCap = cap;
  drawPathShape(target, start, end, size, maxVertices);
  target.pop();
}

function advancePlayback() {
  if (!recipe) return;

  if (currentStep >= recipe.totalSteps) {
    currentStep = 0;
    renderedStep = 0;
    renderTrailToStep(0);
    return;
  }

  const stride = playbackStride();
  const nextStep = clamp(currentStep + stride, 0, recipe.totalSteps);
  const stepDelta = nextStep - currentStep;

  drawBaseTrailSegment(currentStep, nextStep, baseTrailLayer, canvasSize);
  fadeRecentTrailLayer(stepDelta, recentTrailLayer, canvasSize);
  drawRecentTrailSegment(currentStep, nextStep, recentTrailLayer, canvasSize);

  currentStep = nextStep;
  renderedStep = nextStep;

  syncProgressUi();

  if (nextStep >= recipe.totalSteps) {
    beginEndingTransition();
  }
}

function beginEndingTransition() {
  if (!recipe || playbackState === PLAYBACK_ENDING) return;

  const fromColors = normalizeColors(recipe.colors);
  const seed = makeRecipeSeed();
  const mode = ui.modeSelect.value || recipe.mode || "classic";
  const toColors = pickRandomColors(seed, fromColors);
  const nextRecipe = makeRecipe({ mode, seed, colors: toColors });
  const maskLayer = createGraphics(canvasSize, canvasSize);
  maskLayer.pixelDensity(1);
  maskLayer.clear();
  drawBaseTrailToStep(recipe.totalSteps, maskLayer, canvasSize, {
    background: [0, 0, 0],
    points: [255, 255, 255],
  });
  drawRecentTrailToStep(recipe.totalSteps, maskLayer, canvasSize, {
    background: [0, 0, 0],
    points: [255, 255, 255],
  });

  endingTransition = {
    startMs: performance.now(),
    durationMs: END_TRANSITION_MS,
    fromColors,
    toColors,
    nextRecipe,
    maskLayer,
    fallDistance: canvasSize * 1.18,
  };
  playbackState = PLAYBACK_ENDING;
  syncPlaybackUi();
}

function drawEndingTransition() {
  if (!endingTransition) return;

  const elapsed = performance.now() - endingTransition.startMs;
  const progress = clamp(elapsed / endingTransition.durationMs, 0, 1);
  const colorProgress = easeInOutCubic(progress);
  const fallProgress = easeInCubic(progress);
  const colors = {
    background: lerpRgb(endingTransition.fromColors.background, endingTransition.toColors.background, colorProgress),
    points: lerpRgb(endingTransition.fromColors.points, endingTransition.toColors.points, colorProgress),
  };

  syncArtworkBackground(colors);
  background(...colors.background);
  push();
  tint(...colors.points, 255);
  image(endingTransition.maskLayer, 0, endingTransition.fallDistance * fallProgress);
  noTint();
  pop();

  if (progress >= 1) {
    finishEndingTransition();
  }
}

function finishEndingTransition() {
  if (!endingTransition) return;
  const nextRecipe = endingTransition.nextRecipe;
  clearEndingTransition();
  applyRecipe(nextRecipe, { startPlaying: true });
}

function clearEndingTransition() {
  if (endingTransition?.maskLayer) {
    endingTransition.maskLayer.remove();
  }
  endingTransition = null;
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
  clearEndingTransition();
  currentStep = 0;
  playbackState = PLAYBACK_PLAYING;
  renderTrailToStep(0);
  syncPlaybackUi();
}

function togglePlayback() {
  if (!recipe) return;
  if (playbackState === PLAYBACK_ENDING) return;
  playbackState = playbackState === PLAYBACK_PLAYING ? PLAYBACK_PAUSED : PLAYBACK_PLAYING;
  syncPlaybackUi();
}

function jumpToEnd() {
  if (!recipe) return;
  clearEndingTransition();
  currentStep = recipe.totalSteps;
  playbackState = PLAYBACK_PAUSED;
  renderTrailToStep(currentStep);
  syncPlaybackUi();
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
  ui.canvasStage.classList.remove("controls-visible");
  document.body.classList.add("has-app-fullscreen");
  resizeArtworkCanvas();
  syncFullscreenUi();
}

function exitAppFullscreen() {
  ui.canvasStage.classList.remove("is-app-fullscreen");
  ui.canvasStage.classList.remove("controls-visible");
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
}

function syncPlaybackUi() {
  const label = playbackState === PLAYBACK_PLAYING ? "Pause" : playbackState === PLAYBACK_ENDING ? "Ending" : "Play";
  ui.playPauseBtn.textContent = label;
  if (ui.mobilePlayPauseBtn) ui.mobilePlayPauseBtn.textContent = label;
}

function toggleControlsDrawer() {
  const isOpen = ui.controlsPane.classList.toggle("is-open");
  ui.controlsToggleBtn.textContent = isOpen ? "Hide controls" : "Show controls";
  ui.controlsToggleBtn.setAttribute("aria-expanded", String(isOpen));
}

function syncFullscreenUi() {
  if (!ui.fullscreenBtn) return;
  const isFullscreen = Boolean(document.fullscreenElement) || ui.canvasStage?.classList.contains("is-app-fullscreen");
  const label = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
  ui.fullscreenBtn.textContent = label;
  if (ui.mobileFullscreenBtn) ui.mobileFullscreenBtn.textContent = label;
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
  };
}

async function copyRecipe() {
  if (!recipe) return;
  syncRecipeBox();
  const text = ui.recipeBox.value;

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    ui.recipeBox.focus();
    ui.recipeBox.select();
  }
}

function saveRecipe() {
  if (!recipe) return;
  syncRecipeBox();
  const blob = new Blob([ui.recipeBox.value], { type: "application/json" });
  downloadBlob(blob, `spirograph-recipe-${recipe.seed}.json`);
}

function loadRecipeFromBox() {
  try {
    const loaded = JSON.parse(ui.recipeBox.value);
    applyRecipe(loaded, { startPlaying: false });
  } catch (error) {
    console.warn("Recipe JSON did not load", error);
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
    }
    preview.remove();
  }, "image/png");
}

function drawPreviewCursor(target, size) {
  const colors = activeColors();
  const mapped = mapPathIndexToCanvas(currentStep, size);
  const sparkColor = sparkColorForColors(colors);
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
  const colors = activeColors();
  const lightBackground = luminance(colors.background) > 150;
  const fillColor = lightBackground ? [255, 255, 255, 206] : [0, 0, 0, 172];
  const textColor = lightBackground ? [32, 33, 36, 218] : [255, 255, 255, 224];
  const label = `preview | seed ${recipe.seed}`;

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

function isDarkBackground(colors) {
  return luminance(colors.background) < 90;
}

function sparkColorForColors(colors) {
  return isDarkBackground(colors) ? warmSparkColor(colors.points) : colors.points;
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

function syncArtworkBackground(colors) {
  if (!ui.canvasStage || !colors) return;
  ui.canvasStage.style.setProperty("--artwork-background", `rgb(${colors.background.join(",")})`);
}

function emptyPathPoints() {
  return {
    fit: null,
    length: 0,
  };
}

function activeColors() {
  if (recipe?.colors) return recipe.colors;
  return { background: DEFAULT_BG.slice(), points: DEFAULT_FG.slice() };
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

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function easeInCubic(value) {
  return value * value * value;
}

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function lerpRgb(fromRgb, toRgb, amount) {
  return [0, 1, 2].map((index) => Math.round(fromRgb[index] + (toRgb[index] - fromRgb[index]) * amount));
}

function roundForRecipe(value) {
  return Math.round(value * 1000000) / 1000000;
}

function luminance(rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  const trimmed = hex.replace("#", "").trim();
  if (trimmed.length !== 6) return null;
  const r = parseInt(trimmed.slice(0, 2), 16);
  const g = parseInt(trimmed.slice(2, 4), 16);
  const b = parseInt(trimmed.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return null;
  return [r, g, b];
}

function rgbToHex(rgb) {
  const pad = (n) => clamp(Math.round(Number(n) || 0), 0, 255).toString(16).padStart(2, "0");
  return `#${pad(rgb[0])}${pad(rgb[1])}${pad(rgb[2])}`;
}
