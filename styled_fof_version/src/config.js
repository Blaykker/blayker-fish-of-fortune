// Central place for every tunable value used in v1.
// v2/v3 will mostly touch EASING / TIMING values here — keep this file as
// the single source of truth so README "valores ajustados" stay accurate.
//
// History:
// - ai_logs/v1b_mechanic_correction.txt: fixed color-matched shooting,
//   countdown ammo, belt capacity vs. picking queue, entry corner.
// - ai_logs/v1c_layout_and_feel_pass.txt: tighter pillar clusters, faster/
//   jittered + arced shots, pig despawns the instant ammo hits 0, English
//   UI copy, vertical mobile frame, capacity token row, belt direction
//   arrows, clearer nose marker.
// - ai_logs/v1d_layout_rework.txt: isometric-ish orthographic camera,
//   rounded 3D belt with curved pig movement, a 3D "chip tray" prop at
//   the belt entrance, 4x3 column queue (was a single row of 4), a
//   primitive-built pig model (rounded body/ears/snout/legs/eyes), higher
//   contrast pillars, lighter projectile sphere.
// - ai_logs/v1e_tile_rig_and_los.txt: pigs now ride physical "fiche" tiles
//   (TILE below) that carry belt-capacity and drive the pig's turning at
//   corners instead of a per-frame lookAt(center); a real 3D queue
//   (rendered with the same pig model, via scissored mini-viewports)
//   replaces the flat CSS icons; line-of-sight shooting (archer rule);
//   bigger/brighter projectile with a short trail; a visual gap in the
//   belt at the entry corner where the fiche stack lives.
// - ai_logs/v1f_arrow_fix_and_hud_pass.txt: found + fixed the real bug
//   behind the crooked belt arrows (mixing object.rotation.x with a
//   live-updated object.rotation.y on the SAME Euler is not equivalent to
//   "lay flat, then steer" in three.js — the fix bakes the flattening
//   rotation into the geometry instead); a 5-slot "selected pigs" HUD row
//   between the belt and the queue; ammo numbers drawn directly over the
//   model (no circle backdrop); a tapering comet-style shot trail
//   (replacing the small particle puffs); minimum spacing between pigs on
//   the belt; a fixed low-angle "afternoon sun" light for soft cast
//   shadows; white fiche stack; queue/HUD mini-viewports now match the
//   scene background instead of rendering a stray black square.
// - ai_logs/v1g_real_scene_queue_and_scale.txt: the queue moved OUT of the
//   scissored mini-viewport and into the real 3D scene (so it can cast a
//   real shadow from the global sun and isn't visually confined to a tiny
//   box) — clicks now go through raycasting; picking a pig flies that same
//   instance, drag-and-drop style, onto the fiche the moment it lands on
//   the belt, instead of building a throwaway model for the rig; the belt
//   track itself became a string of instanced segments (open where the
//   fiche-stack gap is, instead of a closed ring masked by a floor-colored
//   block) that also lets 100s of grid pillars stay cheap via
//   InstancedMesh (needed once the grid grew to 13x13); belt arrows now
//   wipe in/out like they're sliding under a mask instead of popping;
//   pure black/white ammo digits (no outline); brighter/lighter global
//   light previewing the eventual tropical Fish-of-Fortune palette.
// - ai_logs/v1h_scale_pass_and_queue_flow.txt: belt-riding pigs now move at
//   the exact same speed as the direction arrows (same surface, same
//   speed); belt pigs idle by default and only kick into the shoot/recoil
//   pose while actually firing (were stuck in a constant walk cycle);
//   queue pigs 5x bigger; picking now waits for the lane-shift to finish
//   before a fresh pig walks in from off-screen (instead of popping into
//   place immediately) — reads like a genuinely infinite queue; the fiche/tile
//   (still shared between the stack and the belt rig) is much bigger and
//   has real visible thickness, anticipating the eventual wood-raft prop;
//   belt-riding pig 3x bigger (up from 1.5x); pillars 3x taller; belt
//   track itself much thicker (room made by pushing TRACK.margin out) to
//   comfortably carry the bigger tile; belt corner segments finer so the
//   curve reads smooth instead of faceted; stack tiles gapped further
//   apart so the "X/5" count is easy to eyeball; a full camera/layout
//   reproportion pass since every prop above changed scale at once.
// - ai_logs/v1i_pacing_queue_rework_and_sfx.txt: belt corner radius pulled
//   BACK down (was over-corrected to 4.5, way too soft a turn) to just
//   above the minimum that avoids the self-overlap "fan" z-fighting bug —
//   a tighter corner without the facet defect; belt narrowed and margin
//   tightened to give the checkerboard more of the frame; queue pigs
//   dialed back from 5x to 2x with more lane spacing; ammo number moved
//   down to the flat of the pig's back, below the ears; every tile is now
//   the same neutral color regardless of rider (anticipating the future
//   wood-raft look) — no more white/black tile distinction; the "X/5"
//   label now sits flat on the floor right below the stack, sized to the
//   tile's own width; the numeric "X/5 on belt" HUD pill is gone entirely
//   (the physical stack + its floor label is the only capacity readout
//   now); the 5-slot "selected pig" row no longer renders a pig thumbnail
//   at all — those slots are reserved for a future quick-action item
//   system and shouldn't compete for attention with the belt; picking is
//   now blocked while there's no room for another fiche on the belt
//   (used to only check the numeric capacity, not actual physical
//   clearance); the queue's "new pig" bug (fixed-looking gaps) is fixed by
//   ALWAYS keeping a real (already-built) 4th pig per lane parked off-
//   screen, rather than deferring its creation — picking just shifts all
//   4 rows north (the previously hidden 4th visibly walks into frame) and
//   immediately builds a fresh one at the now-empty hidden slot, so there
//   is no timing window where a lane can desync; belt/arrow speed and fire
//   rate pushed up a lot faster/livelier, closer to the reference clip's
//   pacing; projectile much bigger with its trail matched to the same
//   width; pillars now bounce on impact and play a short collapse
//   animation instead of vanishing instantly; first pass at placeholder
//   SFX (see sound.js) for every core interaction.
// - ai_logs/v1j_layout_match_and_tile_rework.txt: belt even faster (closer
//   picking cadence, per feedback); tile shrunk down to just slightly
//   bigger than the belt pig's own foot-print (was comically oversized);
//   belt-riding pig dialed to a flat 2x (was 3x, matches how the "Nx
//   maior" instructions have consistently been read as an absolute
//   multiplier, not a further multiply-on-top); queue pigs + lane/row
//   spacing shrunk to match the tighter reference grid; fiche "stack" is
//   no longer a vertical pile — tiles now stand on edge side-by-side in a
//   row (real book-like props), with the rightmost one tipping forward
//   onto its face as it walks onto the belt; pillars now use
//   RoundedBoxGeometry (soft edges) and get a proper elastic
//   shrink-grow-shrink scale bounce on destruction (was a position jolt +
//   monotonic shrink); global sun moved to a true southeast 45°
//   (azimuth AND elevation) so the cast shadow reads at a clean 45°;
//   added a dedicated "hole" prop at the belt's kill-zone point (same
//   corner as the fiche stack, opposite side of the gap) that spent pigs
//   visibly sink/shrink into instead of just vanishing; ammo + tray-label
//   text switched to a rounder, more casual display font with a
//   comic-style stroke outline (drawn via canvas stroke-then-fill, so it
//   works as a "dynamic" border on any text/number, not a fixed asset).
// - ai_logs/v1k_readability_and_hole_split.txt: belt pushed much closer to
//   the frame's own edges (margin cut, camera padding cut) so the
//   checkerboard/pillars read noticeably bigger without changing the grid
//   itself; corner radius opened up further so the belt's inner and outer
//   arcs both read as generously rounded instead of the inner one looking
//   pinched; belt-riding tile+pig scaled up (kept proportional to each
//   other, per feedback) — NOT the literal 4x asked for, because a
//   literal 4x tile forces the belt (and therefore the camera's whole
//   view width) to grow with it, which would have shrunk the checkerboard
//   right back down — the single biggest, most repeated ask this round;
//   picked a smaller multiplier instead and flagged the trade-off; queue
//   pigs scaled up hard and the vertical span retuned so the 3rd visible
//   row sits near the bottom edge and the 1st sits right under the
//   selected-slots row, both for legibility and for comfortable
//   thumb-sized tap targets; the tile's "entering" tween switched from an
//   ease-OUT (decelerates to a dead stop right as it lands — read as the
//   pig "parado" on the belt for a beat) to an ease-IN, so it's already at
//   full speed the instant belt movement takes over, no visible pause;
//   the "X/5" counter now reads STORED tiles (capacity minus what's on the
//   belt), not how many are in use — it had the two swapped; a pig that
//   completes the loop now shrinks AND fades out into the hole (not just
//   shrinks), while its tile no longer falls in with it — the tile flies
//   back out toward the stack and stands back up, since only the PIG is
//   supposed to be "destroyed" there; the hole itself is bigger; ammo/tray
//   canvas resolution and font size bumped up since the previous pass's
//   text was reported as barely legible on an actual phone screen.
// - ai_logs/v1l_proportion_and_speed_split.txt: queue pigs bigger again,
//   with lane spacing (X) and row spacing (Z) brought numerically close
//   together (re-measured via screenshot that the two axes actually
//   compress by similar amounts at this camera angle, overturning an
//   earlier pass's assumption that Z needed to stay several times bigger)
//   — also freed up enough vertical room that all 3 visible queue rows now
//   fit compactly with row 2 landing near the bottom edge; queue pushed
//   further south (areaOffsetZ) so row 0 never visually reaches the dashed
//   selected-slots row above it, even at rest; tile stack's row direction
//   changed from a diagonal tangent to a pure world +X axis so it reads as
//   a clean horizontal line, with a small per-tile depth stagger added
//   back in (a purely flat X-only row with zero depth offset rendered as
//   one undifferentiated plank, not 5 countable tiles — caught via zoomed
//   screenshot); "X/5" tray label recentered under the row using a pure
//   south (+Z) offset instead of the corner-relative radial direction
//   (which had an X component dragging it off-center) and enlarged; belt
//   thinned ~16%; the screen-edge margin around the belt cut in half on
//   both the left/right (camera ortho padding) and top (camera look-at
//   target) — the look-at change shifts the ENTIRE view up uniformly, so
//   the queue's areaOffsetZ above also had to grow just to hold its
//   on-screen position relative to the (screen-fixed) HTML slots overlay;
//   PIG.speed decoupled from TRACK.arrowSpeed (previously forced equal) —
//   arrows now crawl slower/smoother while the actual pig+tile rig moves
//   faster than before; verified arrows already render underneath riding
//   pigs/tiles via normal depth-testing (their ride heights are
//   meaningfully different, ~0.24 vs ~0.54, and no material disables
//   depth-test), so no change was needed there beyond the speed split.
// - ai_logs/v1m_tile_cascade_and_belt_squareoff.txt: tile stack's row
//   direction reverted from v1l's pure world +X back to the tangent-at-the-
//   gap direction ("toward the belt" itself) — the flat X-only row read as
//   a single undifferentiated plank in practice (each tile's face-normal
//   and its own overlap direction ended up on the same axis, hiding nearly
//   all of it behind the next one), while a reference image for this pass
//   confirmed the tangential cascade is what actually shows each tile's
//   large face clearly, "one behind the other"; belt thinned further and
//   its corner radius pulled sharply back down for noticeably squarer
//   corners, per a Photoshop reference — validated with a scale-matched
//   pixel comparison against that reference (not just eyeballing), which
//   showed belt-band thickness now lines up closely; camera look-at
//   pulled back down from the previous pass's value (a real bug: combined
//   with this pass's thinner belt, it was pushing the grid's own top row
//   off-screen) and QUEUE.areaOffsetZ retuned alongside it so all 3 queue
//   rows land fully inside the frame with margin on every edge (previously
//   only 2 fit, or the 3rd clipped at the bottom); "X/5" label enlarged
//   again; the destruction hole's size is now derived from TRACK.width
//   (the belt's own thickness) instead of TILE dimensions, so it can't
//   drift out of proportion with the belt independently of it.
// - ai_logs/v1n_tile_row_direction_and_v1_closeout.txt: tile row direction
//   corrected again, this time with explicit compass wording from feedback
//   ("horizontal do oeste ao leste") — row direction is a pure world +X axis
//   (not the v1m tangent/diagonal); tried making the tile's own face-normal
//   literally point east too (a different standing rotation + a small
//   camera X offset so an east-facing surface would even be visible), but
//   the camera offset put a shear into every other screen position in the
//   scene (grid, queue rows/lanes), so that was reverted — face-normal
//   stays on world Z, which this camera can actually render, while the row
//   itself now runs cleanly west->east as asked; a small per-tile depth
//   stagger was added back (a real re-discovered bug: a purely flat X row
//   with zero depth offset renders as one undifferentiated plank from this
//   camera's steep angle, confirmed via zoomed screenshot both before and
//   after the fix); belt loop enlarged 15% (margin/width/cornerRadius all
//   scaled together, preserving the previously-validated proportions);
//   camera padding tightened further; shadow camera frustum recentered off
//   the origin and widened to cover the queue's full depth (real bug: only
//   one queue pig was ever lucky enough to land inside the old frustum and
//   cast a shadow — confirmed all pigs now cast one); selected-slots row
//   nudged up and enlarged; belt visually recessed one full TRACK.width
//   short of the path's true end so the destruction hole reads as a clean
//   square at the belt's own thickness, with the pig+tile fall point
//   recentered in the middle of that recess; re-verified via screenshot that
//   the "last queue pig has cropped legs" issue from the previous round's
//   feedback no longer reproduces (already fixed by v1m's areaOffsetZ
//   change, just hadn't been re-confirmed after a fresh rebuild).
// - ai_logs/v1o_pile_rectangle_belt_and_bigger_slots.txt: fiche stack
//   abandoned the row concept entirely (after 3 rounds of tuning its
//   direction) and went back to a vertical PILE — tiles lie flat (no
//   standing rotation at all anymore) and stack straight up in Y at the
//   belt's open entry gap; all the standing/tipping rotation tweens in
//   spawnRig were removed since there's no rotation left to animate. Belt
//   margin split into TRACK.marginX/marginZ (was one uniform TRACK.margin)
//   so the loop is a portrait rectangle — east/west pulled in close to the
//   grid, north/south pushed out further, corners still uniformly rounded;
//   real bug found: growing marginZ grows beltHalfH, which the queue's
//   areaOffsetZ is added on top of, so the queue was pushed down far enough
//   to clip its 3rd row at the bottom edge — corrected by pulling
//   areaOffsetZ back down by the same amount. Camera's extra screen-edge
//   padding cut to a third of its previous value, per feedback quantifying
//   exactly how much tighter the fit should be. Selected-slots row raised
//   further and enlarged — hit a real geometric ceiling here: with 5 slots
//   in one row on a phone-width frame, CSS flex-shrink means the rendered
//   size is governed almost entirely by gap+padding, not the declared
//   width, and even at zero gap/padding the max possible growth is ~1.47x,
//   not the requested 1.7x — gap/padding cut to their practical minimum to
//   get as close as the layout can fit (~1.4x realized), with max-width
//   itself set to the full 1.7x as a ceiling for any less cramped viewport.
// - ai_logs/v1p_final_polish_pile_belt_arrows.txt: fiche pile grown
//   (tiles bigger AND thicker) with a real visible gap between stacked
//   layers now, and re-anchored to the belt's actual visible starting
//   point (centered on its width there) instead of the open gap arc's own
//   midpoint; camera look-at multiplier pulled back down (1.2 → 1.0) to
//   push the whole belt/grid block further down the frame, which — same
//   coupling as always — required re-tuning QUEUE.areaOffsetZ to keep all
//   3 rows on screen, AND (a new wrinkle this time) re-tuning the
//   selected-slots CSS position, since pushing the belt down without also
//   moving the slots caused a real overlap between the slots row and the
//   queue's front row (caught via screenshot) — fixed by raising the
//   slots back up until there's clean daylight on both sides again.
//   Selected-slots also shrunk to 2/3 of the previous pass's size (a full
//   reversal of last pass's enlargement). Belt direction arrows made
//   bigger, flatter (shorter half-height, wider tip-to-tail span), and
//   more transparent; their wipe-in/out mask switched from a hard
//   `discard`-based step to a `smoothstep` alpha ramp so they visibly
//   fade/blur out approaching the gap instead of being sliced off cleanly
//   — required extending the threshold sweep range past the shape's own
//   tip/tail by the fade softness amount to avoid a visible pop at the
//   handoff between "sweeping" and "fully visible" states.
// - ai_logs/v1q_overlap_regression_death_anims_and_v1_close.txt: real
//   regression fix — v1p's push-down of the belt/grid block (camera
//   look-at multiplier) plus the QUEUE.areaOffsetZ retune it required left
//   too little vertical room for the selected-slots row, so it started
//   overlapping the "X/5" tray label and the queue's own front row on an
//   actual device (my own single-viewport verification hadn't caught it) —
//   fixed by reverting BOTH coupled values (camera.lookAt multiplier +
//   QUEUE.areaOffsetZ) back to their last known-good combination, since the
//   user confirmed the queue's prior position was already correct;
//   re-verified this time across 3 different phone aspect ratios, not just
//   one. TRACK.marginX grown (was smaller than half the belt's own width,
//   a real bug — the belt band geometrically overlapped the nearest corner
//   pillars) so the belt gained horizontal room and now clears every
//   pillar cleanly, without touching TRACK.width (the belt's own
//   thickness, kept as-is per feedback). Two new pig death animations: a
//   mid-ride "ran out of ammo" despawn is no longer instant — it now spins
//   and shrinks/fades with an elastic wobble in place, with its tile
//   flying back to the top of the pile (previously an immediate
//   dispose(), no animation at all); the existing hole-fall death now
//   spins on the way down too (previously just sank/shrank/faded).
//   PIG.minBeltGap raised well above TILE.depth (a latent overlap bug from
//   the tile size growing across v1o/v1p while this gap constant didn't),
//   compensated with a shorter TILE.enterDuration and a higher PIG.speed so
//   overall placement still feels faster despite the bigger required gap.
//   Belt arrows reversed from v1p's shape (which read the wrong way):
//   shorter tip-to-tail span, taller half-height — flat horizontally,
//   stretched vertically — and slowed down further for a smoother crawl.
//   Global sun flipped to the opposite corner (northwest) per feedback,
//   with an explicit note in LIGHTING.sunPosition's comment about an
//   internal contradiction in that feedback (sun position vs. requested
//   shadow direction) and which clause was followed literally.
// - ai_logs/v1r_top_margin_tray_label_and_ne_sun.txt: the selected-slots
//   row was STILL overlapping the "X/5" tray label on a real device even
//   after v1q's fix — addressed from the other side this time per specific
//   feedback: the tray label pulled in closer to the pile's own base
//   (almost touching, small real gap kept) instead of moving the slots
//   again, and the whole belt/grid block nudged down a touch further via
//   camera.lookAt (was 1.2, now 1.15) to open up a real top margin above
//   the grid that didn't exist before (a genuine gap, similar to the
//   lateral margins) — this same shift also pushes the queue down, which
//   this pass separately asked for (QUEUE.areaOffsetZ grown alongside it),
//   so the two asks reinforced each other instead of fighting like in
//   v1p/v1q. Verified across the same 3 aspect ratios again: no overlap
//   anywhere, top margin now visible, last queue row sits close to but
//   clear of the bottom edge. Pile gap between stacked tiles grown again
//   (0.22 -> 0.3). Sun moved from the SE corner to the NE corner (top-right)
//   with matching elevation, per feedback asking for a fixed semi-isometric
//   "tropical noon" sun casting its shadow toward the SW — unlike the
//   previous pass, this feedback's sun-position and shadow-direction
//   clauses actually agreed, confirmed via a shadow-direction screenshot.
// - ai_logs/v1s_top_margin_v2_shot_waste_fix_and_v1_close.txt: pushed the
//   belt/grid block down further still for a real, measured top margin
//   (was ~4px at the belt's own outer edge, nowhere near the ~28px lateral
//   margins) — but this time the feedback explicitly required the queue's
//   own screen position to stay EXACTLY where it was, so QUEUE.areaOffsetZ
//   was retuned in the OPPOSITE direction from the camera shift to cancel
//   it back out (verified pixel-for-pixel via screenshot, not just "close
//   enough"). Selected-slots row moved down again — still touching the
//   "X/5" label at its previous position — this time to a position derived
//   from a specific measured target (1/3 of the slot's own height as the
//   gap to the queue's front row), not just eyeballed. Real bug fixed in
//   the shooting mechanic: pillars have 1 HP, so a projectile already in
//   flight toward a pillar is a guaranteed kill the instant it lands, but
//   pigs kept firing MORE shots at that same still-technically-alive
//   pillar while the first shot was still traveling, wasting them the
//   moment they landed on an already-destroyed target — fixed with a
//   `targeted` reservation flag set the instant a shot is fired and
//   cleared when that shot resolves, so target selection now skips
//   pillars that already have a shot in flight toward them. V1 formally
//   closed as of this pass.
// - ai_logs/styled_v2_coral_torus_penguin_boat_water_pass.txt: second
//   styled_fof_version pass, replacing v1's flat placeholder textures with
//   "definitive" geometry per the coral-reef art brief. Grid pillars are no
//   longer textured boxes: black cells are a merged rigid-coral geometry
//   (submerged base + 4 branching prongs breaching the surface), white
//   cells an organic jittered-icosahedron sponge/algae blob — both still
//   single geometries per color group so the 13x13 grid stays on
//   InstancedMesh. The shared pile/belt-riding TILE is now a real torus
//   ("boia") with 4 yellow cardinal-direction ribbon bands, built as a
//   THREE.Group (buildBoiaMesh) instead of a single flat Mesh — reconciling
//   the brief's explicit demand for true donut geometry with the tile's
//   dual static-pile/moving-platform role (previous pass had flagged this
//   tension as a reason to avoid a true torus; the new brief explicitly
//   overrides that). The "pig" rig (buildPigMesh) was rebuilt from scratch
//   into a chibi penguin worker (helmet, beak, backpack + tubes, hand-held
//   tool) per the user's concept sketch, while keeping the same
//   `userData.parts.{body,earLeft,earRight,legs}` shape so the existing
//   walk/recoil/death animation code needed zero changes. Added a
//   decorative boat prop at the queue's dock/bow origin. Floor got a
//   second, semi-transparent turquoise water plane above the sand so the
//   sand texture/shadows read through it. Tile-enter tween's easing swapped
//   for a small overshoot-then-settle curve for a bouncier collection feel,
//   per the brief's "curvas de movimento elásticas e suaves".

export const GRID = {
  cellsX: 13,
  cellsY: 13,
  cellSize: 1.1,
  pillarSize: 0.58, // footprint of each of the 4 mini pillars inside a cell —
  // nudged up (was 0.46) to fill more of each cell, per feedback ("maior
  // tamanho de pilar que der para encaixar").
  pillarGap: 0.005, // squeezed tight, per the reference // tiny gap so the 4 pillars still read as separate pieces
  // (tightened from 0.035 to make room for the bigger pillarSize above)
  pillarHeight: 1.65, // 3x taller (was 0.55) — width/depth unchanged, per feedback
  pillarCornerRadius: 0.07, // rounded edges/corners on every pillar, per feedback
  // (were sharp BoxGeometry cubes) — kept small + low-segment since this
  // runs through an InstancedMesh with hundreds of instances.
};

export const BELT = {
  capacity: 5, // max pigs alive on the belt at once ("X/5" HUD) == fiche count
};

export const QUEUE = {
  columns: 4, // "filas" — matches the reference video's 4 lanes
  visibleRows: 3, // pigs actually visible on screen per lane, north (row 0,
  // closest to the belt) to south (row visibleRows-1)
  rows: 4, // TOTAL pigs kept alive per lane, including one always-built but
  // OFF-SCREEN pig parked at the south end (row 3) — reinforces the
  // "infinite queue" illusion and, just as importantly, sidesteps the
  // v1h bug where a fresh pig was created on a timer and could desync
  // from the lane's actual shift; now it always already exists and just
  // walks into frame the moment a gap opens in front of it.
  pigScale: 4.4, // queue pigs render even bigger this pass (was 3.2x), per
  // feedback ("quero os porcos bem maiores ainda").
  laneSpacing: 4.2, // world units between lane columns (X axis) — opened up
  // together with pigScale so the now-bigger pigs still have comfortable
  // gaps between lanes instead of touching.
  rowSpacing: 5.2, // world units between VISIBLE rows within a lane (Z
  // axis, north->south) — brought down close to laneSpacing this pass, per
  // feedback ("separação na fila no eixo y igual ou similar entre filas no
  // eixo x"). Earlier passes assumed the isometric camera compresses Z
  // much more than X and kept this several times bigger than laneSpacing
  // as a result — re-measured via screenshot this pass and that gap was
  // actually overcorrected: at this camera angle X and Z compress by
  // roughly similar amounts, so a world value close to laneSpacing is what
  // actually reads as similar spacing on screen. This value is also what
  // lets all 3 visible rows fit compactly between the selected-slots row
  // and the bottom edge, with row 2 landing near the bottom per feedback.
  hiddenRowExtraOffset: 18, // extra world units (on top of rowSpacing) added
  // for the always-built-but-hidden 4th pig, so it sits safely off the
  // bottom of the frame instead of bleeding into view.
  areaOffsetZ: 11.5, // v1s: retuned in the OPPOSITE direction from v1r this
  // time (was 12.2) — main.js's camera.lookAt multiplier was pulled down
  // further this pass to open up a top margin above the grid/belt, which
  // (same coupling as always) also pushes the queue down — but this pass's
  // feedback explicitly asked to keep the queue in its EXACT current screen
  // position ("quero a fila de porcos na exata mesma posicao, n mude"), so
  // this value was pulled back down by roughly the same amount to cancel
  // that shift out. Verified via pixel-measured screenshot comparison
  // against the pre-this-pass build: the queue's front row lands within ~1px
  // of where it was before, while the belt/grid moved down on its own. pushed further south again (was 11.2), per
  // feedback ("a fila de porcos descer um pouco diminuindo pela metade pelo
  // menos o espacamento do ultimo porco até a margem sul") — the whole
  // queue moves down so the last row sits noticeably closer to the bottom
  // edge (reinforcing the "infinite queue" illusion), without clipping it.
  // This pairs with main.js's camera.lookAt multiplier being pulled down a
  // touch this same pass (adds top margin above the grid) — that shift
  // moves the queue down too, so this value didn't need to grow by the
  // full amount on its own; tuned the two together and verified via
  // screenshot that all 3 rows still fit with the last row close to, but
  // not touching, the south edge.
  slideDuration: 0.24, // seconds for a lane pig to slide north into a gap —
  // snappier so repeated picking feels more constant/fluid, per feedback.
  flightDuration: 0.3, // seconds for a picked pig to fly from its queue
  // spot onto the belt, drag-and-drop style, riding along with its fiche
};

export const PIG = {
  ammoStart: 20,
  ammoPirate: 40, // the rare pirate variant. Double, not a small bump: the
  // point of a rare pick is that taking it CHANGES the run, and a 25%
  // bonus would be noise against the jitter in how many shots actually
  // land. // shots a pig starts with (fixed, matches reference)
  speed: 10.5, // world units / second along the belt for the actual
  // pig+tile rig. Previously tied 1:1 to TRACK.arrowSpeed ("same physical
  // surface, same speed") — feedback this pass explicitly asked to BREAK
  // that coupling: the arrows should move slower/smoother while the
  // riding pig+tile move even faster, so this is now intentionally higher
  // than TRACK.arrowSpeed below (the arrows are a separate decorative
  // "flow" cue, not a literal speed reference for the riders anymore).
  // Bumped again in v1q (8.5 -> 10.5) alongside a shorter TILE.enterDuration
  // to keep overall placement cadence feeling faster even though
  // PIG.minBeltGap (below) had to grow for correctness that same pass.
  fireIntervalBase: 75, // ms, base pacing between shots (was 90 — kept in
  // step with the faster belt so shots don't look sparse against it)
  fireIntervalJitter: 50, // ms, random +/- added per shot for a livelier cadence
  ammoLabelHeight: 0.62, // local Y of the ammo sprite on the pig model — sits
  // on the flat of the back, just BELOW the ears (were floating well above
  // the head at 1.05), per feedback; used for queue AND belt pigs alike.
  projectileSpeed: 30, // units / second, travel from nose to target — much
  // faster shots (was 16), matching the reference's pacing.
  projectileArcHeight: 0.55, // world units, peak height of the shot's arc
  projectileRadius: 0.42, // much bigger/more visible shot (was 0.13)
  projectileTrailLength: 1.1, // world units — length of the tapering "comet
  // tail" cone trailing behind each shot; its BASE width now exactly
  // matches projectileRadius (see main.js) so the trail reads as a
  // continuation of the shot itself, not a separate skinnier shape.
  losBlockRadius: 0.42, // half-width of the "can an opposite pillar block this
  // shot" test — roughly one pillar footprint, so only a pillar actually
  // standing in the way (not just nearby) counts as an obstruction.
  inwardOffset: 0, // fixed local yaw applied to the pig model relative to its
  // fiche, so the nose faces the board (inward) instead of along the
  // fiche's direction of travel — see headingFromTangent in main.js.
  minBeltGap: 2.55, // TIGHTENED, and the number is derived rather than
  // dialled: a boia's outer radius is BOIA_RADIUS + BOIA_TUBE = 1.19, so
  // two of them touch at 2.38. This sits just above that — the boias run
  // nearly nose to tail without ever overlapping, which is exactly the
  // "espaço entre boias bem menor, mas nunca sobrepondo" ask. Anything
  // below 2.38 is not a tuning choice, it is an overlap bug.
  minBeltGapWas: 2.9, // minimum arc-length distance kept between two pigs on
  // the belt so a slower/blocked pig ahead never gets bumped into. REAL BUG
  // fixed in v1q: this stayed at 1.6 while TILE.depth grew to 2.6 across
  // v1o/v1p, so two tiles at the old minimum gap could physically overlap
  // each other on the belt — raised comfortably above TILE.depth. Placement
  // cadence (how soon a new pig can enter after the one ahead of it) is
  // compensated below via a faster TILE.enterDuration and a higher speed so
  // it still feels quicker overall, per feedback ("tempo de colocar porcos
  // ... menor, porem respeitando de um tile n ficar sobre o outro").
  beltScale: 3.2, // pigs render 3.2x their base size once riding the belt
  // (was 2x). Feedback asked for the belt pig+tile pair to be "4 vezes
  // maior" keeping their proportion — read literally, a 4x tile forces
  // TRACK.width (and therefore the camera's whole view width) to grow to
  // still carry it, which shrinks the checkerboard right back down, i.e.
  // fights the SAME message's bigger and more repeated ask ("estrutura
  // xadrez maior"). Picked a smaller-but-still-clearly-bigger multiplier
  // instead so the grid could grow too — flagged explicitly in the log.
};

export const TRACK = {
  // Distance of the belt loop's centerline from the grid edge — now SPLIT
  // per axis instead of one uniform margin, per feedback ("quero a esteira
  // em um formato retangular ao invés de quadrado ... laterais leste e
  // oeste mais próxima da estrutura xadrez e a parte norte e sul mais
  // ligeiramente mais distantes"). marginX (east/west sides) is pulled in
  // close to the grid; marginZ (north/south) is pushed out further, which
  // is what turns the loop from a square into a portrait rectangle while
  // corner rounding (cornerRadius below) stays shared/uniform so the turns
  // themselves still look consistent. The extra room on the north/south
  // sides is deliberately "wasted" space for now — reserved per feedback
  // for some future structure ("deixando um pouco mais de espaço interno
  // para eu poder trabalhar alguma estrutura futuramente").
  // marginX grown back up (was 1.0) — **real bug fixed**: with the belt's
  // own width at 3.0 (half-width 1.5), a marginX smaller than 1.5 meant the
  // belt band's INNER edge geometrically crossed 0.5 units into the grid's
  // own footprint, so the belt ribbon was literally overlapping the corner
  // pillars nearest it — per feedback ("quero liberar um pouco de espaço
  // para q nenhum pilar da estrutura em xadrez esteja tocando ou em cima da
  // esteira"). Now comfortably clears the belt's own half-width with room
  // to spare, and also directly satisfies "quero a esteira ganhando mais
  // espaço nas horizontal" (TRACK.width itself is untouched, so the belt's
  // own thickness is unchanged — only the loop grew).
  marginX: 1.9,
  marginZ: 2.6,
  width: 3.0, // belt centerline path width (visual ring thickness) — scaled
  // up the same 15% as margin/cornerRadius this pass (was 2.6), per
  // feedback ("mantendo a proporção da espessura da esteira") — the belt
  // grows as a whole, keeping the same thickness-to-loop-size ratio rather
  // than changing its own proportions.
  height: 0.22, // belt slab height — "leve altura" per reference sketch
  cornerRadius: 3.0, // rounded-corner radius — scaled up the same 15% as
  // width/margin this pass (was 2.6) to keep it proportional to the belt's
  // new overall size; the previous pass pulled this down hard to match a
  // Photoshop reference's squarer corners (~77px), validated then via a
  // scale-matched pixel comparison — this pass just grows that same
  // validated shape uniformly rather than changing its proportions again.
  // The belt mesh is a single lofted ribbon that samples the true curve
  // directly (see buildTrackVisual in main.js) rather than rotated box
  // segments, so this radius is a free visual choice with no
  // self-overlap/z-fighting risk even at a small value like this.
  segmentLength: 0.18, // sampling interval along the path for the lofted
  // belt ribbon (main.js) — small enough that the curve reads as a true
  // smooth arc rather than a visibly faceted polygon.
  arrowCount: 10, // total crawling direction arrows spread along the loop
  arrowSpeed: 3.2, // units/second the direction arrows crawl along the belt —
  // slowed down again this pass (was 4.2), per feedback ("setas ...
  // se movendo mais suavimente") — intentionally SLOWER than PIG.speed and
  // no longer tied to it. Arrows are purely a decorative "flow direction"
  // cue now, independent of the actual rider speed.
  arrowFadeZone: 0.6, // world units, over how much distance an arrow wipes
  // in/out at the entry gap's edges instead of popping in/out abruptly
  entryGapPadding: 0.15, // world units of extra clearance kept clear on each
  // side of the entry-corner arc — this is the literal ABSENCE of belt
  // track at the bottom-left corner where the fiche stack lives.
  rideClearance: 0.12, // extra world units of headroom above the belt slab
  // + arrows before a fiche's own bottom face, so riding fiches never
  // clip into the belt or the direction arrows.
};

export const TILE = {
  // The physical "ficha" (chip/tile) each active pig rides on top of while
  // on the belt — this is what actually occupies belt capacity; the pig is
  // just cargo riding along for the trip. Same geometry AND now the same
  // single color everywhere (stack + belt rig, regardless of which color
  // pig rides it) — per feedback, these will all eventually just be
  // identical wood-raft props, so there's no reason for them to be tinted
  // by the rider's team color today.
  width: 2.6, // slightly bigger again this pass (was 2.4), per feedback
  // ("quero os tiles ligeiramente maiores").
  depth: 2.6,
  height: 0.6, // noticeably thicker this pass (was 0.4), per feedback
  // ("e mais grossos") — also drives the visible gap between layers in the
  // pile now (see PILE_GAP/STACK_PILE_STEP in main.js).
  cornerRadius: 0.24, // nudged up slightly to stay proportional to the
  // bigger width/depth above (was 0.22).
  // Reskinned as a life-ring stack per the brief ("Pilhas de Boias: as
  // pilhas laterais de boias vermelhas e brancas servem como elementos de
  // marcação/interface espacial e contadores") — this pile IS that counter
  // prop already (it's what the "X/5" label sits next to). Kept the same
  // flat riding-platform geometry (it doubles as the belt-riding tile, so
  // it can't become a true torus without breaking that job) and applied a
  // red/white life-ring stripe texture instead (see buildLifeRingTexture in
  // main.js) — a real torus-shaped DECORATIVE pile (visually separate from
  // the riding tile) is flagged as a follow-up polish pass.
  color: 0xe6402c, // v2: classic buoy red (was white-with-stripe-texture) —
  // see COLORS.boiaRed. The tile is now built as a true torus/donut ("boia")
  // in main.js (buildBoiaMesh) instead of a flat textured box, per the v2
  // brief — it still shares these same TILE.width/height/depth dimensions
  // as its overall footprint so the pile-stacking math (PILE_GAP/
  // STACK_PILE_STEP) and the belt-riding-platform role don't need to change.
  stripeColor: 0xffffff, // WHITE, and thicker (see boiaBandGeo in main.js):
  // a life ring is red and white, and the yellow band was reading as a
  // third team colour on a prop that belongs to neither team. // was (was
  // the life-ring texture's white stripe) — see COLORS.boiaYellow.
  enterDuration: 0.11, // faster push-on, so picks can be chained quicker // seconds for the "push fiche onto the belt" entry
  // tween — shortened again in v1q (was 0.28) so a new pig can start riding
  // sooner after being picked, per feedback ("tempo de colocar porcos ...
  // menor") — paired with PIG.minBeltGap growing for correctness above, so
  // the net effect is still a faster-feeling cadence despite pigs needing a
  // bigger gap once actually on the belt. Still an ease-IN in main.js so
  // the tile is already at full speed the instant belt movement takes over.
};

export const TRAY = {
  // The "X/5" capacity label — a flat sprite sitting on the floor just
  // south (below, on screen) of the tile row, sized bigger than before so
  // it reads clearly on its own, per feedback ("quero o numero 5/5 esteja
  // maior e abaixo dessa fila").
  widthMatchesTile: true,
};

export const SELECTED_SLOTS = {
  // The 5-slot row between the belt and the queue. Per feedback these no
  // longer show a picked pig's thumbnail/ammo at all — they're reserved
  // for a future quick-action item system, so for now they just render as
  // empty placeholder cards (kept in index.html/CSS) and the game logic
  // ignores them entirely visually (belt capacity/ammo bookkeeping still
  // happens internally, just isn't drawn here anymore).
  gapPercent: 5,
};

export const LIGHTING = {
  // A single fixed directional light standing in for a low afternoon sun,
  // coming from one side so 3D props/pigs/pillars read with a visible cast
  // shadow.
  sunColor: 0xffe6b8, // warmer: the brief asks the scene to drift toward a
  // tropical late afternoon without going dark, so the WARMTH comes from
  // the light rather than from repainting every material.
  sunPosition: { x: 5.5, y: 15.5, z: -5.5 }, // raised: a 45-degree sun threw
  // a shadow as long as the caster is tall, which at penguin scale buried
  // the silhouette. Higher elevation keeps the contact shadow readable
  // while shortening the throw. // v1r: moved to screen top-right
  // ("canto superior direito"/nordeste), per feedback asking for a fixed
  // semi-isometric sun casting a shadow toward the southwest — screen-right
  // ~= world +X and screen-top ~= world -Z here, so top-right is (+X, -Z).
  // This time the two halves of the feedback actually agree (unlike the
  // previous pass's sun-position-vs-shadow-direction request): a light at
  // top-right casts its shadow toward the diagonally opposite corner,
  // bottom-left/southwest, which is exactly what was asked for. Same
  // magnitude/elevation as before (x==z in absolute value keeps the 45°
  // isometric elevation the feedback explicitly wants), just the sign of z
  // flipped to move the light from the SE corner to the NE one.
  // ---- LIGHT BUDGET: why these sum to ~PI ----
  // three.js shades diffuse through BRDF_Lambert, which divides by PI. So
  // the actual multiplier a material color sees is
  //     (ambientIntensity + sunIntensity * toonBand) / PI
  // and a budget summing to PI (~3.14) is what makes an authored color
  // render as roughly THAT color — which is the entire premise of picking
  // flat cel colors by eye.
  //
  // This was measured, not assumed, after a long detour: an earlier pass
  // read the washed-out water as "3x over-exposure" and dropped the sun
  // hard to compensate. That model was wrong by exactly a factor of PI —
  // the original 2.1 + 0.9 budget was already almost perfectly neutral
  // (3.0 / PI = 0.955), and cutting it to 1.55 made everything render at
  // HALF its authored value, which then got chased with brighter and
  // brighter material colors that never quite worked. Rendering a pure
  // (1,0,1) magenta through the water material and reading back 186 rather
  // than 255 is what pinned it down: 1.55 / PI = 0.49, exactly the shortfall.
  //
  // The split between the two is the only real choice left, and it sets the
  // shadow depth: shadowed surfaces get ambient only, so lit/shadow here is
  // ~1.8x — a soft, high-key look, matching the reference art where cast
  // shadows are barely present.
  sunIntensity: 1.35,
  ambientIntensity: 1.75,
  shadowIntensity: 0.35, // softens shadows further still; the reference has
  // essentially no dark cast shadow anywhere on the water.
  shadowMapSize: 768, // 1024 -> 768. The shadow pass turned out to be a
  // meaningful share of the frame (see the half-rate note in main.js), and
  // its cost is quadratic in this number: 768 is 44% fewer texels than
  // 1024. These are soft, low-contrast cartoon shadows on a phone-sized
  // frame — the resolution was never what made them read.
  shadowIntensity: 0.35, // v2b: shadows at full strength were fine when the
  // seabed sat 0.3 below the props, because every shadow landed right under
  // its caster. With the seabed pushed to WATER.seabedY for real depth, the
  // big casters (the dock, the belt ring, the grid) started throwing hard
  // dark bands across the open sand, which dominated the frame and read as
  // dirt rather than as shadow. Softening every shadow keeps BOTH halves of
  // the double projection visible (the point of the depth stack) while
  // letting the water color, not the shadows, set the bay's tone.
};

export const DEATH_ZONE = {
  // A dedicated "hole" prop at the belt's kill-zone point (the far end of
  // the visible track span, right next to the entry gap where the fiche
  // stack lives) — pigs that run the loop and reach it now visibly
  // sink/shrink into this hole instead of just vanishing. Placeholder only
  // — a whirlpool/trash-can prop can replace this mesh later without
  // touching the space or the fall animation.
  sizeMultiplier: 1.2, // relative to TRACK.width (was relative to
  // TILE.width/depth) — per feedback ("quero q a área preta que acaba a
  // esteira tenha a extensão compatível com a grossura da esteira"), the
  // hole's footprint should read as belonging to the belt's own thickness,
  // not the tile riding over it. 1.2x keeps it a touch more generous than
  // the belt's bare width for legibility, without ballooning independently
  // of it the way the old tile-relative sizing could.
  // Reskinned as a whirlpool per the brief ("Um redemoinho suave posicionado
  // no final da esteira") — deep teal instead of near-black, with a
  // procedural spiral texture (see buildWhirlpoolTexture in main.js) rather
  // than a flat void disc. Flagged for a later pass: this is a static
  // texture, not an animated/rotating swirl or particle foam yet.
  color: 0x14464f, // deep teal funnel wall
  fallDuration: 0.36, // seconds for a pig to sink+fade into the hole (now
  // also spins while doing so, per v1q feedback — see main.js).
  despawnDuration: 0.5, // NEW in v1q: seconds for the "ammo ran out mid-ride"
  // despawn animation (spin + elastic shrink/fade in place, instead of the
  // pig just vanishing instantly) — see main.js's 'despawning' pig phase.
};

export const FONT = {
  // A rounder, more casual display font for in-scene text (ammo count,
  // "X/5" tray label), with a comic-style stroke outline drawn on the
  // canvas itself (stroke pass, then fill pass) rather than a fixed image
  // asset — works as a "dynamic" border on any string/number.
  family: "'Fredoka', 'Segoe UI', sans-serif",
  strokeWidth: 14, // thicker (was 9) to match the bigger canvas resolution
  // below — feedback said the previous pass's text was nearly unreadable
  // on an actual phone screen.
};

// ---------------------------------------------------------------------
// STYLED_FOF_VERSION reskin palette. v2 (this pass) moves the theme from
// "harvest table" (meat/bone) to a Caribbean shallow-reef bay per the
// second art brief — see ai_logs/styled_v2_coral_torus_penguin_boat_water_
// pass.txt. pillarWhite/pillarBlack, pigWhite/pigBlack etc. keep their
// original field NAMES (referenced all over main.js as team/part IDs) but
// now mean "soft sponge/algae" / "rigid coral" and "penguin dark/light
// plumage" respectively — only the color VALUES (and, in main.js, the
// geometry) changed.
// ---------------------------------------------------------------------
export const COLORS = {
  // ---- v2e: palette rebuilt directly off the client's layer breakdown ----
  // The reference is HIGH-KEY: a pale khaki seabed, a soft mint/turquoise
  // water wash over it, and near-white caustics on top. Almost nothing in
  // it is dark or saturated — the contrast budget is spent entirely on the
  // white caustic web and on the props, which is what keeps the gameplay
  // pieces reading on a phone. Earlier passes here drove the water toward
  // deep saturated blue; that fights the reference on both counts, so the
  // whole ramp was re-derived rather than nudged.
  //
  // Remember the 3x exposure note in LIGHTING: these are authored to land
  // on target AFTER lighting, so they read darker here than on screen.
  background: 0x8fd3cf, // matches the shallow water, so the bay can run to
  // the frame edge with no visible rim (the reference has no border of
  // deeper water anywhere).
  floor: 0xe4b478, // warm sand: the recipe starts here, and every layer
  // above is transparent enough that this tone sets the whole bay // pale khaki sand — the reference's step 1 exactly. Not
  // a warm beach yellow: it is a desaturated sage, which is what lets the
  // mint water wash sit on it without going grey.
  track: 0xaeddd2, // the current is nearly white in the reference, not a
  // turquoise channel — see TRACK notes and the brush-streak texture.
  trackArrow: 0xffffff,
  // Gameplay teams: green + purple, unchanged from the last pass.
  pillarWhite: 0x22d8f5, // matched to shotCyan, deliberately // PLASTIC litter: PET bottles, pale bottle-blue // sponge: yellow-green, varied per instance // SOFT team: tube sponges in PINK, per the
  // client reference photo.
  pillarBlack: 0xff4fa8, // matched to shotOrange, deliberately // METAL litter: aluminium cans, cool grey // coral: wine-rose, varied per instance // RIGID team: hard coral, warm red — the color it
  // has in both of the client's target frames.
  // The bird itself is DEEP SLATE-NAVY for both squads now, not blue.
  // Two reasons, and the second is the important one:
  //  - a blue penguin on blue water was competing with its own
  //    background, which is the same problem the old blue team colour had;
  //  - with the crews recoloured to magenta and green, a blue body was a
  //    THIRD hue on a character whose whole job is to announce one of two.
  //    A near-neutral body lets the gear carry the team read unopposed,
  //    which is also how the reference art handles it.
  // The BIRD, matched to the Fish of Fortune moodboard: a vivid, saturated
  // mid blue, not a navy. Both squads share it — the team is told by the
  // bandana and the gear, never by the body, which is what keeps one
  // mascot across the whole game instead of two characters.
  pigWhite: 0x2f9ae8, // both squads are the SAME blue bird now, per the
  // concept sheet — the team read comes from the hat and gear, not from
  // the body, so the character stays one recognisable mascot.
  pigBlack: 0x2f9ae8,
  pigEarWhite: 0x22d8f5, // PLASTIC crew: vacuum, strong cyan // PLASTIC crew: vacuum, blue gear // squad matched to the yellow-green sponges // ORANGE squad -> shoots the orange sponges // SPONGE CLEANER squad — green gear
  // (`pigEarWhite`/`pigEarBlack` keep their field names: every call site
  // and animation refers to them, and only the meaning changed.)
  // METAL crew, now VIVID PURPLE — almost pink. The yellow it replaces was
  // nearly the same value as the golden-hour key light, so at sunset the
  // whole crew dissolved into its own lighting; purple is the one strong
  // hue that no time-of-day stop uses, so it holds at every hour.
  pigEarBlack: 0xff4fa8, // METAL crew: magnet, red gear (a magnet is red) // squad matched to the wine-rose corals // GREEN squad -> shoots the green corals // CORAL BREAKER squad — orange gear
  snout: 0xff9426, // beak AND feet: one saturated orange, straight off the
  // moodboard. It is the only warm accent on the bird, which is why it
  // survives at thumbnail size against blue water.
  eye: 0x14162a,
  leg: 0xf5a03c, // feet
  belly: 0xa8e0fa, // pale belly oval, a lighter tint of the body blue
  cap: 0xfbfdff, // the white bandana both squads wear, tinted per team
  helmet: 0xffe14d,
  backpack: 0x3d6b8a,
  tube: 0x9fd8e0,
  weapon: 0xe8e2d6,
  magnetBody: 0xff4fa8, // horseshoe magnet: red yoke, silver poles — the
  magnetTip: 0xd8dee6, // shorthand everyone already reads as "magnet"
  // The two shot colours. Picked far apart in hue on purpose: this is the
  // only cue saying which crew a pellet in mid-air belongs to when several
  // are crossing the board at once, and two blues would not carry it.
  // TEAM COLOURS, second revision. The crews were orange vs blue; they are
  // now MAGENTA-VIOLET vs GREEN-CYAN. The field names still say
  // orange/cyan because every call site reads them by name — renaming them
  // would touch a dozen files to say the same thing.
  //
  // The swap is also a better fit for the setting than the one it
  // replaces: the sea is blue, and a blue team on blue water was competing
  // with its own background. Magenta and spring-green are both far from
  // the water's hue, so each reads at a glance, and they sit almost
  // opposite each other on the wheel, which is what keeps the two apart
  // for a colour-blind player as well as by hue.
  // Both pushed one step around the wheel and held at high chroma. The
  // pair still sits almost opposite (spring-green vs amber), which is what
  // keeps the two teams separable, but neither is now a near-neighbour of
  // the water's blue — the old cyan was, and on a blue sea a cyan team is
  // fighting its own background for attention.
  // MAGENTA-PINK leaning warm, replacing the purple. Purple sat next to
  // the night sky's own blue-violet and lost its identity after dusk;
  // magenta has no neighbour anywhere in the time-of-day table.
  shotOrange: 0xff4fa8, // magnet crew
  shotCyan: 0x22d8f5, // vacuum crew — strong cyan
  nail: 0x3f4f66, // dark bluish gunmetal for the nail — still a cartoon
  // flat tone, just the darkest one in the character palette.
  trayBody: 0x1f8f96,
  trayCardEmpty: 0x2fb3ba,
  projectileWhite: 0xfff0e0,
  projectileBlack: 0xeaf7ff,
  projectileGlow: 0xffffff,
  boiaRed: 0xe6402c,
  boiaYellow: 0xfaf6f0, // the boia is RED AND WHITE, per the reference —
  // field name kept because every call site refers to it.
  // ---- water ----
  waterShallow: 0x38c8ef, // saturated, and BLUE rather than mint: the
  // shallow tone was drifting green over warm sand, which pulled the whole
  // bay toward grey-green // reads as pale mint where the water is thin
  waterDeep: 0x0b62c8, // a real deep blue, so the depth bands actually
  // read as depth instead of as two shades of the same turquoise // reads as soft turquoise at full depth. The two are
  // deliberately CLOSE together: the reference's depth variation is a gentle
  // wash, not the hard shallow/deep split of the previous pass.
  waterFoam: 0xffffff,
  currentUnderflow: 0x1c4a86, // deep navy, carried at low opacity: the
  // current is a body of moving water, and what makes one visible from
  // above is that it is DARKER than the water around it, not whiter
  waterFoamShade: 0xc2d6ea, // the ~10%% NAVY tone in the foam
  waterFoamViolet: 0xd2ccee, // the ~10%% blue-violet tone
  waterFoamShadeOld: 0xcfe9e4, // the COOL half of the foam. Foam is shaded
  // between this and pure white by a slow, large-scale sample, so the web
  // has internal variation instead of reading as one flat sticker. // the white caustic web + contact foam
  // ---- seabed decor (reference step 2): small flat starfish and anemone
  // clusters, sparse, in candy colors that never appear on a gameplay piece
  // so they cannot be mistaken for one.
  seabedReefCoral: [0xff6a55, 0xffab3c, 0xffd447, 0xd95fc4, 0x8a6fe8, 0x4fd8e8, 0xf2477f, 0xff8f4a],
  seabedAlgae: [0x3fae56, 0x7cc44a, 0x2f8f6a, 0x9bd15e, 0x2fbf8f, 0xb6d94a],
  seabedRock: [0x8e8fa0, 0x7a7b8c, 0xa39c94, 0x6f7686],
  seabedStar: [0xe8558f, 0xf27fb0, 0xd0455f, 0xffb347, 0x7f6fe0],
  seabedAnemone: [0x4a6fd0, 0x3fa9c9, 0x7a5fd0, 0xc74a63, 0x2f8fa8, 0xe0643f, 0x36c48a],
  // ---- boat ----
  // DARKER, and warmed toward rose. A pale tan boat under a bright sky was
  // the lightest large mass in the frame after the foam, so it kept pulling
  // the eye down to the dock and away from the board. Dropping its value
  // puts it back where a foreground frame belongs, and the rose in the
  // brown is what stops the darker wood reading as grey mud.
  boatHull: 0xa8705a, // rosewood gunwale
  boatDeck: 0x6f4433, // deep walnut planking
  boatTrim: 0xc98a78, // dusty rose trim
  fishSchool: [0x4fb3e8, 0xf2a03c, 0xe86a9c, 0x63d8c6, 0xf5d24a],
  shark: 0x8fa3b0, // pale grey-blue: it has to read as a silhouette THROUGH
  // the water tint, so a true shark grey would just vanish into the bay.
  hammerhead: 0x7d94a8, // a touch darker than the plain shark, so the two
  // are separable even when the cephalofoil is edge-on to the camera
  sawfish: 0xa8a08c, // sandy: a sawfish is a ray, and rays are bottom
  // dwellers coloured to match the bed they lie on
  whale: 0x5b7a96,
  whirlpool: 0x2c3550,
  whirlpoolDeep: 0x123b47, // the throat: the darkest value in the scene, but
  // a deep TEAL rather than black — a black well reads as a rendering bug
  // in a bright cartoon frame. // the reference's whirlpool is a dark slate-navy
  // disc — the single darkest value in the whole frame, which is what makes
  // it read as a hole rather than as a patch of water.
};

// ---------------------------------------------------------------------
// CRYSTALLINE SHALLOW-WATER DEPTH STACK + TOON WATER SHADER
//
// There must be a REAL vertical distance between the seabed and the water
// surface, so the bay reads as a column of clear water you look down
// through. Everything gameplay-related stays at y~0 (the surface); what
// moved is the SAND, pushed far DOWN — pushing the surface up instead
// would have moved the whole game plane and broken every layout value
// tuned across the V1 passes.
//
//   y ~ 0.0    gameplay plane (belt, boias, penguins, coral tips)
//   surfaceY   the toon water shader: depth gradient + caustic web + foam
//   ...        open water column: coral stems hang here, visibly submerged
//   seabedY    the pale sand bed + its decorative starfish and anemones
//
// The gap buys the parallax: a directional light throws each prop's shadow
// onto BOTH the surface and the sand far below, and the two land at
// visibly different screen positions. That offset is the depth cue, and it
// comes free from the light — but only if the gap is big enough to see.
// ---------------------------------------------------------------------
export const WATER = {
  seabedY: -1.55, // measured, not guessed: the sun sits at 45 degrees, so a
  // prop's seabed shadow lands `seabedY` world units diagonally from its
  // surface shadow. At -2.4 that turned the big casters (the dock, the
  // grid) into shadow smears spanning half the frame; -1.7 keeps the two
  // shadows clearly separate while still reading as one object's pair.
  causticsY: -1.62,
  surfaceY: -0.06, // a hair BELOW the gameplay plane, so every prop reads
  // as floating ON the surface rather than sunk into it.

  // ---- toon water shader (see the injection in main.js) ----
  maxDepth: 1.45, // REACHED SOONER. At 2.1 the play area sat in the first
  // depth band for its whole width, so the bay rendered almost entirely in
  // the shallow tone and the deep blue only appeared in the far corners —
  // the gradient existed but was never seen. Pulling the far end of the
  // ramp inward is what actually makes the water read blue. // world units of depth that maps to the fully "deep" color
  foamDistance: 0.34, // how far from an intersection the foam band reaches.
  // Deliberately small: the visible THICKNESS of a contact edge comes from
  // the depth dilation below, not from this. Raising this instead floods
  // every shallow area (the whole dock end of the bay) with white.
  foamCutoff: 0.52, // vestigial: the network is a Voronoi partition now,
  // not a threshold on a noise field, so nothing reads this. Kept only
  // because the uniform is still declared.
  foamSoftness: 0.03, // thinner again: the line is now carried by grain
  // modulation along its length rather than by sheer width // THE BORDER HALF-WIDTH, in cell units — this is the
  // single number that decides whether the surface reads as Wind Waker
  // water or as a spider web on blue. The reference's white borders are
  // about a tenth of a cell across, and because the stroke has constant
  // width, this is also what rounds the junctions: a thick stroke through a
  // three-way meeting merges into a round blob by itself.
  foamDilatePixels: 8.0, // screen-space radius the depth buffer is dilated
  // by before the foam threshold reads it. Expressed in PIXELS on purpose:
  // a coral stem is a vertical cylinder, so the depth gradient at its edge
  // is a cliff and an undilated foam band comes out 1-2 px wide — invisible
  // on a phone. Dilating pushes the "shallow" reading outward from every
  // silhouette by a fixed number of pixels, which is the right unit when
  // the requirement is about what a thumb-sized screen can resolve.
  foamNoiseScale: 0.19, // one Voronoi cell every ~7.4 world units, so a
  // cell is a bit over two queue penguins wide — the proportion the
  // reference tile shows, and coarse enough to survive a phone screen. // noise-domain scale; sets how big the cells are // large cells: more blue than white, per the brief // one texture tile every 16 world units; the tile
  // holds 5 cells, so each caustic cell is ~3.2 units across — about one
  // queue penguin wide, which is the proportion the reference strip shows.
  foamNoiseAspect: 1.0, // round cells, no stretching
  foamScroll: { x: 0.004, y: 0.007 }, // the net barely drifts; almost all
  // of its motion comes from the animated domain warp instead
  distortAmount: 0.034, // UV warp on the foam lookup, so the web breathes
  // instead of sliding rigidly
  distortScroll: { x: 0.0088, y: -0.0055 },
  shallowAlpha: 0.2, // BACK DOWN. The last pass raised these to make the
  // water read blue, and it did — by hiding the seabed, which is the one
  // thing the whole depth stack was built to show. The blue now comes from
  // the tones themselves and from maxDepth being reached sooner, not from
  // painting over the sand. // more crystalline // LOW, per the recipe: the bed, the reef and the // more crystalline: the seabed, its reef and the
  // fish swimming under it all have to stay clearly legible through the
  // water, which is the whole payoff of building the depth stack. // the sand and the submerged coral stems have to stay
  // clearly readable through the water
  deepAlpha: 0.46, // enough tint for the cells to read BLUE against the
  // white network, while the bed still shows through // fish all have to stay clearly visible through it
  depthBands: 4.0, // cel quantization of the depth gradient, keeping the
  // water in the same visual language as the 3-tone ramp on every other
  // material. The two water colors sit close together on purpose, so this
  // reads as the reference's gentle wash rather than a hard split.

  causticsOpacity: 0.2, // very low: a style layer, not a feature // the separate additive caustics sheet is retired:
  // in the reference the seabed's own "reflexo na areia" is a low-contrast
  // sand-on-sand cell pattern (baked into the sand texture now), while the
  // bright caustics live on the SURFACE, which is the shader's foam layer.
  // Two competing caustic layers just muddied each other.
  causticsRepeat: 4.2, // much larger and softer than the surface web: this
  // is the diffuse light patch ON the sand, not the sharp surface caustic.
  causticsScroll: { x: 0.0077, y: -0.0055 },

  // The bay runs past the frame on every side — the reference has no rim of
  // deeper water anywhere, so the radial fade only kicks in well offscreen.
  bayWidth: 150,
  bayDepth: 190,
  bayCenterZ: 10,
  bayFadeStart: 0.72,
  sandRepeat: 11,

  depthScale: 0.5, // the depth pre-pass renders at half the drawing
  // buffer's resolution: the water reads it only to pick a color band and a
  // foam threshold, both already stylized, so full resolution buys nothing
  // visible while costing an extra screen of fragments every frame.
  currentFoamScroll: 0.42, // much faster: the channel has to read as moving
  // water, and at the old rate it read as a painted stripe
  decorClusters: 130, // the reef is the payoff for clearing the board, so
  // it has to be worth uncovering
};

export const SOUND = {
  // First pass at SFX — every clip is a tiny procedurally-generated blip
  // (Web Audio oscillator/noise envelopes, see sound.js), NOT final audio,
  // just placeholders so every core interaction already has a sound hook
  // wired up before real SFX exist.
  enabled: true,

  // A THREE-STAGE MIX, not one volume. Every voice used to multiply
  // masterVolume itself, which meant balancing music against effects was
  // impossible without editing every call site — and that music and
  // effects could only ever move together.
  masterVolume: 0.62,
  musicVolume: 0.34, // the loop sits UNDER the game: it is a bed, not a
  // performance, and at gameplay length anything louder becomes the thing
  // the player is listening to instead of the thing they are playing
  sfxVolume: 0.75,

  gameplayTrack: 'audio/isle_of_joy.mp3',
  victoryTrack: 'audio/tropical_victory.mp3',
};
