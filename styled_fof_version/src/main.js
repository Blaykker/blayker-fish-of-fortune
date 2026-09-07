import * as THREE from 'three';

// --- Setup base ------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 6, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Lighting (primitives only, but lighting is still allowed) -------
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(3, 8, 4);
scene.add(dirLight);

// --- Sanity-check cube -------------------------------------------------
// This is the "first cube on screen" milestone. Replace/extend this with
// the actual track + carrier mechanic in v1 (see /ai_logs and README).
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshStandardMaterial({ color: 0x00c2ff })
);
cube.position.y = 1;
scene.add(cube);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x2b2b45 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// --- Score UI placeholder (wire this into real game state in v1) -----
let score = 0;
const scoreEl = document.getElementById('score');
function setScore(v) {
  score = v;
  scoreEl.textContent = String(score);
}
setScore(score);

// --- Render loop -------------------------------------------------------
const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  cube.rotation.y += dt * 0.8;
  cube.rotation.x += dt * 0.3;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
