import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GRID, BELT, QUEUE, PIG, TRACK, TILE, TRAY, SELECTED_SLOTS, LIGHTING, COLORS, DEATH_ZONE, FONT } from './config.js';
import { sfx } from './sound.js';

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
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
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
camera.position.set(0, beltHalfW * 4.2, beltHalfW * 2.7);
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
camera.lookAt(0, 0, beltHalfH * 1.05);
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
holder.appendChild(renderer.domElement);

function resizeToHolder() {
  const w = holder.clientWidth;
  const h = holder.clientHeight;
  const aspect = w / h;
  const halfViewW = ORTHO_VIEW_WIDTH / 2;
  const halfViewH = halfViewW / aspect;
  camera.left = -halfViewW;
  camera.right = halfViewW;
  camera.top = halfViewH;
  camera.bottom = -halfViewH;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
scene.add(sunLight);
scene.add(sunLight.target);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: COLORS.floor })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.3;
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------------
// Checkerboard grid: cells -> 4 tightly packed pillars each. Drawn with
// two InstancedMeshes (one per color) so a large board (13x13 = 169
// cells = 676 pillars) stays a couple of draw calls instead of hundreds.
// ---------------------------------------------------------------------
const gridGroup = new THREE.Group();
scene.add(gridGroup);

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

  // Rounded corners/edges on every pillar, per feedback (were sharp
  // BoxGeometry cubes) — segments kept minimal (2) since this runs through
  // an InstancedMesh with hundreds of instances.
  const pillarGeo = new RoundedBoxGeometry(
    GRID.pillarSize,
    GRID.pillarHeight,
    GRID.pillarSize,
    2,
    GRID.pillarCornerRadius
  );
  const whiteMat = new THREE.MeshStandardMaterial({ color: COLORS.pillarWhite, roughness: 0.6 });
  const blackMat = new THREE.MeshStandardMaterial({ color: COLORS.pillarBlack, roughness: 0.6 });

  const offset = GRID.pillarSize / 2 + GRID.pillarGap / 2;
  const quarterOffsets = [
    [-offset, -offset],
    [offset, -offset],
    [-offset, offset],
    [offset, offset],
  ];

  const whiteCenters = [];
  const blackCenters = [];
  for (let cx = 0; cx < GRID.cellsX; cx++) {
    for (let cy = 0; cy < GRID.cellsY; cy++) {
      const isWhite = (cx + cy) % 2 === 0;
      const cellCenterX = -halfW + GRID.cellSize * cx + GRID.cellSize / 2;
      const cellCenterZ = -halfH + GRID.cellSize * cy + GRID.cellSize / 2;
      (isWhite ? whiteCenters : blackCenters).push([cellCenterX, cellCenterZ]);
    }
  }

  whiteInstancedMesh = new THREE.InstancedMesh(pillarGeo, whiteMat, whiteCenters.length * 4);
  blackInstancedMesh = new THREE.InstancedMesh(pillarGeo, blackMat, blackCenters.length * 4);
  whiteInstancedMesh.castShadow = true;
  whiteInstancedMesh.receiveShadow = true;
  blackInstancedMesh.castShadow = true;
  blackInstancedMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let wi = 0;
  for (const [cx, cz] of whiteCenters) {
    for (const [ox, oz] of quarterOffsets) {
      const position = new THREE.Vector3(cx + ox, GRID.pillarHeight / 2, cz + oz);
      dummy.position.copy(position);
      dummy.updateMatrix();
      whiteInstancedMesh.setMatrixAt(wi, dummy.matrix);
      pillars.push({ mesh: whiteInstancedMesh, instanceId: wi, color: 'white', alive: true, position, targeted: false });
      wi++;
    }
  }
  let bi = 0;
  for (const [cx, cz] of blackCenters) {
    for (const [ox, oz] of quarterOffsets) {
      const position = new THREE.Vector3(cx + ox, GRID.pillarHeight / 2, cz + oz);
      dummy.position.copy(position);
      dummy.updateMatrix();
      blackInstancedMesh.setMatrixAt(bi, dummy.matrix);
      pillars.push({ mesh: blackInstancedMesh, instanceId: bi, color: 'black', alive: true, position, targeted: false });
      bi++;
    }
  }
  whiteInstancedMesh.instanceMatrix.needsUpdate = true;
  blackInstancedMesh.instanceMatrix.needsUpdate = true;
  gridGroup.add(whiteInstancedMesh, blackInstancedMesh);
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

function totalAlivePillars() {
  return pillars.filter((p) => p.alive).length;
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
  const quad = (a, b, c, d) => {
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    verts.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  };
  for (let i = 0; i < sampleCount; i++) {
    quad(topInner[i], topOuter[i], topOuter[i + 1], topInner[i + 1]); // top
    quad(botInner[i + 1], botOuter[i + 1], botOuter[i], botInner[i]); // bottom
    quad(topOuter[i], botOuter[i], botOuter[i + 1], topOuter[i + 1]); // outer wall
    quad(botInner[i], topInner[i], topInner[i + 1], botInner[i + 1]); // inner wall
  }
  // End caps at the two open ends of the ribbon.
  quad(botInner[0], botOuter[0], topOuter[0], topInner[0]);
  const last = sampleCount;
  quad(botOuter[last], botInner[last], topInner[last], topOuter[last]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.track, roughness: 0.7 });
  trackMesh = new THREE.Mesh(geo, mat);
  trackMesh.castShadow = true;
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);
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
const ARROW_TIP_X = 0.18;
const ARROW_TAIL_X = -0.1;
const ARROW_HALF_HEIGHT = 0.34; // grown (was 0.16) — taller/more stretched
// vertically, per feedback ("com a vertical mais esticada").
const ARROW_SPAN = ARROW_TIP_X - ARROW_TAIL_X;
const ARROW_OPACITY = 0.55; // within the requested 40-70% range ("cerca de
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
  void main() {
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
  varying float vLocalX;
  void main() {
    float reveal = smoothstep(uThreshold - uSoftness, uThreshold + uSoftness, vLocalX);
    float edgeAlpha = uMode < 0.5 ? reveal : (1.0 - reveal);
    float alpha = edgeAlpha * uOpacity;
    if (alpha <= 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function makeArrowMesh() {
  const shape = new THREE.Shape();
  shape.moveTo(ARROW_TAIL_X, -ARROW_HALF_HEIGHT);
  shape.lineTo(ARROW_TIP_X, 0);
  shape.lineTo(ARROW_TAIL_X, ARROW_HALF_HEIGHT);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
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
const tileGeo = new RoundedBoxGeometry(TILE.width, TILE.height, TILE.depth, 3, TILE.cornerRadius);

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
function buildFicheStack() {
  // All tiles are now the same neutral color regardless of which pig ends
  // up riding them — no more white/black tile distinction, per feedback
  // ("quero eles sempre iguais, serão feitos de madeira futuramente").
  const tileMat = new THREE.MeshStandardMaterial({ color: TILE.color, roughness: 0.6 });
  for (let i = 0; i < BELT.capacity; i++) {
    const mesh = new THREE.Mesh(tileGeo, tileMat);
    mesh.position.copy(stackSlotPosition(i));
    // No rotation — tiles lie flat in the pile, same pose they'll have once
    // they're lying on the belt itself.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  // Comic-style outline: stroke pass first, then fill — a "dynamic" border
  // that works on any string, not a fixed image asset.
  ctx.strokeStyle = '#0a0a12';
  ctx.lineWidth = FONT.strokeWidth;
  ctx.strokeText(text, 160, 66);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 160, 66);
  return canvas;
}

const trayLabelMat = new THREE.SpriteMaterial({
  map: new THREE.CanvasTexture(drawTrayLabelCanvas('0/5')),
  depthTest: false,
});
const trayLabel = new THREE.Sprite(trayLabelMat);
// Sized to the tile's own maximum horizontal dimension (canvas is a 160x64,
// i.e. 2.5:1, texture) and laid flat on the FLOOR right below the base of
// the lowest tile in the stack — not a floating HUD sprite anymore.
const TRAY_LABEL_WIDTH = TILE.width * 2.6; // bigger again this pass, per
// feedback ("quero o texto de 5/5 ainda maior")
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
const holeGeo = new RoundedBoxGeometry(
  TRACK.width * DEATH_ZONE.sizeMultiplier,
  0.06,
  TRACK.width * DEATH_ZONE.sizeMultiplier,
  2,
  0.1
);
const holeMesh = new THREE.Mesh(
  holeGeo,
  new THREE.MeshStandardMaterial({ color: DEATH_ZONE.color, roughness: 0.9 })
);
holeMesh.position.set(HOLE_POINT.x, -0.03, HOLE_POINT.z);
holeMesh.receiveShadow = true;
scene.add(holeMesh);

// ---------------------------------------------------------------------
// Pig model: built from primitives — a rounded body, two ear rectangles,
// a snout cylinder, leg cylinders (pivoted at the hip for a real walk
// cycle), and small eye/nostril accents. Local -Z is the model's "front".
// ---------------------------------------------------------------------
function buildPigMesh(isWhite) {
  const group = new THREE.Group();
  const bodyColor = isWhite ? COLORS.pigWhite : COLORS.pigBlack;
  const earColor = isWhite ? COLORS.pigEarWhite : COLORS.pigEarBlack;

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(0.62, 0.5, 0.5, 3, 0.14),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55 })
  );
  body.position.y = 0.42;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const earGeo = new THREE.BoxGeometry(0.16, 0.18, 0.05);
  const earMat = new THREE.MeshStandardMaterial({ color: earColor, roughness: 0.6 });
  const earLeft = new THREE.Mesh(earGeo, earMat);
  earLeft.position.set(-0.18, 0.68, -0.2);
  earLeft.rotation.z = 0.35;
  earLeft.rotation.x = -0.2;
  earLeft.castShadow = true;
  group.add(earLeft);
  const earRight = earLeft.clone();
  earRight.position.x = 0.18;
  earRight.rotation.z = -0.35;
  group.add(earRight);

  const snout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: COLORS.snout, roughness: 0.5 })
  );
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.4, -0.35);
  snout.castShadow = true;
  group.add(snout);

  const nostrilGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.05, 6);
  const nostrilMat = new THREE.MeshStandardMaterial({ color: COLORS.eye });
  const nostrilLeft = new THREE.Mesh(nostrilGeo, nostrilMat);
  nostrilLeft.rotation.x = Math.PI / 2;
  nostrilLeft.position.set(-0.05, 0.4, -0.43);
  group.add(nostrilLeft);
  const nostrilRight = nostrilLeft.clone();
  nostrilRight.position.x = 0.05;
  group.add(nostrilRight);

  const eyeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: COLORS.eye });
  const eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
  eyeLeft.rotation.x = Math.PI / 2;
  eyeLeft.position.set(-0.16, 0.55, -0.26);
  group.add(eyeLeft);
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.16;
  group.add(eyeRight);

  const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: COLORS.leg });
  const legOffsets = [
    [-0.2, -0.16],
    [0.2, -0.16],
    [-0.2, 0.16],
    [0.2, 0.16],
  ];
  const legs = [];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(0, -0.11, 0);
    leg.castShadow = true;
    // Pivot at the hip (top of the leg), so rotating it for the walk
    // cycle swings it like an actual leg instead of tilting in place.
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.22, lz);
    pivot.add(leg);
    group.add(pivot);
    legs.push(pivot);
  }

  // Exposed so the (lightweight, procedural — no skeleton) idle/walk/shoot
  // animations in animatePigProcedural() can move the right pieces.
  group.userData.parts = { body, earLeft, earRight, legs };

  return group;
}

/**
 * Lightweight procedural animation for the primitive pig model — no
 * skeleton, just a few parts nudged by sine waves. `mode` is 'idle' or
 * 'walk'; `recoil` (0..1, decaying) layers a quick shooting kick on top.
 */
function animatePigProcedural(pigGroup, t, mode, recoil) {
  const parts = pigGroup.userData.parts;
  if (!parts) return;
  const { body, earLeft, earRight, legs } = parts;

  if (mode === 'walk') {
    const stride = Math.sin(t * 11);
    legs[0].rotation.x = stride * 0.5;
    legs[3].rotation.x = stride * 0.5;
    legs[1].rotation.x = -stride * 0.5;
    legs[2].rotation.x = -stride * 0.5;
    body.position.y = 0.42 + Math.abs(Math.sin(t * 11)) * 0.02;
    body.rotation.x = 0;
  } else {
    for (const leg of legs) leg.rotation.x = 0;
    body.position.y = 0.42 + Math.sin(t * 2.2) * 0.015;
    const earWiggle = Math.sin(t * 2.2 + 1.2) * 0.05;
    earLeft.rotation.z = 0.35 + earWiggle;
    earRight.rotation.z = -0.35 - earWiggle;
    // Gentle forward/back rock — a slight nod on the body only, feet stay
    // planted (legs are untouched above), per feedback.
    body.rotation.x = Math.sin(t * 1.7) * 0.07;
  }

  if (recoil > 0) {
    body.position.z = recoil * 0.08;
    body.scale.setScalar(1 - recoil * 0.04);
  } else {
    body.position.z = 0;
    body.scale.setScalar(1);
  }
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
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  // Comic-style outline (stroke-then-fill) in the opposite tone from the
  // fill, so the number always pops regardless of which pig it sits on.
  ctx.strokeStyle = isWhitePig ? '#ffffff' : '#0a0a0f';
  ctx.lineWidth = FONT.strokeWidth;
  ctx.strokeText(String(value), 110, 86);
  ctx.fillStyle = isWhitePig ? '#0a0a0f' : '#ffffff';
  ctx.fillText(String(value), 110, 86);
  return canvas;
}

function makeAmmoSprite(value, isWhitePig) {
  const texture = new THREE.CanvasTexture(drawAmmoCanvas(value, isWhitePig));
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.9, 0.68, 1); // matches the 128x96 canvas aspect ratio
  return sprite;
}

// ---------------------------------------------------------------------
// Projectiles: bigger + brighter, with a tapering comet-style trail (one
// cone mesh per shot, updated in place every frame — cheaper than
// spawning a stream of particles).
// ---------------------------------------------------------------------
const activeProjectiles = [];
const PROJECTILE_GEO = new THREE.SphereGeometry(PIG.projectileRadius, 10, 10);
// Trail's base radius now matches the projectile's own radius exactly (was
// 0.85x, reading as a separate, skinnier shape) — it tapers from the full
// width of the shot down to a point, like a real comet tail extending it.
const TRAIL_GEO = new THREE.ConeGeometry(PIG.projectileRadius, PIG.projectileTrailLength, 10, 1, true);
TRAIL_GEO.translate(0, PIG.projectileTrailLength / 2, 0);
const UP_Y = new THREE.Vector3(0, 1, 0);

function spawnProjectile(fromPosition, toPillar, color) {
  // Reserve this pillar the instant a shot is fired at it, not just once it
  // lands — see findShootablePillar's comment for the bug this fixes.
  toPillar.targeted = true;
  const tone = color === 'white' ? COLORS.projectileWhite : COLORS.projectileBlack;
  const mat = new THREE.MeshStandardMaterial({
    color: tone,
    emissive: COLORS.projectileGlow,
    emissiveIntensity: 0.9,
  });
  const mesh = new THREE.Mesh(PROJECTILE_GEO, mat);
  mesh.position.copy(fromPosition);
  scene.add(mesh);

  const trailMat = new THREE.MeshBasicMaterial({
    color: tone,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
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
      const backDir = vel.normalize().multiplyScalar(-1);
      proj.trailMesh.quaternion.setFromUnitVectors(UP_Y, backDir);
    }
    proj.trailMesh.material.opacity = 0.55 * (1 - Math.pow(t, 3));

    if (t >= 1) {
      scene.remove(proj.mesh);
      proj.mesh.material.dispose();
      scene.remove(proj.trailMesh);
      proj.trailMesh.material.dispose();
      sfx.hit();
      if (proj.targetPillar.alive) {
        destroyPillar(proj.targetPillar); // also fires sfx.pillarDestroy()
        onPillarDestroyed();
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
  return Math.max(60, PIG.fireIntervalBase + jitter);
}

function spawnRig(pigGroup, color, tokenIndex) {
  const isWhite = color === 'white';

  const rig = new THREE.Group();
  // Same neutral tile color everywhere now — no more white/black distinction.
  const tileMat = new THREE.MeshStandardMaterial({ color: TILE.color, roughness: 0.6 });
  const tileMesh = new THREE.Mesh(tileGeo, tileMat);
  tileMesh.castShadow = true;
  tileMesh.receiveShadow = true;
  // No rotation needed — the tile lies flat in the pile already, the same
  // pose it keeps once it's lying on the belt.
  rig.add(tileMesh);
  sfx.tileEnter();

  let ammo = PIG.ammoStart;
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
      // Tile stays flat throughout — it's already lying down in the pile,
      // so unlike the old standing-stack passes there's no tip-over tween
      // needed here anymore.

      // The pig chases the tile's live position, drag-and-drop style,
      // landing on top of it exactly as it settles onto the belt.
      const targetPigPos = rig.position.clone().add(new THREE.Vector3(0, TILE.height, 0));
      pigGroup.position.lerpVectors(pigStartPos, targetPigPos, eased);
      pigGroup.position.y += Math.sin(Math.PI * eased) * 0.6; // little toss arc
      pigGroup.scale.setScalar(pigStartScale + (PIG.beltScale - pigStartScale) * eased);
      animatePigProcedural(pigGroup, sceneTime + pig.animPhase, 'walk', pig.recoil);

      if (t >= 1) {
        scene.remove(pigGroup);
        rig.add(pigGroup);
        pigGroup.position.set(0, TILE.height, 0);
        pigGroup.rotation.y = PIG.inwardOffset;
        pig.phase = 'onBelt';
        sfx.pigLand();
      }
      return false;
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
    // Idle while riding — the fiche/belt does the traveling, the pig itself
    // isn't "walking" — the recoil kick (layered on any mode) is what reads
    // as the shoot pose the instant it fires (feedback: was stuck in a
    // constant walk cycle even while just standing on the belt).
    animatePigProcedural(pigGroup, sceneTime + pig.animPhase, 'idle', pig.recoil);

    if (ammo > 0) {
      pig.fireTimer += dt * 1000;
      if (pig.fireTimer >= pig.nextFireAt) {
        pig.fireTimer = 0;
        pig.nextFireAt = nextFireInterval();
        const target = findShootablePillar(color, rig.position);
        if (target) {
          const nosePos = rig.position.clone().add(new THREE.Vector3(0, TILE.height + 0.4, 0));
          spawnProjectile(nosePos, target, color);
          sfx.shoot();
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
      if (obj.geometry && obj.geometry !== tileGeo) obj.geometry.dispose?.();
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

function onPillarDestroyed() {
  if (totalAlivePillars() === 0) {
    showWin();
  }
}

function showWin() {
  winOverlay.style.display = 'flex';
}

function resetGame() {
  buildGrid();
  winOverlay.style.display = 'none';
  for (const pig of activePigs) pig.dispose();
  activePigs.length = 0;
  beltTokens.fill(null);
  updateCapacityHud();
  rebuildQueue();
}

document.getElementById('restart-btn').addEventListener('click', resetGame);

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
  return new THREE.Vector3(x, 0, z);
}

function createQueuePig(color, colIndex, rowIndex) {
  const isWhite = color === 'white';
  const group = buildPigMesh(isWhite);
  group.scale.setScalar(QUEUE.pigScale); // 5x bigger in the queue, per feedback —
  // tweened down/up to PIG.beltScale once picked, in spawnRig.
  group.userData.queueRef = { colIndex, rowIndex };
  group.userData.isQueuePig = true;
  group.position.copy(queueSlotPosition(colIndex, rowIndex));
  // Local -Z (the model's nose) already points toward -Z, i.e. "north"
  // toward the belt — no extra rotation needed for "olhando para cima".
  const ammoSprite = makeAmmoSprite(PIG.ammoStart, isWhite);
  // Sits on the flat of the pig's back, just BELOW the ears (were floating
  // well above the head) — applies to queue AND belt pigs alike, since
  // this is the same sprite instance reused in spawnRig.
  ammoSprite.position.y = PIG.ammoLabelHeight;
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
      return { color, group: createQueuePig(color, col, row) };
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
  beltTokens[freeToken] = { color: picked.color, ammo: PIG.ammoStart };
  sfx.click();

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
  lane.push({ color: newColor, group: createQueuePig(newColor, colIndex, newRowIndex) });

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

const clock = new THREE.Clock();
let sceneTime = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  sceneTime += dt;

  for (let i = activePigs.length - 1; i >= 0; i--) {
    const pig = activePigs[i];
    const finished = pig.tick(dt, sceneTime);
    if (finished) {
      // 'fall' already played its sound the instant it started sinking
      // (see pig.tick) — only 'despawn' (out of ammo mid-ride) needs it here.
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

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
