import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID, BELT, QUEUE, PIG, TRACK, TILE, TRAY, SELECTED_SLOTS, LIGHTING, COLORS, DEATH_ZONE, FONT, WATER } from './config.js';
import { sfx, music } from './sound.js';

// ---------------------------------------------------------------------
// v2 "definitive model" geometry builders (coral/sponge grid cells, the
// torus "boia", the reworked penguin rig) — kept together here since they
// share the merge-into-one-BufferGeometry technique needed to keep the
// grid's two InstancedMeshes down to one draw call per color group.
// ---------------------------------------------------------------------

/** METAL litter — a drinks can. One can per pillar (a cell holds four).
 *
 * The board changed meaning this pass: it is no longer a reef to be
 * destroyed, it is rubbish to be collected out of the sea. The two teams
 * are now the two waste streams, which fits the mechanic far better than
 * coral ever did — the player is not smashing a reef, they are cleaning up.
 *
 * A can is a body of revolution, so it is ONE LatheGeometry: the profile
 * runs up the wall, in over the chamfered rim and closes across the lid.
 * Assembled from cylinders it would take three pieces for the same
 * silhouette, and this geometry is instanced several hundred times.
 */
function buildCanGeometry(height, submergedDepth = 0) {
  const h = height * 0.72;
  const r = 0.3;
  // The wall is deliberately SUBDIVIDED into several points that all sit at
  // the same radius. Geometrically those extra points change nothing — the
  // silhouette is identical — but LatheGeometry writes `uv.y = j / (points
  // - 1)`, i.e. v is the profile INDEX, not arc length. With the old 7-point
  // profile the entire wall spanned v 0.33..0.5, so a painted label band had
  // one sixth of the texture to live in and no way to be placed accurately.
  // Subdividing gives the wall its own even slice of v, which is what makes
  // the label band below land exactly where it is drawn.
  //
  // v (= j/10) landmarks used by buildCanTexture():
  //   0.0-0.2 base + bottom rim | 0.4-0.6 label | 0.8-1.0 chamfer + lid
  const profile = [
    new THREE.Vector2(0, 0), // v 0.0
    new THREE.Vector2(r * 0.82, 0), // v 0.1
    new THREE.Vector2(r, h * 0.07), // v 0.2  bottom chamfer
    new THREE.Vector2(r, h * 0.2), // v 0.3
    new THREE.Vector2(r, h * 0.33), // v 0.4  label starts
    new THREE.Vector2(r, h * 0.55), // v 0.5
    new THREE.Vector2(r, h * 0.76), // v 0.6  label ends
    new THREE.Vector2(r, h * 0.9), // v 0.7
    new THREE.Vector2(r * 0.86, h * 0.96), // v 0.8  top chamfer
    new THREE.Vector2(r * 0.7, h), // v 0.9
    new THREE.Vector2(0, h), // v 1.0  lid
  ];
  const parts = [new THREE.LatheGeometry(profile, 14)];
  if (submergedDepth > 0) {
    const stemH = submergedDepth + height * 0.14;
    const stem = new THREE.CylinderGeometry(0.16, 0.12, stemH, 7);
    stem.translate(0, height * 0.1 - stemH / 2, 0);
    parts.push(stem);
  }
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}

/** PLASTIC litter — a PET bottle. One bottle per pillar.
 *
 * Also a single lathe: body, shoulder, neck and cap all come out of one
 * profile. The shoulder is the part that has to be right — a straight
 * cylinder with a cap on top reads as a jar, and it is the concave
 * shoulder curving into the neck that says "plastic bottle" at a glance.
 * That matters because this shape has to be told apart from a CAN at
 * thumbnail size, and the two are the game's only piece of colour-coded
 * information.
 */
function buildBottleGeometry(height, submergedDepth = 0) {
  const h = height * 0.95;
  const r = 0.27;
  // Same UV reasoning as the can: the barrel is subdivided so the printed
  // label gets its own slice of v. 14 points => v = j/13.
  //   0.00-0.15 base | 0.31-0.46 label | 0.85-1.00 cap
  const profile = [
    new THREE.Vector2(0, 0), // v 0.000
    new THREE.Vector2(r * 0.8, 0), // v 0.077
    new THREE.Vector2(r, h * 0.06), // v 0.154  base rim
    new THREE.Vector2(r, h * 0.2), // v 0.231
    new THREE.Vector2(r, h * 0.32), // v 0.308  label starts
    new THREE.Vector2(r, h * 0.44), // v 0.385
    new THREE.Vector2(r, h * 0.52), // v 0.462  label ends
    new THREE.Vector2(r * 0.95, h * 0.58), // v 0.538
    new THREE.Vector2(r * 0.62, h * 0.7), // v 0.615  shoulder
    new THREE.Vector2(r * 0.34, h * 0.79), // v 0.692
    new THREE.Vector2(r * 0.3, h * 0.88), // v 0.769  neck
    new THREE.Vector2(r * 0.4, h * 0.9), // v 0.846  cap lip
    new THREE.Vector2(r * 0.4, h), // v 0.923
    new THREE.Vector2(0, h), // v 1.000
  ];
  const parts = [new THREE.LatheGeometry(profile, 14)];
  if (submergedDepth > 0) {
    const stemH = submergedDepth + height * 0.14;
    const stem = new THREE.CylinderGeometry(0.15, 0.11, stemH, 7);
    stem.translate(0, height * 0.1 - stemH / 2, 0);
    parts.push(stem);
  }
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}

// Torus "boia" geometry + its 4 cardinal ribbon bands — shared/module-scope
// like the old tileGeo, since buildBoiaMesh() below is called once per pile
// slot AND once per active belt rig (never instanced — these are plain
// THREE.Mesh/Group, not InstancedMesh, so sharing the geometry across many
// Meshes is enough for the perf win, no merge required here).
const BOIA_RADIUS = TILE.width * 0.32;
const BOIA_TUBE = TILE.height * 0.6;
const boiaTorusGeo = new THREE.TorusGeometry(BOIA_RADIUS, BOIA_TUBE, 10, 24);
boiaTorusGeo.rotateX(Math.PI / 2); // lie flat (hole axis vertical)
// Thicker bands (0.68 -> 1.05 of the tube width). On a life ring the white
// blocks are as wide as the red between them; at 0.68 they read as painted
// pinstripes rather than as the ring's own quartering.
const boiaBandGeo = new THREE.BoxGeometry(BOIA_TUBE * 1.05, BOIA_TUBE * 2.2, BOIA_TUBE * 2.2);

/** A classic red donut buoy with 4 yellow ribbon bands at the cardinal
 * directions — replaces the old flat life-ring-textured tile. Still the
 * SAME overall footprint (TILE.width/height) as before so it drops into
 * both the static pile and the belt-riding-platform roles unchanged. */
function buildBoiaMesh() {
  const group = new THREE.Group();
  const boia = new THREE.Mesh(boiaTorusGeo, toonMat({ color: TILE.color }));
  boia.castShadow = true;
  boia.receiveShadow = true;
  group.add(boia);
  const bandMat = toonMat({ color: TILE.stripeColor });
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i;
    const band = new THREE.Mesh(boiaBandGeo, bandMat);
    band.position.set(Math.cos(angle) * BOIA_RADIUS, 0, Math.sin(angle) * BOIA_RADIUS);
    band.rotation.y = angle + Math.PI / 2;
    band.castShadow = true;
    group.add(band);
  }
  return group;
}

/* ============================================================
 * GAMEPLAY SUMMARY (v1 — primitive, mechanic-only)
 * ------------------------------------------------------------
 * - A checkerboard of CELLS (13x13) sits in the middle. Each cell is a
 *   tightly packed cluster of 4 small pillars, all the same color as the
 *   cell. Pillars are drawn with two InstancedMeshes (one per color) so a
 *   large board stays cheap to render/shadow.
 * - A rounded rectangular belt made of instanced "plank" segments
 *   surrounds the grid, with direction arrows crawling along it (each one
 *   wiping in/out at the entry gap instead of popping). The belt is
 *   deliberately built with NO segments across the entry corner — that
 *   open gap is where the fiche stack physically lives.
 * - Each active "runner" is a fiche (a thin rounded tile) with a pig
 *   model riding on top of it. The fiche is what physically occupies belt
 *   capacity. Picking a pig from the queue animates a fiche pushing out
 *   of the stack onto the belt while that SAME pig model (not a new one)
 *   flies over from its queue spot, drag-and-drop style, landing on the
 *   fiche the moment it reaches the belt.
 * - The pig's own orientation is set ONCE (relative to its fiche) and
 *   never touched again — no per-frame lookAt(center). What makes it
 *   appear to turn toward the center at each corner is the fiche turning
 *   with the belt's own curvature there.
 * - Two pig colors: white pigs only shoot white pillars, black pigs only
 *   shoot black pillars — always the nearest alive one, but ONLY if the
 *   line to it is clear. A pillar of the opposite color standing in the
 *   way blocks the shot entirely (archer rule).
 * - Each pig starts with a fixed ammo count (20) that counts DOWN as it
 *   fires. The instant a pig runs out of ammo it leaves the belt (frees
 *   capacity + returns its fiche to the stack).
 * - Picking queue: 4 lanes of 3 pigs each, now REAL 3D objects standing
 *   in the main scene (so they cast a real shadow from the global sun),
 *   south-to-north — row 0 is the frontmost (closest to the belt) and
 *   gets picked first; picking a pig shifts everyone behind it north to
 *   fill the gap, and a new pig appears at the south end. Clicking uses
 *   raycasting against these real objects (no DOM hit-targets anymore).
 * - A 5-slot HUD row (mini-viewport thumbnails, a rounded card sitting
 *   behind each pig) mirrors which belt-capacity slots are filled.
 * - Win condition (not shown in the reference clip, defined here): all
 *   pillars destroyed -> victory screen.
 * See README.md and ai_logs/ for the full reasoning behind each pass.
 * ============================================================ */

// ---------------------------------------------------------------------
// Pure geometry derived from config — computed FIRST (no scene/camera
// needed yet) so the camera's ortho frustum can be sized to whatever the
// grid/belt actually measure, instead of a hardcoded constant that only
// worked for the old, much smaller 6x8 board.
// ---------------------------------------------------------------------
const halfW = (GRID.cellsX * GRID.cellSize) / 2;
const halfH = (GRID.cellsY * GRID.cellSize) / 2;
// Margin is now split per axis (see TRACK.marginX/marginZ in config.js) so
// the loop is a portrait rectangle rather than a square — east/west sides
// sit closer to the grid, north/south sides sit further out.
const beltHalfW = halfW + TRACK.marginX;
const beltHalfH = halfH + TRACK.marginZ;
const R = TRACK.cornerRadius;

// ---------------------------------------------------------------------
// Renderer / scene / camera — orthographic, isometric-ish top-down view,
// sized to the phone-shaped #game-frame rather than the browser window.
// ---------------------------------------------------------------------
const holder = document.getElementById('canvas-holder');

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.background);

// Sized by WIDTH, not height (the frame is portrait, so width is the
// constraining dimension), and derived from the belt's actual footprint
// so a bigger board (e.g. this pass's 13x13 grid) automatically fits
// instead of getting clipped by a value tuned for a smaller one.
const SCREEN_EDGE_GAP = 0.25 / 3;
// Cut to a third of the previous pass's value — per feedback ("quero q a
// esteira preencha 1/3 do espaçamento entre a esteira e a margem da tela"),
// read as "shrink the empty gap between the belt and the frame's edge down
// to a third of what it currently is" (the previous pass's flat 0.25 value).
// Split evenly across the LEFT and RIGHT edges since the belt loop is
// horizontally centered, so trimming it tightens the gap on both sides at
// once (a symmetric camera can't favor one side over the other).
const ORTHO_VIEW_WIDTH = beltHalfW * 2 + TRACK.width * 2 + SCREEN_EDGE_GAP;
/* SEMI-ISOMETRIC, BUT WITH REAL PERSPECTIVE.
 *
 * This was an OrthographicCamera, which by definition has no perspective
 * at all: parallel edges stay parallel, near and far pieces are the same
 * size, and the board reads as a flat pattern rather than as a thing with
 * depth. The brief asks to emphasise the 3D without losing the iso read of
 * the checkerboard, and those two are only compatible one way — a
 * PERSPECTIVE camera with a LONG LENS, pulled far back.
 *
 * The narrow field of view is the whole trick. At 20 degrees the
 * convergence across the board is a few percent: enough that the litter at
 * the far edge is visibly smaller and the pillars visibly lean away from
 * centre, which is what sells the depth, but nowhere near enough to bend
 * the grid into a vanishing-point view. A wide lens close in would give
 * dramatic perspective and destroy the iso read in the same move.
 *
 * The distance is derived from the framing, not dialled: at a given FOV,
 * the distance that frames a fixed world width is width / (2 * tan(fov/2)),
 * so the composition matches what the orthographic frustum used to show
 * and every offset tuned against it (QUEUE.areaOffsetZ, the lookAt target)
 * still holds.
 */
// 14 degrees, not 20. At 20 the dock — the nearest thing to the camera —
// was magnified enough to take nearly half the frame and squash the board
// into the top third. Narrowing the lens pulls the camera further back for
// the same framing, which shrinks the near/far size difference while
// keeping the convergence that reads as depth. This is the same reason
// sports and wildlife photography use long lenses for compressed,
// legible depth rather than dramatic wide-angle depth.
const CAMERA_FOV = 14;
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 1, 600);
// Isometric-style vantage point: high above, looking down at a shallow
// angle, scaled proportionally to the belt size. Look-at target is
// shifted toward the queue side (+Z) so the belt/grid render in the top
// portion of the frame, leaving room below for the HUD row + queue.
// Pulled back down this pass (was 1.45x, up from an original 1.05x) — the
// belt got thinner again this pass, which zooms the whole scene in further
// for the same ORTHO_VIEW_WIDTH padding, and the previous, more aggressive
// shift ended up pushing the grid's own top row off the top of the frame
// (a real clipping bug, caught via screenshot). This value keeps a small
// visible margin above the grid again. Note this shift moves EVERYTHING
// else on screen too (see QUEUE.areaOffsetZ in config.js, which had to be
// retuned alongside it to keep all 3 queue rows fully inside the frame).
// Direction unchanged from the orthographic build — only the distance
// along it changes, and that is computed in resizeToHolder so the framing
// tracks the aspect ratio the same way the ortho frustum did. Slightly
// lower than the old 4.2/2.7 (more from the side), which is the other half
// of showing depth: a steeper camera sees mostly lids and floors.
const CAMERA_DIR = new THREE.Vector3(0, 4.2, 2.72).normalize();
const CAMERA_TARGET = new THREE.Vector3(0, 0, beltHalfH * 1.05);
// v1s: pulled down further still (was 1.15 in v1r) — per feedback ("quero q
// desça mais um pouco a toda a estrutura da esteira, para ficar um
// espaçamento seguro na margem do topo da tela, n quero os porcos sendo
// cortados ao passar por cima"): measured via screenshot that the belt's own
// OUTER edge (where riding pigs actually travel, not just the checkerboard)
// had only ~4px of clearance from the top of the frame at 1.15 — nowhere
// near the ~28px lateral margins. This pass's feedback ALSO explicitly asked
// to keep the queue in its exact current screen position ("quero a fila de
// porcos na exata mesma posicao, n mude") — unlike v1r, where pushing this
// value down was allowed to carry the queue down with it, this time
// QUEUE.areaOffsetZ in config.js was retuned in the OPPOSITE direction
// (reduced) specifically to cancel this shift back out, measured pixel-for-
// pixel via screenshot until the queue's front row landed within ~1px of
// its pre-this-pass position while the grid/belt block itself moved down to
// ~22px of top clearance (close to the lateral margins, verified via zoomed
// screenshot).
camera.lookAt(CAMERA_TARGET);
// NOTE on the tile-facing feedback ("face maior virada para leste"): I
// tried adding a small X offset here so an east-facing surface would
// actually be visible (with X=0, a face whose normal is pure world X is
// mathematically edge-on to this camera — zero visible area, not just
// heavily foreshortened, which is the real reason an east-facing tile
// rendered as an unreadable solid plank in an earlier attempt). But ANY
// X offset here reintroduces a horizontal shear into literally everything
// else's screen position (the grid, the queue's rows/lanes, all of it),
// because every other position in the scene was laid out assuming this
// exact camera framing — tested it, and the queue's clean rows/columns
// immediately turned into a skewed diamond. That's a much bigger, riskier
// change than this one piece of feedback justifies on its own, so I've
// left the camera as-is and kept the tile's face-normal on world Z (see
// buildFicheStack/spawnRig below) — still clearly visible from this
// camera — while fixing the ROW direction to run cleanly west->east as
// asked. Flagged explicitly in the log; a true 3-axis isometric camera
// (revealing east/west faces on everything) is a bigger follow-up if the
// literal east-facing normal still matters once you see this.

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The scene is drawn twice per frame from here on (a depth-only pre-pass
// for the water shader, then the real pass — see tick()). Shadow maps are
// rebuilt inside renderer.render(), so leaving autoUpdate on would rebuild
// them TWICE per frame for no benefit; instead the main pass explicitly
// asks for one update via `needsUpdate`.
renderer.shadowMap.autoUpdate = false;
holder.appendChild(renderer.domElement);

// Set once three has actually compiled the water shader (inside
// onBeforeCompile, far below). Declared up here with `let` on purpose: the
// resize handler runs before the water material exists, and a `const`
// declared later would be in the temporal dead zone — `typeof` doesn't
// save you there either, it throws for let/const bindings.
let waterShaderRef = null;

/** Keeps the depth target and the water shader's screen-space lookup in
 * step with the real drawing buffer. The water reads its depth sample with
 * gl_FragCoord / uWaterRes, so if these drift apart the whole effect
 * samples the wrong pixel and the foam smears. */
function updateWaterResolution() {
  // Nothing to resize any more: the water reads the seabed analytically, so
  // it has no screen-space buffer to keep in step with. Kept as a no-op
  // hook because the resize path still calls it and a future screen-space
  // effect would want it back.
}

function resizeToHolder() {
  const w = holder.clientWidth;
  const h = holder.clientHeight;
  const aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  // Distance that frames ORTHO_VIEW_WIDTH of world at this FOV and aspect.
  // A perspective camera's vertical FOV is the fixed one, so a narrow
  // portrait frame has to solve for the HORIZONTAL half-angle or the board
  // would grow and shrink with the phone's aspect ratio — which is exactly
  // the bug the orthographic build could not have.
  const halfV = THREE.MathUtils.degToRad(CAMERA_FOV) / 2;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const dist = ORTHO_VIEW_WIDTH / 2 / Math.tan(halfH);
  camera.position.copy(CAMERA_DIR).multiplyScalar(dist).add(CAMERA_TARGET);
  camera.lookAt(CAMERA_TARGET);
  /* PIXEL RATIO CAPPED AT 1.5, not 2.
   *
   * This is the largest real-device win available and it was sitting in
   * one line. A modern phone reports a devicePixelRatio of 3; capping at 2
   * still renders FOUR times as many fragments as capping at 1, and this
   * scene is fragment-heavy — the water surface evaluates a Voronoi
   * partition and several noise octaves per pixel, and the seabed
   * evaluates a second Voronoi for the projected caustics on top of that.
   * Going from 2.0 to 1.5 removes 44% of every one of those fragments.
   *
   * It costs almost nothing here because of what the art actually is:
   * flat cel bands, thick painted foam and hard-edged silhouettes. There
   * is no fine texture detail or thin text in the 3D layer for the extra
   * samples to resolve — and the HUD, which does have fine text, is DOM
   * and renders at native resolution regardless of this setting.
   */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(w, h, false);
  updateWaterResolution();
}
new ResizeObserver(resizeToHolder).observe(holder);
resizeToHolder();

// Fixed "afternoon sun" (~15h-17h): one low-angle directional light coming
// from the right, with a small/cheap shadow map — just enough for the
// grid/belt/pigs to read a soft cast shadow. Brightened this pass toward
// the airier look the eventual tropical Fish-of-Fortune reskin will lean
// into. Kept deliberately minimal (one shadow-casting light, modest map
// size, only grid + belt riders + queue pigs opted into cast/receive).
scene.add(new THREE.AmbientLight(0xffffff, LIGHTING.ambientIntensity));
const sunLight = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity);
sunLight.position.set(LIGHTING.sunPosition.x, LIGHTING.sunPosition.y, LIGHTING.sunPosition.z);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(LIGHTING.shadowMapSize, LIGHTING.shadowMapSize);
// The shadow camera's ortho frustum used to be centered on the origin
// (the light's default target), which only covers roughly the grid/belt
// footprint — every queue pig sits well south of that, so only the one
// lucky enough to land inside the frustum by coincidence ever cast a
// visible shadow (a real bug, confirmed via screenshot: only one queue
// pig had a shadow). Fixed by re-centering the target on the belt+queue
// area's combined midpoint and widening the span to cover both.
const queueMaxZ =
  beltHalfH + QUEUE.areaOffsetZ + (QUEUE.visibleRows - 1) * QUEUE.rowSpacing;
sunLight.target.position.set(0, 0, (queueMaxZ - beltHalfH) / 2);
const shadowSpan = Math.max(beltHalfW, (queueMaxZ + beltHalfH) / 2) + 6;
sunLight.shadow.camera.left = -shadowSpan;
sunLight.shadow.camera.right = shadowSpan;
sunLight.shadow.camera.top = shadowSpan;
sunLight.shadow.camera.bottom = -shadowSpan;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 80;
sunLight.shadow.bias = -0.002;
// v2b: global shadow strength (see LIGHTING.shadowIntensity for why).
// Feature-detected rather than assumed — `shadow.intensity` only exists in
// three r165+, and silently assigning an unsupported property would look
// like the value simply had no effect.
if ('intensity' in sunLight.shadow) sunLight.shadow.intensity = LIGHTING.shadowIntensity;
/* THE SHADOW MAP RUNS AT HALF RATE.
 *
 * This was found by measurement, not by guessing. Quartering the viewport
 * (412x915 -> 206x458) lifted the frame rate by only 1.7x rather than the
 * ~4x a fill-bound scene would give — so a large part of the per-frame
 * cost does not scale with the number of pixels on screen. The shadow pass
 * is exactly that shape of cost: it renders every casting object in the
 * scene into a 1024x1024 map at a fixed resolution, no matter how big the
 * window is.
 *
 * three re-renders that map every single frame by default. Turning
 * autoUpdate off and flagging it on alternate frames halves the pass, and
 * the cost is invisible: these are soft cartoon shadows under a sun that
 * barely moves, on objects that drift a few pixels between frames. A
 * shadow updated at 30Hz behind geometry drawn at 60Hz is not something
 * the eye can resolve here.
 *
 * The one thing it cannot be allowed to do is skip an update the frame
 * something appears or disappears, so buildGrid and the pause resume both
 * force it (see requestShadowUpdate).
 */
sunLight.shadow.autoUpdate = false;
sunLight.shadow.needsUpdate = true;
let shadowFrameToggle = 0;
function tickShadowMap() {
  shadowFrameToggle++;
  sunLight.shadow.needsUpdate = (shadowFrameToggle & 1) === 0;
}
function requestShadowUpdate() {
  sunLight.shadow.needsUpdate = true;
}

scene.add(sunLight);
scene.add(sunLight.target);

/* ============================================================
 * TIME OF DAY
 * ------------------------------------------------------------
 * The scene drifts through morning, afternoon, sunset and night over the
 * course of play, and the pause menu can drive it directly.
 *
 * The whole thing is ONE normalised clock (0..1) feeding a table of keyed
 * stops, and every light and colour in the frame is a lerp between the two
 * stops it sits between. That is the important decision: the alternative —
 * a set of discrete "presets" that get swapped — cannot be made smooth,
 * because there is nothing between two presets to interpolate through. A
 * keyframe table gives continuous motion AND still lets each moment of day
 * be authored deliberately rather than falling out of a formula.
 *
 * Colours are interpolated in linear space via THREE.Color.lerpColors,
 * not by mixing hex components: mixing a warm sunset and a cool night in
 * sRGB drives the midpoint through a muddy grey, which is exactly where
 * the transition is most visible.
 */
const TIME_STOPS = [
  {
    t: 0.0,
    name: 'Dawn',
    sun: 0xffd9bc, sunI: 1.45, ambI: 2.0, ambient: 0xeaf0ff,
    sky: 0xb8dce8, shallow: 0x6fdcf0, deep: 0x2f78d0, foam: 0xfff6ec,
    sand: 0xecc190, shadow: 0.3, sunPos: { x: 9, y: 10, z: -4 }, night: 0,
  },
  {
    // The BRIGHTEST stop, and the one the game opens on. The scene is a
    // tropical lagoon at midday: it should read light, saturated and
    // airy, and the previous grade had drifted to the point where the
    // whole frame was dusk. The sun is high and strong and the ambient is
    // high with it — the contrast here comes from the sun's own hardness,
    // not from starving the fill.
    t: 0.3,
    name: 'Midday',
    sun: 0xfff8e8, sunI: 1.85, ambI: 1.78, ambient: 0xeaf6ff,
    sky: 0x86dce0, shallow: 0x3fd8f5, deep: 0x0f74dc, foam: 0xffffff,
    sand: 0xf0c07a, shadow: 0.42, sunPos: { x: 5.5, y: 16, z: -5.5 }, night: 0,
  },
  {
    t: 0.58,
    name: 'Golden hour',
    // The saturated yellow key light from the reference. Its intensity is
    // the highest of the four stops and the ambient the lowest, which is
    // what produces a hard, dramatic shadow rather than a bright flat one:
    // shadow contrast is the RATIO between them, not a separate setting.
    // The ambient carries the SHADOW's colour, because a shaded surface
    // receives ambient only — so this is the one place the "blue-violet
    // shadow" is set. It is kept LOW in chroma on purpose: ambient
    // multiplies every material in the frame, and a strongly saturated one
    // does not tint the shadows, it tints the whole picture and turns warm
    // sand into mud. The hue reads because it is a shift against a warm
    // key, not because it is strong.
    sun: 0xffcf5e, sunI: 2.0, ambI: 1.5, ambient: 0xbcb8e0,
    sky: 0xf6c49c, shallow: 0x5fd4e0, deep: 0x2a68bc, foam: 0xfff0d8,
    sand: 0xf2b070, shadow: 0.58, sunPos: { x: 13, y: 7.5, z: -3 }, night: 0,
  },
  {
    t: 0.82,
    name: 'Night',
    sun: 0xa8c0ff, sunI: 0.9, ambI: 1.62, ambient: 0x94a0e0,
    sky: 0x22345e, shallow: 0x357ab0, deep: 0x0e2a60, foam: 0xd4e2ff,
    sand: 0xa89ba8, shadow: 0.46, sunPos: { x: -7, y: 11, z: -6 }, night: 1,
  },
  // Wraps back to dawn. Duplicated rather than special-cased in the lookup:
  // a wrap-around branch inside the interpolation is the classic place for
  // an off-by-one, and one extra row of data costs nothing.
  {
    t: 1.0,
    name: 'Dawn',
    sun: 0xffd9bc, sunI: 1.45, ambI: 2.0, ambient: 0xeaf0ff,
    sky: 0xb8dce8, shallow: 0x6fdcf0, deep: 0x2f78d0, foam: 0xfff6ec,
    sand: 0xecc190, shadow: 0.3, sunPos: { x: 9, y: 10, z: -4 }, night: 0,
  },
];

const timeOfDay = {
  // OPENS AT MIDDAY, and the cycle is OFF by default. Two separate
  // decisions and both are about first impressions: the game's own look is
  // the bright tropical one, so that is what a player must see in the
  // first second — not whichever hour the clock happened to reach — and a
  // light that starts drifting immediately makes the opening frame
  // impossible to art-direct. The cycle is a feature the player turns on
  // from the pause menu, not a default they have to fight.
  t: 0.3,
  auto: false,
  // A full cycle takes six minutes of play. Long enough that a single
  // match sits mostly in one mood — the light should not visibly race —
  // short enough that a player who keeps going sees the whole arc.
  cycleSeconds: 360,
  night: 0, // 0..1, read by the night-only effects
};

const _tdA = new THREE.Color();
const _tdB = new THREE.Color();
const _tdOut = new THREE.Color();
const ambientLight = scene.children.find((c) => c.isAmbientLight);

function applyTimeOfDay() {
  const t = ((timeOfDay.t % 1) + 1) % 1;
  let i = 0;
  while (i < TIME_STOPS.length - 2 && TIME_STOPS[i + 1].t <= t) i++;
  const a = TIME_STOPS[i];
  const b = TIME_STOPS[i + 1];
  const span = b.t - a.t;
  // Smoothstepped, not linear. A linear blend between keyframes changes
  // direction abruptly at every stop, and on a slow drift that reads as
  // the light "clicking" from one mood to the next.
  const raw = span > 0 ? (t - a.t) / span : 0;
  const k = raw * raw * (3 - 2 * raw);

  const mixHex = (ha, hb) => {
    _tdA.setHex(ha);
    _tdB.setHex(hb);
    return _tdOut.lerpColors(_tdA, _tdB, k);
  };

  sunLight.color.copy(mixHex(a.sun, b.sun));
  sunLight.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, k);
  sunLight.position.set(
    THREE.MathUtils.lerp(a.sunPos.x, b.sunPos.x, k),
    THREE.MathUtils.lerp(a.sunPos.y, b.sunPos.y, k),
    THREE.MathUtils.lerp(a.sunPos.z, b.sunPos.z, k)
  );
  if ('intensity' in sunLight.shadow) {
    sunLight.shadow.intensity = THREE.MathUtils.lerp(a.shadow, b.shadow, k);
  }
  if (ambientLight) {
    ambientLight.color.copy(mixHex(a.ambient, b.ambient));
    ambientLight.intensity = THREE.MathUtils.lerp(a.ambI, b.ambI, k);
  }
  scene.background.copy(mixHex(a.sky, b.sky));
  // NO `typeof` GUARDS around these. `waterUniforms` and `floor` are
  // module-level consts declared further down the file, and `typeof` does
  // NOT protect against the temporal dead zone — it throws for a let/const
  // binding that has not been initialised yet, unlike for an undeclared
  // name. The real protection is that this function is only ever called
  // from tickTimeOfDay and setTimeOfDay, both of which run after module
  // initialisation is complete. (This project has already been bitten by
  // exactly this once, in the water-shader ref.)
  waterUniforms.uShallowColor.value.copy(mixHex(a.shallow, b.shallow));
  waterUniforms.uDeepColor.value.copy(mixHex(a.deep, b.deep));
  waterUniforms.uFoamColor.value.copy(mixHex(a.foam, b.foam));
  floor.material.color.copy(mixHex(a.sand, b.sand));
  timeOfDay.night = THREE.MathUtils.lerp(a.night, b.night, k);
  nightUniform.value = timeOfDay.night;
}

function tickTimeOfDay(dt) {
  if (timeOfDay.auto) {
    timeOfDay.t = (timeOfDay.t + dt / timeOfDay.cycleSeconds) % 1;
  }
  applyTimeOfDay();
}

/** Used by the pause menu's time slider. */
function setTimeOfDay(t, auto) {
  timeOfDay.t = t;
  timeOfDay.auto = auto;
  applyTimeOfDay();
}

// Shared by everything that only exists after dark.
const nightUniform = { value: 0 };

/* NIGHT LIFE.
 *
 * Points of light under the surface — glowing plankton and drifting
 * jellyfish — that only exist after dark. Built once and simply faded by
 * the night factor rather than created and destroyed at dusk: spawning
 * three hundred sprites at the moment the light changes would hitch, and
 * hitching exactly when the player is admiring the transition is the worst
 * possible time for it.
 *
 * Additive, because they are light sources seen through water; a normal
 * blend would make them pale discs sitting on the seabed.
 */
const nightGlowGroup = new THREE.Group();
const nightGlowMat = new THREE.SpriteMaterial({
  color: 0x9ff0ff,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 0,
});
const jellyMat = new THREE.SpriteMaterial({
  color: 0xd9a8ff,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 0,
});
const nightSparks = [];
{
  // The same soft radial dot the prize glow uses, built inline here
  // because this runs before that one is defined.
  const S = 32;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g2 = c.getContext('2d');
  const grad = g2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, S, S);
  const dotTex = new THREE.CanvasTexture(c);
  nightGlowMat.map = dotTex;
  jellyMat.map = dotTex;

  for (let i = 0; i < 160; i++) {
    const isJelly = i % 7 === 0;
    const sprite = new THREE.Sprite(isJelly ? jellyMat.clone() : nightGlowMat.clone());
    const x = (Math.random() - 0.5) * WATER.bayWidth * 0.5;
    const z = WATER.bayCenterZ + (Math.random() - 0.5) * WATER.bayDepth * 0.42;
    // Between the bed and the surface, never above it.
    const y = THREE.MathUtils.lerp(WATER.seabedY, WATER.surfaceY - 0.25, Math.random());
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(isJelly ? 0.55 + Math.random() * 0.5 : 0.16 + Math.random() * 0.2);
    sprite.renderOrder = 1;
    nightGlowGroup.add(sprite);
    nightSparks.push({
      sprite,
      isJelly,
      phase: Math.random() * 6.28,
      rate: 0.6 + Math.random() * 1.6,
      baseY: y,
      drift: 0.2 + Math.random() * 0.5,
    });
  }
  nightGlowGroup.visible = false;
  scene.add(nightGlowGroup);
}

function tickNightGlow(t) {
  const night = timeOfDay.night;
  // Skipped entirely in daylight — 160 sprites is cheap, but zero is
  // cheaper, and for most of the cycle there is nothing to show.
  nightGlowGroup.visible = night > 0.02;
  if (!nightGlowGroup.visible) return;
  for (const sp of nightSparks) {
    // Each one breathes on its own clock; a field of lights pulsing in
    // unison reads as a strobe, not as living things.
    const pulse = 0.45 + 0.55 * Math.sin(t * sp.rate + sp.phase);
    sp.sprite.material.opacity = night * (sp.isJelly ? 0.55 : 0.8) * pulse;
    if (sp.isJelly) {
      // Jellyfish rise and sink slowly; plankton stays put.
      sp.sprite.position.y = sp.baseY + Math.sin(t * 0.3 + sp.phase) * sp.drift;
    }
  }
}

// ---------------------------------------------------------------------
// STYLED_FOF_VERSION reskin: toon shading pipeline + procedural textures.
// Per the art direction brief ("aplicando uma estética de toon shading
// limpa e leve... silhuetas simplificadas"), every MeshStandardMaterial
// used for a visible prop is replaced with MeshToonMaterial driven by a
// shared 3-step gradient map (a tiny grayscale ramp texture — the classic
// three.js toon-shading technique) instead of smooth PBR shading. The
// existing AmbientLight + DirectionalLight setup (LIGHTING in config.js,
// already a low-angle "sun" per earlier passes) needed no changes — toon
// shading just re-buckets the same lighting into hard bands rather than a
// smooth gradient, so the low-angle look already works in its favor.
function buildToonGradientMap(steps) {
  const canvas = document.createElement('canvas');
  canvas.width = steps;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(i, 0, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // hard steps, no interpolation blur
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
// 3 bands (shadow / mid / highlight) — per the brief's explicit "3 tons de
// sombra bem definidos".
const TOON_GRADIENT_MAP = buildToonGradientMap(3);

/** Shared helper so every reskinned prop's toon material picks up the same
 * gradient map without repeating the boilerplate. */
function toonMat(opts) {
  const mat = new THREE.MeshToonMaterial({ gradientMap: TOON_GRADIENT_MAP, ...opts });
  // Every toon material in the scene gets the cel highlight — the brief
  // asks for it on ALL models, and doing it here rather than per call site
  // means nothing can be missed.
  mat.onBeforeCompile = (shader) => patchToonShader(shader, false);
  mat.customProgramCacheKey = () => 'toonSpec';
  return mat;
}

// ---- Procedural textures (canvas-drawn, no external asset files) ----
// Every InstancedMesh below shares ONE texture across all its instances —
// cheap, and thematically correct here since all the "meat" pillars are
// meant to read as chunks of the SAME fillet, same for "bone".

/** Salmon-flesh look for the "soft meat" team's pillars: a warm pink/orange
 * base with a few darker wavy striations, echoing real fillet muscle grain. */
function buildMeatTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4956f';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(214,90,58,0.55)';
  ctx.lineWidth = 3;
  for (let i = -2; i < 8; i++) {
    ctx.beginPath();
    const yBase = i * 20;
    ctx.moveTo(-10, yBase);
    ctx.bezierCurveTo(size * 0.3, yBase + 14, size * 0.7, yBase - 10, size + 10, yBase + 6);
    ctx.stroke();
  }
  // small pale "fat" flecks
  ctx.fillStyle = 'rgba(255,241,225,0.5)';
  for (let i = 0; i < 14; i++) {
    const x = (i * 37) % size;
    const y = (i * 53) % size;
    ctx.beginPath();
    ctx.ellipse(x, y, 3, 1.4, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Pale bone-grain look for the "hard bone" team's pillars. */
function buildBoneTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efe9dc';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(180,170,150,0.5)';
  ctx.lineWidth = 2;
  for (let i = -2; i < 10; i++) {
    ctx.beginPath();
    const xBase = i * 16;
    ctx.moveTo(xBase, -10);
    ctx.bezierCurveTo(xBase + 6, size * 0.4, xBase - 6, size * 0.6, xBase + 4, size + 10);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Candy-striped life-ring look for the fiche/tile pile — see TILE's
 * comment in config.js for why this is a texture on the flat riding tile
 * rather than an actual torus shape. */
function buildLifeRingTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${TILE.color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = `#${TILE.stripeColor.toString(16).padStart(6, '0')}`;
  const stripeCount = 4;
  const stripeW = size / (stripeCount * 2);
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillRect(i * stripeW * 2, 0, stripeW, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/* ============================================================
 * LITTER LIVERIES — why the trash is painted, not tinted
 * ------------------------------------------------------------
 * The brief: each piece of rubbish should carry the palette of the crew
 * that collects it, so a glance at the board tells you which penguin the
 * cell belongs to ("cores bem caracteristicas com os pinguins"). The metal
 * crew is the red/orange squad, so their cans get an orange label with a
 * deep-red stripe; the plastic crew is the blue squad, so their PET bottles
 * get a blue label and a blue cap.
 *
 * That colour CANNOT come from `setColorAt`. Instance colour is one value
 * for the whole instance — it would drag the label and the body to the same
 * hue, which is the exact opposite of what a label is for. So the full
 * livery is painted into a texture and the instance colour is demoted to a
 * near-white jitter (see buildGrid), which multiplies the painted art and
 * therefore varies both parts together the way real lighting variation
 * would.
 *
 * Incidentally this also fixes a latent squaring bug: the material colour
 * AND the instance colour were both being set to the full pillar tone, and
 * three multiplies the two, so every pillar was rendering at its own colour
 * SQUARED. With the art in the map, the material is plain white and the
 * multiplication chain is neutral again.
 *
 * The bands are addressed in v, which for a LatheGeometry is the profile
 * index — see the v landmarks written next to each profile above. Canvas y
 * runs the other way from v (flipY), hence the `row()` helper.
 */
function buildLitterLiveryTexture(bands, streakAlpha) {
  const W = 64;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // v -> canvas y. v=0 is the LAST row of the image once flipY is applied.
  const row = (v) => Math.round((1 - v) * H);
  for (const [v0, v1, color] of bands) {
    const y1 = row(v0);
    const y0 = row(v1);
    ctx.fillStyle = color;
    ctx.fillRect(0, y0, W, y1 - y0);
  }
  // Vertical streaks running the full height: they wrap in u (the texture
  // repeats around the circumference), so they read as the length-wise
  // scuffing on a crushed can/bottle rather than as a pattern. Kept very
  // low contrast — this is surface interest at thumbnail size, not detail.
  ctx.globalAlpha = streakAlpha;
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * W;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(x, 0, 1 + Math.random() * 2, H);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** METAL litter: aluminium body, orange label, deep-red accent — the
 * red/orange squad's own palette (COLORS.pigEarBlack / magnetBody).
 *
 * The label deliberately covers most of the wall rather than sitting as a
 * stripe in the middle. A first cut gave it a realistic third of the height
 * and the board went uniformly GREY at phone scale: a pillar is about ten
 * pixels wide there, so whichever colour holds the majority of the
 * silhouette IS the colour the player sees, and team identity — the one
 * piece of information the board has to carry — was lost to the aluminium.
 * Realism loses to legibility here. */
function buildCanTexture() {
  return buildLitterLiveryTexture(
    [
      // THE STICKER READ. The brief asks for a can that is visibly METAL
      // with the colour applied as a label stuck onto it, rather than a
      // can moulded out of coloured plastic. So the bare aluminium is kept
      // as real bands top and bottom, the label sits between them with
      // hard edges, and a bright rule runs along each of its edges — a
      // printed wrapper catches the light at its own seam, and that seam
      // is what says "stuck on" instead of "painted in".
      [0.0, 0.2, '#6e7885'], // base + bottom rim, darker so it reads as a lip
      [0.2, 0.29, '#cfd8e0'], // BARE ALUMINIUM below the label
      [0.29, 0.305, '#ffffff'], // the label's lower seam catching light
      // Painted at EXACTLY the shot's hex. The brief asks for the litter
      // and the pellet that collects it to share tone, value and
      // saturation — and the honest way to guarantee that is to use the
      // same number, not to eyeball a near match that drifts every time
      // either one is retuned.
      [0.305, 0.72, '#ff4fa8'], // THE LABEL — the crew's magenta
      [0.4, 0.46, '#c42a6e'], // deep rose band across the label
      [0.62, 0.66, '#ffdcec'], // pale rule, the classic can-label rhythm
      [0.72, 0.735, '#ffffff'], // upper seam
      [0.735, 0.79, '#cfd8e0'], // BARE ALUMINIUM above the label
      // THE LID IS ORANGE TOO, and that is a camera decision rather than a
      // product-design one. This is an isometric view from above, so the
      // biggest single face of a standing can on the board is its lid. With
      // a realistic aluminium lid the board read grey from the play camera
      // even with a fully orange wall, because the wall was the face the
      // player saw least. The team colour has to own the face that is
      // actually pointing at the player.
      [0.79, 1.0, '#e03c90'],
    ],
    0.1
  );
}

/** PLASTIC litter: pale PET body, blue label and blue cap — the blue
 * squad's palette (COLORS.pigEarWhite). Same majority-of-silhouette rule as
 * the can; the pale PET is kept for the shoulder and neck, which is where
 * the bottle's shape does its own talking, so the two pieces still read as
 * different OBJECTS as well as different colours. */
function buildBottleTexture() {
  return buildLitterLiveryTexture(
    [
      [0.0, 0.14, '#8fe0f0'], // moulded base, deeper than the wall
      [0.14, 0.255, '#e6faff'], // PET wall
      [0.255, 0.27, '#ffffff'], // label seam
      [0.27, 0.6, '#22d8f5'], // THE LABEL — the crew's cyan, same hex as the shot
      [0.3, 0.34, '#8fe8fa'], // lighter cyan rule
      [0.53, 0.565, '#ffffff'], // white rule
      // The shoulder is tinted rather than left as bare PET, for the same
      // camera reason as the can's lid: from an isometric view of a
      // standing bottle the shoulder and cap are most of what is visible,
      // so the team colour has to reach them or the board reads white.
      [0.6, 0.82, '#6fdff2'], // shoulder + neck, tinted toward the crew
      [0.82, 1.0, '#0f96b4'], // screw cap, deepest cyan on the piece
    ],
    0.07
  );
}

/** The INNER WALL of the vortex cone.
 *
 * u wraps around the cone and v runs up its height, so a straight DIAGONAL
 * line in this texture is a helix on the cone — the swirl in the concept
 * sketch comes out of the mapping for free, with no polar maths and no
 * distortion at the apex (which is where a painted top-down spiral always
 * pinches into mush).
 *
 * v is inverted relative to the mesh: ConeGeometry puts v=1 at the apex,
 * and the apex is pointing DOWN after the flip, so v=1 is the throat.
 */
function buildVortexWallTexture() {
  const W = 256;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // flipY (three's default) makes canvas row 0 sample at v=1, and v=1 on
  // this mesh is the apex — so row 0 is the THROAT and the last row is the
  // rim at the waterline.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#07202f'); // throat: darkest value in the frame
  grad.addColorStop(0.34, '#0d3c53');
  grad.addColorStop(0.72, '#16718a');
  grad.addColorStop(1, '#2ba0b4'); // rim, meeting the surrounding water
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // NO PAINTED HELIX. Two attempts at one failed for the same structural
  // reason: a cone's UV pinches to a point at the apex, so any line drawn
  // at a constant width in texture space converges and aliases as it
  // descends, and crossing that against the mesh's own 40x8 segmentation
  // produced a basket-weave moire — the vortex read as a dartboard.
  //
  // The swirl is instead carried by the vortexStreaks tubes further down:
  // those are real geometry spiralling into the mouth, they do not care
  // about UV density, and the concept sketch shows exactly that — a plain
  // cone with a handful of curves drawn over it.
  //
  // What stays here is one thing a texture is good at: a few very wide,
  // heavily blurred vertical bands, so the wall has some tonal break as it
  // spins instead of being a flat sweep of colour.
  ctx.filter = 'blur(14px)';
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(190,240,250,0.16)' : 'rgba(4,22,34,0.22)';
    ctx.fillRect((i / 3) * W, -10, W * 0.16, H + 20);
  }
  ctx.filter = 'none';

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Simple concentric-spiral look for the whirlpool at the belt's kill zone. */
function buildWhirlpoolTexture() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  // A BLUE vortex with tonal range, not a black hole. A black well reads as
  // a rendering fault in a bright cartoon frame; the depth has to come from
  // a ramp of blues, with the darkest tone reserved for the throat.
  const grad = ctx.createRadialGradient(S / 2, S / 2, S * 0.04, S / 2, S / 2, S * 0.5);
  grad.addColorStop(0, '#0d2f45'); // throat: darkest value in the scene
  grad.addColorStop(0.35, '#155e78');
  grad.addColorStop(0.72, '#1f8fa8');
  grad.addColorStop(1, '#37b6c4'); // rim, meeting the surrounding water
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  // Spiral arms in two tones: lighter arms catching the light, darker ones
  // in the lee. Drawn as polylines in polar coordinates so they wind in
  // continuously rather than being drawn as separate arcs.
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 9; arm++) {
    const light = arm % 2 === 0;
    ctx.beginPath();
    const a0 = (arm / 9) * Math.PI * 2;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const ang = a0 + t * 3.1;
      const rad = S * 0.5 * (1 - Math.pow(t, 1.25)) * 0.96;
      const x = S / 2 + Math.cos(ang) * rad;
      const y = S / 2 + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = light ? 'rgba(190,240,250,0.5)' : 'rgba(8,40,60,0.42)';
    ctx.lineWidth = S * (light ? 0.035 : 0.05);
    ctx.stroke();
  }
  if ('filter' in ctx) {
    ctx.filter = 'blur(2px)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
  }
  return new THREE.CanvasTexture(canvas);
}

// ---- v2b: crystalline shallow-water textures (sand, caustics, foam) ----
// All still canvas-drawn (no external asset files), and all TILEABLE +
// RepeatWrapping, because three of the four are UV-scrolled every frame
// (see tickWaterAnimation) — a non-tiling texture would show a hard seam
// sweeping across the bay every time the offset wraps.

/** Hex color number -> CSS string, for the canvas builders below. */
function cssHex(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Draws `fn` at the 5 wrapped positions (center + 4 axis neighbours) so an
 * element straddling a canvas edge reappears on the opposite side — the
 * cheap way to keep a hand-drawn canvas texture seamless when tiled. */
function drawWrapped(ctx, size, x, y, fn) {
  for (const [dx, dy] of [[0, 0], [-size, 0], [size, 0], [0, -size], [0, size]]) {
    ctx.save();
    ctx.translate(x + dx, y + dy);
    fn();
    ctx.restore();
  }
}

/** The seabed, matching reference steps 1 and 3 in one texture.
 *
 * Step 3 of the client's breakdown ("o reflexo da agua na areia") is NOT a
 * bright caustic — it is a low-contrast cell pattern in sand tones, barely
 * a shade lighter than the bed it sits on. Baking it into the sand itself
 * (rather than keeping the separate additive sheet a previous pass used) is
 * what lets the BRIGHT caustics live where the reference puts them: on the
 * surface, in the water shader. Two caustic layers at different depths just
 * cancelled each other out into mush.
 *
 * The cells are drawn as a Worley border field, same construction as the
 * surface web, so the two read as the same visual language at two depths. */
function buildSandTexture() {
  const S = 512;
  const CELLS = 5;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = cssHex(COLORS.floor);
  ctx.fillRect(0, 0, S, S);

  const pts = [];
  for (let gy = 0; gy < CELLS; gy++) {
    pts.push([]);
    for (let gx = 0; gx < CELLS; gx++) {
      pts[gy].push([
        (gx + 0.12 + Math.random() * 0.76) / CELLS,
        (gy + 0.12 + Math.random() * 0.76) / CELLS,
      ]);
    }
  }
  const img = ctx.getImageData(0, 0, S, S);
  const smoothstep = (a, b, x) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const gx = Math.floor(u * CELLS);
      const gy = Math.floor(v * CELLS);
      let f1 = 9;
      let f2 = 9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          const cx = ((nx % CELLS) + CELLS) % CELLS;
          const cy = ((ny % CELLS) + CELLS) % CELLS;
          const px = pts[cy][cx][0] + (nx < 0 ? -1 : nx >= CELLS ? 1 : 0);
          const py = pts[cy][cx][1] + (ny < 0 ? -1 : ny >= CELLS ? 1 : 0);
          const d = Math.hypot(px - u, py - v);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
        }
      }
      // Border BRIGHTER than the cell interior, but only just — the whole
      // effect is worth about 8% of value, which is the point.
      const border = 1 - smoothstep(0.0, 0.055, f2 - f1);
      const lift = 1 + border * 0.1 - smoothstep(0.3, 0.05, f1) * 0.035;
      const o = (y * S + x) * 4;
      img.data[o] = Math.min(255, img.data[o] * lift);
      img.data[o + 1] = Math.min(255, img.data[o + 1] * lift);
      img.data[o + 2] = Math.min(255, img.data[o + 2] * lift);
    }
  }
  ctx.putImageData(img, 0, 0);

  // WARM DRIFTS. The brief asks for the sand's orange to be more present,
  // and simply pushing the base colour further orange does not achieve
  // that: the bed is seen through a turquoise film, which is the complement
  // of orange, so a uniform shift is exactly what the water cancels out.
  // What survives the film is CONTRAST — patches of warmer sand against
  // cooler sand — so the orange is added as broad soft drifts rather than
  // as a global tint. Drawn wrapped, since this texture tiles 11x.
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 34; i++) {
    const r = S * (0.045 + Math.random() * 0.075);
    const warm = Math.random() < 0.62;
    drawWrapped(ctx, S, Math.random() * S, Math.random() * S, () => {
      // drawWrapped has already translated the context to the blob's
      // centre (and to its four wrapped twins), so draw at the origin.
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      // Ripe orange for the warm drifts; a pale bone tone for the few cool
      // ones, which is what stops the bed reading as a single flat wash.
      g.addColorStop(0, warm ? 'rgba(230,136,48,0.2)' : 'rgba(255,246,214,0.15)');
      g.addColorStop(1, warm ? 'rgba(232,140,52,0)' : 'rgba(255,246,214,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // A little grain on top so the bed isn't a flat vector fill up close.
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle =
      Math.random() < 0.5 ? 'rgba(255,255,240,0.18)' : 'rgba(120,116,88,0.16)';
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(WATER.sandRepeat, WATER.sandRepeat);
  return tex;
}

/** Deck planking for the boat. Seams run ACROSS the hull (constant world
 * z), matching the concept. Mapped in world units via ShapeGeometry's UVs,
 * so plank width is a real size the penguins can be measured against
 * rather than a fraction of the mesh. */
function buildPlankTexture() {
  /* VERTICAL boards, thick, with real gaps and defects.
   *
   * "Vertical" here means across the boat's beam — the deck's UVs come
   * from the hull SHAPE's own world coordinates, so the axis a stripe runs
   * along in this canvas is the axis it runs along on the boat. Running
   * them the short way is also what a small working boat actually looks
   * like: long fore-and-aft planks belong to a ship.
   *
   * The gaps are the point. A plank texture without visible seams is a
   * wood-coloured gradient; what makes it read as BOARDS is the dark line
   * where two of them meet, and what makes it read as cartoon rather than
   * as a render is that those lines are hand-irregular — no two boards the
   * same width, and the seam wandering slightly along its length.
   */
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');

  const woods = ['#7a4c37', '#8a5a40', '#6c4230', '#94654a', '#7f5138'];
  const seam = '#3b2318';

  ctx.fillStyle = seam;
  ctx.fillRect(0, 0, S, S);

  // Walk across the tile laying down boards of varying width. The last one
  // is stretched to close the tile exactly, so the pattern still repeats
  // seamlessly despite every board being a different size.
  const edges = [0];
  let x = 0;
  while (x < S - 40) {
    x += 46 + Math.random() * 42;
    edges.push(Math.min(x, S));
  }
  edges[edges.length - 1] = S;

  for (let i = 0; i < edges.length - 1; i++) {
    const x0 = edges[i];
    const x1 = edges[i + 1];
    const w = x1 - x0 - 4; // the -4 IS the seam showing through
    if (w <= 0) continue;
    ctx.fillStyle = woods[Math.floor(Math.random() * woods.length)];
    ctx.fillRect(x0 + 2, 0, w, S);

    // Grain: a few long strokes down the board, only slightly off its own
    // tone. Strong grain at this scale reads as scratches.
    ctx.globalAlpha = 0.16;
    for (let g = 0; g < 4; g++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
      const gx = x0 + 4 + Math.random() * Math.max(1, w - 8);
      ctx.fillRect(gx, 0, 1 + Math.random() * 2, S);
    }
    ctx.globalAlpha = 1;

    // DEFECTS: knots, and the occasional split running in from one end.
    // Two or three per tile, not per board — a board with a knot is a
    // detail, a deck where every board has one is a pattern.
    if (Math.random() < 0.3) {
      const ky = Math.random() * S;
      const kr = 3 + Math.random() * 5;
      ctx.fillStyle = 'rgba(45,26,17,0.75)';
      ctx.beginPath();
      ctx.ellipse(x0 + 2 + w / 2, ky, kr, kr * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(45,26,17,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x0 + 2 + w / 2, ky, kr * 2.1, kr * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (Math.random() < 0.22) {
      // A split: a dark hairline from one edge of the tile, dying out.
      const fromTop = Math.random() < 0.5;
      const len = S * (0.15 + Math.random() * 0.3);
      const gx = x0 + 4 + Math.random() * Math.max(1, w - 8);
      const grad = ctx.createLinearGradient(0, fromTop ? 0 : S, 0, fromTop ? len : S - len);
      grad.addColorStop(0, 'rgba(40,22,14,0.7)');
      grad.addColorStop(1, 'rgba(40,22,14,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(gx, fromTop ? 0 : S - len, 2, len);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** THE SURFACE FOAM — a thin white network over large rounded cells.
 *
 * Three approaches got here, and the two that failed are worth recording
 * because they failed for opposite reasons:
 *
 *  1. Voronoi BORDER field. Voronoi cells are convex polygons: straight
 *     edges, hard corner junctions, by construction. Every attempt to hide
 *     that (power curves, blur, wider ramps) was fighting the primitive.
 *  2. Scattered oval brush dabs. Smooth, yes — but a scatter is not a
 *     NETWORK. The reference's white is connected, and independent dabs
 *     can never connect into one.
 *
 * The reference is both at once: rounded cells AND a connected web. That
 * needs cells that overlap, each drawn dark with a THIN stroked outline —
 * the outline of whatever is on top survives, so the strokes chain into a
 * continuous net while every individual shape stays a closed curve.
 *
 * Two parameters decide whether it reads right, and both were wrong before:
 *  - stroke WIDTH (~7% of cell spacing). Thicker and the white starts
 *    winning the frame; the brief is explicit that there must be far more
 *    blue than white.
 *  - lobe AMPLITUDE (~5-9%, at 2-3 lobes). High amplitude makes the
 *    outline concave and the cells come out star-shaped — which is where
 *    the "pontas" kept coming from even after the Voronoi was gone. Low
 *    amplitude keeps every cell convex and reading as a rounded blob.
 *
 * Verified by generating the tile on its own and measuring it (~13% white)
 * rather than judging it inside the scene, where it had been misread
 * several times.
 *
 * Output is a grayscale mask read by the water shader.
 */
function buildSurfaceFoamTexture() {
  const S = 512;
  const CELLS = 6;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, S, S);
  const step = S / CELLS;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, step * 0.07);
  ctx.fillStyle = '#000000';

  const OFFS = [[0,0],[-S,0],[S,0],[0,-S],[0,S],[-S,-S],[S,S],[-S,S],[S,-S]];
  for (let gy = 0; gy < CELLS; gy++) {
    for (let gx = 0; gx < CELLS; gx++) {
      const cx = (gx + 0.5 + (Math.random() - 0.5) * 0.34) * step;
      const cy = (gy + 0.5 + (Math.random() - 0.5) * 0.34) * step;
      // Radius above half the spacing, so neighbours overlap and their
      // strokes chain together into the network.
      const baseR = step * (0.58 + Math.random() * 0.12);
      const lobes = 2 + Math.floor(Math.random() * 2);
      const amp = 0.05 + Math.random() * 0.04;
      const phase = Math.random() * Math.PI * 2;
      const squash = 0.85 + Math.random() * 0.3; // anisotropy reads organic
      const rot = Math.random() * Math.PI * 2;
      for (const [dx, dy] of OFFS) {
        ctx.beginPath();
        const steps = 96;
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          const r =
            baseR *
            (1 + Math.sin(t * lobes + phase) * amp + Math.sin(t * (lobes + 1) - phase) * amp * 0.4);
          const x = Math.cos(t) * r * squash;
          const y = Math.sin(t) * r;
          const xr = x * Math.cos(rot) - y * Math.sin(rot);
          const yr = x * Math.sin(rot) + y * Math.cos(rot);
          const px = cx + dx + xr;
          const py = cy + dy + yr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  // Light blur only: the lines are already smooth, and blurring hard would
  // thin them below the point where they survive minification on a phone.
  if ('filter' in ctx) {
    ctx.filter = 'blur(1.6px)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** The BED caustic — layer 3 of the recipe. Deliberately a different
 * animal from the surface foam: a soft rounded network at very low
 * contrast, laid over the sand and the corals purely "para dar essa camada
 * de estilo". Light that has come down through the water column arrives
 * diffuse, so drawing this as crisply as the surface would (and did, in an
 * earlier pass) puts two competing patterns at two depths and reads as
 * neither. */
function buildBedCausticTexture() {
  const S = 512;
  const CELLS = 4;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, S, S);
  const step = S / CELLS;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let gy = 0; gy < CELLS; gy++) {
    for (let gx = 0; gx < CELLS; gx++) {
      const cx = (gx + 0.5 + (Math.random() - 0.5) * 0.3) * step;
      const cy = (gy + 0.5 + (Math.random() - 0.5) * 0.3) * step;
      const baseR = step * (0.6 + Math.random() * 0.08);
      const lobes = 3 + Math.floor(Math.random() * 3);
      const amp = 0.12 + Math.random() * 0.08;
      const phase = Math.random() * Math.PI * 2;
      for (const [dx, dy] of [[0,0],[-S,0],[S,0],[0,-S],[0,S],[-S,-S],[S,S],[-S,S],[S,-S]]) {
        ctx.save();
        ctx.translate(cx + dx, cy + dy);
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const t = (i / 64) * Math.PI * 2;
          const r = baseR * (1 + Math.sin(t * lobes + phase) * amp + Math.sin(t * (lobes + 2) - phase) * amp * 0.5);
          const x = Math.cos(t) * r;
          const y = Math.sin(t) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = step * 0.15;
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  if ('filter' in ctx) {
    ctx.filter = 'blur(8px)'; // much softer than the surface: this is light
    ctx.drawImage(canvas, 0, 0); // that has already travelled through water
    ctx.filter = 'none';
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* THE CURRENT'S FLOW MARKS.
 *
 * Two things were wrong with the strokes this replaces, and they are the
 * same complaint stated twice: the marks formed a continuous line all the
 * way round the loop, and every mark sat in its own lane for its whole
 * life.
 *
 * A continuous line reads as a painted lane marking. Real moving water
 * shows INTERMITTENCY — foam gathers, streaks, thins out to nothing, and
 * gathers again somewhere else — so the marks here are cut into segments
 * with real gaps between them, and both the segment lengths and the gaps
 * are randomised so the eye cannot find a period.
 *
 * The "plastic" part is the lane drift. Each stroke is drawn as a CURVE
 * that starts in one lane across the channel and ends in another, so a
 * mark visibly migrates while it travels; where two of them converge on
 * the same lane they overlap and read as merging, and where one leaves a
 * lane it reads as splitting off. Nothing is simulated — the texture just
 * scrolls — but strokes that cross lanes produce the merge-and-separate
 * read for free, which no amount of straight parallel strokes ever could.
 *
 * V is the across-channel axis (see the UV generation in buildTrackVisual),
 * so a stroke changing its Y here is exactly a stroke changing lane.
 */
function buildCurrentFoamTexture() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  // Less blur — the strokes should read as painted marks with an edge, not
  // as vapour. This is the other half of "more defined".
  if ('filter' in ctx) ctx.filter = 'blur(0.9px)';
  ctx.lineCap = 'round';

  // Lanes across the channel. Kept off the extreme edges: a stroke pinned
  // to V=0 or V=1 sits exactly on the channel's rim and reads as an
  // outline of the belt rather than as something floating in it.
  const LANES = [0.2, 0.36, 0.5, 0.64, 0.8];

  for (const lane of LANES) {
    // Walk along U laying down segment / gap / segment / gap. Starting at
    // a random offset per lane stops all five lanes beginning together at
    // the seam, which would read as a starting line painted across the
    // current.
    let x = Math.random() * S;
    const end = x + S;
    while (x < end) {
      const len = 26 + Math.random() * 74;
      // The drift: where this stroke ENDS, across the channel. Half a lane
      // either way, so marks meet and part without ever crossing the whole
      // width and reading as a zig-zag.
      const laneEnd = lane + (Math.random() - 0.5) * 0.3;
      const y0 = lane * S;
      const y1 = THREE.MathUtils.clamp(laneEnd, 0.12, 0.88) * S;
      // 20% thicker and 20% more opaque, per the brief. Both matter: width
      // alone makes a fat soft smear, alpha alone makes a thin hard line.
      const w = 3.6 + Math.random() * 9.6;
      const a = 0.44 + Math.random() * 0.56;
      // Drawn three times, offset by a full tile each way, so a stroke
      // crossing the seam continues on the far side instead of being cut.
      for (const off of [0, -S, S]) {
        ctx.beginPath();
        ctx.moveTo(x + off, y0);
        // Two control points, so the drift eases in and out instead of
        // turning at a corner — this is what makes the migration read as
        // the mark being CARRIED rather than steered.
        ctx.bezierCurveTo(
          x + off + len * 0.35, y0,
          x + off + len * 0.65, y1,
          x + off + len, y1
        );
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = w;
        ctx.stroke();
      }
      // The GAP. As long as the strokes themselves, so the channel is
      // about half empty at any moment — that is the intermittency.
      // Shorter gaps than before: the channel now reads about 60% filled
      // rather than 50%, which is the "more fill" half of the brief while
      // keeping the intermittency that stops it being a painted lane line.
      x += len + 16 + Math.random() * 54;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* The current's UNDERFLOW texture: long, soft, stretched bands.
 *
 * Deliberately the opposite of the stroke texture in every property —
 * very long instead of segmented, very soft instead of defined, and
 * covering most of the tile instead of about half. Two layers that share a
 * visual language stack into one busier layer; two that contrast read as
 * two depths, which is the entire point of adding this one. */
function buildCurrentUnderflowTexture() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  if ('filter' in ctx) ctx.filter = 'blur(11px)';
  ctx.lineCap = 'round';
  /* BROKEN, not continuous. The first version laid nine long bands end to
   * end across the tile, which is a continuous wash — and a continuous
   * dark band under the current reads as a painted lane, the same fault
   * the white strokes had before they were segmented.
   *
   * So the underflow is now PATCHES: several per lane, of different
   * lengths, with real gaps between them, and confined to the middle of
   * the channel rather than spanning its width. Each is its own shape,
   * because a repeated one at intervals is a pattern rather than water.
   */
  for (let lane = 0; lane < 5; lane++) {
    // 0.28..0.72 of the channel width — the MIDDLE, per the reference.
    // Kept off the edges so the darkening never reaches the channel's
    // silhouette, where it would read as an outline.
    const y = S * (0.28 + (lane / 4) * 0.44) + (Math.random() - 0.5) * 12;
    let x = Math.random() * S;
    const end = x + S;
    while (x < end) {
      const len = S * (0.14 + Math.random() * 0.3);
      const drift = (Math.random() - 0.5) * 22;
      for (const off of [-S, 0, S]) {
        ctx.beginPath();
        ctx.moveTo(x + off, y);
        ctx.bezierCurveTo(
          x + off + len * 0.3, y + drift,
          x + off + len * 0.7, y - drift,
          x + off + len, y
        );
        ctx.strokeStyle = `rgba(255,255,255,${0.28 + Math.random() * 0.3})`;
        ctx.lineWidth = 10 + Math.random() * 22;
        ctx.stroke();
      }
      // The gap, as long as the patch itself.
      x += len + S * (0.12 + Math.random() * 0.26);
    }
  }
  ctx.filter = 'none';
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Radial white->black ramp used as an ALPHA MAP on the seabed + caustics
 * planes, so the sandy bay dissolves into deep open water toward the frame
 * edges instead of ending on a hard rectangular seam.
 *
 * This works because `repeat` is per-TEXTURE, not per-material: the sand's
 * color map tiles across the plane while this alpha map stays at 1x,
 * spanning the whole plane exactly once. */
function buildRadialFadeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 256, 256);
  const g = ctx.createRadialGradient(128, 128, 128 * WATER.bayFadeStart, 128, 128, 128);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.62, '#c8c8c8');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

const MEAT_TEXTURE = buildMeatTexture();
const BONE_TEXTURE = buildBoneTexture();
const LIFE_RING_TEXTURE = buildLifeRingTexture();
const WHIRLPOOL_TEXTURE = buildWhirlpoolTexture();
const VORTEX_WALL_TEXTURE = buildVortexWallTexture();
const CAN_TEXTURE = buildCanTexture();
const BOTTLE_TEXTURE = buildBottleTexture();

/* ============================================================
 * FLOATING IDLE — done in the vertex shader, not in JS
 * ------------------------------------------------------------
 * Every piece of rubbish on the board is bobbing on the swell, which is a
 * per-instance animation across ~676 instances. Writing that from JS means
 * rebuilding 676 instance matrices and re-uploading both instanceMatrix
 * buffers every single frame — the one thing InstancedMesh exists to avoid.
 *
 * Instead the offset is computed in the vertex shader from `instanceMatrix`
 * itself: column 3 is the instance's translation, so it doubles as a free,
 * stable per-instance PHASE. Nothing is uploaded per frame except one float.
 *
 * The tilt is a SHEAR (x and z displaced in proportion to local y) rather
 * than a real rotation. At these angles — a few degrees — the two are
 * visually identical, and a shear is three multiply-adds instead of a
 * matrix build. Normals are deliberately left alone: on a 3-band toon ramp
 * a 3-degree normal change almost never crosses a band edge, so recomputing
 * them would cost more than it shows.
 */
const trashBobUniform = { value: 0 };

/* ============================================================
 * CEL SPECULAR — the "plastic highlight" on every model
 * ------------------------------------------------------------
 * MeshToonMaterial has no specular at all: its fragment shader ends at
 *   outgoingLight = directDiffuse + indirectDiffuse + emissive
 * with no specular term anywhere, so there is nothing to turn up. The
 * highlight has to be added to that line.
 *
 * The light used for it is a FIXED VIEW-SPACE direction, not the scene's
 * sun. That is deliberate and it is how stylised plastic is usually shaded:
 * a highlight anchored to the camera stays in the same place on every
 * object no matter where each one sits or which way it is turned, so a
 * board of 676 pieces of litter reads as one material catching one light
 * rather than as 676 objects each glinting on its own schedule. Anchoring
 * it to the real sun instead makes the highlight swing around as objects
 * rotate, which reads as wet, not as plastic.
 *
 * The term is smoothstepped into a hard-edged blob rather than left as a
 * Blinn falloff, for the same reason everything else here is banded: a
 * smooth highlight on a 3-tone ramp reads as a rendering error.
 */
const TOON_SPEC_CHUNK = /* glsl */ `
  {
    vec3 specV = normalize( vViewPosition );
    vec3 specL = normalize( vec3( -0.35, 0.62, 0.7 ) );
    vec3 specH = normalize( specL + specV );
    // A LOWER exponent means a WIDER lobe: 64 gave a highlight the size of
    // a pinhead on a penguin, which at phone scale is a stray bright pixel
    // rather than a read of "this material is glossy". 18 spreads it into
    // a real patch — the shape is what says plastic, not the brightness.
    // 26, after two overshoots in opposite directions. At 64 the highlight
    // was a stray bright pixel; at 18 it swallowed whole heads. The lobe
    // has to be a readable PATCH on a penguin-sized sphere and no larger,
    // and on this camera that lands here.
    float specTerm = pow( max( dot( normal, specH ), 0.0 ), 26.0 );
    // Two steps: a small hot core inside a wider soft shoulder, which is
    // what a highlight on a curved plastic surface actually looks like
    // once it is posterised.
    //
    // The strengths are LOW, and the first pass had them four times
    // higher — which washed the entire frame out. The reason it overshoots
    // so easily is that this is added straight to outgoingLight, after the
    // toon ramp, so it is not competing with the lighting, it is stacked on
    // top of it: at 0.5 the highlight alone is half of full white on a
    // surface already lit to nearly full white. A cel highlight only needs
    // to be a hint brighter than the material's top band.
    float hot = smoothstep( 0.46, 0.62, specTerm );
    float soft = smoothstep( 0.12, 0.3, specTerm );
    outgoingLight += vec3( hot * 0.2 + soft * 0.07 );
  }
`;

function patchToonShader(shader, withBob) {
  shader.fragmentShader = shader.fragmentShader.replace(
    'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
    'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;' +
      TOON_SPEC_CHUNK
  );
  if (!withBob) return;
  shader.uniforms.uBobTime = trashBobUniform;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uBobTime;')
    .replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        float bobPhase = instanceMatrix[ 3 ].x * 1.7 + instanceMatrix[ 3 ].z * 2.31;
      #else
        float bobPhase = 0.0;
      #endif
      float bobT = uBobTime * 1.15 + bobPhase;
      // Two incommensurate rates on the tilt, so neighbours never fall
      // into a visible marching phase across the board.
      transformed.x += transformed.y * sin( bobT ) * 0.055;
      transformed.z += transformed.y * cos( bobT * 0.81 + 1.7 ) * 0.045;
      transformed.y += sin( bobT ) * 0.05 + cos( bobT * 0.63 ) * 0.018;
      `
    );
}

/* FLOATING IDLE — done in the vertex shader, not in JS.
 *
 * Every piece of rubbish on the board bobs on the swell, which is a
 * per-instance animation across ~676 instances. Writing that from JS means
 * rebuilding 676 instance matrices and re-uploading both instanceMatrix
 * buffers every single frame — the one thing InstancedMesh exists to avoid.
 *
 * Instead the offset is computed in the vertex shader from `instanceMatrix`
 * itself: column 3 is the instance's translation, so it doubles as a free,
 * stable per-instance PHASE. Nothing is uploaded per frame except one
 * float.
 *
 * The tilt is a SHEAR (x and z displaced in proportion to local y) rather
 * than a real rotation. At these angles — a few degrees — the two are
 * visually identical, and a shear is three multiply-adds instead of a
 * matrix build. Normals are deliberately left alone: on a 3-band toon ramp
 * a 3-degree normal change almost never crosses a band edge, so
 * recomputing them would cost more than it shows.
 */
function applyFloatingIdle(mat) {
  mat.onBeforeCompile = (shader) => patchToonShader(shader, true);
  // Without this, three caches the compiled program by material type and
  // bobbing and non-bobbing toon materials would share one program.
  mat.customProgramCacheKey = () => 'floatingIdle';
  return mat;
}
const SAND_TEXTURE = buildSandTexture();
const PLANK_TEXTURE = buildPlankTexture();
const CAUSTICS_TEXTURE = buildBedCausticTexture();
const FOAM_NOISE_TEXTURE = buildSurfaceFoamTexture();
const CURRENT_FOAM_TEXTURE = buildCurrentFoamTexture();
const CURRENT_UNDERFLOW_TEXTURE = buildCurrentUnderflowTexture();
const BAY_FADE_TEXTURE = buildRadialFadeTexture();

// ---------------------------------------------------------------------
// v2b: THE CRYSTALLINE DEPTH STACK (see the WATER block in config.js for
// the full layer diagram and why the numbers are what they are).
//
// The previous pass had these two planes 0.22 units apart, which is why it
// read as "a turquoise sheet with sand printed on it" rather than as water
// with a bottom: at that distance the sun casts both shadows onto
// essentially the same screen pixels, so there was no depth cue at all.
// The fix is the GAP, not the material — sand pushed down to WATER.seabedY
// while the game plane stays at y≈0, so the light now throws two clearly
// separated shadows (one on the surface film, one far below on the sand)
// and the eye reads a real water column between them.
//
// Each plane is oversized and each is a bit LARGER than the one above it,
// so the parallax between layers can never expose a gap at the frame's
// edge (you'd otherwise see the surface film end before the seabed does).
// ---------------------------------------------------------------------

// -- Layer 1 (bottom): the sunlit sand seabed.
//
// v2c: the bed is SLOPED, not flat. A flat bed makes the whole bay exactly
// one depth, so a depth-driven water shader has nothing to gradate — every
// pixel lands in the same cel band and the result is one solid slab of
// color. Sloping it up toward the dock (south) and toward the outer rim
// gives the shader the thing it is built to visualize: real shallows where
// the sand and caustics read clearly through thin water, grading into deep
// water out where the board floats. It is also the reference art's own
// composition — bright sand around the pier, open turquoise up top.
/** World-space height of the seabed. Shared by the bed mesh, the caustics
 * sheet that hugs it, and anything placed on it (the decorative reef), so
 * they can never drift apart. */
function seabedHeightAt(x, z) {
  // REAL BUG this fixes: with the bay enlarged to run past the frame, these
  // rises saturated INSIDE the visible area and lifted the bed to +0.07 —
  // above the water surface at -0.06. The southern half of the frame was
  // literally dry land, which is why the whole scene composited as khaki
  // sand with no water tint on it at all. Every term is now bounded so the
  // sum can never approach surfaceY, and the ranges start further out.
  //
  // The slope is also much gentler than the previous pass: the reference is
  // one evenly shallow bay, so this only has to break the flatness enough
  // to give the depth gradient something to work with.
  const southRise = THREE.MathUtils.smoothstep(z, 8, 42) * 0.5;
  const rimRise = THREE.MathUtils.smoothstep(Math.abs(x), beltHalfW + 4, beltHalfW + 22) * 0.28;
  const ripple = Math.sin(x * 0.18) * Math.cos(z * 0.15) * 0.13;
  return WATER.seabedY + southRise + rimRise + ripple;
}

/** A bay-sized plane displaced onto the seabed profile. `lift` floats a
 * copy just above the bed (used by the caustics sheet, which has to follow
 * the slope or it would sink into the sand at the shallow end). */
function buildSeabedGeometry(lift) {
  const geo = new THREE.PlaneGeometry(WATER.bayWidth, WATER.bayDepth, 64, 76);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // The mesh is rotated -90° about X, which maps local (x, y, z) to world
    // (x, z, -y). So local Z carries world HEIGHT, and world Z comes from
    // -local Y (plus the mesh's own offset).
    const worldX = pos.getX(i);
    const worldZ = -pos.getY(i) + WATER.bayCenterZ;
    pos.setZ(i, seabedHeightAt(worldX, worldZ) + lift);
  }
  geo.computeVertexNormals();
  return geo;
}

/* UNDERWATER REFRACTION.
 *
 * Everything below the surface should ripple, and the honest way to do
 * that is to render the submerged half to a target and sample it back
 * through a distorted UV. This project deliberately deleted its one
 * render-target pass (the depth pre-pass) for exactly the reason that
 * would apply again: a second full scene render per frame, on a phone,
 * for an effect that is stylised anyway.
 *
 * So the distortion is applied where it actually shows instead. Two
 * places carry almost all of the read:
 *   - the SEABED's own texture lookup, wobbled in UV space, which makes
 *     the sand and its baked light pattern swim; and
 *   - a lateral SWAY on submerged props, scaled by how deep they sit, so
 *     the reef leans with the same rhythm.
 * Together they give the "seen through moving water" read at the cost of
 * a few instructions, and nothing is re-rendered.
 *
 * The wobble is deliberately LOW frequency and small amplitude: real
 * refraction through a rippled surface displaces by a fraction of a
 * wavelength, and anything stronger stops reading as water and starts
 * reading as a heat haze.
 */
const refractionUniform = { value: 0 };

/** Bend a submerged prop with the current. `modelMatrix[3]` is the mesh's
 * world translation, which gives a free per-object phase without needing a
 * uniform per instance. */
function applyReefSway(mat) {
  mat.onBeforeCompile = (shader) => {
    patchToonShader(shader, false);
    applyProjectedCaustics(shader);
    shader.uniforms.uRefractTime = refractionUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uRefractTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        float swayPhase = modelMatrix[ 3 ].x * 0.7 + modelMatrix[ 3 ].z * 0.9;
        float swayT = uRefractTime * 0.9 + swayPhase;
        // Proportional to height above the base, so the piece bends instead
        // of sliding. Two rates again, so neighbours drift apart.
        float lean = max( transformed.y, 0.0 );
        transformed.x += lean * sin( swayT ) * 0.09;
        transformed.z += lean * cos( swayT * 0.77 + 1.3 ) * 0.07;
        `
      );
  };
  mat.customProgramCacheKey = () => 'reefSway';
  return mat;
}
/* THE SURFACE PATTERN, CAST DOWNWARD.
 *
 * The brief asks for a copy of the surface foam projected onto everything
 * under the water — thinner, sparser, more transparent and slightly more
 * distorted than the surface itself. That is what caustics ARE: the
 * surface's own shape focusing light onto whatever is below it.
 *
 * The important part is that this is the SAME Voronoi construction the
 * water shader draws its foam with, re-evaluated at world XZ down here.
 * Because both read world position rather than a screen or UV projection,
 * the pattern on the seabed lines up with the pattern on the surface for
 * free — a separately authored caustic texture could never stay in
 * register with an animated procedural surface, which is exactly why the
 * old baked caustic sheet always looked like a different effect.
 *
 * The differences from the surface are all deliberate: a wider threshold
 * (so the cells are bigger and the net sparser), a thinner stroke, a much
 * lower contribution, and its own extra warp so the projection wanders
 * relative to the surface the way real refracted light does.
 */
const PROJECTED_CAUSTICS_CHUNK = /* glsl */ `
  {
    vec2 cUv = vWorldXZ * uCausticScale;
    vec2 cw = vec2(
      fbm( cUv * 0.8 + vec2( uRefractTime * 0.09, 0.0 ) ),
      fbm( cUv * 0.8 + vec2( 0.0, -uRefractTime * 0.07 ) + 4.1 )
    ) - 0.5;
    // A BIGGER warp than the surface uses: refracted light wobbles more
    // than the surface that bends it, and that difference is what stops
    // the two layers reading as one decal printed through the water.
    cUv += cw * 0.9;
    float causticCell;
    float cEdge = voronoiEdge( cUv, causticCell );
    float caw = fwidth( cEdge ) * 1.1 + 0.004;
    // Thinner stroke than the surface's, and a second, softer shoulder.
    float line = 1.0 - smoothstep( 0.022 - caw, 0.022 + caw, cEdge );
    float halo = 1.0 - smoothstep( 0.07 - caw, 0.07 + caw, cEdge );
    float caustic = line + halo * 0.3;
    // Sparser: knock out whole regions so the net breaks up instead of
    // covering the bed uniformly. Derived from the warp field already
    // computed above rather than from a fresh fbm — a third octave-stack
    // per fragment for a soft mask is not worth its cost, and the warp is
    // low-frequency and decorrelated enough to do the job.
    caustic *= smoothstep( -0.16, 0.2, cw.x + cw.y );
    // Faded with depth below the surface — light that has travelled
    // further through water arrives weaker and more diffuse.
    float depthFade = 1.0 - clamp( ( WATER_SURFACE_Y - vWorldY ) / 2.6, 0.0, 1.0 ) * 0.55;
    outgoingLight += vec3( caustic * uCausticStrength * depthFade );
  }
`;

const causticStrengthUniform = { value: 0.16 };
const causticScaleUniform = { value: 0.19 };

/** Adds the projected-caustic term to a toon material. Anything that lives
 * under the water can take it — the seabed, the reef, the litter's
 * submerged stems — and it costs one Voronoi lookup per fragment. */
function applyProjectedCaustics(shader) {
  shader.uniforms.uRefractTime = refractionUniform;
  shader.uniforms.uCausticStrength = causticStrengthUniform;
  shader.uniforms.uCausticScale = causticScaleUniform;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;\nvarying float vWorldY;')
    .replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      {
        vec4 causticWorld = modelMatrix * vec4( transformed, 1.0 );
        vWorldXZ = causticWorld.xz;
        vWorldY = causticWorld.y;
      }`
    );
  /* GUARDED DECLARATION.
   *
   * The seabed material runs BOTH patches: applyUnderwaterRefraction (which
   * already declares uRefractTime in the fragment shader for its UV wobble)
   * and this one. Declaring it again is a GLSL redefinition error, and the
   * whole material silently fails to compile — the seabed simply renders
   * with three's fallback and every effect on it disappears.
   *
   * It is worth noting how this was caught: the single-page smoke test
   * reported no errors, because a three.js shader compile failure is a
   * CONSOLE error, not an uncaught exception, and that test only listened
   * for pageerror. The three-viewport run listens to both and flagged it
   * immediately. A harness that only watches one error channel will keep
   * reporting green through a broken shader.
   */
  const needsTimeUniform = !shader.fragmentShader.includes('uniform float uRefractTime;');
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      ${needsTimeUniform ? 'uniform float uRefractTime;' : ''}
      uniform float uCausticStrength;
      uniform float uCausticScale;
      varying vec2 vWorldXZ;
      varying float vWorldY;
      ${WATER_NOISE_GLSL}
      #define WATER_SURFACE_Y (${WATER.surfaceY.toFixed(4)})`
    )
    .replace(
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;' +
        PROJECTED_CAUSTICS_CHUNK
    );
}

function applyUnderwaterRefraction(mat, strength = 1) {
  mat.onBeforeCompile = (shader) => {
    patchToonShader(shader, false);
    shader.uniforms.uRefractTime = refractionUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uRefractTime;`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #ifdef USE_MAP
          // Two crossed sine trains rather than a noise lookup: this runs
          // over the whole bay every frame, and two sines are a handful of
          // instructions where a two-octave fbm would be dozens. The
          // frequencies are deliberately non-harmonic so the pattern never
          // resolves into a visible grid.
          vec2 rUv = vMapUv;
          rUv.x += sin( vMapUv.y * 22.0 + uRefractTime * 1.15 ) * ${(0.006 * strength).toFixed(5)};
          rUv.y += sin( vMapUv.x * 17.0 - uRefractTime * 0.87 ) * ${(0.006 * strength).toFixed(5)};
          rUv.x += sin( vMapUv.y * 9.0 - uRefractTime * 0.52 ) * ${(0.004 * strength).toFixed(5)};
          vec4 sampledDiffuseColor = texture2D( map, rUv );
          diffuseColor *= sampledDiffuseColor;
        #endif
        `
      );
    // Applied LAST, so its guard above sees the uniform this patch just
    // declared and skips its own copy.
    applyProjectedCaustics(shader);
  };
  mat.customProgramCacheKey = () => `refract${strength}`;
  return mat;
}

const floor = new THREE.Mesh(
  buildSeabedGeometry(0),
  applyUnderwaterRefraction(
    toonMat({
      color: 0xffffff,
      map: SAND_TEXTURE,
      alphaMap: BAY_FADE_TEXTURE,
      transparent: true,
    })
  )
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, WATER.bayCenterZ); // height is baked into the geometry
floor.receiveShadow = true;
// REAL BUG this fixes: three sorts transparent objects back-to-front by
// their bounding-sphere distance to the camera, and the seabed is OFFSET
// SOUTH (bayCenterZ) while the water plane is centered on the origin —
// which puts the seabed's center CLOSER to this camera than the water's,
// so the seabed was being drawn AFTER (i.e. on top of) the water it is
// supposed to sit under. That is why the bay kept compositing as bare sand
// no matter how the water's color and opacity were tuned: the water was
// there, it was simply being painted over every frame. An explicit
// renderOrder pins the stack instead of letting a center-point heuristic
// decide it. Negative values keep the rest of the scene's transparents
// (shot trails, ammo sprites) on their normal distance-sorted path.
floor.renderOrder = -2;
scene.add(floor);

// -- Layer 2: the caustic light web crawling over the sand. Additive and
// depthWrite:false — it's LIGHT landing on the seabed, not a surface, so
// it must brighten what's under it without occluding anything or taking
// part in depth sorting. Deliberately NOT toon-shaded: caustics are an
// emissive light pattern, and running them through the 3-band ramp would
// have the sun's own shading darken the light itself.
const causticsPlane = new THREE.Mesh(
  buildSeabedGeometry(0.08),
  new THREE.MeshBasicMaterial({
    map: CAUSTICS_TEXTURE,
    alphaMap: BAY_FADE_TEXTURE, // dies out with the sand it's projected on
    transparent: true,
    opacity: WATER.causticsOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
causticsPlane.rotation.x = -Math.PI / 2;
causticsPlane.position.set(0, 0, WATER.bayCenterZ); // height baked in
causticsPlane.renderOrder = -1; // between the sand and the water, always
scene.add(causticsPlane);

// PARALLAX: a second caustic sheet, higher in the water column, at a
// different scale and drifting faster. Two layers at different depths
// moving at different rates is the whole trick — with one layer the light
// slides across the bed like a decal, and no amount of tuning its speed
// fixes that, because a single plane has no depth to give away.
const CAUSTICS_TEXTURE_HI = buildBedCausticTexture();
CAUSTICS_TEXTURE_HI.repeat.set(WATER.causticsRepeat * 1.9, WATER.causticsRepeat * 1.9);
const causticsPlaneHi = new THREE.Mesh(
  buildSeabedGeometry(0.55),
  new THREE.MeshBasicMaterial({
    map: CAUSTICS_TEXTURE_HI,
    alphaMap: BAY_FADE_TEXTURE,
    transparent: true,
    opacity: WATER.causticsOpacity * 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
causticsPlaneHi.rotation.x = -Math.PI / 2;
causticsPlaneHi.position.set(0, 0, WATER.bayCenterZ);
causticsPlaneHi.renderOrder = -1;
scene.add(causticsPlaneHi);

// -- Layer 3 (top): THE TOON WATER SURFACE.
//
// This is a MeshToonMaterial whose fragment shader is extended through
// onBeforeCompile, rather than a from-scratch ShaderMaterial. That choice
// is deliberate and is what the brief asked for ("mantendo a coesão com o
// restante dos assets em MeshToonMaterial"): keeping three's own material
// means the water still goes through the SAME 3-tone gradient ramp, the
// same directional light, and — critically — still receives real shadows.
// A hand-written ShaderMaterial would have meant re-implementing three's
// entire shadow and lighting plumbing just to get those back.
//
// What the injection adds is Roystan's toon-water model:
//   depth difference vs. the scene depth buffer  ->  shallow/deep gradient
//   the same depth difference, tighter           ->  foam at intersections
//   scrolling noise thresholded by that value    ->  foam streaks + edges
//
// The key insight from the tutorial is that the foam edge and the surface
// streaks are NOT two effects: they're one noise texture compared against
// one threshold, where the threshold is driven to zero near an
// intersection (so nearly all the noise passes and the foam goes solid)
// and stays high out in open water (so only the noise peaks show, as
// sparse streaks). One sampler, one compare, both behaviours.
/* The procedural noise + Voronoi toolkit, shared by the WATER SURFACE and
 * by the caustics projected onto everything below it.
 *
 * Hoisted into one string rather than pasted into both shaders, and that
 * is not tidiness — it is the only way the two layers can stay in
 * register. The projection has to evaluate the SAME field at the same
 * world coordinates as the surface, so if the two copies ever drifted by a
 * constant, a frequency or a hash, the light on the seabed would stop
 * matching the foam casting it, and the whole effect would read as two
 * unrelated patterns.
 */
const WATER_NOISE_GLSL = /* glsl */ `
// ---- procedural noise, replacing the tiled foam texture ----
//
// Every texture-based attempt at this foam hit the same wall: a tile
// REPEATS, and at the scale the bay is drawn the repeat is plainly visible
// — which is what read as "muito padronizada". No amount of redrawing the
// tile fixes a tile.
//
// So the field is generated in the shader. fBm has no period, so nothing
// repeats anywhere in the bay.
float hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 345.45 ) );
  p += dot( p, p + 34.345 );
  return fract( p.x * p.y );
}

float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f ); // smoothstep interpolation: C1, so no
  // creases show up along the lattice lines
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float fbm( vec2 p ) {
  float sum = 0.0;
  float amp = 0.5;
  // 2.03 rather than 2.0, and a per-octave offset: an exact doubling makes
  // octaves share their lattice and the alignment shows as a grid.
  for ( int i = 0; i < 3; i++ ) {
    sum += amp * vnoise( p );
    p = p * 2.03 + 17.7;
    amp *= 0.5;
  }
  return sum;
}

// ---- the Wind Waker cell network ----
//
// Iso-contours of fbm (what this used to be) give closed organic curves,
// but they give BLOBS — islands of white that drift apart and rejoin, with
// no guarantee that any two of them connect. The reference is not blobs:
// it is a PARTITION. Every patch of blue is a cell, every cell is fully
// enclosed, and the white is one continuous net. Only a cellular
// construction has that property built in, so this had to go back to
// Voronoi — the primitive an earlier pass rejected.
//
// It was rejected for a real reason: Voronoi cells are convex polygons with
// straight edges and sharp corners. Two things fix that here, and neither
// is a tuning knob:
//
//  1. The lookup DOMAIN is warped by fbm before the cells are found. The
//     partition is still exact — every cell still closes — but its edges
//     are now curves, because straight lines in warped space are curves in
//     world space. This is the same trick as the domain warp before, used
//     on a construction that actually needs it.
//
//  2. The field measured is DISTANCE TO THE NEAREST EDGE, not F2 - F1.
//     F2 - F1 varies with how the two sites are placed, so a band drawn
//     from it changes width along its own length and pinches at junctions.
//     A true edge distance gives a stroke of constant width, and a thick
//     constant-width stroke through a Y-junction MERGES into a round blob
//     on its own — which is exactly what the reference's junctions look
//     like. The rounding is a consequence of stroke width, not a filter.
vec2 cellSite( vec2 c ) {
  // Two decorrelated hashes for the site's offset inside its cell, pulled
  // in from the walls (0.15..0.85) so neighbouring sites cannot land on top
  // of each other and collapse a cell to nothing.
  return vec2( 0.15 ) + 0.7 * vec2( hash21( c ), hash21( c + 41.7 ) );
}

float voronoiEdge( vec2 p, out float cellId ) {
  vec2 n = floor( p );
  vec2 f = fract( p );

  // Pass 1 — find the closest site. Its offset vector is kept, because the
  // edge distance in pass 2 is measured relative to it.
  vec2 closestOffset = vec2( 0.0 );
  vec2 closestCell = vec2( 0.0 );
  float best = 8.0;
  for ( int j = -1; j <= 1; j++ ) {
    for ( int i = -1; i <= 1; i++ ) {
      vec2 g = vec2( float( i ), float( j ) );
      vec2 r = g + cellSite( n + g ) - f;
      float d = dot( r, r );
      if ( d < best ) { best = d; closestOffset = r; closestCell = g; }
    }
  }

  // The closest cell's id falls out of pass 1 for free. It used to be
  // recomputed by cellTone(), a THIRD full 3x3 sweep over the same sites
  // for a value pass 1 had already found — pure duplicated work on every
  // fragment of the bay.
  cellId = hash21( n + closestCell + 7.13 );

  // Pass 2 — distance to the bisector between the closest site and each
  // other site, which is the cell's own boundary.
  //
  // 3x3 AROUND THE CLOSEST CELL, not 5x5. This was 5x5, and the reason
  // given was that a 3x3 sweep leaves nicks in the net — which was true of
  // the version that swept around the ORIGINAL cell. Sweeping around the
  // CLOSEST cell instead (note the closestCell + term below) already covers
  // every site whose bisector can be nearest, so the extra ring was
  // answering a question that had already been fixed.
  //
  // It is worth being precise about the saving: this loop is the single
  // most expensive thing in the frame. It ran 25 sites x 2 hashes = 50
  // hashes per fragment, and it runs TWICE over most of the screen — once
  // for the water surface and once for the caustics projected on the
  // seabed beneath it. 25 -> 9 removes roughly two thirds of the fill cost
  // of the entire water stack.
  float edge = 8.0;
  for ( int j = -1; j <= 1; j++ ) {
    for ( int i = -1; i <= 1; i++ ) {
      vec2 g = closestCell + vec2( float( i ), float( j ) );
      vec2 r = g + cellSite( n + g ) - f;
      vec2 diff = r - closestOffset;
      float len = length( diff );
      if ( len > 1e-4 ) {
        edge = min( edge, dot( 0.5 * ( closestOffset + r ), diff / len ) );
      }
    }
  }
  return edge;
}

`;

const waterUniforms = {
  tWaterNoise: { value: FOAM_NOISE_TEXTURE },
  uVortexXZ: { value: new THREE.Vector2(0, 0) }, // filled in once the
  // whirlpool exists (see HOLE_POINT below); the water masks a disc here.
  uVortexRadius: { value: 0 },
  uWaterTime: { value: 0 },
  uShallowColor: { value: new THREE.Color(COLORS.waterShallow) },
  uDeepColor: { value: new THREE.Color(COLORS.waterDeep) },
  uFoamColor: { value: new THREE.Color(COLORS.waterFoam) },
  uMaxDepth: { value: WATER.maxDepth },
  uFoamDistance: { value: WATER.foamDistance },
  uFoamCutoff: { value: WATER.foamCutoff },
  uFoamSoftness: { value: WATER.foamSoftness },
  uNoiseScale: { value: WATER.foamNoiseScale },
  uNoiseAspect: { value: WATER.foamNoiseAspect },
  uFoamScroll: { value: new THREE.Vector2(WATER.foamScroll.x, WATER.foamScroll.y) },
  uDistortAmount: { value: WATER.distortAmount },
  uDistortScroll: { value: new THREE.Vector2(WATER.distortScroll.x, WATER.distortScroll.y) },
  uShallowAlpha: { value: WATER.shallowAlpha },
  uDeepAlpha: { value: WATER.deepAlpha },
  uDepthBands: { value: WATER.depthBands },
  uFoamShadeColor: { value: new THREE.Color(COLORS.waterFoamShade) },
  uFoamVioletColor: { value: new THREE.Color(COLORS.waterFoamViolet) },
};

const waterMaterial = toonMat({
  color: 0xffffff,
  transparent: true,
  depthWrite: false, // never occlude the seabed/caustics behind it
});
waterMaterial.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, waterUniforms);

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;')
    // World XZ, not UV: the foam has to tile in WORLD space so its scale is
    // set by the bay's real size rather than by how big this plane happens
    // to be, and so it stays put relative to the props it breaks against.
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n\tvWaterXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;'
    );

  // Injected so the GLSL seabed profile is literally the same numbers as
  // the JS one that builds the mesh.
  const SEABED_DEFS =
    `#define SEABED_Y (${WATER.seabedY.toFixed(4)})\n` +
    `#define SEABED_RIM_IN (${(beltHalfW + 4).toFixed(4)})\n` +
    `#define SEABED_RIM_OUT (${(beltHalfW + 22).toFixed(4)})\n` +
    `#define WATER_SURFACE_Y (${WATER.surfaceY.toFixed(4)})\n`;
  shader.fragmentShader = SEABED_DEFS + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform sampler2D tWaterNoise;
uniform vec2 uVortexXZ;
uniform float uVortexRadius;
uniform float uWaterTime;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uFoamColor;
uniform float uMaxDepth;
uniform float uFoamDistance;
uniform float uFoamCutoff;
uniform float uFoamSoftness;
uniform float uNoiseScale;
uniform float uNoiseAspect;
uniform vec2 uFoamScroll;
uniform float uDistortAmount;
uniform vec2 uDistortScroll;
uniform float uShallowAlpha;
uniform float uDeepAlpha;
uniform float uDepthBands;
uniform vec3 uFoamShadeColor;
uniform vec3 uFoamVioletColor;
varying vec2 vWaterXZ;

// How deep the water is at a world XZ — evaluated directly from the seabed
// profile rather than read back from a depth buffer. The bottom is not an
// unknown: it is a function this project writes itself (seabedHeightAt in
// JS), so the shader evaluates the same function and the whole depth
// pre-pass disappears. The constants are injected from JS so the two
// implementations cannot drift apart.
float seabedHeight( const in vec2 xz ) {
  float southRise = smoothstep( 8.0, 42.0, xz.y ) * 0.5;
  float rimRise = smoothstep( SEABED_RIM_IN, SEABED_RIM_OUT, abs( xz.x ) ) * 0.28;
  float ripple = sin( xz.x * 0.18 ) * cos( xz.y * 0.15 ) * 0.13;
  return SEABED_Y + southRise + rimRise + ripple;
}

${WATER_NOISE_GLSL}
`
    )
    .replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `vec4 diffuseColor = vec4( diffuse, opacity );

  // The whirlpool is a HOLE, not a patch of surface: the foam network has
  // to stop at its rim, or the funnel reads as a picture painted on flat
  // water instead of an opening in it.
  //
  // And the rim is NOT A CIRCLE. A perfect circle is the one shape that
  // cannot read as water being dragged into a drain — it reads as a disc
  // laid on top. Three sine harmonics of the angle push the edge in and
  // out, which is enough to make it wander without ever folding back on
  // itself (a radius that stays positive and single-valued is still a
  // simple closed curve, so nothing downstream has to cope with a
  // self-intersecting boundary).
  //
  // The harmonics DRIFT: each one advances at its own rate, so the lobes
  // slide past each other and the outline is never the same shape twice.
  // A previous pass froze them because the JS foam ring is built from the
  // same three terms and the two have to agree to the vertex — an animated
  // edge means rebuilding that ring every frame. It does now (see
  // vortexWobble / the rim rebuild in tickWhirlpool): 128 segments of one
  // ring is nothing next to the scene, and a rim that visibly changes
  // shape is the difference between water being pulled in and a hole
  // stamped in the surface.
  vec2 vortexDelta = vWaterXZ - uVortexXZ;
  float vortexAngle = atan( vortexDelta.y, vortexDelta.x );
  float vortexWobble = 1.0
    + 0.15 * sin( vortexAngle * 3.0 + 0.7 + uWaterTime * 0.55 )
    + 0.09 * sin( vortexAngle * 5.0 - 1.9 - uWaterTime * 0.41 )
    + 0.05 * sin( vortexAngle * 8.0 + 2.4 + uWaterTime * 0.29 );
  if ( length( vortexDelta ) < uVortexRadius * vortexWobble ) discard;

  // --- how much water is over the bed at this point ---
  float waterDepth = max( WATER_SURFACE_Y - seabedHeight( vWaterXZ ), 0.0 );

  // --- depth gradient, quantized into cel bands ---
  float depth01 = clamp( waterDepth / uMaxDepth, 0.0, 1.0 );
  float bandedDepth = clamp( floor( depth01 * uDepthBands ) / ( uDepthBands - 1.0 ), 0.0, 1.0 );
  vec3 waterColor = mix( uShallowColor, uDeepColor, bandedDepth );
  float waterAlpha = mix( uShallowAlpha, uDeepAlpha, bandedDepth );

  // --- the foam network ---
  //
  // Domain first, cells second. The warp is what turns a polygon partition
  // into the reference's rounded, wandering cells (see voronoiEdge above),
  // and animating the warp rather than scrolling the result is what makes
  // the net breathe in place instead of sliding across the bay like a
  // printed sheet.
  vec2 fUV = vWaterXZ * uNoiseScale;
  // TWO warps at different scales and rates, both much faster than
  // before. One slow and broad, one quicker and finer. A single warp at
  // one rate makes the whole net breathe in unison, which is what read as
  // "too slow" even when the rate was raised — the eye needs the cells to
  // change shape RELATIVE TO EACH OTHER, and that only happens when the
  // deformation itself has more than one frequency moving through it.
  vec2 warpA = vec2(
    fbm( fUV * 0.9 + vec2( uWaterTime * 0.13, 0.0 ) ),
    fbm( fUV * 0.9 + vec2( 0.0, -uWaterTime * 0.105 ) + 5.2 )
  ) - 0.5;
  vec2 warpB = vec2(
    fbm( fUV * 2.1 + vec2( -uWaterTime * 0.21, uWaterTime * 0.09 ) + 11.3 ),
    fbm( fUV * 2.1 + vec2( uWaterTime * 0.17, uWaterTime * 0.14 ) + 3.7 )
  ) - 0.5;
  vec2 cUV = fUV
    + warpA * uDistortAmount * 26.0
    + warpB * uDistortAmount * 9.0
    + uWaterTime * uFoamScroll;

  float cellId;
  float edgeDist = voronoiEdge( cUV, cellId );

  // One hard-edged stroke of CONSTANT width along every cell boundary. The
  // width is the whole look: too thin and the frame is all blue with a
  // spider web on it, too thick and the cells drown. The reference sits at
  // roughly a tenth of a cell.
  float aa = fwidth( edgeDist ) * 0.9 + 0.002;
  float foam = 1.0 - smoothstep( uFoamSoftness - aa, uFoamSoftness + aa, edgeDist );

  // A second, wider stroke outside the first at partial strength: the
  // borders are not a flat white band, they have a brighter core with a
  // softer shoulder.
  float inner = 1.0 - smoothstep( uFoamSoftness * 1.9 - aa, uFoamSoftness * 1.9 + aa, edgeDist );
  foam = clamp( foam + inner * 0.2, 0.0, 1.0 );

  // VARIATION INSIDE THE SILHOUETTE.
  //
  // The stroke was a single flat white, which is what made the contrast
  // read as harsh however thin the line got — a pure, uniform white next
  // to saturated blue is the strongest edge available in the frame, and
  // thinning it only makes it a thinner maximum-contrast edge.
  //
  // So the foam's own coverage is now modulated by a noise field along the
  // border: the stroke thins, thickens and momentarily half-dissolves
  // along its length. That does two things at once — it takes the peak
  // contrast down without desaturating anything, and it makes the net read
  // as foam gathering unevenly rather than as a drawn outline.
  float foamGrain = fbm( fUV * 3.1 + uWaterTime * 0.06 );
  foam *= 0.55 + 0.45 * smoothstep( 0.25, 0.72, foamGrain );

  // Cell-sized tone variation in the blue, plus a finer mottle inside it.
  // In the reference no two cells are quite the same value and each one has
  // lighter patches drifting through it, and that — not the net — is what
  // makes the surface read as water with depth rather than as tiled vinyl.
  float tone = cellId;
  float mottle = fbm( fUV * 2.6 + uWaterTime * 0.05 );
  vec3 cellColor = waterColor * ( 0.9 + tone * 0.2 );
  cellColor = mix( cellColor, mix( cellColor, uFoamColor, 0.3 ), smoothstep( 0.5, 0.8, mottle ) * 0.45 );

  // Sparse white flecks — the tiny highlights scattered over the reference
  // tile. Threshold high so they stay rare; at any higher coverage they
  // read as dirt on the lens.
  // 0.72, not 0.9: fbm here is three octaves at 0.5/0.25/0.125, so it can
  // never reach 0.875 and a threshold above that produces no flecks at all
  // — an easy way to ship a dead effect and never notice.
  float fleck = step( 0.72, fbm( fUV * 7.0 - uWaterTime * 0.09 ) );
  cellColor = mix( cellColor, uFoamColor, fleck * 0.75 );

  // The white itself is broken up too, toward the cooler shade tone and
  // toward the water under it. Pure white is reserved for the few brightest
  // spots rather than being the whole net.
  vec3 foamTone = mix( uFoamColor, uFoamShadeColor, smoothstep( 0.3, 0.75, mottle ) * 0.55 );
  foamTone = mix( foamTone, cellColor, ( 1.0 - foam ) * 0.35 );

  diffuseColor.rgb = mix( cellColor, foamTone, foam );
  // The foam no longer goes fully opaque. At alpha 1 the net was a solid
  // lid over the seabed, and the reference's foam has the water reading
  // faintly through it.
  diffuseColor.a = mix( waterAlpha, 0.88, foam );`
    );

  // Kept so tick() can drive uWaterTime and the resize handler can keep
  // uWaterRes in step with the drawing buffer.
  waterShaderRef = shader;
  updateWaterResolution();
};

const waterSurface = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), waterMaterial);
waterSurface.rotation.x = -Math.PI / 2;
waterSurface.position.y = WATER.surfaceY;
// The plane that catches the SURFACE half of every prop's double shadow.
waterSurface.receiveShadow = true;
scene.add(waterSurface);
updateWaterResolution();

// ---------------------------------------------------------------------
// MARINE LIFE — fish crossing under the water, with a rare shark and a
// rarer whale.
//
// These are the strongest argument the scene has that the water is CLEAR:
// a caustic pattern says "surface", but something moving BENEATH the
// surface, tinted by it and occluded by nothing, is what makes the depth
// legible as depth. They swim between the seabed and the surface film, so
// the water shader's own tint colours them — no per-fish tinting needed.
//
// Everything is one small primitive stack (body + tail + fin), because at
// this size and depth they resolve to a moving silhouette and nothing more.
// ---------------------------------------------------------------------
const SEA_LIFE = {
  fish: { every: [1.6, 4.5], size: [0.35, 0.62], speed: [3.2, 5.5], school: [2, 5] },
  shark: { every: [26, 52], size: 2.3, speed: 3.4 },
  // The two RARE species. Their intervals are long enough that most runs
  // will not show one — that is the point of a rare spawn, and making them
  // common would turn a moment into scenery. Both are silhouette
  // variations on the shark rather than new models: what makes a hammerhead
  // or a sawfish recognisable is one distinctive shape, and at this scale
  // that shape is the entire read.
  hammerhead: { every: [70, 150], size: 2.6, speed: 3.1 },
  sawfish: { every: [85, 180], size: 2.5, speed: 2.7 },
  whale: { every: [95, 190], size: 5.2, speed: 2.1 },
};

function buildSwimmerMesh(kind, size, color) {
  const group = new THREE.Group();
  const mat = toonMat({ color });
  const body = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 12, 9), mat);
  // Elongated on the geometry, not the mesh: these get scaled as a whole
  // when they spawn, and a mesh-level stretch would be multiplied by that.
  // Flattened harder for the big two: a shark or a whale at natural
  // proportions simply does not fit between the bed and the surface in a
  // bay this shallow, and squashing them is far cheaper than deepening the
  // water — which would have cost the crystalline read the whole scene is
  // built around.
  body.geometry.scale(1, kind === 'fish' ? 0.62 : 0.4, kind === 'whale' ? 2.4 : 1.9);
  group.add(body);

  // HAMMERHEAD: the cephalofoil. A wide flattened bar across the nose, and
  // nothing else needs to change — from above, which is the only angle this
  // game shows, that bar IS the animal.
  if (kind === 'hammerhead') {
    const headBar = new THREE.Mesh(new THREE.BoxGeometry(size * 1.15, size * 0.16, size * 0.3), mat);
    headBar.position.z = -size * 0.85;
    group.add(headBar);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(size * 0.055, 8, 6), toonMat({ color: COLORS.eye }));
      eye.position.set(sx * size * 0.54, 0, -size * 0.88);
      group.add(eye);
    }
  }

  // SAWFISH: the rostrum. A long flat blade with teeth down both edges —
  // the teeth are what stop it reading as a swordfish's round bill.
  if (kind === 'sawfish') {
    const saw = new THREE.Mesh(new THREE.BoxGeometry(size * 0.16, size * 0.07, size * 1.15), mat);
    saw.position.z = -size * 1.45;
    group.add(saw);
    const toothGeo = new THREE.ConeGeometry(size * 0.035, size * 0.16, 4);
    for (let i = 0; i < 7; i++) {
      for (const sx of [-1, 1]) {
        const tooth = new THREE.Mesh(toothGeo, mat);
        tooth.rotation.z = (sx * Math.PI) / 2;
        tooth.position.set(sx * size * 0.13, 0, -size * (1.0 + i * 0.15));
        group.add(tooth);
      }
    }
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(size * 0.42, size * 0.6, 4), mat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = size * 0.95;
  tail.scale.set(0.35, 1, 1);
  group.add(tail);

  if (kind !== 'fish') {
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(size * 0.3, size * 0.55, 3), mat);
    dorsal.position.y = size * 0.34;
    dorsal.scale.set(0.3, 1, 1);
    group.add(dorsal);
  }
  return group;
}

const swimmers = [];
const spawnTimers = { fish: 2, shark: 14, hammerhead: 40, sawfish: 55, whale: 55 };
const randRange = (r) => r[0] + Math.random() * (r[1] - r[0]);

function spawnSwimmer(kind) {
  const cfg = SEA_LIFE[kind];
  const dir = Math.random() < 0.5 ? 1 : -1;
  // Big animals pass deep and slow near the bottom; small fish drift higher
  // in the column, so the two read at different depths rather than as one
  // flat layer of stuff.
  const depthT = kind === 'fish' ? 0.35 + Math.random() * 0.4 : 0.12 + Math.random() * 0.15;
  const spanZ = beltHalfH + QUEUE.areaOffsetZ + QUEUE.visibleRows * QUEUE.rowSpacing;
  const z = -beltHalfH - 6 + Math.random() * (spanZ + beltHalfH + 10);
  const startX = dir > 0 ? -beltHalfW - 12 : beltHalfW + 12;
  const count = kind === 'fish' ? Math.round(randRange(cfg.school)) : 1;
  const palette = kind === 'fish' ? COLORS.fishSchool : [COLORS[kind]];

  for (let i = 0; i < count; i++) {
    const size = kind === 'fish' ? randRange(cfg.size) : cfg.size;
    const mesh = buildSwimmerMesh(kind, size, palette[Math.floor(Math.random() * palette.length)]);
    // Hard ceiling below the waterline. Big animals are tall enough that a
    // depth fraction alone let a shark's dorsal poke through the surface —
    // and something breaching the water ruins the one illusion the whole
    // layer stack exists to sell. The clamp is on the TOP of the animal,
    // not its centre, which is why the size term is in here.
    const bedY = seabedHeightAt(0, z);
    const halfHeight = (kind === 'fish' ? size : cfg.size) * 0.34;
    const ceiling = WATER.surfaceY - 0.12 - halfHeight;
    const y = Math.min(THREE.MathUtils.lerp(WATER.surfaceY, bedY, depthT), ceiling);
    const jitterZ = kind === 'fish' ? (Math.random() - 0.5) * 3 : 0;
    mesh.position.set(startX - dir * i * (1.2 + Math.random()), y, z + jitterZ);
    // The tail is at local +Z, so the model FACES -Z. Rotating a vector
    // (0,0,-1) by t about Y gives x' = -sin(t): to point it at +X you need
    // sin(t) = -1, i.e. t = -90 degrees. The previous sign had every fish
    // swimming tail-first.
    mesh.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(mesh);
    swimmers.push({
      mesh,
      dir,
      speed: (kind === 'fish' ? randRange(cfg.speed) : cfg.speed) * (0.9 + Math.random() * 0.2),
      phase: Math.random() * 10,
      baseY: y,
    });
  }
}

function tickSeaLife(dt, t) {
  for (const key of Object.keys(spawnTimers)) {
    spawnTimers[key] -= dt;
    if (spawnTimers[key] <= 0) {
      spawnSwimmer(key);
      const every = SEA_LIFE[key].every;
      spawnTimers[key] = Array.isArray(every) ? randRange(every) : randRange([every * 0.7, every * 1.3]);
    }
  }
  const limit = beltHalfW + 16;
  for (let i = swimmers.length - 1; i >= 0; i--) {
    const sw = swimmers[i];
    sw.mesh.position.x += sw.dir * sw.speed * dt;
    // A slow vertical drift plus a yaw wag: without them a swimmer slides
    // across like a decal on a rail.
    // Bob kept small and downward-biased, so the drift can never carry a
    // swimmer back up through the surface.
    sw.mesh.position.y = sw.baseY - 0.06 + Math.sin(t * 1.1 + sw.phase) * 0.06;
    sw.mesh.rotation.y =
      (sw.dir > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.sin(t * 2.4 + sw.phase) * 0.12;
    if (Math.abs(sw.mesh.position.x) > limit) {
      scene.remove(sw.mesh);
      sw.mesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      swimmers.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------
// WATERLINE FOAM DECALS — the replacement for the screen-space contact ring.
//
// The client's topology sketches are the spec: foam belongs exactly where a
// solid meets the surface, and nowhere else. A depth-buffer test can't
// express that, because "geometry is close behind this pixel" is not the
// same statement as "this object floats here" — which is why the old
// version ringed an entire stack of boias when only the bottom one is in
// the water. Stating it as geometry means the topology is declared, not
// inferred: a decal is attached to a hull, to the one boia that floats, to
// the reef's own footprint, and to nothing else.
//
// It also fixes the aliasing for free — a soft-edged texture on a quad has
// no stair-steps, where a half-resolution screen-space threshold always
// will.
// ---------------------------------------------------------------------

/** Foam band textures — SOLID, not soft.
 *
 * The previous version blurred the band, which is what made it read as
 * smoke around the object instead of foam against it. Cartoon foam has a
 * hard edge: the shape does the work, so the outline is a filled band with
 * a wavy contour and NO blur, and it sits tight against the silhouette
 * rather than haloing outward from it.
 *
 * Built by filling the outer wavy contour and then punching the inner one
 * out with `destination-out`, which is what leaves a band of constant,
 * controllable thickness — stroking a path instead would centre the width
 * on the contour and bleed half of it inward over the object. */
function buildFoamBandTexture(kind) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  const wavyPath = (radiusScale, lobes, amp, phase) => {
    ctx.beginPath();
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      // Two lobe frequencies, so the wobble is irregular rather than a
      // clean flower shape.
      const wob =
        1 + Math.sin(t * lobes + phase) * amp + Math.sin(t * (lobes * 2.3) + phase * 1.7) * amp * 0.45;
      let rx;
      let ry;
      if (kind === 'circle') {
        rx = ry = S * 0.5 * radiusScale * wob;
      } else {
        // Square-ish contour for hulls and the reef block: a superellipse,
        // so the corners round off without the sides bowing in.
        const c = Math.cos(t);
        const sn = Math.sin(t);
        const n = 4.5;
        const k = Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(sn), n), -1 / n);
        rx = S * 0.5 * radiusScale * wob * k * Math.abs(c) * Math.sign(c) || 0;
        ry = S * 0.5 * radiusScale * wob * k * Math.abs(sn) * Math.sign(sn) || 0;
        const x = S / 2 + rx;
        const y = S / 2 + ry;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        continue;
      }
      const x = S / 2 + Math.cos(t) * rx;
      const y = S / 2 + Math.sin(t) * ry;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  ctx.fillStyle = '#ffffff';
  wavyPath(1.0, 7, 0.016, 0.6);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  wavyPath(0.86, 9, 0.011, 2.1);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  // Linear filtering only — a hard-edged band still needs its own texels
  // interpolated, or the edge itself becomes the staircase we were trying
  // to get away from.
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
const FOAM_BAND_ROUND = buildFoamBandTexture('circle');
const FOAM_BAND_RECT = buildFoamBandTexture('rect');

/** A flat foam band lying on the water surface, sized to the footprint of
 * whatever is floating there. */
function buildFoamDecal(width, depth, kind = 'circle', opacity = 0.75) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({
      map: kind === 'circle' ? FOAM_BAND_ROUND : FOAM_BAND_RECT,
      color: COLORS.waterFoam,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  // Above the water plane, and drawn after it: the water is transparent and
  // does not write depth, so without an explicit order the decal can end up
  // sorted underneath the very surface it is supposed to sit on.
  mesh.position.y = WATER.surfaceY + 0.012;
  mesh.renderOrder = 2;
  return mesh;
}

// ---------------------------------------------------------------------
// Decorative reef clusters scattered on the SEABED along the frame's left
// and right margins, per the reference art's colorful corals in the
// corners. Reuses the same coral/sponge geometry builders as the gameplay
// grid (below) at larger, randomized scales — they sit at WATER.seabedY,
// so they're seen through the full water column and are one more thing
// giving the depth away. Colors come from COLORS.seabedReef, kept clear of
// both team colors so a decorative coral can never be misread as a
// shootable one.
// ---------------------------------------------------------------------
/** A flat five-pointed starfish lying on the sand, with a paler centre —
 * reference step 2. Extruded from a Shape rather than assembled from
 * primitives: the concave points between the arms are the whole silhouette,
 * and that is exactly the shape a boolean-free primitive stack can't make. */
function buildStarfishGeometry(radius) {
  const shape = new THREE.Shape();
  const arms = 5;
  for (let i = 0; i < arms * 2; i++) {
    const outer = i % 2 === 0;
    const r = outer ? radius : radius * 0.42;
    const a = (i / (arms * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: radius * 0.16,
    bevelEnabled: true,
    bevelThickness: radius * 0.1,
    bevelSize: radius * 0.1,
    bevelSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** A small clump of 2-3 pointed anemone fronds. Kept low and simple: at the
 * size these render on a phone, anything more detailed is a coloured smudge. */
function buildAnemoneCluster(mat, scale) {
  const group = new THREE.Group();
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const h = (0.5 + Math.random() * 0.45) * scale;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.19 * scale, h, 4), mat);
    frond.position.set(
      (Math.random() - 0.5) * 0.5 * scale,
      h / 2,
      (Math.random() - 0.5) * 0.5 * scale
    );
    frond.rotation.z = (Math.random() - 0.5) * 0.5;
    frond.rotation.y = Math.random() * Math.PI;
    frond.castShadow = true;
    group.add(frond);
  }
  return group;
}

/** A branching coral head for the SEABED. The reef moved down here this
 * pass: the board is rubbish now, so the actual living reef is what the
 * player uncovers underneath as they clear it — which is the whole point of
 * the new premise, and it only pays off if there is something worth
 * seeing down there. */
function buildSeabedCoralGeometry(height) {
  const parts = [];
  const trunkH = height * 0.36;
  const trunk = new THREE.CylinderGeometry(0.11, 0.18, trunkH, 7);
  trunk.translate(0, trunkH / 2, 0);
  parts.push(trunk);
  const arms = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + Math.random() * 0.6;
    const len = height * (0.34 + Math.random() * 0.4);
    const branch = new THREE.CylinderGeometry(0.055, 0.085, len, 6);
    branch.translate(0, len / 2, 0);
    const tip = new THREE.SphereGeometry(0.06, 6, 5);
    tip.translate(0, len, 0);
    const g = mergeGeometries([branch, tip], false);
    g.rotateZ(Math.cos(a) * 0.55);
    g.rotateX(Math.sin(a) * 0.55);
    g.translate(Math.cos(a) * 0.12, trunkH * 0.75, Math.sin(a) * 0.12);
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

/** Seagrass: a few tapered blades leaning off vertical. Cheap, and enough
 * to break up bare sand between the coral heads. */
function buildAlgaeGeometry(height) {
  const parts = [];
  const blades = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < blades; i++) {
    const h = height * (0.6 + Math.random() * 0.7);
    const blade = new THREE.CylinderGeometry(0.015, 0.07, h, 5);
    blade.translate(0, h / 2, 0);
    blade.rotateZ((Math.random() - 0.5) * 0.9);
    blade.rotateX((Math.random() - 0.5) * 0.9);
    blade.translate((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
    parts.push(blade);
  }
  return mergeGeometries(parts, false);
}

function buildSeabedDecor() {
  const group = new THREE.Group();
  // The reef SWAYS. Same underwater-motion brief as the seabed's texture
  // wobble, but props need it in geometry rather than in UVs — a coral is
  // a silhouette against the sand, and distorting its texture would do
  // nothing to the outline the eye is actually reading.
  //
  // Scaled by the vertex's own height above its base, so each piece bends
  // from the seabed rather than sliding as a block, and phased by world
  // position so the whole reef never leans in unison.
  /* LOW-POLY ROCKS. Deliberately NOT swayed — the sway materials are for
   * things that bend in a current, and a rock that leans with the water is
   * the fastest way to tell the player none of this is real. They are also
   * the only hard, angular silhouette down there: every other prop is
   * organic and curved, so the rocks are what give the bed a sense of
   * ground rather than of decoration.
   *
   * An icosahedron at detail 0 is twenty flat faces — exactly the faceted
   * read wanted — and non-uniform scaling per instance turns one geometry
   * into boulders, slabs and pebbles without a second mesh. */
  const rockMats = COLORS.seabedRock.map((c) => toonMat({ color: c, flatShading: true }));
  const starMats = COLORS.seabedStar.map((c) => applyReefSway(toonMat({ color: c })));
  const anemoneMats = COLORS.seabedAnemone.map((c) => applyReefSway(toonMat({ color: c })));
  const reefMats = COLORS.seabedReefCoral.map((c) => applyReefSway(toonMat({ color: c })));
  const algaeMats = COLORS.seabedAlgae.map((c) => applyReefSway(toonMat({ color: c })));
  const spanZ = beltHalfH + QUEUE.areaOffsetZ + QUEUE.visibleRows * QUEUE.rowSpacing;

  for (let i = 0; i < WATER.decorClusters; i++) {
    // Spread over the WHOLE bay, not just the side margins. In the
    // reference these are scattered everywhere, including under the play
    // area — the ones the board hides cost nothing, and the ones inside the
    // belt loop are a big part of why the bay reads as a real place.
    const x = (Math.random() - 0.5) * (beltHalfW * 2 + 9);
    const z = -beltHalfH - 7 + Math.random() * (spanZ + beltHalfH + 12);
    const scale = 0.75 + Math.random() * 0.5;
    // Four kinds rather than two, weighted so no single silhouette
    // dominates: the bed is what the player is uncovering, so it has to
    // reward being looked at once the rubbish is gone.
    const roll = Math.random();
    let mesh;
    if (roll < 0.18) {
      const rockGeo = new THREE.IcosahedronGeometry(0.42 * (0.6 + Math.random() * 1.5), 0);
      // Squashed so it sits like a boulder rather than floating like a die,
      // and jittered per axis so no two are the same shape.
      rockGeo.scale(1 + Math.random() * 0.5, 0.45 + Math.random() * 0.35, 1 + Math.random() * 0.5);
      mesh = new THREE.Mesh(rockGeo, rockMats[i % rockMats.length]);
      mesh.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (roll < 0.34) {
      mesh = new THREE.Mesh(buildStarfishGeometry(0.62 * scale), starMats[i % starMats.length]);
      mesh.castShadow = true;
    } else if (roll < 0.5) {
      mesh = new THREE.Mesh(
        buildSeabedCoralGeometry(1.7 + Math.random() * 1.5),
        reefMats[i % reefMats.length]
      );
      mesh.castShadow = true;
    } else if (roll < 0.78) {
      mesh = new THREE.Mesh(buildAlgaeGeometry(1.3 + Math.random() * 1.0), algaeMats[i % algaeMats.length]);
      mesh.castShadow = true;
    } else {
      mesh = buildAnemoneCluster(anemoneMats[i % anemoneMats.length], scale);
    }
    const bedY = seabedHeightAt(x, z);
    mesh.position.set(x, bedY, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    // NOTHING BREAKS THE SURFACE. The reef is meant to be seen THROUGH the
    // water — a coral poking out the top instantly reads as a rock on dry
    // land and destroys the depth the whole water stack exists to build.
    // Decor is scattered at random heights and the bed rises toward the
    // frame edges, so the two together were pushing the tallest pieces out
    // of the water in the shallows.
    //
    // Scaled down to fit rather than moved or culled: moving it would
    // leave tall pieces floating off the bed, and culling would strip the
    // reef exactly where the water is clearest and the player looks most.
    mesh.updateMatrixWorld(true);
    const topY = new THREE.Box3().setFromObject(mesh).max.y;
    const ceiling = WATER.surfaceY - 0.12;
    if (topY > ceiling && topY > bedY) {
      const available = Math.max(0.12, ceiling - bedY);
      mesh.scale.multiplyScalar(THREE.MathUtils.clamp(available / (topY - bedY), 0.25, 1));
    }
    group.add(mesh);
  }
  return group;
}
const seabedDecorGroup = buildSeabedDecor();
scene.add(seabedDecorGroup);

// v2: decorative boat prop at the queue's dock/bow — where the penguin
// line originates before sliding down the current onto the belt, per
// "o barco agora aparece em destaque na proa... na doca". Built as a
// simple hull (tapered box) + open-sided cabin wall + a small bow marker,
// placed just south of the queue's last visible row so it reads as the
// structure the line is walking out of, without sitting on top of any
// queue slot position (queueSlotPosition is defined further down, so this
// is deferred into a function called once the belt geometry — beltHalfH —
// is known).
// The pier the penguin queue actually stands in, modelled from the user's
// concept: a real hull with a tapered bow pointing north at the play area,
// raised gunwales down both sides, and a planked deck the whole queue sits
// on. It replaces the flat plank of the previous pass, which left the two
// front queue rows apparently standing on open water.
//
// Everything is authored directly in WORLD z, and the shape's y is negated
// when building it: the mesh is rotated -90° about X (so the extrusion axis
// becomes world Y, i.e. the hull walls stand up), and that rotation maps
// local (x, y, z) to world (x, z, -y) — so world z is MINUS the shape's y.
// Getting that sign wrong builds the boat sailing backwards.
const BOAT = {
  bowZ: 16.2, // tip of the bow, north of the queue's FRONT row: the hull
  // has to contain all three visible rows, not just the back two.
  shoulderZ: 24.0, // where the taper ends and the sides run straight
  sternZ: 58, // far off the bottom of the frame, past the hidden queue row
  halfWidth: 9.6, // frame is ~24.2 world units wide, so this leaves a thin
  // strip of water visible down each side, as in the concept
  wallThickness: 0.62, // THINNER, per the brief. At 1.15 the rim ate a
  // wide band of deck all the way round and the HUD item slots ended up
  // sitting on top of it; this is a gunwale now, not a parapet.
  hullBottomY: -0.45, // dips below the waterline: it still floats, and the
  // submerged lip is what the foam band sits against.
  // The deck is lifted WELL clear of the water. Two reasons, and the second
  // is the one that was actually broken: a boat whose deck sits at the
  // waterline reads as a raft, and — because the water film and the fish
  // under it are transparent layers drawn after the opaque hull — anything
  // swimming past at deck height showed through the planking. Raising the
  // deck puts the whole crew above the water line where nothing can pass
  // behind them.
  deckY: 1.35,
  gunwaleY: 2.5,
  // Cartoon wide-angle: the hull is WIDER at the stern (nearest the camera)
  // than at the bow. A real boat tapers the other way, but an orthographic
  // camera flattens everything to the same size, so the exaggeration is how
  // the near end is given weight — the same trick a fisheye lens plays,
  // done in geometry because the projection can't.
  sternFlare: 1.22,
};

/** Hull outline — now seen from the STERN, per the revised direction: the
 * flat transom faces north toward the reef and the crew works off it, so
 * the end nearest the play area is a straight edge rather than a point.
 *
 * That flip also removes a problem the bow had: a taper narrows exactly
 * where the front queue row sits, so the outermost lanes had less deck than
 * the middle ones. A transom gives every lane the same width. */
function buildHullShape(halfWidth, bowZ, shoulderZ, sternZ) {
  const y = (worldZ) => -worldZ; // see the sign note above
  // The far (south) end is the one that tapers now, and it runs off-frame
  // anyway; the near end toward the reef is the flat transom. The hull is
  // still WIDER at the south, the cartoon wide-angle exaggeration — an
  // orthographic camera gives the near end no size advantage of its own, so
  // the geometry has to supply it.
  const flare = BOAT.sternFlare;
  const wFar = halfWidth * flare;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, y(bowZ)); // transom, port corner
  shape.lineTo(halfWidth, y(bowZ)); // transom, starboard corner
  shape.lineTo(wFar, y(shoulderZ + 6));
  shape.lineTo(wFar * 0.82, y(sternZ));
  shape.lineTo(-wFar * 0.82, y(sternZ));
  shape.lineTo(-wFar, y(shoulderZ + 6));
  shape.closePath();
  return shape;
}

/* THE GUNWALE, REBUILT AS A RIBBON.
 *
 * It used to be one ExtrudeGeometry of the hull outline with the inner
 * outline punched out as a hole. That produced a wall of CONSTANT height
 * all the way round, and then a pair of straight rounded boxes were laid
 * along the flanks to suggest rails — which is exactly the "paredes finas e
 * retas" the brief rejects: the boxes are straight while the hull tapers,
 * so they cross the hull's own line and read as scaffolding bolted on.
 *
 * A real boat's gunwale is low at the transom and rises toward the
 * quarters, and it follows the hull's curve because it IS the top edge of
 * the hull. Extrusion cannot do that — its depth is one number — so this
 * builds the wall directly: walk the outline, and at each sample emit a
 * quad column whose top height comes from a function of position. Four
 * vertices per sample, three strips (outer face, top cap, inner face), and
 * the wall follows the hull exactly because it is generated from the same
 * points the hull is.
 */
function buildGunwaleRibbon(outlinePts, thickness, topYAt) {
  const positions = [];
  const indices = [];
  const n = outlinePts.length;

  // Inward normal per sample, averaged from the two adjoining segments so
  // the offset wall does not kink at corners.
  const inward = outlinePts.map((_, i) => {
    const prev = outlinePts[(i - 1 + n) % n];
    const next = outlinePts[(i + 1) % n];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    // Left normal of the tangent; the outline is wound so this points in.
    return { x: -tz / len, z: tx / len };
  });

  for (let i = 0; i < n; i++) {
    const p = outlinePts[i];
    const nrm = inward[i];
    const topY = topYAt(p);
    const ix = p.x + nrm.x * thickness;
    const iz = p.z + nrm.z * thickness;
    // 0 outer-bottom, 1 outer-top, 2 inner-top, 3 inner-bottom
    // Both bottoms sit on the DECK, not down at the hull's underside. The
    // outer skirt used to run all the way to hullBottomY while the inner
    // face stopped at the deck, which left the wall visibly hovering with
    // daylight under it wherever the deck was seen at a low angle — a wall
    // has to meet the floor it stands on.
    positions.push(p.x, BOAT.deckY - 0.06, p.z);
    positions.push(p.x, topY, p.z);
    positions.push(ix, topY, iz);
    positions.push(ix, BOAT.deckY - 0.06, iz);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 4;
    const b = ((i + 1) % n) * 4;
    // outer face, top cap, inner face
    for (const [o0, o1] of [[0, 1], [1, 2], [2, 3]]) {
      indices.push(a + o0, a + o1, b + o1, a + o0, b + o1, b + o0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildBoatProp() {
  const group = new THREE.Group();

  const outerShape = buildHullShape(BOAT.halfWidth, BOAT.bowZ, BOAT.shoulderZ, BOAT.sternZ);
  // Sampled once and reused for the wall, so the wall cannot drift from the
  // hull outline it is supposed to be the top of.
  const outline = outerShape.getPoints(72).map((v) => ({ x: v.x, z: -v.y }));

  // Height along the hull. LOW at the transom — that edge is the one the
  // crew works over and the one the player looks across at the board, and
  // the previous constant-height wall put a bar right through that
  // sightline — rising toward the quarters, which is both what a boat does
  // and what the concept sketch draws.
  const transomZ = BOAT.bowZ;
  const topYAt = (p) => {
    const back = THREE.MathUtils.clamp((p.z - transomZ) / 9, 0, 1);
    const rise = back * back * (3 - 2 * back); // smoothstep
    // The transom edge — the one facing the item slots and the board — is
    // now a BUMP, not a wall: barely a lip. It is the edge the player
    // looks across at the whole play area, so anything with height there
    // is a bar through the middle of the composition. The sides still rise
    // properly, which is where the boat reads as a boat.
    return BOAT.deckY + 0.07 + rise * 1.5;
  };

  const walls = new THREE.Mesh(
    buildGunwaleRibbon(outline, BOAT.wallThickness, topYAt),
    toonMat({ color: COLORS.boatHull, side: THREE.DoubleSide })
  );
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // A capping rail that follows the SAME outline — a thin strip of trim
  // laid on the wall's top edge, so the boat gets its painted gunwale line
  // without a single straight box anywhere.
  const railGeo = buildGunwaleRibbon(
    outline.map((p) => ({ x: p.x, z: p.z })),
    BOAT.wallThickness,
    (p) => topYAt(p) + 0.12
  );
  const rail = new THREE.Mesh(railGeo, toonMat({ color: COLORS.boatTrim, side: THREE.DoubleSide }));
  rail.castShadow = true;
  group.add(rail);

  // Planked deck. ShapeGeometry derives UVs straight from the shape's own
  // coordinates, which here are world units — so the plank texture's repeat
  // is set in world scale and every plank comes out the same size no matter
  // how long the hull is.
  const innerShape = buildHullShape(
    BOAT.halfWidth - BOAT.wallThickness,
    BOAT.bowZ + BOAT.wallThickness * 1.6,
    BOAT.shoulderZ + BOAT.wallThickness,
    BOAT.sternZ - 1.5
  );
  const deckGeo = new THREE.ShapeGeometry(innerShape, 24);
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.translate(0, BOAT.deckY, 0);
  const deck = new THREE.Mesh(deckGeo, toonMat({ color: 0xffffff, map: PLANK_TEXTURE }));
  deck.receiveShadow = true;
  group.add(deck);

  // Waterline foam along the hull. The hull is the one part of the boat
  // that touches the surface, so it is the one part that gets foam.
  const hullVisibleEnd = BOAT.shoulderZ + 22; // the stern runs off-frame
  const hullFoam = buildFoamDecal(
    BOAT.halfWidth * 2.02,
    (hullVisibleEnd - BOAT.bowZ) * 1.01,
    'rect',
    0.5
  );
  hullFoam.position.z = (BOAT.bowZ + hullVisibleEnd) * 0.5;
  group.add(hullFoam);

  return group;
}

// ---------------------------------------------------------------------
// Checkerboard grid: cells -> 4 tightly packed pillars each. Drawn with
// two InstancedMeshes (one per color) so a large board (13x13 = 169
// cells = 676 pillars) stays a couple of draw calls instead of hundreds.
// ---------------------------------------------------------------------
const gridGroup = new THREE.Group();
scene.add(gridGroup);

// The reef block breaks the surface across its whole footprint, so it gets
// one big soft foam patch rather than a ring per pillar — 676 rings would
// be both absurd and unreadable at this size.
const reefFoam = buildFoamDecal(halfW * 2.06, halfH * 2.06, 'rect', 0.5);
scene.add(reefFoam);

/** @type {{mesh: THREE.InstancedMesh, instanceId: number, color: 'white'|'black', alive: boolean, position: THREE.Vector3, targeted: boolean}[]} */
let pillars = [];
let whiteInstancedMesh = null;
let blackInstancedMesh = null;
const HIDDEN_MATRIX = new THREE.Object3D();
HIDDEN_MATRIX.position.set(0, -999, 0);
HIDDEN_MATRIX.scale.setScalar(0.0001);
HIDDEN_MATRIX.updateMatrix();

function buildGrid() {
  if (whiteInstancedMesh) {
    gridGroup.remove(whiteInstancedMesh);
    whiteInstancedMesh.geometry.dispose();
    whiteInstancedMesh.material.dispose();
  }
  if (blackInstancedMesh) {
    gridGroup.remove(blackInstancedMesh);
    blackInstancedMesh.geometry.dispose();
    blackInstancedMesh.material.dispose();
  }
  pillars = [];

  // v2: definitive obstacle geometry, per the coral-reef brief — black
  // cells are rigid coral (submerged base + 4 breaching prongs), white
  // cells are a soft organic sponge/algae blob. Each is still a SINGLE
  // merged/jittered geometry shared across its whole InstancedMesh color
  // group (one draw call per team, same perf profile as the old boxes).
  // v2b: both cell types now get a stem hanging BELOW the waterline, seen
  // through the translucent surface film — the obstacle reads as anchored
  // in the bay instead of sitting on top of it. Deliberately stopping well
  // short of WATER.seabedY: stems all the way to the sand would wall the
  // seabed off under the whole board and kill the depth read exactly where
  // the player is looking most.
  const SUBMERGED = 0.95;
  const pillarGeo = buildCanGeometry(GRID.pillarHeight, SUBMERGED); // METAL team
  const spongeGeo = buildBottleGeometry(GRID.pillarHeight, SUBMERGED); // PLASTIC team
  // Plain WHITE materials: the livery textures carry the actual colours
  // (see buildLitterLiveryTexture for why the label cannot be an instance
  // colour, and for the colour-squaring bug this also removes). Both get
  // the floating-idle vertex offset.
  // The BOTTLE is translucent. PET is the one material on the board that
  // should let the water behind it through, and now that the water itself
  // is transparent again there is something to see through to. Kept high
  // (0.82) rather than obviously glassy: a board of 340 see-through
  // objects stops reading as a board.
  //
  // `depthWrite: false` is NOT set, deliberately. It would be the usual
  // move for a transparent material, but these are packed four to a cell
  // and would then draw through each other in whatever order the sort
  // happened to pick, which flickers as the camera's distances shift. With
  // depth writing on, a bottle occludes the one behind it and only the
  // WATER shows through — which is the effect that was wanted anyway.
  const whiteMat = applyFloatingIdle(toonMat({
    color: 0xffffff,
    map: BOTTLE_TEXTURE,
    transparent: true,
    opacity: 0.82,
  }));
  const blackMat = applyFloatingIdle(toonMat({ color: 0xffffff, map: CAN_TEXTURE }));

  const offset = GRID.pillarSize / 2 + GRID.pillarGap / 2;
  const quarterOffsets = [
    [-offset, -offset],
    [offset, -offset],
    [-offset, offset],
    [offset, offset],
  ];

  // Each cell keeps an id so a pillar can tell which group of four it
  // belongs to — the boost drop fires when the last of a cell's four goes,
  // and without this there is no way to ask "is my cell empty?".
  const whiteCenters = [];
  const blackCenters = [];
  for (let cx = 0; cx < GRID.cellsX; cx++) {
    for (let cy = 0; cy < GRID.cellsY; cy++) {
      const isWhite = (cx + cy) % 2 === 0;
      const cellCenterX = -halfW + GRID.cellSize * cx + GRID.cellSize / 2;
      const cellCenterZ = -halfH + GRID.cellSize * cy + GRID.cellSize / 2;
      (isWhite ? whiteCenters : blackCenters).push([cellCenterX, cellCenterZ, `${cx},${cy}`]);
    }
  }

  whiteInstancedMesh = new THREE.InstancedMesh(spongeGeo, whiteMat, whiteCenters.length * 4);
  blackInstancedMesh = new THREE.InstancedMesh(pillarGeo, blackMat, blackCenters.length * 4);
  whiteInstancedMesh.castShadow = true;
  whiteInstancedMesh.receiveShadow = true;
  blackInstancedMesh.castShadow = true;
  blackInstancedMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  // Reused scratch color: setColorAt copies out of it, so one instance is
  // enough for all 676 writes.
  const PILLAR_TINT = new THREE.Color();
  let wi = 0;
  for (const [cx, cz, cellId] of whiteCenters) {
    for (const [ox, oz] of quarterOffsets) {
      // y=0: both new geometries are already baked with their base at the
      // ground plane (see buildCoralGeometry/buildSpongeGeometry above),
      // unlike the old symmetric box which needed a half-height Y offset.
      const position = new THREE.Vector3(cx + ox, 0, cz + oz);
      dummy.position.copy(position);
      // Per-pillar yaw and scale jitter. The reef is 676 copies of one mesh,
      // so without this the eye immediately finds the repeat; a random turn
      // and a few percent of size is enough to break it, and it costs
      // nothing because the instance matrix is being written anyway.
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      const sc = 0.9 + Math.random() * 0.3;
      dummy.scale.set(sc, 0.85 + Math.random() * 0.4, sc);
      dummy.updateMatrix();
      whiteInstancedMesh.setMatrixAt(wi, dummy.matrix);
      // Near-white jitter, NOT the pillar colour. The livery texture is the
      // colour now; this multiplies it, so it varies body and label
      // together — a slightly duller can has a slightly duller label, which
      // is how a real batch of litter varies. Setting the full tone here
      // (as before) would flatten the label back into the body.
      // A WIDE hue spread, but only inside the crew's own half of the
      // wheel: green through blue for the vacuum crew, red through yellow
      // for the magnet crew (below). That is what buys the reference's
      // richness without costing the one thing the board must say — which
      // squad each cell belongs to. Lightness stays high because this
      // multiplies the painted livery rather than replacing it.
      // Cyan through azure for the vacuum crew, amber through orange for
      // the magnet crew (below) — each family a slice of the wheel wide
      // enough for real variety and narrow enough that the team read never
      // wobbles.
      whiteInstancedMesh.setColorAt(wi, PILLAR_TINT.setHSL(
        0.5 + Math.random() * 0.045, 0.55 + Math.random() * 0.35, 0.62 + Math.random() * 0.18
      ));
      pillars.push({ mesh: whiteInstancedMesh, instanceId: wi, color: 'white', alive: true, position, targeted: false, cellId });
      wi++;
    }
  }
  let bi = 0;
  for (const [cx, cz, cellId] of blackCenters) {
    for (const [ox, oz] of quarterOffsets) {
      // y=0: both new geometries are already baked with their base at the
      // ground plane (see buildCoralGeometry/buildSpongeGeometry above),
      // unlike the old symmetric box which needed a half-height Y offset.
      const position = new THREE.Vector3(cx + ox, 0, cz + oz);
      dummy.position.copy(position);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      const sc = 0.9 + Math.random() * 0.3;
      dummy.scale.set(sc, 0.85 + Math.random() * 0.4, sc);
      dummy.updateMatrix();
      blackInstancedMesh.setMatrixAt(bi, dummy.matrix);
      // Same near-white jitter as the bottles; warmer hue so the aluminium
      // batch drifts toward the crew's own colour rather than toward blue.
      blackInstancedMesh.setColorAt(bi, PILLAR_TINT.setHSL(
        0.9 + Math.random() * 0.055, 0.6 + Math.random() * 0.35, 0.6 + Math.random() * 0.18
      ));
      pillars.push({ mesh: blackInstancedMesh, instanceId: bi, color: 'black', alive: true, position, targeted: false, cellId });
      bi++;
    }
  }
  whiteInstancedMesh.instanceMatrix.needsUpdate = true;
  blackInstancedMesh.instanceMatrix.needsUpdate = true;
  if (whiteInstancedMesh.instanceColor) whiteInstancedMesh.instanceColor.needsUpdate = true;
  if (blackInstancedMesh.instanceColor) blackInstancedMesh.instanceColor.needsUpdate = true;
  gridGroup.add(whiteInstancedMesh, blackInstancedMesh);

  // Seed the prize cells. Done from the finished pillar list rather than
  // during the build loops, because a cell's four pillars are created
  // across two separate passes (one per team) and only here is the full
  // set available to pick a representative position from.
  requestShadowUpdate();
  aliveTotal = pillars.length;
  cellAliveCount.clear();
  for (const p of pillars) {
    cellAliveCount.set(p.cellId, (cellAliveCount.get(p.cellId) || 0) + 1);
  }

  clearPrizeGlows();
  const cellReps = new Map();
  for (const p of pillars) {
    if (!cellReps.has(p.cellId)) cellReps.set(p.cellId, p.position);
  }
  for (const [cellId, position] of cellReps) {
    if (Math.random() < PRIZE_CELL_CHANCE) addPrizeGlow(cellId, position);
  }
}

function alivePillars(color) {
  return pillars.filter((p) => p.alive && p.color === color);
}

/** Alive pillars that don't already have a shot in flight toward them —
 * see `targeted` below for why this exists separately from `alive`. */
function shootableAlivePillars(color) {
  return pillars.filter((p) => p.alive && !p.targeted && p.color === color);
}

// Pillars no longer vanish the instant they're hit — they get a quick
// "impact bounce" and a short collapse/sink animation first (feedback:
// wanted a bounce reaction + a real destruction animation, not an instant
// pop). `alive` still flips to false immediately so targeting logic stops
// considering it right away; only the VISUAL removal is deferred.
const DESTROY_DURATION = 0.34;
const destroyingPillars = [];
const destroyDummy = new THREE.Object3D();

function destroyPillar(pillar) {
  pillar.alive = false;
  // Maintained here rather than derived by scanning, because this is the
  // only place a pillar ever stops being alive. Both the win check and the
  // prize glows read these instead of filtering the full board.
  aliveTotal--;
  if (pillar.cellId !== undefined) {
    cellAliveCount.set(pillar.cellId, (cellAliveCount.get(pillar.cellId) || 1) - 1);
  }
  pillar.destroyT = 0;
  destroyingPillars.push(pillar);
  sfx.pillarDestroy();
}

/** Piecewise elastic scale curve: quick shrink -> overshoot grow -> settle
 * shrink -> gone. Per feedback ("um bounce no tamanho, diminuindo
 * rapidamente e então crescendo e então diminuindo, tudo em um movimento
 * elástico") — replaces the old monotonic-shrink + position-jolt combo. */
function elasticDestroyScale(t) {
  if (t < 0.18) return 1 - (1 - 0.5) * (t / 0.18); // 1 -> 0.5, quick shrink
  if (t < 0.45) return 0.5 + (1.3 - 0.5) * ((t - 0.18) / 0.27); // 0.5 -> 1.3, overshoot grow
  if (t < 0.72) return 1.3 - (1.3 - 0.8) * ((t - 0.45) / 0.27); // 1.3 -> 0.8, settle shrink
  return 0.8 * (1 - (t - 0.72) / 0.28); // 0.8 -> 0, final vanish
}

function tickPillarDestructions(dt) {
  for (let i = destroyingPillars.length - 1; i >= 0; i--) {
    const p = destroyingPillars[i];
    p.destroyT += dt;
    const t = Math.min(p.destroyT / DESTROY_DURATION, 1);

    const scale = Math.max(elasticDestroyScale(t), 0.0001);
    destroyDummy.position.copy(p.position);
    destroyDummy.scale.setScalar(scale);
    destroyDummy.rotation.set(0, t * 0.4, 0);
    destroyDummy.updateMatrix();
    p.mesh.setMatrixAt(p.instanceId, destroyDummy.matrix);
    p.mesh.instanceMatrix.needsUpdate = true;

    if (t >= 1) {
      p.mesh.setMatrixAt(p.instanceId, HIDDEN_MATRIX.matrix);
      p.mesh.instanceMatrix.needsUpdate = true;
      destroyingPillars.splice(i, 1);
    }
  }
}

// Both maintained by destroyPillar and reset by buildGrid. `filter().length`
// over 676 entries was being called on every destruction to answer a
// question a running total already knows.
let aliveTotal = 0;
const cellAliveCount = new Map();

function totalAlivePillars() {
  return aliveTotal;
}

/**
 * "Archer" line-of-sight check: is the straight segment from `fromPos` to
 * `toPos` free of any alive pillar of `blockingColor` standing in the way?
 */
function hasClearLine(fromPos, toPos, blockingColor) {
  const dx = toPos.x - fromPos.x;
  const dz = toPos.z - fromPos.z;
  const totalDist = Math.hypot(dx, dz);
  if (totalDist < 1e-6) return true;
  const dirX = dx / totalDist;
  const dirZ = dz / totalDist;

  for (const p of pillars) {
    if (!p.alive || p.color !== blockingColor) continue;
    const px = p.position.x - fromPos.x;
    const pz = p.position.z - fromPos.z;
    const proj = px * dirX + pz * dirZ;
    if (proj <= 0.05 || proj >= totalDist - 0.05) continue;
    const perp = Math.abs(px * dirZ - pz * dirX);
    if (perp < PIG.losBlockRadius) return false;
  }
  return true;
}

/** Nearest alive, NOT-ALREADY-TARGETED same-color pillar that currently has a
 * clear shot, or null. Excluding already-targeted pillars (ones with a shot
 * already in flight toward them) fixes a real bug: every pillar has exactly
 * 1 HP, so the first shot in flight is already guaranteed to destroy it the
 * instant it lands — any second/third shot a pig fires at that same pillar
 * while the first is still traveling was pure waste (per feedback, "as vezes
 * ele gasta uns 3 tiros por pilastra, sendo q o primeiro tiro ja destroi a
 * pilastra e os outros 2 somem por n ter mais pilastra pra acertar"). */
function findShootablePillar(color, fromPosition) {
  const oppositeColor = color === 'white' ? 'black' : 'white';
  const candidates = shootableAlivePillars(color).sort(
    (a, b) =>
      fromPosition.distanceToSquared(a.position) - fromPosition.distanceToSquared(b.position)
  );
  for (const candidate of candidates) {
    if (hasClearLine(fromPosition, candidate.position, oppositeColor)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------
// Rounded-rectangle belt path: a real curve pigs travel along (straight
// sides + quarter-circle corners), so movement stays fluid through turns.
// ---------------------------------------------------------------------
const rectCorners = [
  new THREE.Vector3(-beltHalfW, 0, beltHalfH), // bottom-left (entry)
  new THREE.Vector3(beltHalfW, 0, beltHalfH), // bottom-right
  new THREE.Vector3(beltHalfW, 0, -beltHalfH), // top-right
  new THREE.Vector3(-beltHalfW, 0, -beltHalfH), // top-left
];

function rotate90(x, z, sign) {
  return sign < 0 ? { x: z, z: -x } : { x: -z, z: x };
}

/** Build alternating arc/line edges that round every corner of `corners`. */
function buildRoundedLoopEdges(corners, radius) {
  const n = corners.length;
  const tangentStarts = [];
  const tangentEnds = [];
  const arcCenters = [];
  const arcAngles = [];

  for (let i = 0; i < n; i++) {
    const P = corners[(i - 1 + n) % n];
    const C = corners[i];
    const N = corners[(i + 1) % n];
    const dirIn = new THREE.Vector3().subVectors(C, P).normalize();
    const dirOut = new THREE.Vector3().subVectors(N, C).normalize();
    const cross = dirIn.x * dirOut.z - dirIn.z * dirOut.x;
    const perp = rotate90(dirIn.x, dirIn.z, cross < 0 ? -1 : 1);

    const tangentStart = new THREE.Vector3(C.x - dirIn.x * radius, 0, C.z - dirIn.z * radius);
    const tangentEnd = new THREE.Vector3(C.x + dirOut.x * radius, 0, C.z + dirOut.z * radius);
    const center = new THREE.Vector3(
      tangentStart.x + perp.x * radius,
      0,
      tangentStart.z + perp.z * radius
    );

    let startAngle = Math.atan2(tangentStart.z - center.z, tangentStart.x - center.x);
    let endAngle = Math.atan2(tangentEnd.z - center.z, tangentEnd.x - center.x);
    const clockwise = cross < 0;
    if (clockwise && endAngle > startAngle) endAngle -= Math.PI * 2;
    if (!clockwise && endAngle < startAngle) endAngle += Math.PI * 2;

    tangentStarts.push(tangentStart);
    tangentEnds.push(tangentEnd);
    arcCenters.push(center);
    arcAngles.push([startAngle, endAngle]);
  }

  // Arc-then-line order so distance 0 lands right at the entry corner's arc
  // (corners[0], bottom-left) — matches the pig spawn point and keeps the
  // fiche stack anchored where it belongs.
  const edges = [];
  for (let i = 0; i < n; i++) {
    const [a0, a1] = arcAngles[i];
    edges.push({
      type: 'arc',
      center: arcCenters[i],
      radius,
      a0,
      a1,
      length: Math.abs(a1 - a0) * radius,
    });
    const end = tangentEnds[i];
    const nextStart = tangentStarts[(i + 1) % n];
    const lineLength = end.distanceTo(nextStart);
    if (lineLength > 1e-4) {
      edges.push({ type: 'line', from: end, to: nextStart, length: lineLength });
    }
  }
  return edges;
}

const beltEdges = buildRoundedLoopEdges(rectCorners, R);
const totalPathLength = beltEdges.reduce((sum, e) => sum + e.length, 0);

function pointAtDistance(dist) {
  let remaining = ((dist % totalPathLength) + totalPathLength) % totalPathLength;
  for (const edge of beltEdges) {
    if (remaining <= edge.length) {
      const t = edge.length === 0 ? 0 : remaining / edge.length;
      if (edge.type === 'line') {
        return edge.from.clone().lerp(edge.to, t);
      }
      const angle = edge.a0 + (edge.a1 - edge.a0) * t;
      return new THREE.Vector3(
        edge.center.x + Math.cos(angle) * edge.radius,
        0,
        edge.center.z + Math.sin(angle) * edge.radius
      );
    }
    remaining -= edge.length;
  }
  const lastEdge = beltEdges[beltEdges.length - 1];
  return lastEdge.type === 'line'
    ? lastEdge.to.clone()
    : new THREE.Vector3(
        lastEdge.center.x + Math.cos(lastEdge.a1) * lastEdge.radius,
        0,
        lastEdge.center.z + Math.sin(lastEdge.a1) * lastEdge.radius
      );
}

/** Exact analytic tangent direction (unit vector, XZ plane) at `dist`. */
function tangentAtDistance(dist) {
  let remaining = ((dist % totalPathLength) + totalPathLength) % totalPathLength;
  for (const edge of beltEdges) {
    if (remaining <= edge.length) {
      if (edge.type === 'line') {
        return edge.to.clone().sub(edge.from).normalize();
      }
      const t = edge.length === 0 ? 0 : remaining / edge.length;
      const angle = edge.a0 + (edge.a1 - edge.a0) * t;
      const dir = edge.a1 - edge.a0 >= 0 ? 1 : -1;
      return new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(dir).normalize();
    }
    remaining -= edge.length;
  }
  const lastEdge = beltEdges[beltEdges.length - 1];
  if (lastEdge.type === 'line') return lastEdge.to.clone().sub(lastEdge.from).normalize();
  const dir = lastEdge.a1 - lastEdge.a0 >= 0 ? 1 : -1;
  return new THREE.Vector3(-Math.sin(lastEdge.a1), 0, Math.cos(lastEdge.a1)).multiplyScalar(dir).normalize();
}

/** Converts a travel-direction vector (dx, dz) into the rotation.y that
 * makes a flat, ground-lying mesh visually point that way — re-derived
 * (and checked numerically) against the requested screen directions:
 * bottom->right, right->up, top->left, left->down. Only ever applied as a
 * SINGLE Euler component (rotation.y alone) on any object that uses it —
 * see makeArrowMesh's comment for why mixing it with rotation.x broke. */
function headingFromTangent(dir) {
  return Math.atan2(-dir.z, dir.x);
}

// The point where the belt path crosses the entry corner's arc — the fiche
// stack and the open gap in the visual track both anchor off of this.
const ENTRY_POINT = pointAtDistance(0);
const CENTER = new THREE.Vector3(0, 0, 0);

// The entry corner's arc (edges[0], by construction above) is left OUT of
// the belt's visual track and out of the pig's travel range entirely —
// that's the open gap where the fiche stack physically sits (no floor-
// colored "mask" block standing in for it — the track segments simply
// aren't generated there). GREEN_ZONE_DIST: where a newly-placed fiche
// lands on the belt. RED_ZONE_DIST: the kill zone, just before the gap.
const entryGapEdge = beltEdges[0];
const GREEN_ZONE_DIST = entryGapEdge.length + TRACK.entryGapPadding;
// The track visually stops (and pigs trigger their "fall" into the hole)
// one full belt-width short of the true path end — per feedback ("quero q
// o final da esteira recue um pouco para q a área preta forme 1 quadrado
// da espessura da esteira no fim da esteira"). Recessing the visible track
// here (rather than just enlarging the hole in place) is what actually
// creates a clean, empty square of floor between "where the belt ends" and
// "where the gap begins" for the hole to occupy legibly.
const HOLE_RECESS = TRACK.width;
const RED_ZONE_DIST = totalPathLength - TRACK.entryGapPadding - HOLE_RECESS;

// Height a fiche rides at while on the belt: clear of both the belt slab
// top AND the direction arrows sitting just above it.
const BELT_RIDE_HEIGHT = TRACK.height + TRACK.rideClearance + TILE.height / 2;

// ---------------------------------------------------------------------
// Belt visual: a single extruded "ribbon" mesh, built by sampling the
// REAL centerline curve at fine intervals and lofting a constant-width
// cross-section along it — built ONLY across the visible span
// (GREEN_ZONE_DIST..RED_ZONE_DIST), so the entry corner's arc is simply
// never built, leaving a real, geometry-free gap there.
//
// This replaced an earlier approach that rotated a straight box to match
// the tangent at each sample point: that's only exact on straight runs —
// on a curve, adjacent straight boxes (each as wide as TRACK.width)
// necessarily overlap on the inside of the turn once the corner radius
// gets small relative to the belt's width, and the overlapping wedges
// z-fought into a visible "fan" of facet lines right at the corners
// (reported twice: once when the belt was thickened and the radius
// stayed small, and again after over-correcting the radius way up and
// then pulling it back down for a tighter turn). Lofting the actual
// curve, sample by sample, is geometrically exact at ANY corner radius —
// there is no minimum radius this can misrender, so TRACK.cornerRadius is
// now a free visual choice again instead of something to fight with.
// ---------------------------------------------------------------------
let trackMesh = null;
function buildTrackVisual() {
  if (trackMesh) {
    scene.remove(trackMesh);
    trackMesh.geometry.dispose();
    trackMesh.material.dispose();
  }
  const visibleLength = RED_ZONE_DIST - GREEN_ZONE_DIST;
  const sampleCount = Math.max(4, Math.round(visibleLength / TRACK.segmentLength));
  const halfWidth = TRACK.width / 2;

  const topInner = [];
  const topOuter = [];
  const botInner = [];
  const botOuter = [];
  for (let i = 0; i <= sampleCount; i++) {
    const d = GREEN_ZONE_DIST + (i / sampleCount) * visibleLength;
    const c = pointAtDistance(d);
    const t = tangentAtDistance(d);
    // In-plane perpendicular to the travel direction (rotate tangent 90°).
    const nx = -t.z;
    const nz = t.x;
    topInner.push(new THREE.Vector3(c.x - nx * halfWidth, TRACK.height, c.z - nz * halfWidth));
    topOuter.push(new THREE.Vector3(c.x + nx * halfWidth, TRACK.height, c.z + nz * halfWidth));
    botInner.push(new THREE.Vector3(c.x - nx * halfWidth, 0, c.z - nz * halfWidth));
    botOuter.push(new THREE.Vector3(c.x + nx * halfWidth, 0, c.z + nz * halfWidth));
  }

  const verts = [];
  // v2b: the lofted ribbon had NO uv attribute at all (it was only ever
  // built to carry a flat color), so a scrolling foam texture was
  // impossible on it. UVs are generated here in the same pass: U runs
  // along the PATH (in world units / CURRENT_UV_LENGTH, so the foam's
  // scale stays constant whether the belt is long or short) and V runs
  // across the channel's width. Scrolling U therefore drags the foam in
  // the exact direction the water flows, around the corners included.
  const uvs = [];
  const CURRENT_UV_LENGTH = 6;
  const quad = (a, b, c, d) => {
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    verts.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  };
  const quadUV = (ua, va, ub, vb, uc, vc, ud, vd) => {
    uvs.push(ua, va, ub, vb, uc, vc);
    uvs.push(ua, va, uc, vc, ud, vd);
  };
  const uAt = (i) =>
    (GREEN_ZONE_DIST + (i / sampleCount) * visibleLength) / CURRENT_UV_LENGTH;
  for (let i = 0; i < sampleCount; i++) {
    const u0 = uAt(i);
    const u1 = uAt(i + 1);
    quad(topInner[i], topOuter[i], topOuter[i + 1], topInner[i + 1]); // top
    quadUV(u0, 0, u0, 1, u1, 1, u1, 0);
    quad(botInner[i + 1], botOuter[i + 1], botOuter[i], botInner[i]); // bottom
    quadUV(u1, 0, u1, 1, u0, 1, u0, 0);
    quad(topOuter[i], botOuter[i], botOuter[i + 1], topOuter[i + 1]); // outer wall
    quadUV(u0, 1, u0, 0, u1, 0, u1, 1);
    quad(botInner[i], topInner[i], topInner[i + 1], botInner[i + 1]); // inner wall
    quadUV(u0, 0, u0, 1, u1, 1, u1, 0);
  }
  // NO END CAPS. They were flat quads sealing the two open ends of the
  // ribbon, and a cap is a hard edge by definition — it is precisely the
  // "ends in a straight line" the brief rejects. With the ribbon fading
  // out instead there is nothing to seal: by the time the geometry stops,
  // it is already fully transparent.
  const uFirst = uAt(0);
  const uLast = uAt(sampleCount);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  /* THE FADE, as per-vertex alpha.
   *
   * The current has to emerge out of the water at the entry gap rather
   * than starting at a definite place. Done here rather than in the
   * texture because the texture SCROLLS: any fade painted into it would
   * travel around the loop with the marks instead of staying at the end
   * of the ribbon, which is the one place it has to stay.
   *
   * three multiplies a vec4 vertex colour into diffuseColor including its
   * alpha, so an RGBA colour attribute is a per-vertex opacity mask and
   * costs no extra draw and no extra texture.
   */
  const FADE_UV = 2.6; // in the same units as U, so it is a fixed world
  // length whatever the belt's total length turns out to be
  const uvArr = geo.attributes.uv.array;
  const colors = new Float32Array((verts.length / 3) * 4);
  for (let v = 0; v < verts.length / 3; v++) {
    const u = uvArr[v * 2];
    const fadeIn = THREE.MathUtils.smoothstep(u, uFirst, uFirst + FADE_UV);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(u, uLast - FADE_UV, uLast);
    const a = Math.min(fadeIn, fadeOut);
    const o = v * 4;
    colors[o] = 1; colors[o + 1] = 1; colors[o + 2] = 1; colors[o + 3] = a;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geo.computeVertexNormals();
  // v2b: the channel is now a flowing current in its own right — a foam
  // texture whose U scrolls along the path every frame (see
  // tickWaterAnimation), instead of a flat color relying entirely on the
  // arrow sprites to imply movement. The arrows stay (they're the explicit
  // direction cue and read at a glance); this adds the continuous
  // water-surface motion underneath them.
  // Transparent, so the caustic web and the seabed read straight through
  // the current — in the reference the loop is a wash over the water, not a
  // solid channel laid on top of it.
  // The channel slab itself is GONE — only its flow lines are left. The
  // texture's background is transparent and doubles as the alpha map, so
  // what renders is the strokes and nothing else, and the caustic web and
  // seabed run straight through the loop uninterrupted.
  //
  // MeshBasicMaterial, not toon: these lines are moving water highlights,
  // and running them through the shade ramp made half the loop dimmer than
  // the other half purely because of which way it faced the sun.
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: CURRENT_FOAM_TEXTURE,
    alphaMap: CURRENT_FOAM_TEXTURE,
    // Reads the per-vertex fade written above. Both the texture's own
    // alpha and this one multiply into the final alpha, so a mark that is
    // inside the fade zone AND in a gap between strokes is doubly gone —
    // which is what makes the end of the ribbon dissolve rather than
    // dimming as a whole shape.
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  trackMesh = new THREE.Mesh(geo, mat);
  trackMesh.renderOrder = 3; // above the water film and its foam decals
  scene.add(trackMesh);

  /* THE UNDERFLOW.
   *
   * The white strokes alone gave the current motion but no WEIGHT — it
   * read as marks drawn on flat water rather than as a body of water
   * moving. What was missing is the thing that makes a real current
   * visible from above: the water in it is deeper and darker than the
   * water around it.
   *
   * So a second, WIDER ribbon runs underneath, in a low-opacity navy. It
   * is scaled out from the channel's own geometry rather than rebuilt, so
   * it follows every curve exactly and cannot drift out of register with
   * the strokes above it.
   *
   * The long smoky bands in its texture drift at a different rate from the
   * white strokes, which is what gives the two layers parallax — a single
   * layer moving as one piece reads as a decal no matter how it is
   * painted, and the depth here comes from the RELATIVE motion, not from
   * the colour.
   */
  const underGeo = geo.clone();
  {
    // Widen across the channel by pushing every vertex away from the path
    // centre. The V coordinate already says which side of the channel a
    // vertex is on (0 = inner, 1 = outer), so the offset direction is free.
    const pos = underGeo.attributes.position;
    const uv = underGeo.attributes.uv;
    const centre = new THREE.Vector3();
    // The path centre for a given U is not stored, so the widening is done
    // against the ribbon's own local normal instead: the inner and outer
    // rows share a U, so the vector between them IS the across-channel
    // direction. Simpler and exact: scale about the mesh's own centroid in
    // XZ per vertex pair is overkill here — a flat vertical lift plus a
    // uniform XZ scale about the loop's centre gives the same read at a
    // fraction of the work, because the loop is centred on the origin.
    for (let v = 0; v < pos.count; v++) {
      const side = uv.getY(v);
      const k = 1 + (side < 0.5 ? -0.1 : 0.1); // NARROWER than the strokes' channel, not wider
      pos.setX(v, pos.getX(v) * k);
      pos.setZ(v, (pos.getZ(v) - beltHalfH * 0) * k);
      pos.setY(v, pos.getY(v) - 0.004); // just under the strokes
      centre.set(0, 0, 0);
    }
    pos.needsUpdate = true;
  }
  const underMat = new THREE.MeshBasicMaterial({
    color: COLORS.currentUnderflow,
    map: CURRENT_UNDERFLOW_TEXTURE,
    alphaMap: CURRENT_UNDERFLOW_TEXTURE,
    vertexColors: true, // reuses the same end fade as the strokes
    transparent: true,
    opacity: 0.17, // far more transparent: it is a hint of depth, not a shadow
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const underMesh = new THREE.Mesh(underGeo, underMat);
  underMesh.renderOrder = 2; // beneath the white strokes, above the water
  scene.add(underMesh);
  trackMesh.userData.underMesh = underMesh;
}

// ---------------------------------------------------------------------
// Direction arrows crawling along the visible span. Each one wipes in/out
// at the gap's edges (a shader threshold sweeping from tip to tail) rather
// than popping instantly into/out of existence.
// ---------------------------------------------------------------------
const arrowGroup = new THREE.Group();
scene.add(arrowGroup);

// v1q REVERSAL of the v1p shape: feedback clarified "chatas" here means
// flat/short in the HORIZONTAL span (tip-to-tail), with the tip sitting
// close to the tail/base, and MORE STRETCHED in the VERTICAL dimension —
// the exact opposite of what v1p built (which read "flatter" as a wide,
// short silhouette). Span shrunk hard and half-height grew instead.
// 3x, per the brief: at the previous size the direction cue was the
// smallest thing on screen while being the one piece of information the
// player needs before touching anything.
const ARROW_TIP_X = 0.54;
const ARROW_TAIL_X = -0.3;
const ARROW_HALF_HEIGHT = 1.02; // grown (was 0.16) — taller/more stretched
// vertically, per feedback ("com a vertical mais esticada").
const ARROW_SPAN = ARROW_TIP_X - ARROW_TAIL_X;
const ARROW_OPACITY = 0.9; // within the requested 40-70% range ("cerca de
// 40 a 70% de opacidade") — left as-is from v1p, already inside that band.
// How much of the arrow's own length the fade band spans, centered on the
// wipe threshold — per feedback ("quero uma transicao da mascara de sumir e
// apacecer as setas, seja uma transicao suave, como um blur ou um
// degrade"). The old version was a hard `discard` step (a binary cut that
// just moved frame to frame); this instead ramps alpha smoothly across a
// band around the threshold so the arrow visibly fades/blurs away as it
// gets there instead of being sliced off cleanly.
const ARROW_FADE_SOFTNESS = ARROW_SPAN * 0.4;

const ARROW_VERTEX_SHADER = `
  varying float vLocalX;
  varying vec2 vShapeUv;
  void main() {
    vShapeUv = uv;
    vLocalX = position.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ARROW_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uThreshold;
  uniform float uMode; // 0 = revealing (fades in past threshold), 1 = hiding (fades out past threshold)
  uniform float uSoftness;
  uniform float uOpacity;
  uniform sampler2D uShape;
  varying float vLocalX;
  varying vec2 vShapeUv;
  void main() {
    float reveal = smoothstep(uThreshold - uSoftness, uThreshold + uSoftness, vLocalX);
    float edgeAlpha = uMode < 0.5 ? reveal : (1.0 - reveal);
    // The chevron's SHAPE now comes from a texture's alpha rather than from
    // the mesh outline, which is what allows the rounded caps: geometry
    // edges are polygons and can never be arcs.
    float shape = texture2D(uShape, vShapeUv).a;
    float alpha = edgeAlpha * uOpacity * shape;
    if (alpha <= 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/** A rounded-cap chevron, drawn as a thick STROKE rather than as a filled
 * triangle.
 *
 * The filled triangle had three sharp corners by definition — a shape with
 * vertices cannot have rounded ends. A stroked polyline can: `lineCap` and
 * `lineJoin` set to round give a V whose tip and both tails are circular
 * arcs, which is the asset shape asked for. Baked to a canvas and used as
 * the alpha of a quad, so the existing wipe shader keeps working
 * unchanged. */
function buildChevronTexture() {
  const W = 128;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = W * 0.34;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(W * 0.26, H * 0.2);
  ctx.lineTo(W * 0.74, H * 0.5);
  ctx.lineTo(W * 0.26, H * 0.8);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
const CHEVRON_TEXTURE = buildChevronTexture();

function makeArrowMesh() {
  const geo = new THREE.PlaneGeometry(
    ARROW_TIP_X - ARROW_TAIL_X,
    ARROW_HALF_HEIGHT * 2
  );
  // Centre the quad on the same local span the old triangle occupied, so
  // the wipe shader's threshold sweep still lines up with the geometry.
  geo.translate((ARROW_TIP_X + ARROW_TAIL_X) * 0.5, 0, 0);
  // Bake the "lay flat on the ground" rotation into the geometry itself —
  // NOT into mesh.rotation.x — so the only rotation ever touched live on
  // this object is rotation.y (see headingFromTangent's doc comment).
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: ARROW_VERTEX_SHADER,
    fragmentShader: ARROW_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Color(COLORS.trackArrow) },
      uThreshold: { value: ARROW_TIP_X },
      uMode: { value: 1 },
      uSoftness: { value: ARROW_FADE_SOFTNESS },
      uOpacity: { value: ARROW_OPACITY },
      uShape: { value: CHEVRON_TEXTURE },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 10;
  return mesh;
}

const beltArrows = [];
function buildBeltArrows() {
  const visibleLength = RED_ZONE_DIST - GREEN_ZONE_DIST;
  for (let i = 0; i < TRACK.arrowCount; i++) {
    const mesh = makeArrowMesh();
    mesh.position.y = TRACK.height + 0.02;
    arrowGroup.add(mesh);
    beltArrows.push({ mesh, progress: GREEN_ZONE_DIST + (i / TRACK.arrowCount) * visibleLength });
  }
}

function tickBeltArrows(dt) {
  const visibleLength = RED_ZONE_DIST - GREEN_ZONE_DIST;
  const FADE = TRACK.arrowFadeZone;
  for (const arrow of beltArrows) {
    arrow.progress += TRACK.arrowSpeed * dt;
    if (arrow.progress > RED_ZONE_DIST) {
      arrow.progress = GREEN_ZONE_DIST + ((arrow.progress - RED_ZONE_DIST) % visibleLength);
    }
    const pos = pointAtDistance(arrow.progress);
    arrow.mesh.position.x = pos.x;
    arrow.mesh.position.z = pos.z;
    arrow.mesh.rotation.y = headingFromTangent(tangentAtDistance(arrow.progress));

    const distFromEnd = RED_ZONE_DIST - arrow.progress;
    const distFromStart = arrow.progress - GREEN_ZONE_DIST;
    const uniforms = arrow.mesh.material.uniforms;
    // Sweep range extended by the fade softness past each end of the arrow
    // shape itself (TAIL_X/TIP_X), not just across its own span. With the
    // OLD hard-edge cutoff, sweeping the threshold exactly across
    // TAIL_X..TIP_X was fine (a step function doesn't care about margin).
    // With a soft/blurred edge, hitting the threshold at exactly the tip's
    // own vLocalX means that point is already 50% faded — a visible pop at
    // the moment a fade-out sweep starts (or a fade-in sweep finishes) if
    // the range isn't padded, since the "fully visible" state below relies
    // on the same padded value for continuity.
    const EXT = ARROW_FADE_SOFTNESS;
    const extendedSpan = ARROW_SPAN + EXT * 2;
    if (distFromEnd < FADE) {
      // Hiding: the mask edge sweeps from the tip toward the tail.
      const f = Math.max(0, distFromEnd / FADE);
      uniforms.uMode.value = 1;
      uniforms.uThreshold.value = ARROW_TAIL_X - EXT + f * extendedSpan;
    } else if (distFromStart < FADE) {
      // Revealing: same sweep direction, tip appears first.
      const g = Math.max(0, distFromStart / FADE);
      uniforms.uMode.value = 0;
      uniforms.uThreshold.value = ARROW_TIP_X + EXT - g * extendedSpan;
    } else {
      // Fully visible — matches the hiding sweep's f=1 endpoint exactly, so
      // there's no pop at the handoff between this and the sweep above.
      uniforms.uMode.value = 1;
      uniforms.uThreshold.value = ARROW_TIP_X + EXT;
    }
  }
}

// ---------------------------------------------------------------------
// Fiche stack: a physical pile of tile tokens sitting in the belt's open
// gap, at ground level, aligned with where the visible belt begins (see
// stackAnchor below). This IS the belt-capacity counter — a pig can only be
// on the belt while riding one of these.
// ---------------------------------------------------------------------
// v2: tileGeo is gone — the pile/belt-riding platform is now a real torus
// "boia" (see buildBoiaMesh above), built fresh per Mesh/Group instance
// rather than one shared geometry constant, since it's a small Group of a
// few primitives rather than a single Mesh.

// The pile's X/Z footprint is anchored off the belt's own VISIBLE start
// point (GREEN_ZONE_DIST, not the gap arc's own midpoint like previous
// passes used) — per feedback ("quero q a base da pilha de tile alinhado ao
// centro com a largura e o inicio da esteira"). Centering it on the
// centerline there (zero perpendicular offset) is what "aligned to the
// center with the width" means — the belt's centerline IS the center of its
// own width by definition — then it's pulled straight back along the
// reverse travel direction so it clears the belt's own footprint (still off
// the moving path, in the gap) while staying directly in line with where
// the belt begins.
const beltStartPoint = pointAtDistance(GREEN_ZONE_DIST);
const beltStartTangent = tangentAtDistance(GREEN_ZONE_DIST);
const PILE_BACK_OFFSET = TRACK.width / 2 + TILE.depth / 2 + 0.3;
const stackAnchor = beltStartPoint
  .clone()
  .addScaledVector(beltStartTangent, -PILE_BACK_OFFSET);
// Back to a vertical pile — per feedback ("n quero mais os tiles nessa
// posicao ... agora quero mudar quero uma pilha ao inves de uma fila, um em
// cima do outro"), reversing the last few passes' standing-row experiments
// entirely. Tiles lie FLAT (no standing rotation at all) and stack straight
// up in world Y, right at ground level in the belt's open entry gap — not
// on the belt's own moving surface, just parked beside it.
const PILE_GAP = 0.3; // grown again in v1r (was 0.22), per feedback
// ("o espaçamento entre tiles da pilha pode ser levemente maior") — on top
// of the real gap already introduced a couple passes ago.
const STACK_PILE_STEP = TILE.height + PILE_GAP;

/** Position of the Nth tile in the pile — straight up in Y, all other tiles
 * sharing the same X/Z footprint (unlike the previous row-based layouts). */
function stackSlotPosition(index) {
  return stackAnchor
    .clone()
    .add(new THREE.Vector3(0, TILE.height / 2 + index * STACK_PILE_STEP, 0));
}

const stackTiles = [];
let pileFoamDecal = null;
function buildFicheStack() {
  // v2: each pile slot is now a true torus "boia" Group (buildBoiaMesh),
  // not a shared-geometry flat Mesh — same neutral-red color regardless of
  // which penguin ends up riding it, per the original "quero eles sempre
  // iguais" feedback (still applies, just to the new geometry).
  // Exactly ONE foam ring for the whole pile, at its base. The stack is
  // five boias tall but only the bottom one is in the water — ringing each
  // of them (which the old screen-space test did) reads as five separate
  // floating objects instead of one stack sitting in the sea.
  // Sized to the boia itself (plus the band's own width), not to a
  // generous margin around it: any extra here becomes a visible gap
  // between the object and its foam.
  const pileFoam = buildFoamDecal((BOIA_RADIUS + BOIA_TUBE) * 2.06, (BOIA_RADIUS + BOIA_TUBE) * 2.06);
  pileFoam.position.x = stackAnchor.x;
  pileFoam.position.z = stackAnchor.z;
  scene.add(pileFoam);
  // The ring belongs to the OBJECT, not to the spot. With the pile empty
  // there is nothing floating there, and a waterline ring on bare water is
  // the clearest possible statement that the effect is a decal rather than
  // contact — so it goes when the last boia goes, and comes back with the
  // first one returned.
  pileFoamDecal = pileFoam;

  for (let i = 0; i < BELT.capacity; i++) {
    const mesh = buildBoiaMesh();
    mesh.position.copy(stackSlotPosition(i));
    // No rotation — the boia lies flat in the pile, same pose it keeps once
    // it's on the belt itself.
    scene.add(mesh);
    stackTiles.push(mesh);
  }
}

/** World position of the current top of the stack — where a newly picked
 * fiche starts its entry animation from. */
function stackTopWorldPosition() {
  const freeCount = BELT.capacity - onBeltCount();
  return stackSlotPosition(Math.max(freeCount - 1, 0));
}

function updateFicheStack() {
  const freeCount = BELT.capacity - onBeltCount();
  for (let i = 0; i < BELT.capacity; i++) {
    stackTiles[i].visible = i < freeCount;
  }
  if (pileFoamDecal) pileFoamDecal.visible = freeCount > 0;
}

/* THE TEXT OUTLINE RULE, in one place.
 *
 * The house style is: every piece of text carries a WHITE outline — except
 * text that is itself white, which carries a NAVY one. That is not an
 * arbitrary exception, it is the rule's own logic: the outline exists to
 * separate the glyph from whatever is behind it, and a white outline on
 * white text separates nothing.
 *
 * It lives here as a function rather than as two lines copied into each
 * canvas builder, because the moment there are three of them one gets
 * missed and the game has two typographic styles.
 */
const TEXT_OUTLINE_DARK = '#12325a'; // navy, for white text
function drawOutlinedText(ctx, text, x, y, fillColor) {
  const isWhiteFill = /^#f{3,6}$/i.test(fillColor) || fillColor.toLowerCase() === '#ffffff';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = isWhiteFill ? TEXT_OUTLINE_DARK : '#ffffff';
  ctx.lineWidth = FONT.strokeWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}

function drawTrayLabelCanvas(text) {
  // Bumped resolution + font size hard this pass — feedback said the
  // previous canvas was nearly illegible on an actual phone screen.
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = `700 66px ${FONT.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // White text, so by the rule above it takes the navy outline.
  drawOutlinedText(ctx, text, 160, 66, '#ffffff');
  return canvas;
}

const trayLabelMat = new THREE.SpriteMaterial({
  map: new THREE.CanvasTexture(drawTrayLabelCanvas('0/5')),
  depthTest: false,
  // depthTest:false alone was not enough: it stops the label being
  // OCCLUDED, but three still draws transparent objects in
  // distance-sorted order, so the foam ring and the boia — both
  // transparent, both nearer the camera — were painted on top of it
  // afterwards. This is a UI element, so it is forced to the very end of
  // the draw order instead of arguing with the sort.
  depthWrite: false,
  transparent: true,
});
const trayLabel = new THREE.Sprite(trayLabelMat);
// Sized to the tile's own maximum horizontal dimension (canvas is a 160x64,
// i.e. 2.5:1, texture) and laid flat on the FLOOR right below the base of
// the lowest tile in the stack — not a floating HUD sprite anymore.
const TRAY_LABEL_WIDTH = TILE.width * 2.15; // trimmed back down: at 2.6 it
// was wider than the pile it labels and crowded the item slots above it
trayLabel.scale.set(TRAY_LABEL_WIDTH, TRAY_LABEL_WIDTH / 2.5, 1);
// Now a single pile (not a row), so there's no longer a "row center" to
// find — just sit it on the floor right at the pile's own X/Z footprint,
// offset south (+Z) so it doesn't get hidden under the tiles themselves.
// Offset pulled in closer in v1r (was 1.05x) — per feedback ("chegar o
// texto 5/5 um pouquinho para cima até quase encostar mas ainda com um
// espaçamento do tile q esta na base"), the label should sit almost against
// the base of the pile, just keeping a small real gap, not the fuller
// offset from before.
trayLabel.position
  .copy(stackAnchor)
  .add(new THREE.Vector3(0, 0.03, TILE.width * 0.68));
trayLabel.renderOrder = 999;
scene.add(trayLabel);

function updateTrayLabel(count) {
  trayLabelMat.map.dispose();
  trayLabelMat.map = new THREE.CanvasTexture(drawTrayLabelCanvas(`${count}/${BELT.capacity}`));
  trayLabelMat.needsUpdate = true;
}

// ---------------------------------------------------------------------
// Destruction "hole": a dedicated space at the belt's kill-zone point
// (right next to the entry gap, on the far/exit side of it) that spent
// pigs visibly sink + shrink into, instead of just vanishing. Placeholder
// only — a whirlpool/trash-can prop can drop in here later without
// touching the space itself or the fall animation below.
// ---------------------------------------------------------------------
// Centered in the recessed span between the visible track's end
// (RED_ZONE_DIST) and the true path end, so the pig+tile falls into the
// MIDDLE of the empty square left by that recess, not its near edge — per
// feedback ("quero q o porco com o tile caia até o meio dessa área").
const HOLE_POINT = pointAtDistance(RED_ZONE_DIST + HOLE_RECESS / 2);
// Sized off TRACK.width (the belt's own thickness) rather than the tile —
// per feedback ("quero q a área preta que acaba a esteira tenha a extensão
// compatível com a grossura da esteira"), the hole's footprint should read
// as belonging to the belt's own width, not an arbitrary size relative to
// the tile riding over it.
// A round disc, not the old square slab: in the reference the whirlpool is
// a circular navy spiral, and it is the darkest value anywhere in the
// frame, which is what makes it read as a hole rather than as dark water.
// A real FUNNEL, not a flat disc: a lathe whose profile drops from the
// surface radius down to a narrow throat, so the vortex has depth and the
// silhouette is a cone. Spun continuously, with the spiral texture riding
// on it — rotating the mesh is what sells the swirl, because a static
// spiral just reads as a painted decal no matter how good the texture is.
const holeRadius = TRACK.width * DEATH_ZONE.sizeMultiplier * 0.5;

/* ------------------------------------------------------------
 * THE VORTEX, REBUILT AS A LITERAL CONE (per the concept sheet)
 * ------------------------------------------------------------
 * The sketch shows the same object in three views — 3/4, side and top —
 * and the point of drawing it three times is that it is a CONE in all of
 * them: a triangle from the side, a circle from above, straight walls in
 * 3/4. The previous build was a curved funnel (radius fell as t^1.8) with
 * a painted disc capping the mouth, which is a different object: from the
 * side it reads as a bowl, and the cap flattened the top into a decal.
 *
 * So: straight walls, apex down, mouth at the waterline.
 *
 * Why the mouth needs no cap any more. A cone closed at its tip is a
 * convex solid whose only opening is the flat mouth disc, and a straight
 * ray that enters that disc travelling downward MUST strike the wall — it
 * cannot reach the seabed. (The old funnel leaked because its concave
 * flare left a cavity between the mouth and the wall; that was the
 * starfish-through-the-hole bug, and it is a property of the concave
 * profile, not of cones in general.) DoubleSide, so the near half draws
 * its outer face and the far half its inner face, and the silhouette is
 * closed from any angle above the mouth plane.
 *
 * The throat disc below is belt-and-braces at the one place the geometry
 * is degenerate: the apex, where the cone's triangles pinch to zero area
 * and can drop out at grazing angles.
 */
// A hole cannot be deeper than the floor it is cut into, so the depth is
// clamped against the bed's ACTUAL height here — seabedY is only the bed's
// base level, and the bed is displaced by seabedHeight() and rises toward
// the frame edges, which is exactly where the whirlpool sits.
const VORTEX_BED_Y = seabedHeightAt(HOLE_POINT.x, HOLE_POINT.z);
const VORTEX_DEPTH = Math.min(
  holeRadius * 2.35,
  Math.max(0.4, (WATER.surfaceY + 0.02 - VORTEX_BED_Y) * 0.8)
);

/* THE CONE IS A LATHE, and that is not a stylistic choice — it works
 * around a real defect in three.ConeGeometry.
 *
 * The cone rendered as a basket weave: alternating solid triangles and
 * see-through gaps in a radial fan, unmistakably the mesh's own
 * triangulation. It survived removing the texture, then removing the
 * lighting entirely (flat MeshBasicMaterial, one colour), then every side
 * mode, then polygonOffset — ruling out the map, the shading, a near/far
 * wall pairing and z-fighting in turn. Each of those had been a plausible
 * story, and each was wrong.
 *
 * What settled it was COUNTING the triangles instead of reasoning about
 * them. `new THREE.ConeGeometry(r, h, 40, 8)` on r169 returns 320
 * triangles where 40x8 quads need about 600; checked again at 8x3 it
 * returns 24 for 24 quads — exactly ONE TRIANGLE PER QUAD. A cone is a
 * cylinder with radiusTop = 0, and the guard that drops the degenerate
 * triangle at the apex row is dropping one on every row. Half the surface
 * was never in the index buffer, so no amount of render state could have
 * fixed it.
 *
 * A LatheGeometry over a straight-line profile is the same cone, built by
 * code with no such special case — and it is what the funnel here used
 * before, which is why this only appeared when the shape was rewritten.
 * Several points down the slope for the same reason as before: the toon
 * ramp and the texture both need vertices along the wall to work on. */
const holeProfile = [];
{
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Straight walls: a triangle in side view, a circle from above — the
    // three views in the concept sheet are three views of a plain cone, and
    // the previous t^1.8 flare read as a bowl from the side.
    holeProfile.push(new THREE.Vector2(holeRadius * (1 - t), -t * VORTEX_DEPTH));
  }
}
const holeGeo = new THREE.LatheGeometry(holeProfile, 40);
const holeMesh = new THREE.Mesh(
  holeGeo,
  // Blue-green, not black: a black well reads as a rendering fault in a
  // bright cartoon frame. The tonal range is painted into
  // VORTEX_WALL_TEXTURE (dark throat -> bright rim) and the toon ramp adds
  // the real lighting on top, so the far wall darkens on its own.
  // DoubleSide: from this camera only the INSIDE of the funnel is ever
  // visible (a FrontSide-only test rendered nothing at all), but the cone
  // is also what the falling boia disappears into, so both faces stay
  // available rather than relying on that holding at every angle.
  toonMat({ color: 0xffffff, map: VORTEX_WALL_TEXTURE, side: THREE.DoubleSide })
);
holeMesh.position.set(HOLE_POINT.x, WATER.surfaceY + 0.02, HOLE_POINT.z);
scene.add(holeMesh);

// Seals the apex, where the cone's own triangles have zero area.
const vortexCap = new THREE.Mesh(
  new THREE.CircleGeometry(holeRadius * 0.16, 20),
  toonMat({ color: COLORS.whirlpoolDeep })
);
vortexCap.rotation.x = -Math.PI / 2;
vortexCap.position.set(
  HOLE_POINT.x, WATER.surfaceY + 0.02 - VORTEX_DEPTH * 0.86, HOLE_POINT.z
);
scene.add(vortexCap);

// NO LIP RING any more. A torus on the mouth was a perfect circle, and a
// perfect circle is the one silhouette the brief rules out — it read as a
// drawn outline sitting on the water rather than as water being pulled in.
// Layer 3's wobbly foam ring below now does that job with an irregular
// edge, which is what the rim needed all along.

// Clear the seabed under the vortex. The decor is scattered before the
// whirlpool's position is known (it is derived from the belt path further
// down), and the bed there is only ~1.6 below the surface while a tall
// algae is over 2 units — so a few of them grew straight up through the
// funnel and waved about inside the hole. Pruning after the fact is much
// simpler than threading the hole's position back into the scatter.
for (const child of [...seabedDecorGroup.children]) {
  const dx = child.position.x - HOLE_POINT.x;
  const dz = child.position.z - HOLE_POINT.z;
  if (dx * dx + dz * dz < (holeRadius * 1.3) ** 2) seabedDecorGroup.remove(child);
}

/* ------------------------------------------------------------
 * THE VORTEX, AS THE THREE LAYERS IN THE CONCEPT SHEET
 * ------------------------------------------------------------
 * The sheet is explicit about the construction, and it is worth following
 * exactly because each layer is doing a different job:
 *
 *   Layer 1 — FUNNEL: the dark cone, deepest value in the frame. Depth.
 *   Layer 2 — MID-SWIRL FOAM: churned water inside the mouth. Motion.
 *   Layer 3 — OUTER SURFACE: bold white arcs on the flat water outside the
 *             hole, curving in. The connection to the rest of the sea.
 *
 * Layer 1 is the lathe cone above. Layers 2 and 3 are below.
 */

// The rim's shape, shared by the geometry here and the water shader above.
// Same three harmonics, same phases — if these two ever disagree the foam
// ring and the hole it rings stop being concentric, so they are written
// once and used twice rather than tuned in two places.
function vortexWobble(theta, time) {
  return (
    1 +
    0.15 * Math.sin(theta * 3 + 0.7 + time * 0.55) +
    0.09 * Math.sin(theta * 5 - 1.9 - time * 0.41) +
    0.05 * Math.sin(theta * 8 + 2.4 + time * 0.29)
  );
}

// uVortexRadius is the BASE radius the wobble multiplies, so it has to be
// set low enough that the widest lobe (about 1.28x) still fits inside the
// cone's mouth. Otherwise the water would be discarded past the cone's rim
// and open a crescent straight down to the seabed.
waterUniforms.uVortexXZ.value.set(HOLE_POINT.x, HOLE_POINT.z);
waterUniforms.uVortexRadius.value = holeRadius * 0.72;
const VORTEX_RIM = holeRadius * 0.72;

/* LAYER 3 — the outer surface ring.
 *
 * A flat annulus lying on the water, its inner edge exactly on the wobbly
 * hole and its outer edge dissolving into the open sea. The dissolve is
 * per-vertex alpha rather than a texture: the edge is an irregular curve,
 * and a radial texture fade would have to be circular, which would put
 * back the hard round silhouette the wobble exists to remove.
 *
 * REBUILT EVERY FRAME (positions only — the index buffer and the colours
 * never change) so it tracks the shader's animated rim exactly. Writing
 * 128 vertices into an existing Float32Array is cheap; what would not be
 * cheap, and what this avoids, is allocating a new geometry per frame.
 */
const VORTEX_RIM_SEGMENTS = 128;
const vortexRimGeo = new THREE.BufferGeometry();
{
  const verts = new Float32Array((VORTEX_RIM_SEGMENTS + 1) * 2 * 3);
  const colors = [];
  const indices = [];
  const rimColor = new THREE.Color(COLORS.waterFoam);
  for (let i = 0; i <= VORTEX_RIM_SEGMENTS; i++) {
    colors.push(rimColor.r, rimColor.g, rimColor.b, 0.85);
    colors.push(rimColor.r, rimColor.g, rimColor.b, 0);
    if (i < VORTEX_RIM_SEGMENTS) {
      const a = i * 2;
      const b = (i + 1) * 2;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  vortexRimGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  // itemSize 4 — three reads RGBA vertex colours, which is what carries the
  // fade without a second texture or a second draw.
  vortexRimGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  vortexRimGeo.setIndex(indices);
}
const vortexRim = new THREE.Mesh(
  vortexRimGeo,
  new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
vortexRim.position.set(HOLE_POINT.x, WATER.surfaceY + 0.012, HOLE_POINT.z);
vortexRim.renderOrder = 3;
scene.add(vortexRim);

function updateVortexRim(time) {
  const pos = vortexRimGeo.attributes.position.array;
  for (let i = 0; i <= VORTEX_RIM_SEGMENTS; i++) {
    const th = (i / VORTEX_RIM_SEGMENTS) * Math.PI * 2;
    const w = vortexWobble(th, time);
    // The outer edge gets its own, differently-phased and slower wobble.
    // Giving both edges the same one produces a band of constant width,
    // which reads as a drawn outline rather than as foam gathering
    // unevenly — and with both animated identically it would also pulse
    // in and out as one ring, which reads as breathing, not as churn.
    const outerW = w * (
      1 + 0.18 * Math.sin(th * 2 - 0.6 + time * 0.33) +
      0.1 * Math.sin(th * 4 + 2.2 - time * 0.24)
    );
    const rIn = VORTEX_RIM * w * 0.995;
    const rOut = VORTEX_RIM * outerW * 2.15;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const o = i * 6;
    pos[o] = c * rIn; pos[o + 1] = 0; pos[o + 2] = sn * rIn;
    pos[o + 3] = c * rOut; pos[o + 4] = 0; pos[o + 5] = sn * rOut;
  }
  vortexRimGeo.attributes.position.needsUpdate = true;
}
updateVortexRim(0);

/* LAYER 2 + LAYER 3's arcs — one group, one rotation.
 *
 * These used to be seven tubes each spinning at its own rate on top of the
 * group's rotation, which is exactly the desynchronised look the brief
 * asks to remove: at any moment the arcs sat at unrelated angles and the
 * vortex read as seven separate things turning near each other.
 *
 * Now there is a SINGLE transform. Every arc is a child of one group, so
 * their relative angles are fixed forever and they can only ever move as
 * one piece. The speed still varies — the brief asks for that — but it
 * varies for the group (see tickWhirlpool), which is what "variable speed
 * but all together" actually means.
 *
 * Each arc also runs all the way to radius ZERO, so the tips meet at the
 * centre instead of stopping short and leaving a bald disc in the middle.
 */
/* CONCENTRIC ON THE CONE'S TIP.
 *
 * Every layer of the vortex used to be anchored at the surface, directly
 * over the hole's centre in X/Z. That is concentric on the MOUTH, and the
 * mouth is not where the vortex converges — the cone's apex is, a full
 * depth below. So the arcs spiralled into a point on the water while the
 * funnel drained to a point somewhere under it, and the two centres read
 * as a wobble even though nothing was actually off-axis.
 *
 * Both now share the apex as their origin. In X/Z that is the same point,
 * so the fix is only about which HEIGHT the rotation happens around — but
 * that is exactly what was making the spirals and the funnel look like two
 * separate objects.
 */
const VORTEX_APEX = new THREE.Vector3(
  HOLE_POINT.x,
  WATER.surfaceY + 0.02 - VORTEX_DEPTH,
  HOLE_POINT.z
);

const vortexStreaks = new THREE.Group();
vortexStreaks.position.set(HOLE_POINT.x, WATER.surfaceY + 0.02, HOLE_POINT.z);
scene.add(vortexStreaks);
{
  const ARCS = 6;
  for (let i = 0; i < ARCS; i++) {
    const a0 = (i / ARCS) * Math.PI * 2;
    const pts = [];
    const STEPS = 30;
    for (let k = 0; k <= STEPS; k++) {
      const t = k / STEPS;
      // Logarithmic-ish inward spiral — the curve water actually takes into
      // a drain. The angle keeps running as the radius collapses, so the
      // arc wraps tighter and tighter near the middle.
      const ang = a0 + Math.pow(t, 0.75) * 3.5;
      const rad = VORTEX_RIM * 2.0 * (1 - t);
      // Above the surface while still outside the mouth, then following the
      // cone's wall down once inside it. That is what stitches layer 3 to
      // layer 2: one continuous stroke that starts on the flat sea and ends
      // in the throat, rather than two rings at two heights.
      const inside = Math.max(0, 1 - rad / holeRadius);
      const depth = Math.pow(inside, 1.15) * VORTEX_DEPTH * 0.95;
      pts.push(new THREE.Vector3(Math.cos(ang) * rad, -depth, Math.sin(ang) * rad));
    }
    const base = holeRadius * 0.075;
    const curve = new THREE.CatmullRomCurve3(pts);
    const arcGeo = new THREE.TubeGeometry(curve, 48, base, 8, false);

    /* THE TWO ENDS ARE DIFFERENT PROBLEMS, and the brief names both.
     *
     * The INNER end (t = 1, at the centre) is where all six tips meet.
     * There it is tapered to nothing: six blunt tubes ending at radius
     * zero pile their end caps on top of each other and make a lump right
     * where the eye is drawn.
     *
     * The OUTER end (t = 0, on the open water) was a flat cut — a tube
     * stops and its cross-section shows as a hard disc, which reads as a
     * cut noodle. It needs two separate things:
     *   - a ROUNDED cap, done by tapering the last few percent of the
     *     radius on a circular (sqrt) curve rather than a linear one, so
     *     the silhouette closes in a dome instead of a point or a disc;
     *   - a FADE that runs from that tip inward over the first quarter of
     *     the length, so the arc emerges out of the water rather than
     *     beginning at a definite place. The fade has to finish BEFORE the
     *     rim (a quarter of the arc is about that), or the stroke would
     *     still be brightening as it crosses into the funnel.
     *
     * The fade is per-vertex alpha, which is why the material takes
     * vertexColors: a whole-mesh opacity cannot fade one end of a mesh.
     */
    const pos = arcGeo.attributes.position;
    const uv = arcGeo.attributes.uv;
    const center = new THREE.Vector3();
    const arcColors = new Float32Array(pos.count * 4);
    const foamColor = new THREE.Color(COLORS.waterFoam);
    const TIP_CAP = 0.055; // the rounded dome's share of the length
    const FADE = 0.25; // one quarter, per the brief
    for (let v = 0; v < pos.count; v++) {
      const along = uv.getX(v); // 0 at the outer tip, 1 at the centre
      // Taper toward the centre...
      let scale = Math.pow(1 - along, 0.6);
      // ...and dome the outer tip. sqrt(1 - (1 - x)^2) is a quarter
      // circle, which is exactly the profile of a hemispherical cap.
      if (along < TIP_CAP) {
        const u = along / TIP_CAP;
        scale *= Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u)));
      }
      curve.getPointAt(Math.min(along, 1), center);
      pos.setXYZ(
        v,
        center.x + (pos.getX(v) - center.x) * scale,
        center.y + (pos.getY(v) - center.y) * scale,
        center.z + (pos.getZ(v) - center.z) * scale
      );
      const fade = THREE.MathUtils.smoothstep(along, 0, FADE);
      const o = v * 4;
      arcColors[o] = foamColor.r;
      arcColors[o + 1] = foamColor.g;
      arcColors[o + 2] = foamColor.b;
      arcColors[o + 3] = 0.62 * fade;
    }
    arcGeo.setAttribute('color', new THREE.BufferAttribute(arcColors, 4));
    arcGeo.computeVertexNormals();
    const arc = new THREE.Mesh(
      arcGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      })
    );
    arc.renderOrder = 5;
    vortexStreaks.add(arc);
  }
}

/* LAYER 2 — the churned foam inside the mouth.
 *
 * An inner cone carrying the swirl texture, turning faster than the arcs
 * above it. Two rates in the same vortex is what reads as water shearing
 * as it falls; one rate everywhere reads as a solid object spinning.
 *
 * Two things changed from the lathe version this replaces:
 *
 *  - Its apex is now the SAME point as the main funnel's, not a shallower
 *    one. As a lathe ending at 0.62 of the depth it converged above the
 *    real tip, so the inner waves and the cone drained to two different
 *    places and the whole vortex read as slightly off-axis.
 *
 *  - Its MOUTH is a living, irregular curve rather than a circle, rebuilt
 *    every frame. This is the inner border the brief asks to keep moving.
 *    A LatheGeometry cannot do it at all — a lathe's radius is a function
 *    of height only, so every horizontal section is by definition a
 *    perfect circle. Built by hand it is a ring of vertices whose radius
 *    is a function of ANGLE and time, which is the one thing the lathe
 *    could never express.
 */
const MID_SWIRL_SEGMENTS = 72;
const midSwirlGeo = new THREE.BufferGeometry();
{
  const verts = new Float32Array((MID_SWIRL_SEGMENTS + 1) * 2 * 3);
  const uvs = [];
  const cols = [];
  const indices = [];
  for (let i = 0; i <= MID_SWIRL_SEGMENTS; i++) {
    const u = i / MID_SWIRL_SEGMENTS;
    uvs.push(u, 1, u, 0); // rim row, apex row
    /* THE SMOOTH BORDER, as per-vertex alpha.
     *
     * The spiral sheet used to end on a hard circle where its rim met the
     * funnel, and a hard edge between two water effects reads as one being
     * pasted on the other. Fading the RIM row to zero while the apex row
     * stays opaque makes the marks emerge out of the cone instead of
     * starting at a line — and doing it per vertex rather than with a
     * radial texture matters because the rim is not a circle: it is the
     * deformed, animated curve below, and a radial gradient could only
     * ever fade a circle.
     */
    cols.push(1, 1, 1, 0); // rim: transparent
    cols.push(1, 1, 1, 1); // apex: solid
    if (i < MID_SWIRL_SEGMENTS) {
      const a = i * 2;
      const b = (i + 1) * 2;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  midSwirlGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  midSwirlGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  midSwirlGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
  midSwirlGeo.setIndex(indices);
}
const midSwirl = new THREE.Mesh(
  midSwirlGeo,
  new THREE.MeshBasicMaterial({
    map: WHIRLPOOL_TEXTURE,
    vertexColors: true, // carries the rim fade written above
    transparent: true,
    // Raised from 0.42: the spiral marks inside the funnel are the layer
    // the brief asks to bring back to how it was, and at 0.42 under a
    // brighter grade they had all but vanished.
    opacity: 0.78,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
midSwirl.position.set(HOLE_POINT.x, WATER.surfaceY + 0.018, HOLE_POINT.z);
midSwirl.renderOrder = 4;
scene.add(midSwirl);

function updateMidSwirl(time) {
  const pos = midSwirlGeo.attributes.position.array;
  const apexY = -VORTEX_DEPTH; // local: the mesh sits at the surface
  for (let i = 0; i <= MID_SWIRL_SEGMENTS; i++) {
    const th = (i / MID_SWIRL_SEGMENTS) * Math.PI * 2;
    // Its own harmonics, deliberately different from the outer rim's: two
    // edges wobbling on the same terms would move as one shape and the
    // gap between them would stay constant, which is the look of a drawn
    // outline rather than of two independent surfaces of water.
    /* MUCH faster and much more radical than the outer rim, and ORBITING.
     *
     * The `-time * 2.2` inside every harmonic is the orbit: subtracting a
     * multiple of time from the ANGLE rotates the whole wobble pattern
     * around the axis, in the same direction the vortex turns. That is a
     * different thing from the shape changing — a pattern that only
     * morphs in place reads as boiling, while one that also travels reads
     * as being dragged round by the water, which is what a drain does.
     *
     * The amplitudes are roughly tripled from the outer rim's, so the
     * inner edge visibly lunges in and out instead of rippling. It can
     * afford to: it is inside the funnel, where violence reads as the
     * water being pulled under, whereas the same amplitude on the outer
     * rim would tear the hole away from the surface it sits in.
     */
    const orbit = -time * 2.2;
    const w =
      1 +
      0.3 * Math.sin(th * 3 + orbit + time * 2.4) +
      0.19 * Math.sin(th * 5 + orbit * 1.35 - time * 1.7) +
      0.11 * Math.sin(th * 8 + orbit * 0.8 + time * 3.1);
    const r = holeRadius * 0.86 * w;
    const o = i * 6;
    pos[o] = Math.cos(th) * r; pos[o + 1] = 0; pos[o + 2] = Math.sin(th) * r;
    // Every second vertex is the APEX — one shared point, so the whole
    // surface converges exactly where the funnel does.
    pos[o + 3] = 0; pos[o + 4] = apexY; pos[o + 5] = 0;
  }
  midSwirlGeo.attributes.position.needsUpdate = true;
}
updateMidSwirl(0);

// Foam rings riding the rim: each grows outward and fades on its own
// offset phase, so the loop never shows every ring at the same size. The
// growth is eased rather than linear — foam thrown off a vortex leaves fast
// and then drifts, and a linear scale reads as a mechanical pulse. These
// are the one thing here deliberately NOT synchronised with the arcs: they
// are spray being thrown clear, not part of the turning body.
const whirlRings = [];
for (let i = 0; i < 3; i++) {
  const ring = buildFoamDecal(holeRadius * 2.3, holeRadius * 2.3);
  ring.position.set(HOLE_POINT.x, WATER.surfaceY + 0.03, HOLE_POINT.z);
  ring.material.opacity = 0;
  ring.renderOrder = 4;
  scene.add(ring);
  whirlRings.push({ mesh: ring, phase: i / 3 });
}

function tickWhirlpool(dt, t) {
  // ONE rate for everything that turns, and it VARIES — the brief asks for
  // both, and they are only compatible if the variation is applied to a
  // single shared clock rather than to each piece. Two sines of different
  // periods give a speed that surges and eases without ever repeating on a
  // short loop or reversing.
  const surge = 1 + 0.42 * Math.sin(t * 0.55) + 0.18 * Math.sin(t * 1.37 + 1.1);

  // Layer 1: the funnel wall.
  holeMesh.rotation.y -= dt * 1.15 * surge;
  // Scrolled in U only. U wraps around the cone, so this is a second,
  // faster rotation of the BANDS against the wall — the water visibly
  // shearing as it falls. (Scrolling V would slide the tonal gradient up
  // the cone and carry the dark throat with it, which is why it isn't.)
  VORTEX_WALL_TEXTURE.offset.x = (VORTEX_WALL_TEXTURE.offset.x + dt * 0.22 * surge) % 1;

  // Layer 2: the churned foam, faster than the wall under it.
  midSwirl.rotation.y -= dt * 2.6 * surge;
  updateMidSwirl(t);

  // Layer 3: the arcs. ONE transform for all six — they cannot drift apart
  // because there is nothing left that could drift.
  vortexStreaks.rotation.y -= dt * 1.9 * surge;

  // The rim's own outline, rebuilt against the same clock the water shader
  // uses. Both read WATER.surfaceY-relative time, so the foam ring and the
  // hole it rings stay concentric to the vertex while both change shape.
  updateVortexRim(t);

  for (const r of whirlRings) {
    const k = (t * 0.42 + r.phase) % 1;
    const eased = 1 - Math.pow(1 - k, 2.2);
    // Never below ~0.95: the rings are a band AROUND the rim, and at small
    // scales three of them overlap into a solid white disc covering the
    // throat.
    const scale = 0.95 + eased * 0.6;
    r.mesh.scale.setScalar(scale);
    r.mesh.material.opacity = Math.sin(k * Math.PI) * 0.22;
    r.mesh.rotation.z = k * 1.4;
  }
}

// ---------------------------------------------------------------------
// "Pig" model — v2: rebuilt from scratch as a chibi penguin WORKER per the
// user's hand-drawn concept sketch (stout body, helmet/cap, prominent
// beak, supply backpack connected via tubes, a hand-held bubble-cannon/
// tool). Function name kept as buildPigMesh (every call site references
// it) even though nothing pig-shaped is left. `earLeft`/`earRight` are now
// the flipper-arm nubs at the sides (a real penguin part, and their
// existing idle "wiggle" animation reads naturally as flippers flapping).
// `group.userData.parts = {body, earLeft, earRight, legs}` is kept
// EXACTLY as before so animatePigProcedural (walk cycle, idle rock, ammo
// recoil) needed zero code changes. Local -Z is the model's "front".
// ---------------------------------------------------------------------
/* THE BIRD, remodelled from the Fish of Fortune moodboard.
 *
 * What changed and why, because the previous model was not far off in
 * parts but was wrong in proportion:
 *
 *  - The body is an EGG, widest low and tapering to a small rounded head,
 *    with no separate head mesh. The moodboard's character has no neck and
 *    no head sphere: the whole silhouette is one teardrop, and that single
 *    shape is what makes it read as this character rather than as a
 *    generic round mascot. The old build had a squashed sphere body with a
 *    dome cap on top, which reads as a body-plus-helmet.
 *  - Feet are ORANGE PADDLES resting on the ground, not four cylindrical
 *    legs. Two flat ovals, and they are most of the character's charm.
 *  - The belly is a large light-blue oval covering most of the front, not
 *    a small patch.
 *  - The bandana is white with a knot and two tails, and it is TINTED by
 *    the team. It sits low on the head so it does not become a hat.
 *  - Eyes are simple black ovals, wide apart and low, which is what makes
 *    the face read as friendly rather than as alert.
 */
function buildPigMesh(isWhite, isPirate = false) {
  const group = new THREE.Group();
  // Both squads are the SAME blue bird; the team is told by the bandana
  // and the gear, never by the body. One mascot across the whole game.
  const bodyColor = COLORS.pigWhite;
  const gearColor = isWhite ? COLORS.pigEarWhite : COLORS.pigEarBlack;
  const gearMat = toonMat({ color: gearColor });

  // The egg. Built by scaling a sphere on Y and then pinching the top with
  // a lathe-like taper is overkill here — a sphere scaled 1.0/1.28/0.95
  // and shifted up already gives the teardrop once the bandana sits at the
  // narrow end. The squash is baked into the GEOMETRY, not mesh.scale,
  // because animatePigProcedural drives body.scale.setScalar() every frame
  // for the recoil pulse and would stomp a mesh-level squash.
  const bodyGeo = new THREE.SphereGeometry(0.36, 16, 14);
  // TALLER and NARROWER. At 1.28 the bird was as wide as it was tall once
  // the flippers were counted, and twelve of them in a 4x3 queue read as a
  // packed tray of blobs. The moodboard's character is an EGG standing on
  // end — the vertical is what gives it posture, and the narrowing is what
  // gives the queue air between its columns.
  bodyGeo.scale(0.9, 1.52, 0.86);
  // Pinch the upper half inward so the head end tapers instead of staying
  // spherical — done on the vertices because a scale cannot narrow one end
  // only.
  {
    const pos = bodyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp(y / (0.36 * 1.52), 0, 1);
      const pinch = 1 - Math.pow(t, 1.7) * 0.42;
      pos.setX(i, pos.getX(i) * pinch);
      pos.setZ(i, pos.getZ(i) * pinch);
    }
    bodyGeo.computeVertexNormals();
  }
  const body = new THREE.Mesh(bodyGeo, toonMat({ color: bodyColor }));
  body.position.y = 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // The belly: a big light oval across the front, not a small patch. On
  // the moodboard it covers most of the lower body and it is the second
  // strongest shape after the silhouette itself.
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 14, 12),
    toonMat({ color: COLORS.belly })
  );
  // Pulled DOWN and FORWARD, and narrowed. From the play camera — looking
  // down at the bird — a belly centred at chest height projects onto the
  // top of the silhouette and reads as the character's main colour, which
  // is how a vivid blue penguin ended up looking pale. It belongs on the
  // FRONT, where a profile view sees it and a top view mostly does not.
  belly.scale.set(0.72, 1.05, 0.4);
  belly.position.set(0, 0.34, -0.215);
  group.add(belly);

  // BANDANA — white, tinted by the team, sitting low on the taper. A knot
  // and two tails on the side, which is the moodboard's own read and also
  // breaks the egg's symmetry so the character has a facing at a glance.
  const bandanaMat = toonMat({ color: COLORS.cap });
  /* THE BANDANA CAPS THE SKULL.
   *
   * Two passes ago it was a wide dome that swallowed the head; the fix was
   * to shrink it, which traded one wrong read for another — it became a
   * small cap perched on top, with a gap of blue between cloth and skull.
   *
   * The real answer is neither: a bandana is tied AROUND the head, so it
   * has to be the same shape as the head at that height and sit flush
   * against it. The radius is derived from the body's own taper at the
   * bandana's height rather than picked by eye, so the two cannot drift
   * apart when the body is retuned — that derivation is the whole reason
   * this now fits instead of hovering.
   */
  const bandana = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    bandanaMat
  );
  // Sat HIGH, on the crown. The derivation below still fits it flush to
  // the head — that part was right — but the height it was fitted AT was
  // wrong: at 0.78 the head is still near its widest, so a flush bandana
  // there is as wide as the bird and, from a camera looking down, IS the
  // bird. Moving it up the taper means the same flush fit now covers only
  // the crown, and a ring of body blue stays visible around it, which is
  // what lets the character read as a blue penguin wearing something white
  // rather than as a white blob.
  const BANDANA_Y = 0.95;
  {
    // The body is a sphere of r=0.36 scaled (1, 1.28, 0.95) and pinched by
    // (1 - (y/h)^1.7 * 0.42), centred at y=0.5. Solve for its half-width at
    // BANDANA_Y and add a hair for the cloth's own thickness.
    const bodyR = 0.36;
    const localY = BANDANA_Y - 0.5;
    const h = bodyR * 1.52;
    const ring = Math.sqrt(Math.max(0, 1 - (localY / h) ** 2)); // sphere cross-section
    const pinch = 1 - Math.pow(THREE.MathUtils.clamp(localY / h, 0, 1), 1.7) * 0.42;
    const fit = bodyR * ring * pinch + 0.02;
    bandana.scale.set((fit * 0.9) / 0.235, 0.42, (fit * 0.86) / 0.235);
  }
  bandana.position.y = BANDANA_Y;
  bandana.castShadow = true;
  group.add(bandana);
  // The knot and tails carry the TEAM colour. They are the only saturated
  // mass on the head, so they are what the eye picks up from the play
  // camera — the same "colour the face that points at the player"
  // reasoning that put the team colour on the can's lid.
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), gearMat);
  knot.position.set(0.14, 0.95, 0.07);
  group.add(knot);
  for (const [tx, ty, tz, rz] of [[0.22, 1.0, 0.1, 0.5], [0.21, 0.91, 0.14, -0.35]]) {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.17, 6), gearMat);
    tail.position.set(tx, ty, tz);
    tail.rotation.set(0.3, 0, rz);
    group.add(tail);
  }

  // A small rounded beak. The moodboard's is a stubby orange wedge, not a
  // long cone — a long one reads as a snout from this camera and fights
  // the bazooka for the nose of the silhouette.
  /* THE BEAK is a TAPERED WEDGE, not a cone of revolution.
   *
   * A cone has the same profile from every angle, so from the play camera
   * — looking down — it read as a round orange nub. A bird's beak is wide
   * and deep at the base and narrows to a point in BOTH axes at once, and
   * it is flatter than it is tall. So this is a 4-sided pyramid, squashed:
   * broad at the skull, pinched to a fine tip, and with the four flat
   * facets that make it read as a beak rather than as a carrot.
   *
   * radialSegments 4 on a cone gives exactly that pyramid, and rotating it
   * an eighth turn puts a flat face up so the top of the beak is a plane
   * catching the light rather than a ridge.
   */
  const beakGeo = new THREE.ConeGeometry(0.115, 0.22, 4);
  beakGeo.rotateY(Math.PI / 4);
  beakGeo.scale(1, 1, 0.62); // flatter than tall, like a bill
  const beak = new THREE.Mesh(beakGeo, toonMat({ color: COLORS.snout }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.58, -0.33);
  beak.castShadow = true;
  group.add(beak);

  // Eyes: plain black ovals, set wide and LOW. High, close-set eyes read
  // as alert or angry; the moodboard's character is neither.
  const eyeGeo = new THREE.SphereGeometry(0.05, 10, 8);
  const eyeMat = toonMat({ color: COLORS.eye });
  const eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
  eyeLeft.scale.set(0.72, 1.15, 0.6);
  eyeLeft.position.set(-0.115, 0.7, -0.25);
  group.add(eyeLeft);
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.13;
  group.add(eyeRight);

  // Flipper wings — flat, swept back, hugging the body. Kept as
  // `earLeft`/`earRight` because animatePigProcedural already wiggles
  // those, and a flipper flap is exactly what that wiggle should be.
  const flipperGeo = new THREE.SphereGeometry(0.14, 10, 8);
  flipperGeo.scale(0.42, 1.05, 0.72);
  const flipperMat = toonMat({ color: bodyColor });
  const earLeft = new THREE.Mesh(flipperGeo, flipperMat);
  earLeft.position.set(-0.3, 0.48, 0.03);
  earLeft.rotation.z = 0.25;
  earLeft.castShadow = true;
  group.add(earLeft);
  const earRight = earLeft.clone();
  earRight.position.x = 0.33;
  earRight.rotation.z = -0.25;
  group.add(earRight);

  // Supply backpack, worn on the back (+Z, opposite the beak's -Z front).
  // Deliberately FLAT on top: that face is the ammo readout's surface, and
  // a rounded lid would bend the number across it at this camera angle.
  /* THE BACKPACK: rounded on the OUTER corners, square where it meets the
   * bird. A uniformly rounded box reads as a pillow; a uniformly square one
   * reads as a crate. What makes it read as a pack strapped to a back is
   * that the free edges are soft and the edge against the body is not — so
   * the rounding is applied by squashing a rounded box's far half rather
   * than by rounding everything equally.
   *
   * Done by scaling the geometry's back half outward after the fact: the
   * two corners touching the bird stay where a square box would put them,
   * and only the outer pair get the visible radius. */
  const packGeo = new RoundedBoxGeometry(0.36, 0.4, 0.26, 3, 0.075);
  {
    const pos = packGeo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      // The inner face (-Z, toward the bird) is pushed back out to the
      // full box profile, cancelling its radius.
      if (pos.getZ(v) < -0.05) {
        pos.setX(v, Math.sign(pos.getX(v)) * Math.max(Math.abs(pos.getX(v)), 0.18));
        pos.setY(v, Math.sign(pos.getY(v)) * Math.max(Math.abs(pos.getY(v)), 0.2));
      }
    }
    packGeo.computeVertexNormals();
  }
  const backpack = new THREE.Mesh(packGeo, gearMat);
  backpack.position.set(0, 0.6, 0.26);
  backpack.castShadow = true;
  backpack.receiveShadow = true;
  group.add(backpack);
  const packLid = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.035, 0.28),
    toonMat({ color: COLORS.cap })
  );
  packLid.position.set(0, 0.805, 0.26);
  group.add(packLid);
  // The model owns the ammo anchor, so moving the pack later cannot leave
  // the number behind.
  group.userData.ammoAnchor = new THREE.Vector3(0, 1.02, 0.34);

  // Supply tubes from the pack down to the tool.
  /* ONE HOSE, from the pack to the weapon, and it FOLLOWS the weapon.
   *
   * The two little stubs it replaces were parented to the body and pointed
   * nowhere — with the barrel now swinging to track targets, they read as
   * two pipes aiming into empty water. A supply line has to connect two
   * specific points, so this one is rebuilt each frame from where the pack
   * actually is to where the weapon actually is (see tickPigHose), which
   * is the only way it can stay attached while one end moves.
   *
   * A tube along a quadratic curve rather than a straight cylinder: a hose
   * hangs, and the sag is most of what says "flexible" instead of "pipe".
   */
  const hoseMat = toonMat({ color: COLORS.tube });
  const hose = new THREE.Mesh(buildHoseGeometry(), hoseMat);
  hose.castShadow = true;
  group.add(hose);
  group.userData.hose = hose;
  group.userData.hoseFrom = new THREE.Vector3(0.08, 0.52, 0.2);

  /* THE BAZOOKA — shorter, with a real bore.
   *
   * The muzzle used to be a solid cap (a flared funnel, or a magnet head),
   * which reads as a nozzle, not as a weapon. A bazooka's tip is a HOLE,
   * and a hole is the one detail that makes a tube read as something that
   * fires. It is built as an open-ended cylinder with the inside painted
   * dark, seen through the ring of the muzzle lip — cheaper and more
   * legible at phone size than actually boring through the barrel.
   */
  const weaponGroup = new THREE.Group();
  const BARREL_LEN = 0.4;
  // openEnded defaults to FALSE, so this cylinder already has caps — but
  // the previous build's bore disc sat proud of the front cap and the rear
  // was left visible from behind at some angles. The barrel is a solid
  // tube with a painted bore at the front, not an open pipe.
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.125, 0.135, BARREL_LEN, 14, 1, false),
    gearMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.castShadow = true;
  weaponGroup.add(barrel);
  // Muzzle lip: a slightly wider ring at the end, so the bore has a rim to
  // read against instead of ending flush with the barrel.
  // A MUCH heavier muzzle. The bore is the detail that says "this fires",
  // and at the previous size the lip was barely wider than the barrel, so
  // from the play camera the tip just looked like where the tube stopped.
  // A pronounced flare gives the bore a rim to read against and gives the
  // whole silhouette a front end.
  const muzzleRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.185, 0.14, 0.1, 14),
    toonMat({ color: COLORS.weapon })
  );
  muzzleRing.rotation.x = Math.PI / 2;
  muzzleRing.position.z = -BARREL_LEN / 2 - 0.02;
  weaponGroup.add(muzzleRing);
  // The BORE: a dark disc recessed inside the lip. Flat and dark is enough
  // — at this size a real cavity would be a few dark pixels either way.
  const bore = new THREE.Mesh(
    new THREE.CircleGeometry(0.135, 16),
    new THREE.MeshBasicMaterial({ color: 0x171c2e })
  );
  bore.position.z = -BARREL_LEN / 2 - 0.07;
  bore.rotation.y = Math.PI; // face forward, down -Z
  weaponGroup.add(bore);
  // A grip under the barrel, so the bird is holding something rather than
  // balancing a tube.
  const grip = new THREE.Mesh(
    new RoundedBoxGeometry(0.07, 0.13, 0.09, 2, 0.03),
    toonMat({ color: COLORS.weapon })
  );
  grip.position.set(0, -0.11, 0.04);
  weaponGroup.add(grip);

  // Where a shot is born. Exposed as a node so the firing code can ask the
  // MODEL where its muzzle is instead of guessing an offset from the body.
  const muzzleTip = new THREE.Object3D();
  muzzleTip.position.set(0, 0, -BARREL_LEN / 2 - 0.08);
  weaponGroup.add(muzzleTip);
  group.userData.muzzleTip = muzzleTip;
  // Carried out in front and slightly to the side. The REST pose only —
  // tickPigAim swings this group to face whatever is being shot at.
  // Carried OUT TO THE SIDE and back, not out in front. The rest pose used
  // to sit the barrel directly ahead of the bird's face, so in idle the
  // tube ran straight through the beak — visible on every queue penguin at
  // once, which is the worst place for it. Held at the shoulder it clears
  // the head entirely, and the aim code swings it forward only to shoot.
  weaponGroup.position.set(0.26, 0.56, 0.06);
  group.userData.weaponRest = weaponGroup.position.clone();
  group.add(weaponGroup);

  /* FEET — two orange paddles, flat on the ground.
   *
   * Still called `legs` and still wrapped in hip pivots, because
   * animatePigProcedural swings that array for the walk cycle and it
   * should keep working unchanged. Two, not four: the moodboard's bird has
   * two, and four little cylinders were the single most off-model thing on
   * the previous build.
   */
  const footGeo = new THREE.SphereGeometry(0.13, 10, 8);
  footGeo.scale(0.85, 0.38, 1.25);
  const footMat = toonMat({ color: COLORS.snout });
  const legs = [];
  for (const lx of [-0.15, 0.15]) {
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.position.set(0, -0.08, -0.05);
    foot.castShadow = true;
    // Pivot at the hip, so the walk cycle swings the foot rather than
    // tilting it in place.
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.14, 0);
    pivot.add(foot);
    group.add(pivot);
    legs.push(pivot);
  }

  /* THE PIRATE. A rare variant, worth 40 rounds instead of 20.
   *
   * It reuses the whole bird and only ADDS a hat — no second model, no
   * second code path anywhere else. That matters more than it looks:
   * every system downstream (queue, pick, rig, aim, fire, despawn) keeps
   * working on it unchanged, because as far as they are concerned it is an
   * ordinary penguin whose ammo happens to start higher.
   *
   * The hat is in the CREW's colour, not black, so the rarity never costs
   * the team read — a player still has to know at a glance which squad they
   * are picking.
   */
  if (isPirate) {
    const hatGroup = new THREE.Group();
    // The crown: a shallow dome sitting over the bandana.
    /* A SAILOR CAP: white crown, coloured band, short peak.
     *
     * The bicorne it replaces was reading as a lump — a torus brim plus a
     * dome is two silhouettes fighting, and neither said "sailor". A cap
     * is three clean parts stacked, and the BAND is where the team colour
     * goes: it is the widest coloured element seen from the play camera,
     * which is the same reasoning that put the crew's colour on the can's
     * lid and the bandana's knot.
     */
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.175, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      toonMat({ color: COLORS.cap })
    );
    crown.scale.set(1, 0.72, 1);
    crown.position.y = 0.03;
    hatGroup.add(crown);
    // The band, in the WEAPON's colour so cap and bazooka read as one kit.
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.178, 0.182, 0.055, 16),
      gearMat
    );
    band.position.y = 0.018;
    hatGroup.add(band);
    // The peak: a flattened half-disc out over the beak.
    const peak = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 14, Math.PI, Math.PI),
      toonMat({ color: COLORS.cap, side: THREE.DoubleSide })
    );
    peak.rotation.x = -Math.PI / 2 + 0.16;
    peak.scale.set(1, 0.72, 1);
    peak.position.set(0, 0.005, -0.05);
    hatGroup.add(peak);
    // The BICORNE brim: two upswept points fore and aft. Built as a
    // squashed, tilted torus rather than a modelled brim — from every angle
    // the game shows it, the read is "wide dark band with raised ends", and
    // a torus gives that in one primitive.
    // A small badge on the front of the band, in white — the detail that
    // makes it a uniform cap rather than a beanie.
    const badge = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 6),
      toonMat({ color: COLORS.cap })
    );
    badge.scale.set(1, 1, 0.4);
    badge.position.set(0, 0.03, -0.17);
    hatGroup.add(badge);
    hatGroup.position.y = 1.0;
    hatGroup.rotation.z = 0.07; // a slight tilt — a level cap reads as a helmet
    hatGroup.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(hatGroup);
  }
  group.userData.isPirate = isPirate;

  // Exposed so the lightweight procedural animations (no skeleton) can
  // move the right pieces. The weapon is in the set so recoil can kick the
  // bazooka as well as the body — a shot where only the torso moves reads
  // as a flinch, not as a gun going off.
  group.userData.parts = { body, earLeft, earRight, legs, weapon: weaponGroup };

  return group;
}


/**
 * Lightweight procedural animation for the primitive pig model — no
 * skeleton, just a few parts nudged by sine waves. `mode` is 'idle' or
 * 'walk'; `recoil` (0..1, decaying) layers a quick shooting kick on top.
 */
// Where buildPigMesh parks the body. Kept as one constant because the walk
// bob, the idle bob and the recoil all offset FROM it, and the last remodel
// moved the body without moving the three places that assumed 0.42.
const BODY_REST_Y = 0.5;

function animatePigProcedural(pigGroup, t, mode, recoil) {
  const parts = pigGroup.userData.parts;
  if (!parts) return;
  const { body, earLeft, earRight, legs } = parts;

  // TWO feet now, not four — the remodel dropped the four cylindrical legs
  // for the moodboard's pair of orange paddles. The old walk cycle indexed
  // legs[2] and legs[3] and threw the moment a bird took a step.
  if (mode === 'walk') {
    const stride = Math.sin(t * 11);
    legs[0].rotation.x = stride * 0.5;
    legs[1].rotation.x = -stride * 0.5;
    body.position.y = BODY_REST_Y + Math.abs(Math.sin(t * 11)) * 0.025;
    body.rotation.x = 0;
  } else {
    for (const leg of legs) leg.rotation.x = 0;
    body.position.y = BODY_REST_Y + Math.sin(t * 2.2) * 0.015;
    const earWiggle = Math.sin(t * 2.2 + 1.2) * 0.05;
    earLeft.rotation.z = 0.25 + earWiggle;
    earRight.rotation.z = -0.25 - earWiggle;
    // Gentle forward/back rock — a slight nod on the body only, feet stay
    // planted (legs are untouched above), per feedback.
    body.rotation.x = Math.sin(t * 1.7) * 0.07;
  }

  /* THE WEAPON AIMS AT WHAT IT SHOOTS.
   *
   * Before, the barrel had exactly two poses: shouldered, or swung to a
   * fixed forward angle for the recoil. So a bird firing at a target off
   * to its left still pointed dead ahead and the pellet left at an angle
   * the model never showed — the shot looked like it came out of the side
   * of the gun.
   *
   * The fix separates two things that were being conflated. The BIRD keeps
   * its own facing (it rides the belt and its heading comes from the belt
   * tangent; spinning the whole model to track targets would make the
   * queue look drunk). Only the WEAPON GROUP turns, and it turns to the
   * real target — the same vector the projectile is spawned along, so the
   * barrel and the shot cannot disagree by construction.
   *
   * `aimLocal` is written by tickPigAim below in the weapon's own parent
   * space; here it is only followed, and followed with a lerp so the
   * barrel swings across rather than snapping between targets.
   */
  const weapon = parts.weapon;
  if (weapon) {
    const aim = weapon.userData.aimLocal;
    // Shouldered when there is nothing to shoot at: swung out to the side
    // and tilted up. In a 4-lane queue the bird ahead stands barely a body
    // width away, and a barrel held straight forward pushed right through
    // it.
    // Swept back over the shoulder at rest: yaw turns the muzzle away from
    // the bird's own centreline and pitch lifts it, so the barrel ends up
    // behind and above the head rather than across the chest — which is
    // where a real shouldered weapon sits, and the only pose that clears
    // both the beak and the neighbour standing a body-width away.
    const targetYaw = aim ? aim.yaw : -1.35;
    const targetPitch = aim ? aim.pitch : -1.15;
    weapon.rotation.y += (targetYaw - weapon.rotation.y) * 0.22;
    weapon.userData.restPitch = targetPitch;
  }
  if (recoil > 0) {
    body.position.z = recoil * 0.11;
    body.scale.setScalar(1 - recoil * 0.05);
    if (weapon) {
      // Kick straight back along the barrel and tip the muzzle up: recoil
      // that only translates reads as the model sliding, while the pitch
      // is what makes it read as a shot being fired. Both are applied as
      // an OFFSET from the aim pose, so recoiling never fights the aim.
      const rest = weapon.userData.restPos ?? weapon.position.z;
      weapon.userData.restPos = rest;
      weapon.position.z = rest + recoil * 0.16;
      weapon.rotation.x = (weapon.userData.restPitch ?? -0.95) - recoil * 0.35;
    }
  } else {
    body.position.z = 0;
    body.scale.setScalar(1);
    if (weapon) {
      weapon.position.z = weapon.userData.restPos ?? weapon.position.z;
      // Ease back rather than snapping: the gun coming down for a shot and
      // lifting again is half the read of the firing animation.
      const rest = weapon.userData.restPitch ?? -0.95;
      weapon.rotation.x += (rest - weapon.rotation.x) * 0.18;
    }
  }
}

// Scratch vectors for tickPigAim — called for every rider every frame, so
// it allocates nothing.
const _aimWorld = new THREE.Vector3();
const _aimLocal = new THREE.Vector3();
const _hoseA = new THREE.Vector3();
const _hoseB = new THREE.Vector3();
const _hoseMid = new THREE.Vector3();

/* Update the supply hose between the pack and the weapon.
 *
 * The geometry is built ONCE per bird and then has its vertex positions
 * rewritten in place. The first version disposed and re-created a
 * TubeGeometry every frame for every rider, which allocates and frees five
 * index buffers, five position buffers and five normal buffers per frame —
 * a steady stream of garbage for a shape with 54 vertices. Writing into
 * the existing array costs no allocation at all.
 *
 * The ring layout is fixed (9 rings of 6), so the positions can be
 * recomputed directly from the curve rather than going through
 * TubeGeometry's frame maths again.
 */
const HOSE_SEGMENTS = 8;
const HOSE_RADIAL = 6;
const HOSE_RADIUS = 0.026;
const _hosePt = new THREE.Vector3();
const _hoseTan = new THREE.Vector3();
const _hoseNrm = new THREE.Vector3();
const _hoseBin = new THREE.Vector3();
const _hoseUp = new THREE.Vector3(0, 1, 0);

function buildHoseGeometry() {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array((HOSE_SEGMENTS + 1) * HOSE_RADIAL * 3);
  const idx = [];
  for (let i = 0; i < HOSE_SEGMENTS; i++) {
    for (let j = 0; j < HOSE_RADIAL; j++) {
      const a = i * HOSE_RADIAL + j;
      const b = i * HOSE_RADIAL + ((j + 1) % HOSE_RADIAL);
      const c = (i + 1) * HOSE_RADIAL + j;
      const d = (i + 1) * HOSE_RADIAL + ((j + 1) % HOSE_RADIAL);
      idx.push(a, c, d, a, d, b);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  return geo;
}

function tickPigHose(pigGroup) {
  const hose = pigGroup.userData.hose;
  const weapon = pigGroup.userData.parts?.weapon;
  if (!hose || !weapon) return;
  _hoseA.copy(pigGroup.userData.hoseFrom);
  _hoseB.copy(weapon.position);
  _hoseB.y -= 0.02;
  _hoseB.z += 0.14; // the hose meets the weapon at its BACK, not its tip
  // Sag: the midpoint drops below the straight line between the ends.
  _hoseMid.copy(_hoseA).add(_hoseB).multiplyScalar(0.5);
  _hoseMid.y -= 0.09;

  const pos = hose.geometry.attributes.position.array;
  for (let i = 0; i <= HOSE_SEGMENTS; i++) {
    const t = i / HOSE_SEGMENTS;
    // Quadratic Bezier, inlined — one curve object per frame per rider is
    // exactly the allocation this rewrite exists to remove.
    const mt = 1 - t;
    _hosePt.set(
      mt * mt * _hoseA.x + 2 * mt * t * _hoseMid.x + t * t * _hoseB.x,
      mt * mt * _hoseA.y + 2 * mt * t * _hoseMid.y + t * t * _hoseB.y,
      mt * mt * _hoseA.z + 2 * mt * t * _hoseMid.z + t * t * _hoseB.z
    );
    _hoseTan.set(
      2 * mt * (_hoseMid.x - _hoseA.x) + 2 * t * (_hoseB.x - _hoseMid.x),
      2 * mt * (_hoseMid.y - _hoseA.y) + 2 * t * (_hoseB.y - _hoseMid.y),
      2 * mt * (_hoseMid.z - _hoseA.z) + 2 * t * (_hoseB.z - _hoseMid.z)
    ).normalize();
    _hoseNrm.crossVectors(_hoseUp, _hoseTan).normalize();
    if (_hoseNrm.lengthSq() < 0.01) _hoseNrm.set(1, 0, 0);
    _hoseBin.crossVectors(_hoseTan, _hoseNrm).normalize();
    for (let j = 0; j < HOSE_RADIAL; j++) {
      const a = (j / HOSE_RADIAL) * Math.PI * 2;
      const ca = Math.cos(a) * HOSE_RADIUS;
      const sa = Math.sin(a) * HOSE_RADIUS;
      const o = (i * HOSE_RADIAL + j) * 3;
      pos[o] = _hosePt.x + _hoseNrm.x * ca + _hoseBin.x * sa;
      pos[o + 1] = _hosePt.y + _hoseNrm.y * ca + _hoseBin.y * sa;
      pos[o + 2] = _hosePt.z + _hoseNrm.z * ca + _hoseBin.z * sa;
    }
  }
  hose.geometry.attributes.position.needsUpdate = true;
  hose.geometry.computeVertexNormals();
}

/** Point a rider's weapon at a world position (or stow it, when null).
 *
 * The target is converted into the WEAPON'S PARENT space before the angles
 * are taken, which is what makes this correct regardless of how the rig is
 * turned: the rig's heading follows the belt tangent and changes through
 * every curve, and angles measured in world space would be off by exactly
 * that heading. */
function tickPigAim(pigGroup, worldTarget) {
  const weapon = pigGroup.userData.parts?.weapon;
  if (!weapon) return;
  if (!worldTarget) {
    weapon.userData.aimLocal = null;
    return;
  }
  _aimWorld.copy(worldTarget);
  weapon.parent.worldToLocal(_aimLocal.copy(_aimWorld));
  const dx = _aimLocal.x - weapon.position.x;
  const dy = _aimLocal.y - weapon.position.y;
  const dz = _aimLocal.z - weapon.position.z;
  // The barrel points down local -Z, so a target straight ahead is yaw 0.
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  weapon.userData.aimLocal = { yaw, pitch };
}

// ---------------------------------------------------------------------
// Ammo label sprite: no circle/badge backdrop — just the number itself,
// solid black on a white pig and solid white on a black pig, no outline.
// ---------------------------------------------------------------------
function drawAmmoCanvas(value, isWhitePig) {
  // Bumped resolution + font size hard this pass — feedback said the
  // previous canvas was nearly illegible on an actual phone screen.
  const canvas = document.createElement('canvas');
  canvas.width = 220;
  canvas.height = 164;
  const ctx = canvas.getContext('2d');
  ctx.font = `700 96px ${FONT.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Both crews now get the SAME dark number on a white outline. The ammo
  // count is information about the game, not about the team — the team is
  // already said by the gear, the bandana and the backpack — and swapping
  // the number's own colours per squad meant the one number a player reads
  // under pressure changed appearance depending on who they picked.
  drawOutlinedText(ctx, String(value), 110, 86, '#12325a');
  return canvas;
}

function makeAmmoSprite(value, isWhitePig) {
  const texture = new THREE.CanvasTexture(drawAmmoCanvas(value, isWhitePig));
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  // Smaller than before: it now sits on the backpack lid rather than
  // floating over the whole model, so it no longer has to be the biggest
  // thing on the bird to be found.
  sprite.scale.set(0.62, 0.47, 1); // matches the 128x96 canvas aspect ratio
  return sprite;
}

// ---------------------------------------------------------------------
// Projectiles: bigger + brighter, with a tapering comet-style trail (one
// cone mesh per shot, updated in place every frame — cheaper than
// spawning a stream of particles).
// ---------------------------------------------------------------------
const activeProjectiles = [];
// The two pieces of flying litter. Small, squat versions of the board
// shapes, so what the tool pulls in is visibly the same thing that was
// standing there a moment ago.
const LITTER_BOTTLE_GEO = buildBottleGeometry(PIG.projectileRadius * 3.4);
const LITTER_CAN_GEO = buildCanGeometry(PIG.projectileRadius * 3.4);
const PROJECTILE_GEO = new THREE.SphereGeometry(PIG.projectileRadius, 10, 10);

/** The CORAL BREAKER fires nails, not pellets: a flat round head with a
 * shaft behind it, per the brief's "pregos em formato de T". Merged into
 * one geometry and built once, since a shot is spawned several times a
 * second. The head faces the target, so from this camera the silhouette
 * reads as a disc with a tail — a nail seen head-on. */
const NAIL_GEO = (() => {
  const r = PIG.projectileRadius;
  const head = new THREE.CylinderGeometry(r, r, r * 0.42, 12);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, -r * 0.5);
  const shaft = new THREE.CylinderGeometry(r * 0.3, r * 0.22, r * 1.9, 8);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, r * 0.7);
  return mergeGeometries([head, shaft], false);
})();
// Trail's base radius now matches the projectile's own radius exactly (was
// 0.85x, reading as a separate, skinnier shape) — it tapers from the full
// width of the shot down to a point, like a real comet tail extending it.
const TRAIL_GEO = new THREE.ConeGeometry(PIG.projectileRadius, PIG.projectileTrailLength, 10, 1, true);
TRAIL_GEO.translate(0, PIG.projectileTrailLength / 2, 0);

/** The COLLECTION trail — the INVERSE of the shot trail above.
 *
 * Unused while the game is in shooting mode, and kept deliberately: the
 * suction read may come back for a powerup (a magnet that pulls a whole
 * row), and the shape reasoning below is the part that took the work.
 *
 * A fired projectile drags a tail that is widest at the object and tapers
 * to a point behind it: the classic comet, reading as something leaving.
 * A collected object is the opposite event — it is being pulled, and the
 * water behind it is being dragged after it. So this cone is flipped: its
 * APEX sits on the object and it FLARES outward behind, which is the shape
 * of a wake being stretched rather than a trail being shed, and gives the
 * distortion feel the brief asks for.
 *
 * ConeGeometry puts the apex at +h/2. rotateZ(PI) swings it to -h/2, then
 * the translate lifts the apex to the origin and the wide base out to +Y —
 * the same +Y axis the existing code already aims backward along the
 * flight vector, so no change is needed at the aiming site.
 */
const SUCTION_TRAIL_LENGTH = PIG.projectileTrailLength * 1.55;
const SUCTION_TRAIL_GEO = new THREE.ConeGeometry(
  PIG.projectileRadius * 2.2, SUCTION_TRAIL_LENGTH, 12, 1, true
);
SUCTION_TRAIL_GEO.rotateZ(Math.PI);
SUCTION_TRAIL_GEO.translate(0, SUCTION_TRAIL_LENGTH / 2, 0);
const UP_Y = new THREE.Vector3(0, 1, 0);
// The nail's head faces local -Z, so this is the axis aimed along flight.
const FORWARD_NEG_Z = new THREE.Vector3(0, 0, -1);

/** COLLECTION, not shooting.
 *
 * The premise changed: the crew are cleaning the sea, so the piece of
 * rubbish must travel FROM the board TO the tool — the plastic crew sucks
 * bottles into a vacuum, the metal crew pulls cans in on a magnet. That is
 * a reversal of the original direction, and it also simplifies the timing:
 * the pillar is removed the moment collection starts rather than when a
 * projectile lands, so the flying object IS the rubbish leaving its slot
 * instead of a bullet chasing something still standing there.
 *
 * `fromPosition` is now the TOOL's muzzle (the destination), and the
 * journey runs the other way.
 */
function spawnProjectile(fromPosition, toPillar, color) {
  // Reserve this pillar the instant the shot leaves — see
  // findShootablePillar for the bug the flag fixes.
  toPillar.targeted = true;

  // BACK TO SHOOTING. The suction read was built and then pulled: pulling
  // the rubbish in meant the pillar had to vanish at the START of the
  // flight, so the board emptied a beat before anything reached the tool
  // and the two events never lined up. A shot puts cause before effect
  // again — the pellet lands, THEN the litter goes — which is the timing
  // the whole feedback loop (sound, counter, recoil) was written around.
  //
  // Each crew fires its own colour: orange for the magnet crew, cyan for
  // the vacuum crew. That is the only cue telling the player which squad a
  // shot in mid-air belongs to when several are crossing at once, so the
  // two are picked far apart in hue rather than as two blues.
  const tone = color === 'white' ? COLORS.shotCyan : COLORS.shotOrange;
  const mat = toonMat({
    color: tone,
    emissive: tone,
    // A little self-emission so the pellet stays legible over the white
    // foam network, which is now the brightest thing it flies across.
    emissiveIntensity: 0.35,
  });
  const mesh = new THREE.Mesh(NAIL_GEO, mat);
  mesh.position.copy(fromPosition);
  scene.add(mesh);

  const trailMat = new THREE.MeshBasicMaterial({
    color: tone,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  // The COMET trail again: widest at the pellet, tapering to a point
  // behind it. The flared cone built for suction is the opposite shape and
  // would now read as the shot being sucked backwards.
  const trailMesh = new THREE.Mesh(TRAIL_GEO, trailMat);
  trailMesh.position.copy(fromPosition);
  scene.add(trailMesh);

  const distance = fromPosition.distanceTo(toPillar.position);
  const duration = distance / PIG.projectileSpeed;

  activeProjectiles.push({
    mesh,
    trailMesh,
    from: fromPosition.clone(),
    to: toPillar.position.clone(),
    prevPos: fromPosition.clone(),
    elapsed: 0,
    duration: Math.max(duration, 0.03),
    targetPillar: toPillar,
  });
}

function tickProjectiles(dt) {
  for (let i = activeProjectiles.length - 1; i >= 0; i--) {
    const proj = activeProjectiles[i];
    proj.elapsed += dt;
    const t = Math.min(proj.elapsed / proj.duration, 1);
    proj.prevPos.copy(proj.mesh.position);
    proj.mesh.position.lerpVectors(proj.from, proj.to, t);
    proj.mesh.position.y += Math.sin(Math.PI * t) * PIG.projectileArcHeight;

    const vel = proj.mesh.position.clone().sub(proj.prevPos);
    proj.trailMesh.position.copy(proj.mesh.position);
    if (vel.lengthSq() > 1e-6) {
      const fwd = vel.clone().normalize();
      // Point the NAIL along its own velocity. It was never oriented at
      // all before, so a shot fired sideways still showed its head facing
      // whatever direction the geometry happened to be authored in — which
      // is why the nail looked like it was travelling in the wrong
      // direction. The head is at local -Z (see NAIL_GEO), so that is the
      // axis to align with the flight vector.
      proj.mesh.quaternion.setFromUnitVectors(FORWARD_NEG_Z, fwd);
      const backDir = fwd.clone().multiplyScalar(-1);
      proj.trailMesh.quaternion.setFromUnitVectors(UP_Y, backDir);
    }
    // Fades as it travels: the trail is spent energy behind the pellet,
    // so it thins out over the flight rather than building up.
    proj.trailMesh.material.opacity = 0.55 * (1 - Math.pow(t, 3));

    if (t >= 1) {
      scene.remove(proj.mesh);
      proj.mesh.material.dispose();
      scene.remove(proj.trailMesh);
      proj.trailMesh.material.dispose();
      sfx.hit();
      // ON ARRIVAL, not at launch: the litter is removed when the pellet
      // reaches it, so the hit reads as the cause of it going.
      if (proj.targetPillar.alive) {
        destroyPillar(proj.targetPillar);
        onPillarDestroyed(proj.targetPillar.color, proj.targetPillar);
      }
      // Release the reservation now that this shot has resolved (hit or
      // not) — always safe to clear, whether or not the pillar was already
      // destroyed, since `alive` alone excludes a destroyed one afterward.
      proj.targetPillar.targeted = false;
      activeProjectiles.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------
// Rigs (active runners on the belt): a fiche tile + the pig riding it.
// The rig's rotation follows the belt's own tangent through the curve;
// the pig's local rotation relative to the fiche is fixed at spawn.
// `pigGroup` is the SAME instance that was standing in the queue — picking
// it flies it, drag-and-drop style, from its queue spot onto the fiche.
// ---------------------------------------------------------------------
const activePigs = [];

function nextFireInterval() {
  const jitter = (Math.random() * 2 - 1) * PIG.fireIntervalJitter;
  // Divided by the rapid-fire multiplier rather than subtracting from the
  // base: a powerup that says "twice as fast" should stay twice as fast
  // whatever the base is tuned to later, and a subtraction would go
  // negative the moment someone lowers the base.
  return Math.max(50, (PIG.fireIntervalBase + jitter) / boosts.fireRate);
}

function spawnRig(pigGroup, color, tokenIndex) {
  const isWhite = color === 'white';

  const rig = new THREE.Group();
  // v2: same real torus "boia" Group used by the static pile.
  const tileMesh = buildBoiaMesh();
  // No rotation needed — the boia lies flat in the pile already, the same
  // pose it keeps once it's lying on the belt.
  rig.add(tileMesh);
  // A riding boia genuinely floats, so it carries its own waterline foam.
  // Parented to the rig, so it tracks the boia around the loop instead of
  // being recomputed per frame. Its Y is set relative to the rig, which
  // rides above the surface — hence the negative offset back down to it.
  // Sized to the boia's OWN outer diameter (radius + tube), not to the
  // tile's nominal footprint. TILE.width is the slot the boia occupies,
  // and the torus inside it is smaller — so a ring at TILE.width left a
  // visible gap of open water between the foam and the object it is
  // supposed to be breaking against. The x2.06 is the diameter plus a
  // couple of percent for the foam's own thickness, which is what puts the
  // waterline ON the boia's side rather than around it.
  const RIDE_FOAM_SIZE = (BOIA_RADIUS + BOIA_TUBE) * 2.06;
  const rideFoam = buildFoamDecal(RIDE_FOAM_SIZE, RIDE_FOAM_SIZE);
  rideFoam.position.y = WATER.surfaceY + 0.012 - BELT_RIDE_HEIGHT;
  rig.add(rideFoam);
  sfx.tileEnter();

  // Read from the MODEL, not from the constant: a pirate carries 40, and
  // the rig has to inherit whatever the queue bird was showing rather than
  // resetting to the default the moment it is picked.
  let ammo = pigGroup.userData.ammo ?? PIG.ammoStart;
  const label = pigGroup.userData.ammoSprite; // reuse the queue instance's own sprite

  const startTilePos = stackTopWorldPosition();
  const endTilePos = pointAtDistance(GREEN_ZONE_DIST);
  endTilePos.y = BELT_RIDE_HEIGHT;
  const headingAtGreen = headingFromTangent(tangentAtDistance(GREEN_ZONE_DIST));

  rig.position.copy(startTilePos);
  rig.rotation.y = headingAtGreen;
  scene.add(rig);

  const pigStartPos = pigGroup.position.clone();
  const pigStartScale = pigGroup.scale.x;

  const pig = {
    group: rig,
    pigGroup,
    color,
    tokenIndex,
    phase: 'entering', // 'entering' -> 'onBelt'
    tweenT: 0,
    distance: GREEN_ZONE_DIST,
    fireTimer: 0,
    nextFireAt: nextFireInterval(),
    recoil: 0,
    animPhase: Math.random() * 10,
  };

  pig.updateLabel = () => {
    label.material.map.dispose();
    label.material.map = new THREE.CanvasTexture(drawAmmoCanvas(ammo, isWhite));
    label.material.needsUpdate = true;
  };

  // Ammo is a closure variable, so the AMMO boost cannot reach it from
  // outside — this is the door it comes through. Only tops up a rider that
  // is still shooting: refilling one that has already started its
  // out-of-ammo exit would leave it flying off with a full magazine.
  pig.grantAmmo = (n) => {
    if (ammo <= 0 || pig.phase === 'despawning' || pig.phase === 'falling') return;
    ammo += n;
    pig.updateLabel();
    if (beltTokens[pig.tokenIndex]) {
      beltTokens[pig.tokenIndex].ammo = ammo;
      updateCapacityHud();
    }
  };

  pig.tick = (dt, sceneTime) => {
    pig.recoil = Math.max(0, pig.recoil - dt * 5);

    if (pig.phase === 'entering') {
      pig.tweenT += dt / TILE.enterDuration;
      const t = Math.min(pig.tweenT, 1);
      // Ease-IN (starts slow, ends at full speed) instead of the previous
      // ease-out — an ease-out decelerates to a dead stop right as the
      // tile "lands," which read as the pig sitting parked on the belt for
      // a beat before conveyor movement kicked in. Ending at full velocity
      // here hands off into the constant-speed belt motion with no visible
      // pause, per feedback ("já vai andando, não quero ele parado").
      const eased = t * t;
      rig.position.lerpVectors(startTilePos, endTilePos, eased);
      // LIFTED OVER THE TOP. `startTilePos` is already the top boia of the
      // pile, but sliding it straight to the belt sent it THROUGH the
      // stack it just came off — the interpolation is a straight line and
      // the pile is in the way. The arc lifts it clear, and it also makes
      // the pick legible: the player sees a specific boia leave the top of
      // the stack and travel, instead of one just appearing on the belt.
      rig.position.y += Math.sin(Math.PI * eased) * (TILE.height * 2.2);
      // Tile stays flat throughout — it's already lying down in the pile,
      // so unlike the old standing-stack passes there's no tip-over tween
      // needed here anymore.

      // The pig chases the tile's live position, drag-and-drop style,
      // landing on top of it exactly as it settles onto the belt.
      const targetPigPos = rig.position.clone().add(new THREE.Vector3(0, TILE.height, 0));
      pigGroup.position.lerpVectors(pigStartPos, targetPigPos, eased);
      pigGroup.position.y += Math.sin(Math.PI * eased) * 0.6; // little toss arc
      // v2: the pig's OWN scale-up (not the tile's position handoff, which
      // must stay velocity-matched to the belt, per the comment above) gets
      // a small overshoot-then-settle — a cheap elastic "pop" on landing,
      // per the brief's "curvas de movimento elásticas e suaves (bounce
      // dinâmico)" for collection/interaction feel.
      const backC1 = 1.70158;
      const backC3 = backC1 + 1;
      const scaleT = 1 + backC3 * Math.pow(eased - 1, 3) + backC1 * Math.pow(eased - 1, 2);
      pigGroup.scale.setScalar(pigStartScale + (PIG.beltScale - pigStartScale) * scaleT);
      animatePigProcedural(pigGroup, sceneTime + pig.animPhase, 'walk', pig.recoil);

      if (t >= 1) {
        scene.remove(pigGroup);
        rig.add(pigGroup);
        pigGroup.position.set(0, TILE.height, 0);
        pigGroup.rotation.y = PIG.inwardOffset;
        pig.phase = 'onBelt';
        sfx.pigLand();
        // Landing on the boia throws water. The rig's own position, not
        // the pig's, because the boia is what touches the surface.
        spawnSplash(rig.position, 1.15);
      }
      return false;
    }

    // The waterline foam belongs to an object that is IN the water. The
    // moment that object starts leaving — sinking into the vortex, or
    // being lifted away when its ammo runs out — the ring has to go with
    // it, fast. Previously it stayed behind, sitting on empty water, which
    // is what was noticed when a penguin ran out and its boia returned to
    // the pile.
    if (pig.phase === 'falling' || pig.phase === 'despawning') {
      rideFoam.material.opacity = Math.max(0, rideFoam.material.opacity - dt * 6.5);
    }

    if (pig.phase === 'falling') {
      // Only the PIG sinks/shrinks/fades into the hole — the tile is NOT
      // "destroyed" along with it. Per feedback, the tile instead flies
      // back out toward the stack and stands back up, since it just
      // rejoins the pool of stored fiches (which already happens in the
      // capacity bookkeeping the instant this pig's belt token frees up —
      // this is purely the tile's own cosmetic return trip).
      pig.tweenT += dt / DEATH_ZONE.fallDuration;
      const t = Math.min(pig.tweenT, 1);

      // v1q: spins while sinking into the hole, per feedback ("ao morrer ao
      // cair no buraco o porco caia girando") — was a straight sink/shrink
      // with no rotation at all before.
      pigGroup.rotation.y += dt * 10;
      pigGroup.scale.setScalar(Math.max(pig.fallStartScale * (1 - t), 0.0001));
      pigGroup.position.y = pig.fallPigStartY - t * 0.5; // sinks down a bit too
      /* DRAWN TOWARD THE CENTRE.
       *
       * It used to sink straight down wherever it happened to be standing,
       * which put half the falls off to one side of the funnel — a hole
       * that does not pull things toward its middle is a trapdoor, not a
       * whirlpool. The target is the vortex's own X/Z, converted into the
       * rig's local space because the pig is parented to the rig and the
       * rig is rotated by the belt's tangent; using world coordinates here
       * would send it off by exactly that heading.
       */
      if (!pig.fallCentreLocal) {
        pig.fallCentreLocal = rig.worldToLocal(
          new THREE.Vector3(HOLE_POINT.x, rig.position.y, HOLE_POINT.z)
        );
        pig.fallStartLocalX = pigGroup.position.x;
        pig.fallStartLocalZ = pigGroup.position.z;
      }
      // Eased IN: it drifts at first and accelerates toward the throat, the
      // way something caught in a current does.
      const pull = t * t;
      pigGroup.position.x = THREE.MathUtils.lerp(pig.fallStartLocalX, pig.fallCentreLocal.x, pull);
      pigGroup.position.z = THREE.MathUtils.lerp(pig.fallStartLocalZ, pig.fallCentreLocal.z, pull);
      if (!pig.fallMaterialsPrepped) {
        pigGroup.traverse((obj) => {
          if (obj.material) {
            obj.material.transparent = true;
            obj.material.depthWrite = false;
          }
        });
        pig.fallMaterialsPrepped = true;
      }
      pigGroup.traverse((obj) => {
        if (obj.material) obj.material.opacity = 1 - t;
      });

      tileMesh.position.lerpVectors(pig.tileFallStart, pig.tileFallTargetLocal, t);
      // Stays flat the whole way back too — it just rejoins the pile lying down.

      return t >= 1;
    }

    if (pig.phase === 'despawning') {
      // NEW in v1q: a pig that runs out of ammo mid-ride used to just
      // vanish the instant its last shot fired (an immediate dispose() in
      // the main tick loop, no animation at all). Per feedback ("caso um
      // porco morra na esteira (acabe sua municao) ele gira até desaparecer
      // em um movimento elastico, e o tile volta para posicao inicial indo
      // para o topo da pilha"), this now plays out as its own timed phase,
      // mirroring the 'falling' phase's tile-return logic exactly (same
      // "next free pile slot" target), but with a spin + elastic
      // shrink/fade instead of a sink.
      pig.tweenT += dt / DEATH_ZONE.despawnDuration;
      const t = Math.min(pig.tweenT, 1);

      pigGroup.rotation.y += dt * 16; // fast spin while vanishing in place
      // Elastic wobble: an oscillating overshoot layered on top of a
      // straight shrink-to-zero, so the scale doesn't just monotonically
      // shrink — it "boings" a couple times on the way out, decaying as t
      // approaches 1 (the oscillation's own amplitude fades with (1 - t)).
      const wobble = 1 + 0.35 * Math.sin(t * Math.PI * 5) * (1 - t);
      const scale = Math.max(pig.despawnStartScale * (1 - t) * wobble, 0.0001);
      pigGroup.scale.setScalar(scale);

      if (!pig.despawnMaterialsPrepped) {
        pigGroup.traverse((obj) => {
          if (obj.material) {
            obj.material.transparent = true;
            obj.material.depthWrite = false;
          }
        });
        pig.despawnMaterialsPrepped = true;
      }
      pigGroup.traverse((obj) => {
        if (obj.material) obj.material.opacity = 1 - t;
      });

      // Tile returns to the pile's next free slot — same "top of the pile"
      // target the hole-fall path already uses, per feedback ("o tile volta
      // para posicao inicial indo para o topo da pilha").
      tileMesh.position.lerpVectors(pig.tileDespawnStart, pig.tileDespawnTargetLocal, t);

      return t >= 1;
    }

    pig.distance += PIG.speed * dt;
    if (pig.distance >= RED_ZONE_DIST) {
      pig.endReason = 'fall'; // reached the kill zone and drops into the hole
      pig.phase = 'falling';
      pig.tweenT = 0;
      rig.position.set(HOLE_POINT.x, BELT_RIDE_HEIGHT, HOLE_POINT.z);
      pig.fallStartScale = pigGroup.scale.x;
      pig.fallPigStartY = pigGroup.position.y;
      pig.tileFallStart = tileMesh.position.clone();
      // The slot this fiche will actually occupy once its belt token frees
      // up one frame from now — NOT stackTopWorldPosition() (that's the
      // CURRENT top, which is one slot short since this token is still
      // counted as occupied for one more tick).
      pig.tileFallTargetLocal = rig.worldToLocal(stackSlotPosition(BELT.capacity - onBeltCount()));
      sfx.pigFall(); // played now, at the moment it starts sinking, not after
      return false;
    }
    rig.position.copy(pointAtDistance(pig.distance));
    rig.position.y = BELT_RIDE_HEIGHT;
    rig.rotation.y = headingFromTangent(tangentAtDistance(pig.distance));
    // Wake puffs by distance travelled, not by time — see spawnWakePuff.
    if (pig.lastWakeDist === undefined) pig.lastWakeDist = pig.distance;
    if (pig.distance - pig.lastWakeDist > WAKE_SPACING) {
      pig.lastWakeDist = pig.distance;
      spawnWakePuff(rig.position, rig.rotation.y);
    }
    // Idle while riding — the fiche/belt does the traveling, the pig itself
    // isn't "walking" — the recoil kick (layered on any mode) is what reads
    // as the shoot pose the instant it fires (feedback: was stuck in a
    // constant walk cycle even while just standing on the belt).
    // AIM FIRST, then animate: animatePigProcedural reads the aim angles
    // this writes, so the order matters. The rider keeps a standing target
    // between shots rather than re-picking one every frame — otherwise the
    // barrel would twitch around the board at 60Hz instead of tracking one
    // thing and firing at it.
    if (!pig.aimTarget || !pig.aimTarget.alive) {
      pig.aimTarget = findShootablePillar(color, rig.position);
    }
    tickPigAim(pigGroup, pig.aimTarget ? pig.aimTarget.position : null);
    tickPigHose(pigGroup);
    animatePigProcedural(pigGroup, sceneTime + pig.animPhase, 'idle', pig.recoil);

    if (ammo > 0) {
      pig.fireTimer += dt * 1000;
      if (pig.fireTimer >= pig.nextFireAt) {
        pig.fireTimer = 0;
        pig.nextFireAt = nextFireInterval();
        // Shoot at the pillar the BARREL IS ALREADY POINTING AT, not at a
        // freshly picked one. Re-picking here is what let the shot and the
        // aim disagree: the gun would be tracking one target and the
        // pellet would leave toward another.
        const target = pig.aimTarget && pig.aimTarget.alive
          ? pig.aimTarget
          : findShootablePillar(color, rig.position);
        if (target) {
          // Ask the MODEL where its muzzle is, in world space, instead of
          // offsetting from the rig: the weapon swings between a shouldered
          // and an aiming pose, so a fixed offset would spawn the shot
          // somewhere in mid-air for most of the animation.
          const tip = pigGroup.userData.muzzleTip;
          const nosePos = tip
            ? tip.getWorldPosition(new THREE.Vector3())
            : rig.position.clone().add(new THREE.Vector3(0, TILE.height + 0.4, 0));
          spawnProjectile(nosePos, target, color);
          // MULTISHOT fires at a second, different target in the same
          // volley — a second call rather than a wider projectile, so
          // every downstream rule (reservation, arrival, scoring) applies
          // to it unchanged.
          if (boosts.multiShot > 0) {
            const second = findShootablePillar(color, rig.position);
            if (second && second !== target) {
              spawnProjectile(nosePos, second, color);
              cleanupScore.shotsFired++;
            }
          }
          sfx.shoot();
          cleanupScore.shotsFired++;
          // The LAST CREW TO FIRE is who poses on the win screen, so it is
          // recorded on every shot rather than worked out afterwards.
          cleanupScore.lastShooter = color;
          // Drop the standing target so the next frame picks a new one and
          // the barrel starts swinging toward it during the reload gap.
          pig.aimTarget = null;
          ammo -= 1;
          pig.recoil = 1;
          pig.updateLabel();
          if (beltTokens[pig.tokenIndex]) {
            beltTokens[pig.tokenIndex].ammo = ammo;
            updateCapacityHud();
          }
          if (ammo <= 0) {
            pig.endReason = 'despawn'; // ran out of ammo mid-ride
            pig.phase = 'despawning';
            pig.tweenT = 0;
            pig.despawnStartScale = pigGroup.scale.x;
            pig.tileDespawnStart = tileMesh.position.clone();
            // Next free pile slot once this belt token frees up one frame
            // from now — same reasoning as the hole-fall path's target.
            pig.tileDespawnTargetLocal = rig.worldToLocal(stackSlotPosition(BELT.capacity - onBeltCount()));
            return false;
          }
        }
        // else: no clear shot right now (archer rule) — wait and retry.
      }
    }
    return false;
  };

  pig.dispose = () => {
    scene.remove(rig);
    rig.traverse((obj) => {
      // boiaTorusGeo/boiaBandGeo are shared module-scope constants (like
      // the old tileGeo) — every other geometry on this rig is unique to
      // it and safe to dispose.
      if (obj.geometry && obj.geometry !== boiaTorusGeo && obj.geometry !== boiaBandGeo) {
        obj.geometry.dispose?.();
      }
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  };

  activePigs.push(pig);
}

/** Keeps a minimum arc-length gap between fiches riding the belt. */
function enforceBeltSpacing() {
  const onBelt = activePigs.filter((p) => p.phase === 'onBelt').sort((a, b) => b.distance - a.distance);
  for (let i = 1; i < onBelt.length; i++) {
    const ahead = onBelt[i - 1];
    const behind = onBelt[i];
    if (ahead.distance - behind.distance < PIG.minBeltGap) {
      behind.distance = ahead.distance - PIG.minBeltGap;
      behind.group.position.copy(pointAtDistance(behind.distance));
      behind.group.position.y = BELT_RIDE_HEIGHT;
      behind.group.rotation.y = headingFromTangent(tangentAtDistance(behind.distance));
    }
  }
}

// ---------------------------------------------------------------------
// Belt capacity: numeric pill + the physical fiche stack + the 5-slot HUD.
// ---------------------------------------------------------------------
const beltTokens = new Array(BELT.capacity).fill(null); // null | { color, ammo }
const winOverlay = document.getElementById('win-overlay');

function onBeltCount() {
  return beltTokens.filter(Boolean).length;
}

// No more numeric "X/5 on belt" text pill — per feedback, the physical
// fiche stack + its floor label (drawn directly on the tile count) is the
// only capacity readout now.
function updateCapacityHud() {
  // The label reads how many tiles are STORED (i.e. still in the stack),
  // not how many are currently out on the belt — feedback pointed out
  // these were swapped.
  const stored = BELT.capacity - onBeltCount();
  updateTrayLabel(stored);
  updateFicheStack();
}

function findFreeToken() {
  return beltTokens.findIndex((t) => t === null);
}

/** True only when a fresh fiche can actually enter the belt right now —
 * capacity alone isn't enough: another fiche might still be mid-entry, or
 * the frontmost one on the belt might not have cleared the entry point
 * yet. Prevents two tiles ever overlapping at the entrance. */
function hasRoomForNewFiche() {
  if (findFreeToken() === -1) return false;
  for (const p of activePigs) {
    if (p.phase === 'entering') return false;
    if (p.phase === 'onBelt' && p.distance - GREEN_ZONE_DIST < PIG.minBeltGap) return false;
  }
  return true;
}

// Running tally of what has been cleaned, by kind. It lives here rather
// than being recomputed from the board, because once the board is empty
// there is nothing left to count — and the win screen needs the numbers
// precisely at that moment.
const cleanupScore = {
  plastic: 0, metal: 0, shotsFired: 0, lastShooter: 'black', startedAt: performance.now(),
};

/* ============================================================
 * BOOSTS
 * ------------------------------------------------------------
 * The five dashed slots under the board have been an empty placeholder
 * since v1. They now hold the powerups the brief asked for: cleaning up
 * rubbish drops a boost, tapping the slot spends it.
 *
 * Everything a boost does is expressed as a MULTIPLIER or a counter that
 * the normal game rules already read (`boosts.fireRate` divides the fire
 * interval, `boosts.multiShot` adds a second call to the same spawn
 * function). Nothing branches on "is a boost active" at the point of use,
 * so a boost cannot desynchronise the rules it modifies, and two of the
 * same boost stack by construction instead of needing a special case.
 */
const boosts = { fireRate: 1, multiShot: 0 };

/* THE PURSE.
 *
 * Persisted to localStorage, so coins are a number that grows ACROSS
 * sessions rather than a per-match score. That is the whole point of the
 * currency existing at all: a value that resets on refresh is just a
 * second score, and the top bar already has two of those.
 *
 * Wrapped in try/catch because storage throws outright in private
 * browsing and in embedded contexts, and a playable ad that crashes on
 * boot because it could not read a saved coin count would be a poor
 * trade for the feature.
 */
let totalCoins = 0;
try {
  totalCoins = Number(localStorage.getItem('fof_coins')) || 0;
} catch { totalCoins = 0; }

function addCoins(n) {
  totalCoins += n;
  try { localStorage.setItem('fof_coins', String(totalCoins)); } catch { /* ignore */ }
  const el = document.getElementById('count-coins');
  if (el) {
    el.textContent = totalCoins.toLocaleString();
    bumpCounter(el.closest('.counter'));
  }
  return totalCoins;
}
const BOOST_TYPES = {
  rapid: { icon: '\u26A1', label: 'Rapid', duration: 9, apply: () => { boosts.fireRate *= 2; }, undo: () => { boosts.fireRate /= 2; } },
  multi: { icon: '\u2726', label: 'Multi', duration: 9, apply: () => { boosts.multiShot++; }, undo: () => { boosts.multiShot--; } },
  // Instant, so no duration and no undo: it tops up whoever is on the belt
  // right now.
  ammo: { icon: '\u2795', label: 'Ammo', duration: 0, apply: () => { for (const p of activePigs) p.grantAmmo?.(12); } },
  // Straight currency. The only boost that does nothing to this run — its
  // payoff is outside the match, which is what makes it a genuinely
  // different choice rather than a weaker version of the others.
  coin: { icon: '\uD83E\uDE99', label: 'Coins', duration: 0, apply: () => addCoins(100) },
};
const BOOST_KEYS = Object.keys(BOOST_TYPES);
// A cleared CELL has a chance of dropping a boost; a single piece never
// does. The brief asks for this and it is also the better rule: four
// pieces of one colour sitting together is a small goal a player can
// aim at, so the drop becomes something you can play FOR rather than
// something that happens to you every N shots. Not every cell pays out,
// which is what keeps it feeling like a find.
const BOOST_CELL_CHANCE = 0.55;
const boostSlots = new Array(5).fill(null);
const activeBoosts = [];
let boostSlotEls = [];
let cleanedSinceDrop = 0;

/* PRIZE CELLS.
 *
 * Some cells are seeded, at build time, as holding a prize — and they say
 * so by GLOWING FROM INSIDE the litter, which is why the bottle being
 * translucent matters: the light is a small emissive core placed inside
 * the piece, read through the plastic.
 *
 * Marking them up front rather than rolling at destruction time is the
 * point. A prize the player cannot see until it drops is a random reward;
 * a prize they can SEE across the board is a target, and turns the whole
 * board from a field to be cleared into a field with things in it worth
 * reaching first.
 */
const PRIZE_CELL_CHANCE = 0.09;
const prizeCells = new Set();
const prizeGlows = [];
const PRIZE_GLOW_TEXTURE = (() => {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,246,200,0.75)');
  g.addColorStop(1, 'rgba(255,230,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
})();

function clearPrizeGlows() {
  for (const g of prizeGlows) {
    scene.remove(g.sprite);
    g.sprite.material.dispose();
  }
  prizeGlows.length = 0;
  prizeCells.clear();
}

function addPrizeGlow(cellId, position) {
  prizeCells.add(cellId);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: PRIZE_GLOW_TEXTURE,
      color: 0xfff0b0,
      transparent: true,
      depthWrite: false,
      // Additive, so it reads as light coming OUT of the bottle rather
      // than as a pale sticker on it — a normal blend over a translucent
      // object just makes the object look chalky.
      blending: THREE.AdditiveBlending,
    })
  );
  sprite.position.copy(position);
  sprite.position.y += GRID.pillarHeight * 0.45;
  sprite.scale.setScalar(GRID.pillarSize * 2.2);
  sprite.renderOrder = 7;
  scene.add(sprite);
  prizeGlows.push({ sprite, cellId, phase: Math.random() * 6.28 });
}

function tickPrizeGlows(t) {
  for (let i = prizeGlows.length - 1; i >= 0; i--) {
    const g = prizeGlows[i];
    // The cell is cleared -> the light goes out. Checked here rather than
    // pushed from the destruction path so there is only one place that
    // decides what "this cell still has a prize" means.
    // A COUNTER, not a scan. This ran `pillars.some(...)` over all 676
    // pillars for every glow, every frame — up to ~17,000 comparisons per
    // frame for an effect that changes only when something is destroyed.
    // The count is maintained at the one place a pillar can die.
    const alive = (cellAliveCount.get(g.cellId) || 0) > 0;
    if (!alive) {
      scene.remove(g.sprite);
      g.sprite.material.dispose();
      prizeGlows.splice(i, 1);
      continue;
    }
    // Breathing, not blinking: a steady pulse reads as a beacon the player
    // can plan around, while a flash reads as an alert.
    g.sprite.material.opacity = 0.5 + 0.35 * Math.sin(t * 2.1 + g.phase);
    g.sprite.scale.setScalar(GRID.pillarSize * (2.0 + 0.35 * Math.sin(t * 2.1 + g.phase)));
  }
}

function tryDropBoost(worldPos) {
  if (Math.random() > BOOST_CELL_CHANCE) return;
  forceDropBoost(worldPos);
}

function forceDropBoost(worldPos) {
  const free = boostSlots.indexOf(null);
  if (free === -1) return; // full row: the drop is simply lost, which is
  // what makes spending them a decision rather than a formality
  const key = BOOST_KEYS[Math.floor(Math.random() * BOOST_KEYS.length)];
  boostSlots[free] = key;
  renderBoostSlots();
  sfx.boostDrop();
  // The burst is at the CELL, not at the slot. The player is looking at
  // the board when this fires, not at the HUD, so the effect has to
  // announce itself where their eyes already are — the slot lighting up
  // is confirmation they will find a moment later, not the notification.
  if (worldPos) spawnBoostBurst(worldPos, key);
}

/* The burst: a ring that expands and fades, plus the boost's own glyph
 * rising out of the cell. Both are sprites on a shared, tiny canvas
 * texture — a particle system for one event per cell would be more
 * machinery than the effect is worth. */
const BOOST_BURST_TEXTURE = (() => {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
})();

/* SPLASHES.
 *
 * A flat expanding ring lying ON the water, not a billboard sprite. That
 * choice is the whole effect: a sprite always faces the camera, so at this
 * isometric angle it would stand up out of the sea like a card, while a
 * ring lying in the surface plane foreshortens exactly the way a real
 * ripple does and needs no extra work to sit correctly.
 *
 * Reuses the foam band texture the waterline rings already use, so a
 * splash and the standing foam are visibly the same material.
 */
const activeSplashes = [];

/* A soft round droplet, drawn once and shared by every particle. */
const DROPLET_TEXTURE = (() => {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S * 0.42, S * 0.38, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(232,250,255,0.9)');
  g.addColorStop(0.82, 'rgba(190,235,255,0.35)');
  g.addColorStop(1, 'rgba(190,235,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(c);
})();

/* SPLASHES, rebuilt as DROPLETS.
 *
 * The expanding ring this replaces had two problems and the second is the
 * one that mattered. It read as a graphic rather than as water — a
 * perfect circle growing at a fixed rate is a shockwave, not a splash —
 * and it looked out of sync because it was: a single ring is one event,
 * so any mismatch between when it fires and when the object actually hits
 * has nothing to hide behind.
 *
 * Particles fix both. Each droplet has its own launch angle, speed and
 * lifetime, so the effect has a spread of timings rather than one, and a
 * few frames of error inside a scatter is invisible. They also arc under
 * gravity and land, which is the part that reads as water having weight.
 */
function spawnSplash(worldPos, strength = 1) {
  const count = Math.round(7 + strength * 7);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: DROPLET_TEXTURE,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(worldPos.x, WATER.surfaceY + 0.05, worldPos.z);
    const size = (0.1 + Math.random() * 0.16) * strength;
    sprite.scale.setScalar(size);
    sprite.renderOrder = 8;
    scene.add(sprite);
    const angle = Math.random() * Math.PI * 2;
    // Speed and lift correlate — a droplet thrown hard also goes high —
    // which keeps the spray shaped like a crown rather than a sphere.
    const speed = (0.9 + Math.random() * 1.7) * strength;
    activeSplashes.push({
      sprite,
      vx: Math.cos(angle) * speed,
      vz: Math.sin(angle) * speed,
      vy: (1.5 + Math.random() * 1.9) * strength,
      t: 0,
      life: 0.45 + Math.random() * 0.35,
      size,
    });
  }
  sfx.splash(strength);
}

function tickSplashes(dt) {
  for (let i = activeSplashes.length - 1; i >= 0; i--) {
    const d = activeSplashes[i];
    d.t += dt;
    const k = Math.min(d.t / d.life, 1);
    d.vy -= 9.5 * dt; // gravity, so they arc and fall back
    d.sprite.position.x += d.vx * dt;
    d.sprite.position.z += d.vz * dt;
    d.sprite.position.y += d.vy * dt;
    // Shrinking as they fade reads as the droplet breaking up; a droplet
    // that only fades reads as it turning into fog.
    d.sprite.scale.setScalar(d.size * (1 - k * 0.55));
    d.sprite.material.opacity = 0.9 * (1 - k * k);
    if (k >= 1 || d.sprite.position.y < WATER.surfaceY - 0.05) {
      scene.remove(d.sprite);
      d.sprite.material.dispose();
      activeSplashes.splice(i, 1);
    }
  }
}

/* THE BOIA'S WAKE.
 *
 * A trail of small foam patches dropped behind a moving rig, each fading
 * on its own clock. Dropped by DISTANCE travelled rather than by time:
 * spawning on a timer would bunch the trail up wherever the boia slows and
 * stretch it wherever it speeds up, which is precisely backwards — a wake
 * is left by displacement, so a fixed spacing in metres is what makes it
 * read as one continuous mark rather than as a stream of puffs.
 */
const activeWakes = [];
const WAKE_SPACING = 0.55;

/* THE WAKE, as a TAPERED TAIL rather than a string of puffs.
 *
 * Round patches dropped at intervals read as a dotted line, however
 * closely they are spaced. A wake is one shape: widest where the hull is
 * and drawn out to nothing behind it — the same comet silhouette the shot
 * trail uses, which is exactly the comparison the brief draws. So each
 * segment is an elongated quad oriented along the direction of travel,
 * and consecutive segments overlap into one continuous ribbon.
 *
 * Bigger and slower to fade than the shot's trail: a boia displaces far
 * more water than a pellet, and the foam it leaves sits on the surface for
 * seconds rather than being spent instantly.
 */
const WAKE_TAIL_GEO = new THREE.PlaneGeometry(1, 1);
WAKE_TAIL_GEO.translate(0, -0.5, 0); // pivot at the wide end
function spawnWakePuff(worldPos, heading) {
  const mesh = new THREE.Mesh(
    WAKE_TAIL_GEO,
    new THREE.MeshBasicMaterial({
      map: FOAM_BAND_ROUND,
      color: COLORS.waterFoam,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -heading;
  mesh.position.set(worldPos.x, WATER.surfaceY + 0.01, worldPos.z);
  const w = (BOIA_RADIUS + BOIA_TUBE) * 1.7;
  mesh.scale.set(w, w * 1.5, 1);
  mesh.renderOrder = 2;
  scene.add(mesh);
  activeWakes.push({ mesh, t: 0, life: 2.2, w });
}

function tickWakes(dt) {
  for (let i = activeWakes.length - 1; i >= 0; i--) {
    const w = activeWakes[i];
    w.t += dt;
    const k = Math.min(w.t / w.life, 1);
    // Spreads sideways and stretches backward as it ages — foam left on
    // the surface disperses, and doing both is what keeps the ribbon
    // widening behind the boia instead of just dimming.
    w.mesh.scale.set(w.w * (1 + k * 1.1), w.w * 1.5 * (1 + k * 0.5), 1);
    w.mesh.material.opacity = 0.5 * (1 - k) * (1 - k);
    if (k >= 1) {
      scene.remove(w.mesh);
      w.mesh.material.dispose();
      activeWakes.splice(i, 1);
    }
  }
}

const activeBursts = [];
function spawnBoostBurst(worldPos, key) {
  const mat = new THREE.SpriteMaterial({
    map: BOOST_BURST_TEXTURE,
    color: 0xffe9a8,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(worldPos);
  sprite.position.y += 0.6;
  sprite.renderOrder = 900;
  scene.add(sprite);
  activeBursts.push({ sprite, t: 0, life: 0.75 });
}

function tickBoostBursts(dt) {
  for (let i = activeBursts.length - 1; i >= 0; i--) {
    const b = activeBursts[i];
    b.t += dt;
    const k = Math.min(b.t / b.life, 1);
    // Fast out, slow settle — a linear expansion reads as a mechanical
    // pulse, and the whole point of the burst is that it feels like a pop.
    const eased = 1 - Math.pow(1 - k, 3);
    b.sprite.scale.setScalar(0.5 + eased * 3.4);
    b.sprite.position.y += dt * 1.4;
    b.sprite.material.opacity = 1 - k;
    if (k >= 1) {
      scene.remove(b.sprite);
      b.sprite.material.dispose();
      activeBursts.splice(i, 1);
    }
  }
}

function useBoost(index) {
  const key = boostSlots[index];
  if (!key) return;
  const type = BOOST_TYPES[key];
  boostSlots[index] = null;
  type.apply();
  if (type.duration > 0) activeBoosts.push({ type, remaining: type.duration });
  sfx.boostUse();
  renderBoostSlots();
}

function tickBoosts(dt) {
  for (let i = activeBoosts.length - 1; i >= 0; i--) {
    const b = activeBoosts[i];
    b.remaining -= dt;
    if (b.remaining <= 0) {
      b.type.undo?.();
      activeBoosts.splice(i, 1);
      renderBoostSlots();
    }
  }
}

/* THE COLLECTED-ITEM ICONS, drawn rather than emoji.
 *
 * A ♻ and a ⚯ said "recycling" and "something", not "a PET bottle" and "a
 * can". These are the two objects the whole game is about, so the HUD has
 * to show the objects — and drawing them here rather than shipping PNGs
 * keeps the one rule this project has held throughout: no external art
 * assets, everything procedural, so nothing can go missing or drift out of
 * palette when the team colours change.
 */
function drawCounterIcon(canvas, kind) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // WHITE outline round the illustration, per the house rule — the same
  // one the text follows. On a dark HUD pill a navy outline disappears
  // into the background, and the icon needs to be legible against
  // whatever the water behind the pill happens to be doing.
  const outline = (path, fill, stroke = '#ffffff', lw = 6) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke(path);
    ctx.fillStyle = fill;
    ctx.fill(path);
  };

  if (kind === 'coin') {
    // A 3D-reading coin: an ellipse for the face, a thicker ellipse behind
    // and below it for the rim. Two shapes is all it takes — the offset
    // between them IS the thickness, and at 34 pixels a modelled coin
    // would resolve to exactly this anyway.
    const rim = new Path2D();
    rim.ellipse(W * 0.5, H * 0.58, W * 0.34, H * 0.34, 0, 0, Math.PI * 2);
    outline(rim, '#c8811a');
    const face = new Path2D();
    face.ellipse(W * 0.5, H * 0.46, W * 0.34, H * 0.34, 0, 0, Math.PI * 2);
    outline(face, '#ffd24a');
    // Inner ring + a struck mark, so it reads as minted rather than as a
    // yellow dot.
    const inner = new Path2D();
    inner.ellipse(W * 0.5, H * 0.46, W * 0.22, H * 0.22, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#e0a01f';
    ctx.lineWidth = 4;
    ctx.stroke(inner);
    ctx.fillStyle = '#e0a01f';
    ctx.font = `700 ${Math.round(H * 0.3)}px 'Fredoka', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', W * 0.5, H * 0.47);
    return;
  }

  if (kind === 'bottle') {
    // A PET bottle: base, shoulder, neck, cap. Drawn as one closed path so
    // the outline runs round the whole silhouette instead of round each
    // part — the shape has to read at 38 CSS pixels, and internal outlines
    // at that size are just noise.
    const p = new Path2D();
    p.moveTo(W * 0.3, H * 0.92);
    p.lineTo(W * 0.7, H * 0.92);
    p.quadraticCurveTo(W * 0.76, H * 0.9, W * 0.76, H * 0.8);
    p.lineTo(W * 0.76, H * 0.46);
    p.quadraticCurveTo(W * 0.74, H * 0.36, W * 0.62, H * 0.3);
    p.lineTo(W * 0.62, H * 0.16);
    p.lineTo(W * 0.38, H * 0.16);
    p.lineTo(W * 0.38, H * 0.3);
    p.quadraticCurveTo(W * 0.26, H * 0.36, W * 0.24, H * 0.46);
    p.lineTo(W * 0.24, H * 0.8);
    p.quadraticCurveTo(W * 0.24, H * 0.9, W * 0.3, H * 0.92);
    p.closePath();
    outline(p, '#e6faff');
    // Label band in the crew's colour — the same green the bottles on the
    // board wear, so the icon and the object are obviously one thing.
    ctx.save();
    ctx.clip(p);
    ctx.fillStyle = '#22d8f5';
    ctx.fillRect(0, H * 0.55, W, H * 0.26);
    ctx.restore();
    // Cap
    const cap = new Path2D();
    cap.rect(W * 0.36, H * 0.08, W * 0.28, H * 0.12);
    outline(cap, '#0f96b4');
  } else {
    // A drinks can: straight wall, chamfered top and bottom.
    const p = new Path2D();
    p.moveTo(W * 0.28, H * 0.24);
    p.quadraticCurveTo(W * 0.5, H * 0.14, W * 0.72, H * 0.24);
    p.lineTo(W * 0.72, H * 0.78);
    p.quadraticCurveTo(W * 0.5, H * 0.88, W * 0.28, H * 0.78);
    p.closePath();
    outline(p, '#cfd8e0');
    ctx.save();
    ctx.clip(p);
    ctx.fillStyle = '#ff4fa8';
    ctx.fillRect(0, H * 0.33, W, H * 0.34);
    ctx.restore();
    // The lid ellipse, which is what makes it a CAN rather than a tube.
    const lid = new Path2D();
    lid.ellipse(W * 0.5, H * 0.235, W * 0.22, H * 0.075, 0, 0, Math.PI * 2);
    outline(lid, '#e6edf4', '#12325a', 4);
  }
}

function renderBoostSlots() {
  boostSlotEls.forEach((el, i) => {
    const key = boostSlots[i];
    el.textContent = key ? BOOST_TYPES[key].icon : '';
    el.classList.toggle('filled', !!key);
  });
  const bar = document.getElementById('boost-active');
  if (bar) {
    // SUMMED BY TYPE. Two rapid-fires used to show as two separate
    // countdowns racing each other, which tells the player nothing they
    // can act on — what they want to know is "how long am I still fast
    // for". Since the effects stack multiplicatively and each has its own
    // remaining time, the honest single number is the LONGEST one, not the
    // total: that is the moment the last of them expires.
    const byType = new Map();
    for (const b of activeBoosts) {
      const prev = byType.get(b.type) || { type: b.type, remaining: 0, count: 0 };
      prev.remaining = Math.max(prev.remaining, b.remaining);
      prev.count++;
      byType.set(b.type, prev);
    }
    bar.innerHTML = [...byType.values()]
      .map(
        (b) =>
          `<div class="boost-chip"><span class="glyph">${b.type.icon}</span>` +
          `${b.count > 1 ? `x${b.count} ` : ''}${Math.ceil(b.remaining)}s</div>`
      )
      .join('');
  }
}

/* ============================================================
 * PAUSE
 * ------------------------------------------------------------
 * Pausing sets a flag the main loop reads; it does not stop the rAF. That
 * matters for two reasons: the loop is also what keeps the renderer alive
 * for the lore panel's own 3D preview, and restarting a stopped rAF loop
 * cleanly (without ever double-starting it) is more moving parts than a
 * boolean.
 *
 * The clock is reset on resume. Without that, THREE.Clock's delta would
 * come back as the entire length of the pause, and every tween, timer and
 * boost countdown would jump forward by however long the player spent in
 * the menu.
 */
let paused = false;
function setPaused(on) {
  paused = on;
  const overlay = document.getElementById('pause-overlay');
  if (overlay) overlay.style.display = on ? 'flex' : 'none';
  if (!on) { clock.getDelta(); requestShadowUpdate(); } // swallow the accumulated pause time
  else buildLorePose();
}

/* The lore panel's illustration: the mascot, idling, rendered live rather
 * than shipped as an image. It reuses the win screen's renderer wholesale
 * — one extra WebGL context per panel is exactly the leak the win screen
 * was already careful to avoid. */
let lorePoseCtx = null;
function buildLorePose() {
  const holder = document.getElementById('lore-stage');
  if (!holder) return;
  if (!lorePoseCtx) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(300, 150, false);
    holder.appendChild(renderer.domElement);
    const vScene = new THREE.Scene();
    const vCam = new THREE.PerspectiveCamera(30, 2, 0.1, 50);
    vCam.position.set(0, 1.1, 4.2);
    vCam.lookAt(0, 0.75, 0);
    vScene.add(new THREE.AmbientLight(0xffffff, LIGHTING.ambientIntensity));
    const key = new THREE.DirectionalLight(0xffffff, LIGHTING.sunIntensity);
    key.position.set(3, 6, 5);
    vScene.add(key);
    // One of each crew, so the panel shows the two teams the text is
    // describing rather than a single bird standing in for both.
    const pair = new THREE.Group();
    const green = buildPigMesh(true);
    green.position.x = -0.75;
    green.rotation.y = 0.35;
    const purple = buildPigMesh(false);
    purple.position.x = 0.75;
    purple.rotation.y = -0.35;
    pair.add(green, purple);
    vScene.add(pair);
    lorePoseCtx = { renderer, vScene, vCam, pair, t: 0, green, purple };
  }
  const ctx = lorePoseCtx;
  ctx.running = true;
  const spin = () => {
    if (!ctx.running) return;
    ctx.t += 1 / 60;
    animatePigProcedural(ctx.green, ctx.t, 'idle', 0);
    animatePigProcedural(ctx.purple, ctx.t + 1.7, 'idle', 0);
    ctx.pair.position.y = Math.sin(ctx.t * 1.6) * 0.03;
    ctx.renderer.render(ctx.vScene, ctx.vCam);
    requestAnimationFrame(spin);
  };
  spin();
}

function initPauseMenu() {
  const btn = document.getElementById('pause-btn');
  const resume = document.getElementById('pause-resume');
  if (btn) btn.addEventListener('click', () => setPaused(true));
  if (resume) {
    resume.addEventListener('click', () => {
      if (lorePoseCtx) lorePoseCtx.running = false;
      setPaused(false);
    });
  }

  for (const tab of document.querySelectorAll('.pause-tab[data-panel]')) {
    tab.addEventListener('click', () => {
      const name = tab.dataset.panel;
      for (const t of document.querySelectorAll('.pause-tab[data-panel]')) {
        t.classList.toggle('on', t === tab);
      }
      for (const p of document.querySelectorAll('.pause-panel')) {
        p.classList.toggle('on', p.dataset.panel === name);
      }
    });
  }

  const muteBtn = document.getElementById('mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const muted = music.toggleMute();
      muteBtn.textContent = muted ? 'Muted' : 'Sound on';
      muteBtn.classList.toggle('on', !muted);
    });
  }

  const bindSlider = (id, valId, apply, format) => {
    const el = document.getElementById(id);
    const out = document.getElementById(valId);
    if (!el) return;
    const update = () => {
      const v = Number(el.value) / 100;
      apply(v);
      if (out) out.textContent = format ? format(v) : `${Math.round(v * 100)}%`;
    };
    el.addEventListener('input', update);
    update();
  };
  bindSlider('vol-music', 'vol-music-val', (v) => music.setMusicVolume(v));
  bindSlider('vol-sfx', 'vol-sfx-val', (v) => music.setSfxVolume(v));
  // Moving the time slider takes MANUAL control — an auto cycle that kept
  // running would drag the setting away from wherever the player just put
  // it, which reads as the control being broken.
  bindSlider(
    'time-of-day',
    'time-of-day-val',
    (v) => setTimeOfDay(v, false),
    () => timeOfDayName()
  );
  const autoBtn = document.getElementById('auto-time-btn');
  if (autoBtn) {
    autoBtn.addEventListener('click', () => {
      timeOfDay.auto = !timeOfDay.auto;
      autoBtn.textContent = timeOfDay.auto ? 'On' : 'Off';
      autoBtn.classList.toggle('on', timeOfDay.auto);
    });
  }
}

/** The nearest keyed stop's name, for the time slider's readout. */
function timeOfDayName() {
  const t = ((timeOfDay.t % 1) + 1) % 1;
  let best = TIME_STOPS[0];
  let bestD = 1;
  for (const stop of TIME_STOPS) {
    const d = Math.min(Math.abs(stop.t - t), 1 - Math.abs(stop.t - t));
    if (d < bestD) { bestD = d; best = stop; }
  }
  return best.name;
}

function initBoostSlots() {
  const row = document.getElementById('selected-slots');
  if (!row) return;
  row.innerHTML = '';
  // The row was pointer-events:none because it used to sit invisibly over
  // the queue and swallow taps meant for a penguin. The slots themselves
  // now need clicks, so only they re-enable pointer events — the gaps
  // between them stay transparent to taps.
  boostSlotEls = boostSlots.map((_, i) => {
    const el = document.createElement('button');
    el.className = 'slot';
    el.addEventListener('click', () => useBoost(i));
    row.appendChild(el);
    return el;
  });
  renderBoostSlots();
}

function onPillarDestroyed(color, pillar) {
  if (color === 'white') cleanupScore.plastic++;
  else cleanupScore.metal++;
  updateScoreHud();
  // A CELL is four pillars sharing one cell index (see buildGrid). The
  // drop fires on the shot that empties the last of the four, and it is
  // asked for at that pillar's position so the burst lands where the
  // player was just aiming.
  if (pillar && pillar.cellId !== undefined) {
    const cellStillAlive = (cellAliveCount.get(pillar.cellId) || 0) > 0;
    if (!cellStillAlive) {
      // A cell that was GLOWING always pays out — that is the promise the
      // light was making. An ordinary cell still has its own chance, so
      // clearing anywhere is worth something.
      if (prizeCells.has(pillar.cellId)) {
        prizeCells.delete(pillar.cellId);
        forceDropBoost(pillar.position);
      } else {
        tryDropBoost(pillar.position);
      }
    }
  }
  if (totalAlivePillars() === 0) showWin();
}

function updateScoreHud() {
  const p = document.getElementById('count-plastic');
  const m = document.getElementById('count-metal');
  if (p) { p.textContent = cleanupScore.plastic; bumpCounter(p.parentElement); }
  if (m) { m.textContent = cleanupScore.metal; bumpCounter(m.parentElement); }
}

/** Restart the CSS pop by removing the class and forcing a reflow — without
 * the reflow the browser coalesces remove+add into no change at all, and
 * the counter only ever animates once. */
function bumpCounter(el) {
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

/* THE VICTORY POSE.
 *
 * The brief: the penguin holding its weapon up in triumph, and it must be
 * the crew that fired the LAST shot. That penguin is a scene object with
 * lights and shadows, not a sprite, so the overlay gets its own tiny
 * renderer rather than trying to reach into the game's camera — the game
 * camera is orthographic, framed on the belt, and pointed at a board that
 * is by definition empty by the time this runs.
 *
 * Built lazily and then reused: the win screen can be reached many times
 * in a session, and a second WebGL context per win would leak them until
 * the browser starts dropping the oldest one (which is the game's).
 */
let victoryCtx = null;
function buildVictoryPose(color) {
  const holder = document.getElementById('win-pig');
  if (!holder) return;
  if (!victoryCtx) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(220, 240, false);
    renderer.shadowMap.enabled = false;
    holder.appendChild(renderer.domElement);
    const vScene = new THREE.Scene();
    const vCam = new THREE.PerspectiveCamera(34, 220 / 240, 0.1, 50);
    vCam.position.set(0, 1.35, 5.6);
    vCam.lookAt(0, 0.95, 0);
    // The same light budget as the main scene (sum ~PI), so the winner is
    // lit exactly like it was a second ago on the belt. A brighter "hero"
    // light here would read as a different character.
    vScene.add(new THREE.AmbientLight(0xffffff, LIGHTING.ambientIntensity));
    const key = new THREE.DirectionalLight(0xffffff, LIGHTING.sunIntensity);
    key.position.set(3, 6, 5);
    vScene.add(key);
    const pivot = new THREE.Group();
    vScene.add(pivot);
    victoryCtx = { renderer, vScene, vCam, pivot, mesh: null, t: 0 };
  }
  const ctx = victoryCtx;
  if (ctx.mesh) ctx.pivot.remove(ctx.mesh);
  ctx.mesh = buildPigMesh(color === 'white');
  // Turned to FACE the camera. buildPigMesh points the bird down -Z
  // (toward the board it shoots at), so dropped in unrotated the win
  // screen showed its back with the weapon sticking out past its head.
  ctx.mesh.rotation.y = Math.PI;
  ctx.mesh.scale.setScalar(1.3);
  ctx.mesh.position.y = -0.12;
  ctx.pivot.add(ctx.mesh);
  ctx.t = 0;
  ctx.running = true;

  const spin = () => {
    if (!ctx.running) return;
    ctx.t += 1 / 60;
    // Slow turntable plus a small hop: a static model on a win screen
    // reads as a paused game, and the hop is what makes it read as
    // celebrating rather than as an inspect view.
    ctx.pivot.rotation.y = Math.sin(ctx.t * 0.7) * 0.5 + 0.25;
    ctx.pivot.position.y = Math.abs(Math.sin(ctx.t * 3.4)) * 0.16;
    // The weapon goes UP. buildPigMesh parks it in a carry pose, so the
    // arm is rotated here rather than the model being rebuilt for one use.
    const weapon = ctx.mesh.userData.parts?.weapon;
    if (weapon) {
      // Held ALOFT and out to the side, not across the chest: the carry
      // pose the model ships with points the barrel forward, which from
      // this camera is straight at the lens and reads as a coloured slab
      // covering the bird's face.
      weapon.position.set(0.46, 0.8, -0.05);
      weapon.rotation.set(-1.25, 0, -0.55 + Math.sin(ctx.t * 3.4) * 0.1);
    }
    ctx.renderer.render(ctx.vScene, ctx.vCam);
    requestAnimationFrame(spin);
  };
  spin();
}

/* THE WIN SEQUENCE.
 *
 * It used to write every number and star into the DOM at once and show the
 * overlay. Everything was true and nothing was dramatic: the player's eye
 * has one place to land and the whole result is already there.
 *
 * This stages it instead. Each stat counts UP with a tick per frame-step,
 * the stars land one at a time on a rising pitch, and the coin sound fires
 * at the end of each row. The staging is driven by a single timeline of
 * {at, run} entries rather than nested setTimeouts — nesting makes the
 * order implicit and impossible to retime without unpicking the chain,
 * while a flat list can be read top to bottom and every delay is absolute.
 */
const winTimers = [];
function clearWinTimeline() {
  for (const id of winTimers) clearTimeout(id);
  winTimers.length = 0;
}

/** Count an element from 0 to `target` over `ms`, ticking as it goes. */
function countUpTo(el, target, ms) {
  if (!el) return;
  const started = performance.now();
  let lastShown = -1;
  const step = () => {
    const k = Math.min((performance.now() - started) / ms, 1);
    // Ease-out: numbers that decelerate read as landing on a value, while
    // a linear count reads as a progress bar still running.
    const eased = 1 - Math.pow(1 - k, 2.4);
    const shown = Math.round(target * eased);
    if (shown !== lastShown) {
      el.textContent = shown;
      // Only tick when the digits actually change, not once per frame:
      // at 60fps a per-frame tick is a buzz, not a count.
      if (shown !== lastShown + 0 && k < 1) sfx.countTick();
      lastShown = shown;
    }
    if (k < 1) requestAnimationFrame(step);
    else sfx.coin();
  };
  requestAnimationFrame(step);
}

function showWin() {
  clearWinTimeline();
  const seconds = Math.max(1, (performance.now() - cleanupScore.startedAt) / 1000);
  const total = cleanupScore.plastic + cleanupScore.metal;
  // Two independent things decide the rank, because the brief asks for
  // both speed and not wasting shots. Accuracy is bounded at 1 so a
  // multishot volley that overshoots the last few targets cannot push it
  // above a perfect run.
  const accuracy = Math.min(1, total / Math.max(1, cleanupScore.shotsFired));
  const pace = total / seconds; // pieces per second
  let stars = 1;
  if (accuracy > 0.82 && pace > 1.6) stars = 3;
  else if (accuracy > 0.65 && pace > 0.95) stars = 2;

  // Rows are laid out empty and filled by the timeline below.
  const rows = [
    ['Plastic', cleanupScore.plastic, true],
    ['Metal', cleanupScore.metal, true],
    ['Time', `${seconds.toFixed(1)}s`, false],
    ['Accuracy', `${Math.round(accuracy * 100)}%`, false],
  ];
  const statsEl = document.getElementById('win-stats');
  statsEl.innerHTML = rows
    .map(([k], i) => `<div class="stat pending" data-i="${i}"><span>${k}</span><b></b></div>`)
    .join('');
  const starsEl = document.getElementById('win-stars');
  starsEl.innerHTML = [0, 1, 2].map(() => '<span class="star">\u2605</span>').join('');

  const payoutBox = document.getElementById('win-payout');
  if (payoutBox) payoutBox.classList.remove('show');
  buildVictoryPose(cleanupScore.lastShooter);
  music.playVictory();
  winOverlay.style.display = 'flex';

  const at = (ms, run) => winTimers.push(setTimeout(run, ms));

  rows.forEach(([, value, isCount], i) => {
    at(450 + i * 380, () => {
      const row = statsEl.querySelector(`.stat[data-i="${i}"]`);
      if (!row) return;
      row.classList.remove('pending');
      row.classList.add('reveal');
      const b = row.querySelector('b');
      if (isCount) countUpTo(b, value, 520);
      else { b.textContent = value; sfx.coin(); }
    });
  });

  const starsStart = 450 + rows.length * 380 + 260;
  for (let i = 0; i < stars; i++) {
    at(starsStart + i * 420, () => {
      const el = starsEl.children[i];
      if (el) el.classList.add('on');
      sfx.star(i);
    });
  }
  /* THE PAYOUT — the last beat.
   *
   * Deliberately after the stars, because the amount DEPENDS on them:
   * paying out before the rank is revealed would be showing the answer
   * before the question. The value counts up from zero the same way the
   * stats do, and only when that count finishes is it committed to the
   * stored total — so the number the player watches climbing and the
   * number in the top bar can never disagree.
   */
  const payout = Math.round((total * 12 + stars * 250) * (1 + accuracy));
  at(starsStart + stars * 420 + 150, () => {
    const box = document.getElementById('win-payout');
    const val = document.getElementById('payout-value');
    if (!box || !val) return;
    box.classList.add('show');
    sfx.coin();
    countUpTo(val, payout, 900);
    winTimers.push(setTimeout(() => addCoins(payout), 950));
  });
  at(starsStart + stars * 420 + 1250, () => {
    const btn = document.getElementById('restart-btn');
    if (btn) btn.classList.add('reveal');
  });
}

function resetGame() {
  music.restoreGameplay();
  buildGrid();
  // Stop the win screen's own render loop — it runs on its own rAF and
  // would otherwise keep drawing an invisible canvas for the rest of the
  // session, once per replay.
  if (victoryCtx) victoryCtx.running = false;
  winOverlay.style.display = 'none';
  cleanupScore.plastic = 0; cleanupScore.metal = 0; cleanupScore.shotsFired = 0;
  cleanupScore.startedAt = performance.now();
  cleanedSinceDrop = 0;
  boostSlots.fill(null);
  for (const b of activeBoosts) b.type.undo?.();
  activeBoosts.length = 0;
  renderBoostSlots();
  updateScoreHud();
  for (const pig of activePigs) pig.dispose();
  activePigs.length = 0;
  beltTokens.fill(null);
  updateCapacityHud();
  rebuildQueue();
}

document.getElementById('restart-btn').addEventListener('click', resetGame);

// A dev-only door into the win state, so the victory screen can be
// screenshotted and tuned without clearing 676 pieces of litter by hand
// first. Harmless in a shipped build (nothing calls it), and the
// alternative — a debug flag threaded through the win condition — is far
// more likely to be left switched on by accident.
window.__forceWin = () => {
  cleanupScore.plastic = 148;
  cleanupScore.metal = 156;
  cleanupScore.shotsFired = 322;
  cleanupScore.lastShooter = 'black';
  cleanupScore.startedAt = performance.now() - 214000;
  showWin();
};

// ---------------------------------------------------------------------
// Selected-pigs HUD row: 5 empty placeholder slots between the belt and
// the queue. These used to show a live pig thumbnail + ammo for each
// belt-capacity slot, but per feedback that's cancelled for now — this
// row is reserved for a future quick-action item system, and having a
// pig render here too just competes with the belt for attention. Belt
// capacity/ammo bookkeeping (beltTokens) is unchanged internally; it's
// just not drawn here anymore.
// ---------------------------------------------------------------------
const selectedSlotsEl = document.getElementById('selected-slots');

function buildSelectedSlots() {
  selectedSlotsEl.innerHTML = '';
  for (let i = 0; i < BELT.capacity; i++) {
    const el = document.createElement('div');
    el.className = 'slot';
    selectedSlotsEl.appendChild(el);
  }
}

// ---------------------------------------------------------------------
// Picking queue: 4 lanes, each ALWAYS holding QUEUE.rows (4) real pigs —
// REAL 3D objects standing in the main scene south of the belt (so they
// cast a shadow from the global sun, and aren't confined to any clipping
// viewport). Only the first QUEUE.visibleRows (3) are actually on screen;
// row index QUEUE.visibleRows (the 4th) is always already built but
// parked well off-frame to the south. Row 0 is the frontmost (north,
// closest to the belt) and gets picked first; picking a pig flies that
// exact instance onto the belt fiche, EVERY row behind it (including the
// hidden 4th) shifts north by one — the previously-hidden pig visibly
// walks into frame — and a fresh pig is built immediately at the now
// empty hidden slot. Building the 4th pig up front (instead of on a
// delay/timer, like the previous pass did) is what fixes the "queue gets
// stuck with fixed gaps" bug — there's never a window where a lane's
// pigs and its bookkeeping can fall out of sync.
// ---------------------------------------------------------------------
/** @type {{color:string, group:THREE.Group}[][]} */
let lanes = [];
const slidingQueuePigs = []; // {group, from, to, t, duration}
const raycaster = new THREE.Raycaster();

function randomColor() {
  return Math.random() < 0.5 ? 'white' : 'black';
}

function queueSlotPosition(colIndex, rowIndex) {
  const x = (colIndex - (QUEUE.columns - 1) / 2) * QUEUE.laneSpacing;
  let z = beltHalfH + QUEUE.areaOffsetZ + rowIndex * QUEUE.rowSpacing;
  if (rowIndex >= QUEUE.visibleRows) z += QUEUE.hiddenRowExtraOffset;
  // y = the boat's deck, not 0: the queue stands INSIDE the hull now. The
  // pick-and-fly tween lerps from this position to the belt, so it carries
  // the step down to the water automatically — nothing else to change.
  return new THREE.Vector3(x, BOAT.deckY, z);
}

// v2: the boat sits just south of the last VISIBLE queue row, spanning the
// full lane width, bow (-Z) pointing north toward the belt — the "doca"
// the line is walking out of. Placed here (rather than at module top)
// since it needs queueSlotPosition/beltHalfH/QUEUE, all defined by now.
// Authored in world coordinates already (see the BOAT block), so it is
// added at the origin rather than being positioned relative to a queue slot.
const boatProp = buildBoatProp();
scene.add(boatProp);

// How often a pirate turns up in the queue. One in eleven is roughly one
// per screenful of twelve — often enough that a player learns to want them,
// rare enough that seeing one is an event rather than a rotation.
const PIRATE_CHANCE = 1 / 11;

function createQueuePig(color, colIndex, rowIndex, isPirate = Math.random() < PIRATE_CHANCE) {
  const isWhite = color === 'white';
  const group = buildPigMesh(isWhite, isPirate);
  group.scale.setScalar(QUEUE.pigScale); // 5x bigger in the queue, per feedback —
  // tweened down/up to PIG.beltScale once picked, in spawnRig.
  group.userData.queueRef = { colIndex, rowIndex };
  group.userData.isQueuePig = true;
  group.position.copy(queueSlotPosition(colIndex, rowIndex));
  // Local -Z (the model's nose) already points toward -Z, i.e. "north"
  // toward the belt — no extra rotation needed for "olhando para cima".
  // The pirate's own ammo, so the number on its back is right from the
  // moment it appears in the queue — a player choosing between birds is
  // reading that number, so it cannot be a surprise revealed after the
  // pick.
  group.userData.ammo = isPirate ? PIG.ammoPirate : PIG.ammoStart;
  // Queue birds never move their weapon, so their hose is built ONCE here
  // rather than every frame — see tickPigHose for why that distinction is
  // worth making.
  tickPigHose(group);
  const ammoSprite = makeAmmoSprite(group.userData.ammo, isWhite);
  // Sits on the flat of the pig's back, just BELOW the ears (were floating
  // well above the head) — applies to queue AND belt pigs alike, since
  // this is the same sprite instance reused in spawnRig.
  // On the backpack's flat lid, not floating over the body: the model
  // declares the anchor, so the number follows the pack.
  const anchor = group.userData.ammoAnchor;
  if (anchor) ammoSprite.position.copy(anchor);
  else ammoSprite.position.y = PIG.ammoLabelHeight;
  group.add(ammoSprite);
  group.userData.ammoSprite = ammoSprite;
  scene.add(group);
  return group;
}

function disposeQueuePig(group) {
  scene.remove(group);
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  });
}

function rebuildQueue() {
  for (const lane of lanes) {
    for (const entry of lane) disposeQueuePig(entry.group);
  }
  slidingQueuePigs.length = 0;
  lanes = Array.from({ length: QUEUE.columns }, (_, col) =>
    Array.from({ length: QUEUE.rows }, (_, row) => {
      const color = randomColor();
      const group = createQueuePig(color, col, row);
      return { color, group, isPirate: group.userData.isPirate };
    })
  );
}

function tickQueueAnimations(dt, sceneTime) {
  const slidingSet = new Set();
  for (let i = slidingQueuePigs.length - 1; i >= 0; i--) {
    const s = slidingQueuePigs[i];
    s.t += dt / s.duration;
    const t = Math.min(s.t, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    s.group.position.lerpVectors(s.from, s.to, eased);
    slidingSet.add(s.group);
    if (t >= 1) slidingQueuePigs.splice(i, 1);
  }
  for (const lane of lanes) {
    for (const entry of lane) {
      const mode = slidingSet.has(entry.group) ? 'walk' : 'idle';
      animatePigProcedural(entry.group, sceneTime, mode, 0);
    }
  }
}

function onPick(colIndex, rowIndex) {
  if (!hasRoomForNewFiche()) return; // no physical room on the belt yet — ignore the pick
  const freeToken = findFreeToken();

  const lane = lanes[colIndex];
  const picked = lane[rowIndex];
  beltTokens[freeToken] = {
    color: picked.color,
    ammo: picked.group.userData.ammo ?? PIG.ammoStart,
  };
  sfx.click();
  // The soundtrack can only start from a user gesture — every browser
  // blocks it otherwise — so the first pick is what starts it. Calling it
  // on every pick is deliberate and free: playGameplay bails immediately
  // once the loop is already running, and this way a tab that was
  // backgrounded and had its context suspended picks the music back up on
  // the next interaction instead of going silent for the rest of the run.
  music.playGameplay();

  // EVERY row behind the picked one — including the always-built-but-
  // hidden last row — shifts north by one, walking (not popping) into its
  // new spot. The previously-hidden pig sliding from the hidden slot into
  // the last VISIBLE slot is what reads as "a new pig walking in from
  // off-screen"; because it already existed, there's no timing window for
  // a lane to desync (the v1h bug).
  for (let row = rowIndex + 1; row < lane.length; row++) {
    const entry = lane[row];
    const newRow = row - 1;
    entry.group.userData.queueRef.rowIndex = newRow;
    slidingQueuePigs.push({
      group: entry.group,
      from: entry.group.position.clone(),
      to: queueSlotPosition(colIndex, newRow),
      t: 0,
      duration: QUEUE.slideDuration,
    });
  }
  lane.splice(rowIndex, 1);

  // Immediately build a fresh pig at the now-empty hidden slot (south end)
  // — it's off-frame, so there's no visible pop-in.
  const newRowIndex = lane.length;
  const newColor = randomColor();
  const newGroup = createQueuePig(newColor, colIndex, newRowIndex);
  lane.push({ color: newColor, group: newGroup, isPirate: newGroup.userData.isPirate });

  spawnRig(picked.group, picked.color, freeToken);
  updateCapacityHud();
}

function onCanvasPointerDown(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const targets = [];
  for (const lane of lanes) for (const entry of lane) targets.push(entry.group);
  const hits = raycaster.intersectObjects(targets, true);
  if (hits.length === 0) return;
  let obj = hits[0].object;
  while (obj && !obj.userData.isQueuePig) obj = obj.parent;
  if (obj) {
    const { colIndex, rowIndex } = obj.userData.queueRef;
    onPick(colIndex, rowIndex);
  }
}
renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);

// ---------------------------------------------------------------------
// Boot + render loop
// ---------------------------------------------------------------------
buildGrid();
buildTrackVisual();
buildBeltArrows();
buildFicheStack();
buildSelectedSlots();
rebuildQueue();
updateCapacityHud();
initBoostSlots();
initPauseMenu();
drawCounterIcon(document.getElementById('icon-plastic'), 'bottle');
drawCounterIcon(document.getElementById('icon-metal'), 'can');
drawCounterIcon(document.getElementById('icon-coin'), 'coin');
drawCounterIcon(document.getElementById('payout-icon'), 'coin');
addCoins(0); // paints the stored total into the bar on boot
updateScoreHud();

// ---------------------------------------------------------------------
// v2b: UV scrolling — what actually makes the bay feel alive. Nothing here
// moves any geometry; each layer just slides its own texture offset, which
// is the cheapest possible way to animate water (no vertex work, no extra
// draw calls, no shader recompiles).
//
// The three layers scroll at deliberately DIFFERENT speeds and directions:
// matched speeds would fuse them into one flat sheet in the eye, while the
// divergence reads as separate depths sliding past each other — the same
// parallax trick the double shadow is doing, on the texture side.
// ---------------------------------------------------------------------
function tickWaterAnimation(dt) {
  // The surface's own foam is scrolled inside the shader (uWaterTime), not
  // by moving a texture offset — it has to stay in world space and be
  // warped by the distortion sample, neither of which a texture offset can
  // express. Only the caustics and the channel foam are plain UV scrolls.
  if (waterShaderRef) waterShaderRef.uniforms.uWaterTime.value += dt;
  CAUSTICS_TEXTURE_HI.offset.x += WATER.causticsScroll.x * 2.35 * dt;
  CAUSTICS_TEXTURE_HI.offset.y += WATER.causticsScroll.y * 2.35 * dt;
  CAUSTICS_TEXTURE.offset.x += WATER.causticsScroll.x * dt;
  CAUSTICS_TEXTURE.offset.y += WATER.causticsScroll.y * dt;
  // Negative: U grows along the path in the direction of travel, so the
  // foam has to scroll the other way for the surface to appear to move
  // WITH the riders toward the whirlpool (same reasoning as a scrolling
  // background moving opposite to the character).
  CURRENT_FOAM_TEXTURE.offset.x -= WATER.currentFoamScroll * dt;
  // The underflow drifts SLOWER than the strokes on top of it. That
  // difference is the whole reason it adds depth: two layers moving at one
  // rate are one layer, and it is the parallax — not the colour — that
  // makes the channel read as water with a body rather than as marks
  // painted on a surface.
  CURRENT_UNDERFLOW_TEXTURE.offset.x -= WATER.currentFoamScroll * 0.55 * dt;
}

const clock = new THREE.Clock();
let sceneTime = 0;
function tick() {
  const rawDt = Math.min(clock.getDelta(), 0.05);
  // Paused: the frame is still drawn (so the scene does not go black
  // behind a translucent overlay) but nothing advances.
  const dt = paused ? 0 : rawDt;
  sceneTime += dt;
  // The whole board's floating idle: one float, and both InstancedMeshes
  // animate in the vertex shader (see applyFloatingIdle).
  trashBobUniform.value = sceneTime;
  tickShadowMap();
  tickTimeOfDay(dt);
  refractionUniform.value = sceneTime;
  tickBoosts(dt);
  tickBoostBursts(dt);
  tickSplashes(dt);
  tickWakes(dt);
  tickPrizeGlows(sceneTime);
  tickNightGlow(sceneTime);

  for (let i = activePigs.length - 1; i >= 0; i--) {
    const pig = activePigs[i];
    const finished = pig.tick(dt, sceneTime);
    if (finished) {
      // 'fall' already played its sound the instant it started sinking
      // (see pig.tick) — only 'despawn' (out of ammo mid-ride) needs it here.
      // A rider leaving the belt goes INTO the water either way — out of
      // ammo, or down the vortex — so both get a splash. The vortex one is
      // bigger: it is the loss event, and the size difference is the cue
      // that tells the two apart without the player having to look.
      spawnSplash(pig.group.position, pig.endReason === 'fall' ? 1.5 : 0.85);
      if (pig.endReason !== 'fall') sfx.pigDespawn();
      pig.dispose();
      activePigs.splice(i, 1);
      beltTokens[pig.tokenIndex] = null;
      updateCapacityHud();
    }
  }
  enforceBeltSpacing();
  tickQueueAnimations(dt, sceneTime);
  tickProjectiles(dt);
  tickBeltArrows(dt);
  tickPillarDestructions(dt);
  tickWaterAnimation(dt);
  tickSeaLife(dt, sceneTime);
  tickWhirlpool(dt, sceneTime);

  // ONE scene render per frame. The depth pre-pass that used to sit here is
  // gone — see seabedHeight() in the water shader for why it was never
  // needed.
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
