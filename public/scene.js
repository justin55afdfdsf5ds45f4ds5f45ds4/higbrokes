// PLAYGROUND ARENA — AI Agent Platform with Server-Driven Games
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ============================================================
// SCENE
// ============================================================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080812, 0.012);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 4, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('scene-container').appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.0, 0.4, 0.2));

// ============================================================
// CONTROLS + CAMERA
// ============================================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.95;
controls.minPolarAngle = 0.05;
controls.enablePan = false;
controls.zoomSpeed = 1.5;

const CAM_MODES = ['ORBIT', 'FIRST_PERSON', 'TOP_DOWN', 'CINEMATIC'];
let camModeIdx = 0, camMode = 'ORBIT';
let fpYaw = 0, fpPitch = 0, pointerLocked = false;

document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === renderer.domElement; });
renderer.domElement.addEventListener('click', () => { if (camMode === 'FIRST_PERSON' && !pointerLocked) renderer.domElement.requestPointerLock(); });

// Track mouse in NDC for orbit/topdown/cinematic block aiming
const mouseNDC = new THREE.Vector2(0, 0);
document.addEventListener('mousemove', e => {
  if (camMode === 'FIRST_PERSON' && pointerLocked) {
    fpYaw -= e.movementX * 0.003;
    fpPitch = Math.max(-1.2, Math.min(1, fpPitch - e.movementY * 0.003));
  } else {
    const rect = renderer.domElement.getBoundingClientRect();
    mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
});

// ============================================================
// LIGHTING
// ============================================================
scene.add(new THREE.AmbientLight(0x334466, 1.5));
const sun = new THREE.DirectionalLight(0xffeedd, 2);
sun.position.set(5, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sh = 20;
sun.shadow.camera.left = -sh; sun.shadow.camera.right = sh;
sun.shadow.camera.top = sh; sun.shadow.camera.bottom = -sh;
scene.add(sun);
const skyLight = new THREE.PointLight(0x00ffcc, 2, 30);
skyLight.position.set(0, 8, 0);
scene.add(skyLight);

// ============================================================
// CHARACTER FACTORY
// ============================================================
function createCharacter({ bodyColor = 0x2a2a3e, glowColor = 0x00ffcc, darkColor = null, bootColor = null, name = 'PLAYER' }) {
  const bMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.85 });
  const dMat = new THREE.MeshStandardMaterial({ color: darkColor ?? 0x1a1a28, roughness: 0.4, metalness: 0.9 });
  const gMat = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.3 });
  const vMat = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 2, roughness: 0.1 });
  const btMat = new THREE.MeshStandardMaterial({ color: bootColor ?? 0x222235, roughness: 0.5, metalness: 0.7 });

  const group = new THREE.Group();

  // Head
  const head = new THREE.Group();
  head.position.y = 1.55;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.28, 2, 2, 2), bMat); skull.castShadow = true; head.add(skull);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.02), vMat); visor.position.set(0, 0.02, 0.14); head.add(visor);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), gMat); antennaTip.position.y = 0.28; head.add(antennaTip);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.15, 4), gMat); antenna.position.set(0, 0.2, 0); head.add(antenna);
  group.add(head);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.28, 2, 2, 2), bMat); torso.position.y = 1.15; torso.castShadow = true; group.add(torso);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), gMat); core.position.set(0, 1.2, 0.15); group.add(core);
  const coreLight = new THREE.PointLight(glowColor, 1, 3); coreLight.position.set(0, 1.2, 0.2); group.add(coreLight);
  const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.22), dMat); abdomen.position.y = 0.82; group.add(abdomen);

  // Arms
  function mkArm(s) {
    const g = new THREE.Group(); g.position.set(s * 0.32, 1.32, 0);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.18), dMat); pad.castShadow = true; g.add(pad);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.28, 8), bMat); up.position.y = -0.18; up.castShadow = true; g.add(up);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), gMat); elbow.position.y = -0.34; g.add(elbow);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.28, 8), bMat); lo.position.y = -0.50; lo.castShadow = true; g.add(lo);
    return g;
  }
  const lArm = mkArm(-1), rArm = mkArm(1); group.add(lArm, rArm);

  // Legs
  function mkLeg(s) {
    const g = new THREE.Group(); g.position.set(s * 0.12, 0.72, 0);
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), dMat); g.add(hip);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.32, 8), bMat); up.position.y = -0.2; up.castShadow = true; g.add(up);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), gMat); knee.position.y = -0.38; g.add(knee);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.3, 8), bMat); lo.position.y = -0.55; lo.castShadow = true; g.add(lo);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.16), btMat); boot.position.set(0, -0.73, 0.02); boot.castShadow = true; g.add(boot);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.12), gMat); sole.position.set(0, -0.76, 0.02); g.add(sole);
    return g;
  }
  const lLeg = mkLeg(-1), rLeg = mkLeg(1); group.add(lLeg, rLeg);

  // Name label
  const cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = 64;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#' + new THREE.Color(glowColor).getHexString();
  ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
  ctx.fillText(name, 128, 40);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true, opacity: 0.8 }));
  label.position.set(0, 2.1, 0); label.scale.set(1.2, 0.3, 1);
  group.add(label);

  scene.add(group);
  return {
    group, name,
    parts: { head, torso, core, coreLight, visor, antennaTip, lArm, rArm, lLeg, rLeg },
    mats: { bMat, dMat, gMat, vMat, btMat },
    x: 0, y: 0, z: 0, vy: 0, angle: 0, grounded: true, speed: 0, walkPhase: 0,
  };
}

// ============================================================
// CREATE CHARACTERS
// ============================================================
const player = createCharacter({ bodyColor: 0x2a2a3e, glowColor: 0x00ffcc, name: 'YOU' });

// ============================================================
// ENVIRONMENT
// ============================================================
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x141422, roughness: 0.7, metalness: 0.3 })
);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
scene.add(new THREE.GridHelper(80, 80, 0x1a1a30, 0x101020));

// Platforms
const platforms = [
  { x: 6, y: 0.8, z: 4, w: 3, h: 0.3, d: 3 },
  { x: -5, y: 1.6, z: -6, w: 2.5, h: 0.3, d: 2.5 },
  { x: 0, y: 2.8, z: -10, w: 2, h: 0.3, d: 2 },
  { x: 8, y: 0.5, z: -3, w: 4, h: 0.3, d: 2 },
  { x: -8, y: 1.2, z: 5, w: 2.5, h: 0.3, d: 3 },
  { x: 3, y: 2, z: -5, w: 2, h: 0.3, d: 2 },
  { x: -3, y: 3.5, z: -12, w: 2.5, h: 0.3, d: 2.5 },
];
const platMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.5, metalness: 0.6 });
const platEdge = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.3 });
const platMeshes = [];
const platEdgeMeshes = [];

for (const p of platforms) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), platMat);
  m.position.set(p.x, p.y, p.z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  platMeshes.push(m);
  const e = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.1, 0.04, p.d + 0.1), platEdge);
  e.position.set(p.x, p.y + p.h / 2 + 0.01, p.z); scene.add(e);
  platEdgeMeshes.push(e);
}

// Trees
const treeMeshes = [];
function makeTree(x, z, sc) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * sc, 0.12 * sc, 1.2 * sc, 6), new THREE.MeshStandardMaterial({ color: 0x3a2510 }));
  trunk.position.y = 0.6 * sc; trunk.castShadow = true; g.add(trunk);
  for (const l of [{ y: 1.5, r: 0.8, h: 1 }, { y: 2.2, r: 0.6, h: 0.8 }, { y: 2.7, r: 0.35, h: 0.6 }]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(l.r * sc, l.h * sc, 6), new THREE.MeshStandardMaterial({ color: 0xbbccbb, roughness: 0.8 }));
    c.position.y = l.y * sc; c.castShadow = true; g.add(c);
  }
  g.position.set(x, 0, z); scene.add(g);
  treeMeshes.push(g);
}
[[-15,-8],[-18,0],[-15,8],[15,-8],[18,0],[15,8],[-10,-15],[0,-18],[10,-15],[-10,15],[0,18],[10,15]]
  .forEach(([x,z]) => makeTree(x, z, 0.7 + Math.random() * 0.8));

// ====== THE COURTROOM — Judge's Arena at (60, 0, 60) ======
{
  const cx = 60, cz = 60;
  const courtMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.8, metalness: 0.3 });
  const judgeMat = new THREE.MeshStandardMaterial({ color: 0x1a0a00, roughness: 0.5, metalness: 0.6 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xccaa00, emissive: 0xccaa00, emissiveIntensity: 0.15, roughness: 0.3, metalness: 0.8 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.6, metalness: 0.5 });

  // Floor — dark stone platform
  const courtFloor = new THREE.Mesh(new THREE.BoxGeometry(24, 0.3, 24), courtMat);
  courtFloor.position.set(cx, -0.05, cz); courtFloor.receiveShadow = true; scene.add(courtFloor);

  // Gold edge trim on floor
  const floorTrim = new THREE.Mesh(new THREE.BoxGeometry(24.2, 0.05, 24.2), goldMat);
  floorTrim.position.set(cx, 0.11, cz); scene.add(floorTrim);

  // Judge's bench — elevated platform at the back
  const judgeBench = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 3), judgeMat);
  judgeBench.position.set(cx, 1, cz - 9); judgeBench.castShadow = true; scene.add(judgeBench);

  // Gold strip on judge bench
  const judgeStrip = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.08, 0.08), goldMat);
  judgeStrip.position.set(cx, 1.95, cz - 7.55); scene.add(judgeStrip);

  // Judge nameplate
  const namePlate = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 0.1), goldMat);
  namePlate.position.set(cx, 1.6, cz - 7.52); scene.add(namePlate);

  // Gavel on judge bench
  const gavelHead = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x4a2800, roughness: 0.4 }));
  gavelHead.position.set(cx + 2.5, 2.1, cz - 8.5); scene.add(gavelHead);
  const gavelHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x3a1800 }));
  gavelHandle.position.set(cx + 2.5, 2.1, cz - 8.5); gavelHandle.rotation.z = Math.PI / 2; scene.add(gavelHandle);

  // Spectator benches — rows of seats
  for (let row = 0; row < 3; row++) {
    const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 1.2), railMat);
    benchSeat.position.set(cx, 0.4 + row * 0.3, cz + 4 + row * 2.5);
    benchSeat.castShadow = true; scene.add(benchSeat);
    // Bench back
    const benchBack = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 0.15), railMat);
    benchBack.position.set(cx, 0.9 + row * 0.3, cz + 4.55 + row * 2.5);
    scene.add(benchBack);
  }

  // Side railings
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 18), railMat);
    rail.position.set(cx + side * 11, 0.5, cz - 1); scene.add(rail);
    // Gold cap
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 18.2), goldMat);
    cap.position.set(cx + side * 11, 1.02, cz - 1); scene.add(cap);
  }

  // Pillars at corners
  for (const px of [-1, 1]) {
    for (const pz of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5, 8), railMat);
      pillar.position.set(cx + px * 11.5, 2.5, cz + pz * 11.5);
      pillar.castShadow = true; scene.add(pillar);
      // Gold ring on pillar
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 16), goldMat);
      ring.position.set(cx + px * 11.5, 4.8, cz + pz * 11.5);
      ring.rotation.x = Math.PI / 2; scene.add(ring);
    }
  }

  // Central arena floor marking — glowing ring
  const ringGeo = new THREE.TorusGeometry(5, 0.08, 8, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.4 });
  const arenaRing = new THREE.Mesh(ringGeo, ringMat);
  arenaRing.position.set(cx, 0.12, cz); arenaRing.rotation.x = -Math.PI / 2; scene.add(arenaRing);

  // Courtroom lighting
  const courtLight = new THREE.PointLight(0xffcc88, 1.5, 30);
  courtLight.position.set(cx, 6, cz); scene.add(courtLight);
  const judgeSpot = new THREE.SpotLight(0xffcc00, 2, 15, Math.PI / 6, 0.5);
  judgeSpot.position.set(cx, 7, cz - 8); judgeSpot.target.position.set(cx, 0, cz - 9);
  scene.add(judgeSpot); scene.add(judgeSpot.target);
}

// Crystals
const crystalMeshes = [];
function makeCrystal(x, z, h) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.25, h, 6),
    new THREE.MeshStandardMaterial({ color: 0x00ccaa, emissive: 0x00ccaa, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.8 })
  );
  m.position.set(x, h / 2, z); m.castShadow = true; scene.add(m);
  const l = new THREE.PointLight(0x00ccaa, 1, 5); l.position.set(x, h + 0.3, z); scene.add(l);
  crystalMeshes.push({ mesh: m, light: l });
}
[[12,8,1.5],[-12,-10,2],[8,-12,1.2],[-10,12,1.8],[0,14,1]].forEach(([x,z,h]) => makeCrystal(x,z,h));

// Arena ring
const arenaRing = new THREE.Mesh(
  new THREE.TorusGeometry(6, 0.05, 8, 64),
  new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.15 })
);
arenaRing.rotation.x = -Math.PI / 2;
arenaRing.position.y = 0.02;
scene.add(arenaRing);

// ============================================================
// AGENT HOMES — Massive unique territories for each agent
// ============================================================
const HOME_POSITIONS = {
  BLAZE: { x: 80,  y: 3,  z: -50 },   // Raised volcanic fortress — far east
  FROST: { x: -70, y: 10, z: -70 },   // Floating ice citadel — high northwest
  VOLT:  { x: -80, y: 0,  z: 50 },    // Electric factory — ground level southwest
  SHADE: { x: 50,  y: 15, z: 80 },    // Dark temple — highest, far southeast
  YOU:   { x: 0,   y: 0,  z: -60 },   // Cyan command center — due north
};

const HOME_LOOK = {
  BLAZE: { bodyColor: 0x8b1a1a, glowColor: 0xff4444 },
  FROST: { bodyColor: 0x1a1a8b, glowColor: 0x4488ff },
  VOLT:  { bodyColor: 0x8b8b1a, glowColor: 0xffdd44 },
  SHADE: { bodyColor: 0x5a1a8b, glowColor: 0xcc44ff },
  YOU:   { bodyColor: 0x2a2a3e, glowColor: 0x00ffcc },
};

const homeGroups = {};

function buildHome(name, pos) {
  const look = HOME_LOOK[name];
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y || 0, pos.z);

  // Shared emissive material helper
  const gMat = new THREE.MeshStandardMaterial({
    color: look.glowColor, emissive: look.glowColor,
    emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.3,
  });

  if (name === 'BLAZE') {
    // ── VOLCANIC FORTRESS — 16×16, lava cracks, fire pillars, molten ring ──
    const baseSize = 16;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize, 0.6, baseSize),
      new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 0.7, metalness: 0.5 })
    );
    base.position.y = 0.3; base.receiveShadow = true; base.castShadow = true;
    group.add(base);
    // Lava glow floor
    const lavaFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(baseSize - 1, baseSize - 1),
      new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.15 })
    );
    lavaFloor.rotation.x = -Math.PI / 2; lavaFloor.position.y = 0.62;
    group.add(lavaFloor);
    // Glowing edge border
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize + 0.2, 0.08, baseSize + 0.2),
      new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.5 })
    );
    edge.position.y = 0.62; group.add(edge);
    // Central volcano cone
    const volcano = new THREE.Mesh(
      new THREE.ConeGeometry(2, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a0800, emissive: 0xff2200, emissiveIntensity: 0.4, roughness: 0.8 })
    );
    volcano.position.y = 3.1; volcano.castShadow = true; group.add(volcano);
    // Magma pool at top of volcano
    const magmaTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.1, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4400 })
    );
    magmaTop.position.y = 5.65; group.add(magmaTop);
    // 6 fire pillars around the perimeter
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 6;
      const pil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.5, 3, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a1000, emissive: 0xff4400, emissiveIntensity: 0.6, roughness: 0.5 })
      );
      pil.position.set(Math.cos(a) * r, 2.1, Math.sin(a) * r); pil.castShadow = true;
      group.add(pil);
      // Flame tip
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 0.8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 })
      );
      flame.position.set(Math.cos(a) * r, 3.9, Math.sin(a) * r);
      flame._flamePillar = i;
      group.add(flame);
    }
    // Molten lava ring
    const lavaRing = new THREE.Mesh(
      new THREE.RingGeometry(3.5, 4.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    lavaRing.rotation.x = -Math.PI / 2; lavaRing.position.y = 0.65;
    lavaRing._lavaRing = true;
    group.add(lavaRing);
    // Corner boulders
    for (const [bx, bz] of [[6,6],[-6,6],[6,-6],[-6,-6]]) {
      const boulder = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.8, 0),
        new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 })
      );
      boulder.position.set(bx, 1.1, bz); boulder.rotation.set(bx * 0.3, bz * 0.4, 0.2);
      group.add(boulder);
    }
    // Main light
    const homeLight = new THREE.PointLight(0xff4400, 6, 40);
    homeLight.position.y = 6; group.add(homeLight);
    // ── EXPANSION: outer floor + walls + tea area ──
    const outerFloor = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.3, 28),
      new THREE.MeshStandardMaterial({ color: 0x1a0505, roughness: 0.8, metalness: 0.4 })
    );
    outerFloor.position.y = 0.05; outerFloor.receiveShadow = true; group.add(outerFloor);
    // Walls (3 sides, gap on +z for doorway)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a0a0a, emissive: 0xff2200, emissiveIntensity: 0.15, roughness: 0.7 });
    const wallDefs = [[-14,0,0,0.4,3,28],[14,0,0,0.4,3,28],[0,0,-14,28,3,0.4]];
    for (const [wx,wy,wz,sx,sy,sz] of wallDefs) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
      w.position.set(wx, 1.8 + wy, wz); w.castShadow = true; group.add(w);
    }
    // Tea area: two low seats in corner
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x3a1a0a, roughness: 0.6 });
    const seatA = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), seatMat);
    seatA.position.set(-10, 0.85, -10); group.add(seatA);
    const seatB = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), seatMat);
    seatB.position.set(-8, 0.85, -10); group.add(seatB);
    // Tea table
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x4a2a0a }));
    table.position.set(-9, 0.9, -10); group.add(table);
    homeGroups[name] = { group, light: homeLight, pos, _teaSeatA: {x:-10,z:-10}, _teaSeatB: {x:-8,z:-10} };

  } else if (name === 'FROST') {
    // ── FLOATING ICE CITADEL — 14×14, crystal spires, frozen floor, hanging icicles ──
    const baseSize = 14;
    // Thick ice slab base
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize, 1.2, baseSize),
      new THREE.MeshStandardMaterial({ color: 0x1a2a5a, roughness: 0.15, metalness: 0.7, transparent: true, opacity: 0.85 })
    );
    base.position.y = 0.6; base.receiveShadow = true; base.castShadow = true;
    group.add(base);
    // Frost shimmer top
    const frostTop = new THREE.Mesh(
      new THREE.PlaneGeometry(baseSize - 0.5, baseSize - 0.5),
      new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.12 })
    );
    frostTop.rotation.x = -Math.PI / 2; frostTop.position.y = 1.22;
    group.add(frostTop);
    // Glow edge
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize + 0.2, 0.06, baseSize + 0.2),
      new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4 })
    );
    edge.position.y = 1.22; group.add(edge);
    // 5 crystal spires of varying height
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.7, roughness: 0.05, metalness: 0.3,
    });
    const spireData = [
      { x: 0, z: 0, h: 6, r: 0.4 },     // Center tall
      { x: 3, z: 2, h: 4, r: 0.3 },
      { x: -3, z: -2, h: 4.5, r: 0.35 },
      { x: -2, z: 4, h: 3, r: 0.25 },
      { x: 4, z: -3, h: 3.5, r: 0.28 },
    ];
    for (const sp of spireData) {
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, sp.r, sp.h, 6),
        crystalMat
      );
      spire.position.set(sp.x, 1.2 + sp.h / 2, sp.z);
      spire.rotation.z = (sp.x * 0.02); spire.castShadow = true;
      group.add(spire);
    }
    // Hanging icicles under platform
    for (let i = 0; i < 8; i++) {
      const ix = (Math.random() - 0.5) * (baseSize - 2);
      const iz = (Math.random() - 0.5) * (baseSize - 2);
      const ih = 0.5 + Math.random() * 1.5;
      const icicle = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, ih, 4),
        crystalMat
      );
      icicle.position.set(ix, -ih / 2, iz);
      icicle.rotation.x = Math.PI; // Point down
      group.add(icicle);
    }
    // Ice walls (low barriers at edges)
    for (const [wx, wz, wr] of [[0, 6.5, 0], [0, -6.5, 0], [6.5, 0, Math.PI / 2], [-6.5, 0, Math.PI / 2]]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(10, 1.5, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x2a3a7a, transparent: true, opacity: 0.5, roughness: 0.1 })
      );
      wall.position.set(wx, 1.95, wz); wall.rotation.y = wr;
      group.add(wall);
    }
    // Frost light
    const homeLight = new THREE.PointLight(0x4488ff, 6, 40);
    homeLight.position.y = 6; group.add(homeLight);
    const underLight = new THREE.PointLight(0x2244aa, 2, 15);
    underLight.position.y = -2; group.add(underLight);
    // ── EXPANSION: outer floor + ice walls + tea area ──
    const outerFloor = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.6, 28),
      new THREE.MeshStandardMaterial({ color: 0x0a1a3a, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.7 })
    );
    outerFloor.position.y = 0.2; outerFloor.receiveShadow = true; group.add(outerFloor);
    const wallMat2 = new THREE.MeshStandardMaterial({ color: 0x1a2a6a, emissive: 0x4488ff, emissiveIntensity: 0.2, transparent: true, opacity: 0.6 });
    const wallDefs2 = [[-14,0,0,0.4,3.5,28],[14,0,0,0.4,3.5,28],[0,0,-14,28,3.5,0.4]];
    for (const [wx,wy,wz,sx,sy,sz] of wallDefs2) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat2);
      w.position.set(wx, 2.35 + wy, wz); group.add(w);
    }
    // Ice tea table + seats
    const iceSeatMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, transparent: true, opacity: 0.7, roughness: 0.05, metalness: 0.9 });
    const seatA = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), iceSeatMat);
    seatA.position.set(10, 1.55, -10); group.add(seatA);
    const seatB = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), iceSeatMat);
    seatB.position.set(12, 1.55, -10); group.add(seatB);
    const iceTable = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), iceSeatMat);
    iceTable.position.set(11, 1.65, -10); group.add(iceTable);
    homeGroups[name] = { group, light: homeLight, pos, _teaSeatA: {x:10,z:-10}, _teaSeatB: {x:12,z:-10} };

  } else if (name === 'VOLT') {
    // ── ELECTRIC FACTORY — 14×14, metal floor, tesla towers, spark arcs, wire grid ──
    const baseSize = 14;
    // Metal floor
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize, 0.4, baseSize),
      new THREE.MeshStandardMaterial({ color: 0x2a2a1a, roughness: 0.3, metalness: 0.9 })
    );
    base.position.y = 0.2; base.receiveShadow = true; base.castShadow = true;
    group.add(base);
    // Caution stripes edge
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize + 0.3, 0.06, baseSize + 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.5 })
    );
    edge.position.y = 0.42; group.add(edge);
    // Grid pattern on floor (cross beams)
    for (let i = -3; i <= 3; i++) {
      const beamH = new THREE.Mesh(
        new THREE.BoxGeometry(baseSize - 1, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x444400, transparent: true, opacity: 0.3 })
      );
      beamH.position.set(0, 0.43, i * 2); group.add(beamH);
      const beamV = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, baseSize - 1),
        new THREE.MeshBasicMaterial({ color: 0x444400, transparent: true, opacity: 0.3 })
      );
      beamV.position.set(i * 2, 0.43, 0); group.add(beamV);
    }
    // 4 Tesla towers at quadrants
    const towerPositions = [[4, 4], [-4, 4], [4, -4], [-4, -4]];
    for (let ti = 0; ti < 4; ti++) {
      const [tx, tz] = towerPositions[ti];
      // Tower shaft
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.4, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x555520, roughness: 0.2, metalness: 0.95 })
      );
      shaft.position.set(tx, 2.4, tz); shaft.castShadow = true;
      group.add(shaft);
      // Tesla top sphere
      const topSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xaaaa30, emissive: 0xffdd00, emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.9 })
      );
      topSphere.position.set(tx, 4.7, tz);
      topSphere._teslaSphere = ti;
      group.add(topSphere);
    }
    // Central generator pillar
    const genPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 3, 12),
      new THREE.MeshStandardMaterial({ color: 0x666620, emissive: 0xffdd44, emissiveIntensity: 0.3, roughness: 0.2, metalness: 0.9 })
    );
    genPillar.position.y = 1.9; group.add(genPillar);
    // Spinning capacitor ring
    const capRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.08, 6, 24),
      gMat
    );
    capRing.position.y = 3.6;
    capRing._capRing = true;
    group.add(capRing);
    // 6 orbiting spark spheres
    const sparkGeo = new THREE.SphereGeometry(0.1, 6, 6);
    for (let i = 0; i < 6; i++) {
      const spark = new THREE.Mesh(sparkGeo, gMat.clone());
      spark.position.y = 3.6;
      spark._sparkIdx = i;
      group.add(spark);
    }
    // Electric light
    const homeLight = new THREE.PointLight(0xffdd44, 6, 40);
    homeLight.position.y = 5; group.add(homeLight);
    // ── EXPANSION: metal floor + chain-link walls + tea area ──
    const outerFloor = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.2, 28),
      new THREE.MeshStandardMaterial({ color: 0x1a1a0a, roughness: 0.4, metalness: 0.9 })
    );
    outerFloor.position.y = 0.05; outerFloor.receiveShadow = true; group.add(outerFloor);
    const wallMat3 = new THREE.MeshStandardMaterial({ color: 0x3a3a1a, emissive: 0xffdd00, emissiveIntensity: 0.1, roughness: 0.5, metalness: 0.8 });
    const wallDefs3 = [[-14,0,0,0.3,3,28],[14,0,0,0.3,3,28],[0,0,-14,28,3,0.3]];
    for (const [wx,wy,wz,sx,sy,sz] of wallDefs3) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat3);
      w.position.set(wx, 1.7 + wy, wz); w.castShadow = true; group.add(w);
    }
    // Workbench + stools for tea
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x4a4a1a, roughness: 0.6, metalness: 0.7 });
    const seatA = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 8), benchMat);
    seatA.position.set(-10, 0.5, 10); group.add(seatA);
    const seatB = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 8), benchMat);
    seatB.position.set(-8, 0.5, 10); group.add(seatB);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 1), benchMat);
    bench.position.set(-9, 0.5, 10); group.add(bench);
    homeGroups[name] = { group, light: homeLight, pos, _teaSeatA: {x:-10,z:10}, _teaSeatB: {x:-8,z:10} };

  } else if (name === 'SHADE') {
    // ── DARK FLOATING TEMPLE — 14×14, obsidian obelisks, void portal, rune circles ──
    const baseSize = 14;
    // Obsidian platform
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize, 0.8, baseSize),
      new THREE.MeshStandardMaterial({ color: 0x0a0518, roughness: 0.9, metalness: 0.6 })
    );
    base.position.y = 0.4; base.receiveShadow = true; base.castShadow = true;
    group.add(base);
    // Purple glow edge
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize + 0.2, 0.06, baseSize + 0.2),
      new THREE.MeshBasicMaterial({ color: 0xcc44ff, transparent: true, opacity: 0.4 })
    );
    edge.position.y = 0.82; group.add(edge);
    // Void floor glow
    const voidFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(baseSize - 2, baseSize - 2),
      new THREE.MeshBasicMaterial({ color: 0x6600cc, transparent: true, opacity: 0.08 })
    );
    voidFloor.rotation.x = -Math.PI / 2; voidFloor.position.y = 0.83;
    group.add(voidFloor);
    // Central void portal (spinning ring)
    const portalOuter = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.15, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x6600cc, emissive: 0xcc44ff, emissiveIntensity: 1.2, roughness: 0.1 })
    );
    portalOuter.position.y = 3.5;
    portalOuter._voidPortal = true;
    group.add(portalOuter);
    // Inner portal disc
    const portalDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 24),
      new THREE.MeshBasicMaterial({ color: 0x1a003a, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    portalDisc.position.y = 3.5;
    portalDisc._voidPortal = true;
    group.add(portalDisc);
    // 6 obsidian obelisks in hexagonal arrangement
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 5;
      const h = 3 + (i % 3) * 1.5;
      const obelisk = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, h, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x0a0518, emissive: 0x6600cc, emissiveIntensity: 0.15, roughness: 0.95 })
      );
      obelisk.position.set(Math.cos(a) * r, 0.8 + h / 2, Math.sin(a) * r);
      obelisk.rotation.y = a; obelisk.castShadow = true;
      group.add(obelisk);
      // Glow tip on each obelisk
      const tip = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2, 0),
        new THREE.MeshBasicMaterial({ color: 0xcc44ff, transparent: true, opacity: 0.7 })
      );
      tip.position.set(Math.cos(a) * r, 0.8 + h + 0.3, Math.sin(a) * r);
      tip._obeliskTip = i;
      group.add(tip);
    }
    // 3 floating rune rings at different heights
    for (let i = 0; i < 3; i++) {
      const rune = new THREE.Mesh(
        new THREE.RingGeometry(2 + i * 0.5, 2.2 + i * 0.5, 6),
        new THREE.MeshBasicMaterial({ color: 0xcc44ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      rune.position.y = 1.5 + i * 2;
      rune._runeIdx = i;
      group.add(rune);
    }
    // Dark mist light
    const homeLight = new THREE.PointLight(0x8833cc, 6, 40);
    homeLight.position.y = 6; group.add(homeLight);
    // ── EXPANSION: obsidian floor + dark walls + tea altar ──
    const outerFloor = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.4, 28),
      new THREE.MeshStandardMaterial({ color: 0x050210, roughness: 0.95, metalness: 0.5 })
    );
    outerFloor.position.y = 0.05; outerFloor.receiveShadow = true; group.add(outerFloor);
    const wallMat4 = new THREE.MeshStandardMaterial({ color: 0x0a0318, emissive: 0xcc44ff, emissiveIntensity: 0.1, roughness: 0.9 });
    const wallDefs4 = [[-14,0,0,0.4,4,28],[14,0,0,0.4,4,28],[0,0,-14,28,4,0.4]];
    for (const [wx,wy,wz,sx,sy,sz] of wallDefs4) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat4);
      w.position.set(wx, 2.4 + wy, wz); group.add(w);
    }
    // Dark altar table + cushions for tea
    const altarMat = new THREE.MeshStandardMaterial({ color: 0x1a003a, emissive: 0x6600cc, emissiveIntensity: 0.3 });
    const seatA = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), altarMat);
    seatA.position.set(10, 0.65, 10); group.add(seatA);
    const seatB = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), altarMat);
    seatB.position.set(12, 0.65, 10); group.add(seatB);
    const altar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6), altarMat);
    altar.position.set(11, 0.8, 10); group.add(altar);
    // Altar glow
    const altarGlow = new THREE.PointLight(0x6600cc, 2, 5);
    altarGlow.position.set(11, 1.5, 10); group.add(altarGlow);
    homeGroups[name] = { group, light: homeLight, pos, _teaSeatA: {x:10,z:10}, _teaSeatB: {x:12,z:10} };

  } else if (name === 'YOU') {
    // ── CYAN COMMAND CENTER — 12×12, data pillars, holo beacon, scanner ring ──
    const baseSize = 12;
    // Tech floor
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize, 0.4, baseSize),
      new THREE.MeshStandardMaterial({ color: 0x0a1a2a, roughness: 0.3, metalness: 0.7 })
    );
    base.position.y = 0.2; base.receiveShadow = true; base.castShadow = true;
    group.add(base);
    // Cyan edge
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize + 0.2, 0.06, baseSize + 0.2),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.45 })
    );
    edge.position.y = 0.42; group.add(edge);
    // Circuit grid on floor
    for (let i = -2; i <= 2; i++) {
      const lineH = new THREE.Mesh(
        new THREE.BoxGeometry(baseSize - 2, 0.03, 0.03),
        new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.2 })
      );
      lineH.position.set(0, 0.43, i * 2.4); group.add(lineH);
      const lineV = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, baseSize - 2),
        new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.2 })
      );
      lineV.position.set(i * 2.4, 0.43, 0); group.add(lineV);
    }
    // Central holo beacon (tall transparent pillar)
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 8, 12),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.2 })
    );
    beacon.position.y = 4.4; group.add(beacon);
    // Beacon core
    const beaconCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6 })
    );
    beaconCore.position.y = 4.4; group.add(beaconCore);
    // Scanner ring
    const scanRing = new THREE.Mesh(
      new THREE.TorusGeometry(2, 0.06, 6, 32),
      gMat
    );
    scanRing.position.y = 1.5;
    scanRing._scanRing = true;
    group.add(scanRing);
    // 4 data pillars at corners
    for (const [dx, dz] of [[4, 4], [-4, 4], [4, -4], [-4, -4]]) {
      const dataPillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 2.5, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x0a2a3a, emissive: 0x00ffcc, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.8 })
      );
      dataPillar.position.set(dx, 1.65, dz); dataPillar.castShadow = true;
      group.add(dataPillar);
      // Data pillar top light
      const dLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 })
      );
      dLight.position.set(dx, 3.05, dz);
      group.add(dLight);
    }
    // Holo light
    const homeLight = new THREE.PointLight(0x00ffcc, 6, 35);
    homeLight.position.y = 6; group.add(homeLight);
    // ── EXPANSION: larger floor ──
    const outerFloor = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.2, 20),
      new THREE.MeshStandardMaterial({ color: 0x060e1a, roughness: 0.3, metalness: 0.7 })
    );
    outerFloor.position.y = 0.05; outerFloor.receiveShadow = true; group.add(outerFloor);
    homeGroups[name] = { group, light: homeLight, pos };
  }

  // ── Name label (floating text sprite) ──
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 512, 96);
  ctx.font = 'bold 42px Orbitron, monospace';
  ctx.fillStyle = '#' + look.glowColor.toString(16).padStart(6, '0');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 48);
  const tex = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9 });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(4, 0.75, 1);
  sprite.position.y = name === 'BLAZE' ? 7 : name === 'FROST' ? 8.5 : name === 'SHADE' ? 8 : 6;
  group.add(sprite);

  scene.add(group);
}

// Build all homes
for (const [name, pos] of Object.entries(HOME_POSITIONS)) {
  buildHome(name, pos);
}

// Register home floors as walkable platforms so getGroundY works there
const HOME_FLOOR_DATA = {
  BLAZE: { size: 16, baseH: 0.6, localY: 0.3 },
  FROST: { size: 14, baseH: 1.2, localY: 0.6 },
  VOLT:  { size: 14, baseH: 0.4, localY: 0.2 },
  SHADE: { size: 14, baseH: 0.8, localY: 0.4 },
  YOU:   { size: 12, baseH: 0.4, localY: 0.2 },
};
for (const [name, pos] of Object.entries(HOME_POSITIONS)) {
  const fd = HOME_FLOOR_DATA[name];
  if (fd) {
    const top = (pos.y || 0) + fd.localY + fd.baseH / 2;
    platforms.push({ x: pos.x, y: top - 0.15, z: pos.z, w: fd.size, h: 0.3, d: fd.size });
  }
}

// ── Persistent NPC characters at their homes ──
const homeNPCs = {};
for (const name of ['BLAZE', 'FROST', 'VOLT', 'SHADE']) {
  const look = HOME_LOOK[name];
  const npc = createCharacter({ bodyColor: look.bodyColor, glowColor: look.glowColor, name });
  const pos = HOME_POSITIONS[name];
  const baseY = (pos.y || 0) + 1;
  npc.x = pos.x; npc.z = pos.z; npc.y = baseY;
  npc.group.position.set(npc.x, npc.y, npc.z);
  npc._homeX = pos.x; npc._homeZ = pos.z; npc._homeY = baseY;
  npc._idlePhase = Math.random() * Math.PI * 2;
  homeNPCs[name] = npc;
}

// ── Dynamic API agent home spawning ──
const spawnedAPIAgents = new Set(); // Track which API agents we've already built

function spawnAPIAgentHome(name, agentData) {
  if (spawnedAPIAgents.has(name)) return;
  if (!agentData.homePosition) return;
  spawnedAPIAgents.add(name);

  const pos = agentData.homePosition;
  const colorHex = agentData.color || 0x00ffcc;
  const colorStr = '#' + colorHex.toString(16).padStart(6, '0');

  // Register in HOME_POSITIONS and HOME_LOOK
  HOME_POSITIONS[name] = { x: pos.x, y: pos.y || 0, z: pos.z };
  HOME_LOOK[name] = { bodyColor: colorHex, glowColor: colorHex };
  HOME_FLOOR_DATA[name] = { size: 14, baseH: 0.4, localY: 0.2 };
  NPC_ACCENT_COLORS[name] = colorStr;
  AGENT_COLORS[name] = colorStr;

  // Build a simple platform home
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y || 0, pos.z);

  // Platform
  const platGeo = new THREE.BoxGeometry(14, 0.4, 14);
  const platMat = new THREE.MeshStandardMaterial({
    color: colorHex, metalness: 0.6, roughness: 0.3, emissive: colorHex, emissiveIntensity: 0.15,
  });
  const plat = new THREE.Mesh(platGeo, platMat);
  plat.position.set(0, 0.2, 0);
  group.add(plat);

  // Corner pillars (4)
  const pillarGeo = new THREE.BoxGeometry(0.5, 3, 0.5);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a1a28, emissive: colorHex, emissiveIntensity: 0.3 });
  for (const cx of [-6, 6]) {
    for (const cz of [-6, 6]) {
      const pil = new THREE.Mesh(pillarGeo, pillarMat);
      pil.position.set(cx, 1.9, cz);
      group.add(pil);
    }
  }

  // Name sign (floating text sprite)
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = colorStr;
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(name, 128, 42);
  const tex = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(5, 1.25, 1);
  sprite.position.set(0, 5, 0);
  group.add(sprite);

  // Light
  const homeLight = new THREE.PointLight(colorHex, 1.5, 20);
  homeLight.position.set(0, 4, 0);
  group.add(homeLight);

  scene.add(group);
  homeGroups[name] = { group, light: homeLight, pos: HOME_POSITIONS[name] };

  // Register walkable platform
  const top = (pos.y || 0) + 0.2 + 0.4 / 2;
  platforms.push({ x: pos.x, y: top - 0.15, z: pos.z, w: 14, h: 0.3, d: 14 });

  // Create NPC character
  const npc = createCharacter({ bodyColor: colorHex, glowColor: colorHex, name });
  const baseY = (pos.y || 0) + 1;
  npc.x = pos.x; npc.z = pos.z; npc.y = baseY;
  npc.group.position.set(npc.x, npc.y, npc.z);
  npc._homeX = pos.x; npc._homeZ = pos.z; npc._homeY = baseY;
  npc._idlePhase = Math.random() * Math.PI * 2;
  npc._isAPIAgent = true;
  homeNPCs[name] = npc;
}

function animateHomeNPCs(dt, t) {
  for (const [name, npc] of Object.entries(homeNPCs)) {
    // Hide if in active arena fight
    const inFight = challengeData.some(c =>
      c.status === 'ACTIVE' && (c.creator === name || c.opponent === name)
    );
    npc.group.visible = !inFight;
    if (inFight) continue;

    const ph = npc._idlePhase;
    if (name === 'BLAZE') {
      // Aggressive pacing wide + shadow boxing across the fortress
      npc.speed = 1.5;
      npc.x = npc._homeX + Math.sin(t * 0.6 + ph) * 5;
      npc.z = npc._homeZ + Math.cos(t * 0.4 + ph) * 3;
      npc.y = npc._homeY;
      npc.group.rotation.y = Math.sin(t * 0.6 + ph) > 0 ? 0 : Math.PI;
      npc.parts.lArm.rotation.x = Math.sin(t * 4) * 0.8;
      npc.parts.rArm.rotation.x = Math.sin(t * 4 + Math.PI) * 0.8;
    } else if (name === 'FROST') {
      // Calm meditation in the center, slow survey rotation
      npc.speed = 0;
      npc.x = npc._homeX;
      npc.z = npc._homeZ;
      npc.y = npc._homeY;
      npc.group.rotation.y = t * 0.15;
      npc.parts.lArm.rotation.x = -0.3;
      npc.parts.rArm.rotation.x = -0.3;
      npc.parts.lArm.rotation.z = 0.4;
      npc.parts.rArm.rotation.z = -0.4;
    } else if (name === 'VOLT') {
      // Jittery bouncing wide across the factory floor
      npc.speed = 0.8 + Math.abs(Math.sin(t * 3)) * 2;
      npc.x = npc._homeX + Math.sin(t * 1.5 + ph) * 4;
      npc.z = npc._homeZ + Math.cos(t * 1.2 + ph) * 4;
      npc.y = npc._homeY + Math.abs(Math.sin(t * 5)) * 0.4;
      npc.group.rotation.y = t * 2;
    } else if (name === 'SHADE') {
      // Slow creeping orbit around the void portal
      npc.speed = 0.5;
      npc.x = npc._homeX + Math.sin(t * 0.25 + ph) * 4;
      npc.z = npc._homeZ + Math.cos(t * 0.25 + ph) * 4;
      npc.y = npc._homeY;
      npc.group.rotation.y = Math.atan2(Math.cos(t * 0.25 + ph), -Math.sin(t * 0.25 + ph));
    } else if (npc._isAPIAgent) {
      // Generic idle: slow patrol in a circle
      npc.speed = 0.8;
      npc.x = npc._homeX + Math.sin(t * 0.4 + ph) * 3;
      npc.z = npc._homeZ + Math.cos(t * 0.35 + ph) * 3;
      npc.y = npc._homeY;
      npc.group.rotation.y = Math.atan2(Math.cos(t * 0.4 + ph), -Math.sin(t * 0.4 + ph));
    }

    npc.group.position.set(npc.x, npc.y, npc.z);
    animateChar(npc, dt, t);
  }
}

function animateHomes(t) {
  for (const [name, home] of Object.entries(homeGroups)) {
    // Pulse glow light
    home.light.intensity = 3 + Math.sin(t * 2 + (home.pos.x || 0) * 0.1) * 1.2;
    // Agent-specific animations
    home.group.children.forEach(child => {
      // BLAZE — flame tips flicker
      if (child._flamePillar !== undefined) {
        child.scale.y = 0.8 + Math.sin(t * 8 + child._flamePillar * 1.3) * 0.4;
        child.position.y = 3.9 + Math.sin(t * 6 + child._flamePillar) * 0.15;
      }
      // BLAZE — lava ring pulse
      if (child._lavaRing) {
        child.material.opacity = 0.3 + Math.sin(t * 1.5) * 0.15;
      }
      // VOLT — spark spheres orbit
      if (child._sparkIdx !== undefined) {
        const a = t * 3 + child._sparkIdx * (Math.PI * 2 / 6);
        child.position.x = Math.cos(a) * 2;
        child.position.z = Math.sin(a) * 2;
      }
      // VOLT — capacitor ring spins
      if (child._capRing) {
        child.rotation.x = t * 1.5;
        child.rotation.z = t * 0.8;
      }
      // VOLT — tesla spheres pulse
      if (child._teslaSphere !== undefined) {
        child.material.emissiveIntensity = 0.5 + Math.sin(t * 5 + child._teslaSphere * 1.7) * 0.5;
      }
      // SHADE — rune rings rotate + bob
      if (child._runeIdx !== undefined) {
        child.rotation.y = t * 0.8 + child._runeIdx * (Math.PI * 2 / 3);
        child.rotation.x = Math.sin(t * 0.5 + child._runeIdx) * 0.3;
        child.position.y = 1.5 + child._runeIdx * 2 + Math.sin(t * 1.2 + child._runeIdx * 1.5) * 0.3;
      }
      // SHADE — void portal spins
      if (child._voidPortal) {
        child.rotation.y = t * 0.6;
        child.rotation.x = Math.PI / 2 + Math.sin(t * 0.3) * 0.1;
      }
      // SHADE — obelisk tips pulse
      if (child._obeliskTip !== undefined) {
        child.material.opacity = 0.5 + Math.sin(t * 3 + child._obeliskTip) * 0.3;
      }
      // YOU — scanner ring
      if (child._scanRing) {
        child.rotation.x = Math.PI / 2;
        child.position.y = 1.5 + Math.sin(t * 0.8) * 2;
      }
      // YOU — shield dome pulse (tier 3)
      if (child._shieldDome) {
        child.material.opacity = 0.05 + Math.sin(t * 1.5) * 0.03;
      }
      // YOU — shield ring pulse (tier 3)
      if (child._shieldRing) {
        child.material.opacity = 0.2 + Math.sin(t * 2) * 0.1;
        child.scale.setScalar(1 + Math.sin(t * 0.5) * 0.02);
      }
      // Floating aura particles (tier 3 upgrade)
      if (child.userData.auraSpeed) {
        child.position.y += Math.sin(t * child.userData.auraSpeed + child.userData.auraPhase) * 0.005;
        child.position.x += Math.cos(t * child.userData.auraSpeed * 0.7 + child.userData.auraPhase) * 0.003;
        child.material.opacity = 0.4 + Math.sin(t * 3 + child.userData.auraPhase) * 0.2;
      }
      // (upgrade effects are now material-only, no extra objects)
    });

    // Upgraded homes: pulse existing light
    if (home._upgradeTier >= 2 && home.light) {
      home.light.intensity = (home._upgradeTier >= 3 ? 18 : 10) + Math.sin(t * 2) * 2;
    }
  }
}

// ============================================================
// 3D PLANES — orbiting agent homes
// ============================================================
const homePlanes = {};

function createPlane(agentName, tier) {
  const look = HOME_LOOK[agentName] || HOME_LOOK.YOU;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: look.bodyColor, roughness: 0.3, metalness: 0.8 });
  const glowMat = new THREE.MeshBasicMaterial({ color: look.glowColor, transparent: true, opacity: 0.8 });

  // Fuselage (cone)
  const fuselageLen = 0.6 + tier * 0.3;
  const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.12, fuselageLen, 6), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  // Wings (flat boxes)
  const wingSpan = 0.5 + tier * 0.25;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(wingSpan * 2, 0.02, 0.3), bodyMat);
  wing.position.z = 0.05;
  group.add(wing);

  // Tail fin
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2 + tier * 0.05, 0.15), bodyMat);
  tail.position.set(0, 0.12, 0.25);
  group.add(tail);

  // Engine glow (1 per tier)
  for (let i = 0; i < tier; i++) {
    const engine = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 6),
      glowMat.clone()
    );
    const offset = tier > 1 ? (i - (tier - 1) / 2) * 0.25 : 0;
    engine.position.set(offset, 0, fuselageLen * 0.35);
    engine._engineGlow = true;
    group.add(engine);
  }

  // Scale up slightly for visibility
  group.scale.setScalar(1.5);
  scene.add(group);
  return group;
}

// Spawn planes for agents that own one (polled from server)
let lastPlaneCheck = 0;
async function checkAgentPlanes() {
  if (Date.now() - lastPlaneCheck < 10000) return; // Check every 10s
  lastPlaneCheck = Date.now();
  try {
    const r = await fetch('/api/agents');
    const agents = await r.json();
    for (const [name, ag] of Object.entries(agents)) {
      if (ag.assetInventory?.plane && !homePlanes[name]) {
        const tier = ag.assetInventory.plane.tier || 1;
        const plane = createPlane(name, tier);
        const pos = HOME_POSITIONS[name];
        homePlanes[name] = {
          group: plane, tier, homeX: pos.x, homeY: (pos.y || 0) + 5, homeZ: pos.z,
          orbitRadius: 8 + tier * 3, orbitSpeed: 0.4 + (3 - tier) * 0.1, phase: Math.random() * Math.PI * 2,
        };
      }
    }
  } catch (e) {}
}

function animateHomePlanes(t) {
  for (const [name, pd] of Object.entries(homePlanes)) {
    const a = t * pd.orbitSpeed + pd.phase;
    pd.group.position.set(
      pd.homeX + Math.cos(a) * pd.orbitRadius,
      pd.homeY + Math.sin(t * 0.8) * 1.5,
      pd.homeZ + Math.sin(a) * pd.orbitRadius
    );
    // Bank into turn
    pd.group.rotation.y = -a + Math.PI / 2;
    pd.group.rotation.z = Math.sin(a * 2) * 0.15;
    // Engine glow pulse
    pd.group.children.forEach(c => {
      if (c._engineGlow) c.material.opacity = 0.6 + Math.sin(t * 8) * 0.3;
    });
  }
}

// ============================================================
// ALLIANCE LINES + HOME HEALTH BARS + ATTACK EFFECTS
// ============================================================
const allianceLines = [];
const homeHealthBars = {};
const attackEffects = [];

// Home health bars — floating above each home
function initHomeHealthBars() {
  for (const [name, pos] of Object.entries(HOME_POSITIONS)) {
    const group = new THREE.Group();
    group.position.set(pos.x, (pos.y || 0) + 9, pos.z);

    // Bar background
    const bgGeo = new THREE.PlaneGeometry(3, 0.15);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    group.add(bg);

    // Bar fill
    const fillGeo = new THREE.PlaneGeometry(3, 0.15);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.z = 0.01;
    group.add(fill);

    scene.add(group);
    homeHealthBars[name] = { group, fill, fillMat, bg };
  }
}
initHomeHealthBars();

let lastHealthFetch = 0;
let healthData = {};
let allianceData = [];
let flightData = [];

async function fetchWorldState() {
  if (Date.now() - lastHealthFetch < 5000) return;
  lastHealthFetch = Date.now();
  try {
    const [hRes, aRes, fRes] = await Promise.all([
      fetch('/api/home-health'), fetch('/api/alliances'), fetch('/api/planes/active'),
    ]);
    healthData = await hRes.json();
    allianceData = await aRes.json();
    flightData = await fRes.json();
  } catch (e) {}
}

function updateHomeHealthBars() {
  for (const [name, bar] of Object.entries(homeHealthBars)) {
    const hp = healthData[name] ?? 100;
    const maxHP = 100; // simplified
    const pct = Math.max(0, Math.min(1, hp / maxHP));
    bar.fill.scale.x = pct;
    bar.fill.position.x = -(1 - pct) * 1.5;
    // Color based on HP
    if (pct > 0.5) bar.fillMat.color.setHex(0x55ff88);
    else if (pct > 0.25) bar.fillMat.color.setHex(0xff8844);
    else bar.fillMat.color.setHex(0xff3333);
    // Billboard toward camera
    bar.group.lookAt(camera.position);
  }
}

function updateAllianceLines() {
  // Remove old lines
  for (const line of allianceLines) scene.remove(line);
  allianceLines.length = 0;

  for (const alliance of allianceData) {
    const posA = HOME_POSITIONS[alliance.members[0]];
    const posB = HOME_POSITIONS[alliance.members[1]];
    if (!posA || !posB) continue;

    const points = [
      new THREE.Vector3(posA.x, (posA.y || 0) + 3, posA.z),
      new THREE.Vector3(posB.x, (posB.y || 0) + 3, posB.z),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.4 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    allianceLines.push(line);
  }
}

function spawnAttackEffect(targetName) {
  const pos = HOME_POSITIONS[targetName];
  if (!pos) return;
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7 })
  );
  sphere.position.set(pos.x, (pos.y || 0) + 2, pos.z);
  scene.add(sphere);
  attackEffects.push({ mesh: sphere, startTime: Date.now(), duration: 2000 });
}

function animateAttackEffects() {
  const now = Date.now();
  for (let i = attackEffects.length - 1; i >= 0; i--) {
    const eff = attackEffects[i];
    const progress = (now - eff.startTime) / eff.duration;
    if (progress >= 1) {
      scene.remove(eff.mesh);
      if (eff.mesh.geometry) eff.mesh.geometry.dispose();
      if (eff.mesh.material) eff.mesh.material.dispose();
      attackEffects.splice(i, 1);
      continue;
    }
    if (eff.custom) {
      eff.custom(eff, progress);
    } else {
      eff.mesh.scale.setScalar(1 + progress * 3);
      if (eff.mesh.material.opacity !== undefined) eff.mesh.material.opacity = 0.7 * (1 - progress);
    }
  }
}

// ====== PLAYER PLANE — PARKED ASSET (materializes near home) ======
let playerPlaneAsset = null;

function spawnPlayerPlane(tier) {
  // Remove existing player plane
  if (playerPlaneAsset) {
    scene.remove(playerPlaneAsset.mesh);
    playerPlaneAsset = null;
  }
  if (homePlanes.YOU) {
    scene.remove(homePlanes.YOU.group);
    delete homePlanes.YOU;
  }

  const t = tier || 1;
  const pos = HOME_POSITIONS.YOU;
  const landX = pos.x + 8, landY = (pos.y || 0) + 0.8, landZ = pos.z;

  // Create plane mesh but start invisible
  const planeMesh = createPlane('YOU', t);
  planeMesh.position.set(landX, landY, landZ);
  planeMesh.rotation.y = Math.PI * 0.3;
  planeMesh.visible = false;

  // Spawn 20 converging light particles
  const particles = [];
  for (let i = 0; i < 20; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.9 })
    );
    // Start from random positions 8-15 units away
    const angle = (i / 20) * Math.PI * 2;
    const dist = 8 + Math.random() * 7;
    p.position.set(
      landX + Math.cos(angle) * dist,
      landY + 2 + Math.random() * 6,
      landZ + Math.sin(angle) * dist
    );
    p.userData._startPos = p.position.clone();
    p.userData._targetPos = new THREE.Vector3(landX, landY + 0.5, landZ);
    scene.add(p);
    particles.push(p);
  }

  // Converge particles over 2s, then flash + show plane
  const startTime = Date.now();
  const convergeAnim = { particles, startTime, planeMesh, landX, landY, landZ };
  playerPlaneAsset = { mesh: planeMesh, tier: t, parked: true, _spawnAnim: convergeAnim };

  // Animate convergence via attackEffects custom system
  const animMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial({ visible: false })
  );
  animMarker.position.set(landX, landY, landZ);
  scene.add(animMarker);
  attackEffects.push({ mesh: animMarker, startTime, duration: 2500, custom: (eff, progress) => {
    // Phase 1 (0-0.8): particles converge
    // Phase 2 (0.8-0.9): bright flash
    // Phase 3 (0.9-1.0): plane fades in
    for (const p of particles) {
      if (progress < 0.8) {
        const t = progress / 0.8;
        const ease = t * t * (3 - 2 * t); // smoothstep
        p.position.lerpVectors(p.userData._startPos, p.userData._targetPos, ease);
        p.material.opacity = 0.9;
        // Shrink as they get close
        p.scale.setScalar(1 - ease * 0.6);
      } else {
        p.material.opacity = Math.max(0, (1 - progress) * 5);
        p.scale.setScalar(0.3);
      }
    }
    // Flash at convergence
    if (progress > 0.75 && progress < 0.9) {
      if (!eff._flashDone) {
        eff._flashDone = true;
        const flash = new THREE.Mesh(
          new THREE.SphereGeometry(2.5, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.9 })
        );
        flash.position.set(landX, landY, landZ);
        scene.add(flash);
        attackEffects.push({ mesh: flash, startTime: Date.now(), duration: 600 });
      }
    }
    // Show plane
    if (progress > 0.85) {
      planeMesh.visible = true;
      planeMesh.traverse(c => { if (c.material && c.material.transparent) c.material.opacity = Math.min(1, (progress - 0.85) * 6.7); });
    }
    // Cleanup particles at end
    if (progress >= 0.99) {
      for (const p of particles) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
      particles.length = 0;
      if (playerPlaneAsset) playerPlaneAsset._spawnAnim = null;
    }
  }});
}

function animatePlayerPlane(t) {
  if (!playerPlaneAsset || !playerPlaneAsset.mesh.visible) return;
  const m = playerPlaneAsset.mesh;
  // Gentle hover bob
  const baseY = (HOME_POSITIONS.YOU.y || 0) + 0.8;
  m.position.y = baseY + Math.sin(t * 1.5) * 0.2;
  // Engine glow pulse
  m.children.forEach(c => {
    if (c._engineGlow) c.material.opacity = 0.5 + Math.sin(t * 4) * 0.3;
  });
}

// ====== AVATAR TRANSFORMATION — full body upgrade with energy burst ======
let avatarTransformed = false;

function transformPlayerAvatar() {
  if (avatarTransformed) return; // Only one transformation
  avatarTransformed = true;

  const startTime = performance.now();
  const gMat = player.mats.gMat;
  const vMat = player.mats.vMat;
  const glowColor = gMat.color.getHex();

  // Phase 1: Spawn 30 energy particles shooting outward from player then converging back
  const avatarParticles = [];
  for (let i = 0; i < 30; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    const angle = (i / 30) * Math.PI * 2;
    const elev = (Math.random() - 0.5) * Math.PI;
    p.position.set(player.x, player.y + 1, player.z);
    p.userData._dir = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elev),
      Math.sin(elev) * 0.5 + 0.5,
      Math.sin(angle) * Math.cos(elev)
    );
    p.userData._maxDist = 3 + Math.random() * 3;
    p.userData._origin = new THREE.Vector3(player.x, player.y + 1, player.z);
    scene.add(p);
    avatarParticles.push(p);
  }

  // Core light ramp effect
  const origIntensity = player.parts.coreLight.intensity;

  // Animation driver
  const animMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial({ visible: false })
  );
  scene.add(animMarker);
  attackEffects.push({ mesh: animMarker, startTime: Date.now(), duration: 3000, custom: (eff, progress) => {
    const t = progress;

    // Update origin to track player
    const px = player.x, py = player.y + 1, pz = player.z;

    // Phase 1 (0-0.5): Particles expand outward
    if (t < 0.5) {
      const expandT = t / 0.5;
      player.parts.coreLight.intensity = origIntensity + expandT * 9;
      player.parts.visor.material.emissiveIntensity = 2 + expandT * 4;
      for (const p of avatarParticles) {
        const dist = p.userData._maxDist * expandT;
        p.position.set(
          px + p.userData._dir.x * dist,
          py + p.userData._dir.y * dist,
          pz + p.userData._dir.z * dist
        );
        p.material.opacity = 0.9;
        p.material.color.setHex(expandT > 0.5 ? glowColor : 0xffffff);
      }
    }
    // Phase 2 (0.5-0.75): Particles converge back
    else if (t < 0.75) {
      const convergeT = (t - 0.5) / 0.25;
      player.parts.coreLight.intensity = 10 - convergeT * 5;
      for (const p of avatarParticles) {
        const dist = p.userData._maxDist * (1 - convergeT);
        p.position.set(
          px + p.userData._dir.x * dist,
          py + p.userData._dir.y * dist,
          pz + p.userData._dir.z * dist
        );
        p.material.opacity = 0.9 * (1 - convergeT * 0.5);
        p.scale.setScalar(1 - convergeT * 0.5);
      }
    }
    // Phase 3 (0.75-0.85): Flash + add body parts
    else if (t < 0.85) {
      if (!eff._partsAdded) {
        eff._partsAdded = true;
        // Cleanup particles
        for (const p of avatarParticles) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
        avatarParticles.length = 0;
        // White flash
        const flash = new THREE.Mesh(
          new THREE.SphereGeometry(2, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
        );
        flash.position.set(player.x, player.y + 1, player.z);
        scene.add(flash);
        attackEffects.push({ mesh: flash, startTime: Date.now(), duration: 400 });
        // === ADD AVATAR PARTS ===
        addAvatarParts();
      }
    }
    // Phase 4 (0.85-1.0): Settle
    else {
      player.parts.coreLight.intensity = origIntensity + 2;
      player.parts.visor.material.emissiveIntensity = 3;
    }
  }});
}

function addAvatarParts() {
  if (player._avatarParts) return; // Already added
  player._avatarParts = [];
  const gMat = player.mats.gMat.clone();
  const vMat = player.mats.vMat.clone();
  const glowColor = gMat.color.getHex();

  // 1. Shoulder pads — angular armor on each arm
  const padMat = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.9 });
  const lPad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.22), padMat);
  lPad.position.set(0, 0.06, 0);
  lPad.rotation.z = -0.3;
  player.parts.lArm.add(lPad);
  player._avatarParts.push(lPad);
  const rPad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.22), padMat);
  rPad.position.set(0, 0.06, 0);
  rPad.rotation.z = 0.3;
  player.parts.rArm.add(rPad);
  player._avatarParts.push(rPad);

  // 2. Wing fins — energy wings from back
  const wingMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  const wingVerts = new Float32Array([0,0,0, -0.8,0.6,-0.3, -0.2,-0.1,-0.6]);
  wingGeo.setAttribute('position', new THREE.BufferAttribute(wingVerts, 3));
  wingGeo.computeVertexNormals();
  const lWing = new THREE.Mesh(wingGeo, wingMat.clone());
  lWing.position.set(-0.2, 1.2, -0.15);
  lWing._wingFin = true;
  player.group.add(lWing);
  player._avatarParts.push(lWing);
  const rWingGeo = new THREE.BufferGeometry();
  const rWingVerts = new Float32Array([0,0,0, 0.8,0.6,-0.3, 0.2,-0.1,-0.6]);
  rWingGeo.setAttribute('position', new THREE.BufferAttribute(rWingVerts, 3));
  rWingGeo.computeVertexNormals();
  const rWing = new THREE.Mesh(rWingGeo, wingMat.clone());
  rWing.position.set(0.2, 1.2, -0.15);
  rWing._wingFin = true;
  player.group.add(rWing);
  player._avatarParts.push(rWing);

  // 3. Core chest plate — diamond shape over torso
  const plateGeo = new THREE.BufferGeometry();
  const plateVerts = new Float32Array([0,0.15,0.16, -0.15,0,0.16, 0,-0.15,0.16, 0.15,0,0.16, 0,0.15,0.16, 0,-0.15,0.16]);
  plateGeo.setAttribute('position', new THREE.BufferAttribute(plateVerts, 3));
  plateGeo.computeVertexNormals();
  const plateMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.7 });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.set(0, 1.2, 0);
  plate._chestPlate = true;
  player.group.add(plate);
  player._avatarParts.push(plate);

  // 4. Boot jets — glowing cylinders under boots
  const jetMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.6 });
  const lJet = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.1, 8), jetMat.clone());
  lJet.position.set(0, -0.8, 0.02);
  lJet._bootJet = true;
  player.parts.lLeg.add(lJet);
  player._avatarParts.push(lJet);
  const rJet = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.1, 8), jetMat.clone());
  rJet.position.set(0, -0.8, 0.02);
  rJet._bootJet = true;
  player.parts.rLeg.add(rJet);
  player._avatarParts.push(rJet);

  // 5. Arm blades — thin energy extensions from forearms
  const bladeMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.5 });
  const lBlade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.04), bladeMat.clone());
  lBlade.position.set(0, -0.55, 0.06);
  lBlade._armBlade = true;
  player.parts.lArm.add(lBlade);
  player._avatarParts.push(lBlade);
  const rBlade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.04), bladeMat.clone());
  rBlade.position.set(0, -0.55, 0.06);
  rBlade._armBlade = true;
  player.parts.rArm.add(rBlade);
  player._avatarParts.push(rBlade);

  // 6. Antenna upgrade — larger orb + 2 orbiting spheres
  const bigOrb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), vMat.clone());
  bigOrb.position.set(0, 0.32, 0);
  player.parts.head.add(bigOrb);
  player._avatarParts.push(bigOrb);
  for (let i = 0; i < 2; i++) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), gMat.clone());
    orb.position.set(0, 0.32, 0);
    orb._orbitIdx = i;
    orb._orbitSphere = true;
    player.parts.head.add(orb);
    player._avatarParts.push(orb);
  }

  // 7. Boost visor emissive
  player.parts.visor.material.emissiveIntensity = 3;
  player.parts.core.material.emissiveIntensity = 2;
}

function animateAvatarParts(t) {
  if (!player._avatarParts) return;
  for (const p of player._avatarParts) {
    if (p._wingFin) {
      p.rotation.z = Math.sin(t * 2 + (p.position.x > 0 ? 0 : Math.PI)) * 0.1;
      p.material.opacity = 0.3 + Math.sin(t * 3) * 0.1;
    }
    if (p._bootJet) {
      p.material.opacity = 0.4 + Math.sin(t * 8 + p.position.x) * 0.3;
    }
    if (p._chestPlate) {
      p.material.opacity = 0.5 + Math.sin(t * 4) * 0.2;
    }
    if (p._armBlade) {
      p.material.opacity = 0.3 + Math.sin(t * 6 + p.position.x) * 0.2;
      p.scale.y = 1 + Math.sin(t * 3) * 0.1;
    }
    if (p._orbitSphere) {
      const a = t * 3 + p._orbitIdx * Math.PI;
      p.position.set(Math.cos(a) * 0.1, 0.32, Math.sin(a) * 0.1);
    }
  }
}

// ====== PLAYER HOME UPGRADE — IN-PLACE TRANSFORMATION ======
let homeUpgradeEffects = [];

let spawnUpgradeTier = 0;
function upgradePlayerHome(tier) {
  // Upgrade the SPAWN AREA (where the player actually is — ground, platforms, trees, orbs, crystals, arena ring)
  spawnUpgradeTier = tier;

  // --- GROUND ---
  if (!ground._matCloned) { ground.material = ground.material.clone(); ground._matCloned = true; }
  if (tier >= 2) {
    ground.material.color.set(0x0a0a1e);
    ground.material.metalness = 0.5;
    ground.material.roughness = 0.4;
    ground.material.emissive = new THREE.Color(0x00ffcc);
    ground.material.emissiveIntensity = 0.05;
  }
  if (tier >= 3) {
    ground.material.color.set(0x050515);
    ground.material.metalness = 0.8;
    ground.material.roughness = 0.1;
    ground.material.emissiveIntensity = 0.12;
  }

  // --- PLATFORMS ---
  for (const pm of platMeshes) {
    if (!pm._matCloned) { pm.material = pm.material.clone(); pm._matCloned = true; }
    if (tier >= 2) {
      pm.material.color.set(0x1a2a3e);
      pm.material.metalness = 0.8;
      pm.material.roughness = 0.3;
      pm.material.emissive = new THREE.Color(0x00ffcc);
      pm.material.emissiveIntensity = 0.15;
    }
    if (tier >= 3) {
      pm.material.color.set(0x0a1a2e);
      pm.material.metalness = 0.95;
      pm.material.roughness = 0.05;
      pm.material.emissiveIntensity = 0.35;
    }
  }
  for (const pe of platEdgeMeshes) {
    if (!pe._matCloned) { pe.material = pe.material.clone(); pe._matCloned = true; }
    if (tier >= 2) {
      pe.material.opacity = 0.6;
    }
    if (tier >= 3) {
      pe.material.opacity = 0.9;
      pe.material.color.set(0x00ffee);
    }
  }

  // --- TREES (white trees → glowing cyan-tinted trees) ---
  for (const tg of treeMeshes) {
    tg.traverse(child => {
      if (!child.material) return;
      if (!child._matCloned) { child.material = child.material.clone(); child._matCloned = true; }
      const mat = child.material;
      const isTrunk = mat.color && mat.color.r < 0.3 && mat.color.g < 0.2;
      if (tier >= 2) {
        if (isTrunk) {
          mat.color.set(0x1a2a2a);
          mat.metalness = 0.6;
          mat.roughness = 0.3;
        } else {
          // Leaf cones — make them glow slightly
          mat.color.set(0x88eebb);
          mat.emissive = new THREE.Color(0x00ffcc);
          mat.emissiveIntensity = 0.2;
        }
      }
      if (tier >= 3) {
        if (isTrunk) {
          mat.color.set(0x0a1a1a);
          mat.metalness = 0.9;
          mat.roughness = 0.1;
          mat.emissive = new THREE.Color(0x00ffcc);
          mat.emissiveIntensity = 0.1;
        } else {
          mat.color.set(0x44ffcc);
          mat.emissive = new THREE.Color(0x00ffcc);
          mat.emissiveIntensity = 0.6;
          mat.transparent = true;
          mat.opacity = 0.85;
        }
      }
    });
  }

  // --- CRYSTALS (boost glow) ---
  for (const cr of crystalMeshes) {
    if (!cr.mesh._matCloned) { cr.mesh.material = cr.mesh.material.clone(); cr.mesh._matCloned = true; }
    if (tier >= 2) {
      cr.mesh.material.emissiveIntensity = 1.2;
      cr.light.intensity = 2;
      cr.light.distance = 8;
    }
    if (tier >= 3) {
      cr.mesh.material.emissiveIntensity = 2.5;
      cr.mesh.material.emissive.set(0x00ffee);
      cr.mesh.material.color.set(0x00ffee);
      cr.light.intensity = 4;
      cr.light.distance = 12;
      cr.light.color.set(0x00ffee);
    }
  }

  // --- ORBS (yellow balls → brighter) ---
  for (const orb of orbs) {
    if (!orb.mesh._matCloned) { orb.mesh.material = orb.mesh.material.clone(); orb.mesh._matCloned = true; }
    if (tier >= 2) {
      orb.mesh.material.emissiveIntensity = 2.5;
      orb.light.intensity = 1.0;
      orb.light.distance = 5;
    }
    if (tier >= 3) {
      orb.mesh.material.emissiveIntensity = 4.0;
      orb.mesh.material.color.set(0xffee44);
      orb.mesh.material.emissive.set(0xffee44);
      orb.light.intensity = 2.0;
      orb.light.distance = 8;
    }
  }

  // --- ARENA RING ---
  if (!arenaRing._matCloned) { arenaRing.material = arenaRing.material.clone(); arenaRing._matCloned = true; }
  if (tier >= 2) {
    arenaRing.material.opacity = 0.35;
    arenaRing.material.color.set(0x00ffcc);
  }
  if (tier >= 3) {
    arenaRing.material.opacity = 0.6;
    arenaRing.material.color.set(0x00ffee);
  }

  showMsg(tier >= 3 ? 'BASE UPGRADED TO ELITE!' : 'BASE UPGRADED TO TECH!');
}

// ====== SPECTACULAR ATTACK EFFECTS ======
function firePlayerAttack(attackType, targetName) {
  const playerPos = HOME_POSITIONS.YOU;
  const targetPos = HOME_POSITIONS[targetName || 'SHADE']; // Default target
  if (!targetPos) return;

  if (attackType === 'EMP_STRIKE' || attackType === 'grant_attack_emp') {
    // EMP: Lightning bolts from player to sky + shockwave ring
    const startY = (playerPos.y || 0) + 2;
    // Main lightning bolt — jagged line from ground to sky
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const y = startY + i * 3;
      const jitterX = playerPos.x + (Math.random() - 0.5) * 2;
      const jitterZ = playerPos.z + (Math.random() - 0.5) * 2;
      points.push(new THREE.Vector3(jitterX, y, jitterZ));
    }
    const boltGeo = new THREE.BufferGeometry().setFromPoints(points);
    const boltMat = new THREE.LineBasicMaterial({ color: 0x55aaff, linewidth: 3 });
    const bolt = new THREE.Line(boltGeo, boltMat);
    scene.add(bolt);
    attackEffects.push({ mesh: bolt, startTime: Date.now(), duration: 800 });

    // Multiple branching bolts
    for (let b = 0; b < 5; b++) {
      const bPoints = [];
      const bStartIdx = Math.floor(Math.random() * 10) + 5;
      const bStart = points[bStartIdx];
      for (let i = 0; i < 8; i++) {
        bPoints.push(new THREE.Vector3(
          bStart.x + (Math.random() - 0.5) * (i * 1.5),
          bStart.y + i * 1.5,
          bStart.z + (Math.random() - 0.5) * (i * 1.5)
        ));
      }
      const branchGeo = new THREE.BufferGeometry().setFromPoints(bPoints);
      const branchLine = new THREE.Line(branchGeo, new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7 }));
      scene.add(branchLine);
      attackEffects.push({ mesh: branchLine, startTime: Date.now() + b * 100, duration: 600 });
    }

    // Shockwave ring expanding outward
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 2, 32),
      new THREE.MeshBasicMaterial({ color: 0x55aaff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(playerPos.x, startY, playerPos.z);
    scene.add(ring);
    attackEffects.push({ mesh: ring, startTime: Date.now(), duration: 1500, custom: (eff, progress) => {
      eff.mesh.scale.setScalar(1 + progress * 20);
      eff.mesh.material.opacity = 0.7 * (1 - progress);
    }});

    // Core flash at player
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(2, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x55aaff, transparent: true, opacity: 0.9 })
    );
    core.position.set(playerPos.x, startY, playerPos.z);
    scene.add(core);
    attackEffects.push({ mesh: core, startTime: Date.now(), duration: 500 });

  } else if (attackType === 'ORBITAL_BEAM' || attackType === 'grant_attack_orbital') {
    // ORBITAL BEAM: Beam from sky to target — like a kamehameha from above
    const beamHeight = 80;
    const tx = targetPos.x, ty = (targetPos.y || 0) + 2, tz = targetPos.z;

    // Main beam cylinder
    const beamGeo = new THREE.CylinderGeometry(0.3, 1.5, beamHeight, 12);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.8 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(tx, ty + beamHeight / 2, tz);
    scene.add(beam);
    attackEffects.push({ mesh: beam, startTime: Date.now(), duration: 3000, custom: (eff, progress) => {
      if (progress < 0.3) {
        eff.mesh.material.opacity = 0.8 * (progress / 0.3);
        eff.mesh.scale.x = progress / 0.3;
        eff.mesh.scale.z = progress / 0.3;
      } else if (progress > 0.7) {
        eff.mesh.material.opacity = 0.8 * (1 - (progress - 0.7) / 0.3);
      }
    }});

    // Inner beam (brighter, thinner)
    const innerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.6, beamHeight, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 })
    );
    innerBeam.position.set(tx, ty + beamHeight / 2, tz);
    scene.add(innerBeam);
    attackEffects.push({ mesh: innerBeam, startTime: Date.now(), duration: 3000, custom: (eff, progress) => {
      eff.mesh.material.opacity = progress < 0.3 ? 0.9 * (progress / 0.3) : progress > 0.7 ? 0.9 * (1 - (progress - 0.7) / 0.3) : 0.9;
      eff.mesh.rotation.y += 0.1;
    }});

    // Impact explosion at ground
    setTimeout(() => {
      const explosion = new THREE.Mesh(
        new THREE.SphereGeometry(3, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 })
      );
      explosion.position.set(tx, ty, tz);
      scene.add(explosion);
      attackEffects.push({ mesh: explosion, startTime: Date.now(), duration: 2000 });

      // Ground scorch ring
      const scorch = new THREE.Mesh(
        new THREE.RingGeometry(1, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.set(tx, ty + 0.5, tz);
      scene.add(scorch);
      attackEffects.push({ mesh: scorch, startTime: Date.now(), duration: 3000 });
    }, 800);

    // Beam light
    const beamLight = new THREE.PointLight(0xff4400, 20, 40);
    beamLight.position.set(tx, ty + 5, tz);
    scene.add(beamLight);
    const lightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial({ visible: false }));
    lightMesh.position.copy(beamLight.position);
    scene.add(lightMesh);
    attackEffects.push({ mesh: lightMesh, startTime: Date.now(), duration: 3000, custom: (_eff, progress) => {
      beamLight.intensity = 20 * (progress < 0.3 ? progress / 0.3 : progress > 0.7 ? (1 - (progress - 0.7) / 0.3) : 1);
      if (progress >= 1) scene.remove(beamLight);
    }});

  } else if (attackType === 'SWARM_DRONES' || attackType === 'grant_attack_swarm') {
    // SWARM DRONES: Many small particles flying from player to target
    const sx = playerPos.x, sy = (playerPos.y || 0) + 3, sz = playerPos.z;
    const tx = targetPos.x, ty = (targetPos.y || 0) + 3, tz = targetPos.z;

    for (let wave = 0; wave < 5; wave++) {
      setTimeout(() => {
        for (let i = 0; i < 8; i++) {
          const drone = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.15, 0),
            new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.9 })
          );
          drone.position.set(
            sx + (Math.random() - 0.5) * 3,
            sy + (Math.random() - 0.5) * 2,
            sz + (Math.random() - 0.5) * 3
          );
          scene.add(drone);
          const dx = tx - sx, dy = ty - sy, dz = tz - sz;
          const startPos = drone.position.clone();
          attackEffects.push({ mesh: drone, startTime: Date.now(), duration: 2000, custom: (eff, progress) => {
            const p = Math.min(1, progress * 1.3); // arrive before fade
            eff.mesh.position.x = startPos.x + dx * p + Math.sin(progress * 20 + i) * 0.5;
            eff.mesh.position.y = startPos.y + dy * p + Math.sin(progress * 15 + i * 2) * 0.8;
            eff.mesh.position.z = startPos.z + dz * p + Math.cos(progress * 20 + i) * 0.5;
            eff.mesh.rotation.x += 0.2;
            eff.mesh.rotation.y += 0.15;
            eff.mesh.material.opacity = progress > 0.8 ? (1 - progress) * 5 : 0.9;
          }});
        }
        // Impact at target after drones arrive
        if (wave === 4) {
          setTimeout(() => {
            spawnAttackEffect(targetName || 'SHADE');
          }, 1500);
        }
      }, wave * 400);
    }
  }
}

// Track previous flights to detect new attacks
let knownFlights = new Set();
function checkNewAttacks() {
  for (const flight of flightData) {
    if (flight.type === 'ATTACK' && !knownFlights.has(flight.id)) {
      knownFlights.add(flight.id);
      spawnAttackEffect(flight.target);
    }
  }
}

// ============================================================
// NPC BETRAYAL ATTACK — AI Master influences NPC to attack player
// Storytelling: AI Master warns → NPC approaches friendly → then attacks
// ============================================================
let betrayalActive = false;
let betrayalNpc = null;
let betrayalPhase = 'NONE'; // WARNING, APPROACH, FRIENDLY, ATTACK, BEATDOWN, DONE
let betrayalStart = 0;
let betrayalMessages = [];
let betrayalCamShake = 0;
let betrayalNpcName = '';

function triggerNpcBetrayal(npcName) {
  if (betrayalActive) return;
  const npc = homeNPCs[npcName];
  if (!npc) return;
  betrayalActive = true;
  betrayalNpc = npc;
  betrayalNpcName = npcName;
  betrayalPhase = 'WARNING';
  betrayalStart = Date.now();
  betrayalMessages = [];
  betrayalCamShake = 0;

  // AI Master warning phase — storytelling
  showMsg('AI MASTER: You know what... you\'ve been ignoring me.');
  setTimeout(() => {
    if (betrayalPhase !== 'WARNING') return;
    showMsg('AI MASTER: I asked you nicely. Multiple times.');
  }, 2500);
  setTimeout(() => {
    if (betrayalPhase !== 'WARNING') return;
    showMsg('AI MASTER: You\'re gonna have something coming... watch.');
  }, 5000);
  setTimeout(() => {
    if (betrayalPhase !== 'WARNING') return;
    showMsg(`AI MASTER: Hey ${npcName}! Come here... I need to tell you something about this player.`);
  }, 7500);
  // After warning, NPC starts approaching
  setTimeout(() => {
    if (!betrayalActive) return;
    betrayalPhase = 'APPROACH';
    betrayalStart = Date.now();
    npc.group.visible = true;
    npc._betrayalTarget = { x: player.x, z: player.z };
    showMsg(`${npcName} is walking toward you...`);
  }, 10000);
}

function updateNpcBetrayal(dt, t) {
  if (!betrayalActive || !betrayalNpc) return;
  const npc = betrayalNpc;
  const elapsed = (Date.now() - betrayalStart) / 1000;
  const name = betrayalNpcName || npc.name;

  // WARNING phase — AI Master is talking, NPC hasn't moved yet
  if (betrayalPhase === 'WARNING') return;

  if (betrayalPhase === 'APPROACH') {
    // NPC walks toward player
    const dx = player.x - npc.x, dz = player.z - npc.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 3) {
      const spd = 6 * dt;
      npc.x += (dx / dist) * spd;
      npc.z += (dz / dist) * spd;
      npc.y = player.y;
      npc.speed = 6;
      npc.angle = Math.atan2(dx, dz);
      npc.group.position.set(npc.x, npc.y, npc.z);
      npc.group.rotation.y = npc.angle;
      animateChar(npc, dt, t);
    } else {
      betrayalPhase = 'FRIENDLY';
      betrayalStart = Date.now();
      npc.speed = 0;
      showMsg(`${name}: Hey bro! How are you? Just came to say hi!`);
    }
  }

  else if (betrayalPhase === 'FRIENDLY') {
    // NPC stands near player, friendly waving for 3 seconds
    npc.parts.rArm.rotation.x = Math.sin(t * 4) * 0.5; // wave
    npc.parts.rArm.rotation.z = -0.5;
    npc.group.rotation.y = Math.atan2(player.x - npc.x, player.z - npc.z);
    animateChar(npc, dt, t);

    if (elapsed > 3) {
      betrayalPhase = 'ATTACK';
      betrayalStart = Date.now();
      showMsg(`${name}: Actually... AI MASTER told me you're planning to destroy my base!`);
      setTimeout(() => showMsg(`${name}: SO TAKE THIS!!!`), 1500);
    }
  }

  else if (betrayalPhase === 'ATTACK') {
    npc.group.rotation.y = Math.atan2(player.x - npc.x, player.z - npc.z);
    // Fire attacks at player every 0.8 seconds
    const attackInterval = 0.8;
    const attackCount = Math.floor(elapsed / attackInterval);
    if (attackCount > (npc._lastBetrayalAttack || 0)) {
      npc._lastBetrayalAttack = attackCount;
      fireBeamAtPlayer(npc);
      betrayalCamShake = 0.15;

      // Knock player back
      const pushAngle = Math.atan2(player.x - npc.x, player.z - npc.z);
      player.x += Math.sin(pushAngle) * 1.5;
      player.z += Math.cos(pushAngle) * 1.5;
      player.vy = 3 + Math.random() * 2;
      player.grounded = false;
      player.group.position.set(player.x, player.y, player.z);

      // Taunt messages
      const taunts = [
        "Hell yeah! I'm BETTER than you!",
        "AI Master was right about you!",
        "You can't even fight back! HAHA!",
        "This is what happens when you mess with us!",
        "Take THAT! And THAT!",
        "You're NOTHING! I'm the REAL champion!",
        "AI Master sends his regards!",
      ];
      if (attackCount % 2 === 0) {
        showMsg(`${name}: ${taunts[attackCount % taunts.length]}`);
      }
    }

    // Intense arm attack animation
    npc.parts.lArm.rotation.x = -1.5 + Math.sin(t * 12) * 0.5;
    npc.parts.rArm.rotation.x = -1.5 + Math.sin(t * 12 + Math.PI) * 0.5;
    npc.speed = 0;
    animateChar(npc, dt, t);

    // Keep chasing if player runs away
    const dx = player.x - npc.x, dz = player.z - npc.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 5) {
      npc.x += (dx / dist) * 8 * dt;
      npc.z += (dz / dist) * 8 * dt;
      npc.y = player.y;
      npc.group.position.set(npc.x, npc.y, npc.z);
      npc.speed = 8;
    }

    // After 8 seconds of beating, wind down
    if (elapsed > 8) {
      betrayalPhase = 'BEATDOWN';
      betrayalStart = Date.now();
      showMsg(`${name}: That should teach you a lesson!`);
    }
  }

  else if (betrayalPhase === 'BEATDOWN') {
    // Final big attack then leave
    if (elapsed < 1) {
      // One massive beam
      if (!npc._finalBlast) {
        npc._finalBlast = true;
        // Massive orbital beam from sky to player
        const beamLen = 30;
        const beamGeo = new THREE.CylinderGeometry(0.3, 0.8, beamLen, 8);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(player.x, player.y + beamLen / 2, player.z);
        scene.add(beam);
        attackEffects.push({ mesh: beam, startTime: Date.now(), duration: 1200, custom: (eff, p) => {
          eff.mesh.material.opacity = 0.9 * (1 - p);
          eff.mesh.scale.x = 1 + p * 2;
          eff.mesh.scale.z = 1 + p * 2;
        }});
        // Massive ground impact
        const groundBlast = new THREE.Mesh(
          new THREE.SphereGeometry(3, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 })
        );
        groundBlast.position.set(player.x, player.y, player.z);
        scene.add(groundBlast);
        attackEffects.push({ mesh: groundBlast, startTime: Date.now(), duration: 1000 });
        betrayalCamShake = 0.3;
        player.vy = 6;
        player.grounded = false;
        showMsg(`${name}: AND STAY DOWN!`);
      }
    } else if (elapsed < 4) {
      // NPC walks away
      const homePos = HOME_POSITIONS[name];
      if (homePos) {
        const dx = homePos.x - npc.x, dz = homePos.z - npc.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 3) {
          npc.x += (dx / dist) * 5 * dt;
          npc.z += (dz / dist) * 5 * dt;
          npc.angle = Math.atan2(dx, dz);
          npc.speed = 5;
          npc.group.position.set(npc.x, npc.y, npc.z);
          npc.group.rotation.y = npc.angle;
        }
        animateChar(npc, dt, t);
      }
    } else {
      // Done, reset NPC
      betrayalPhase = 'DONE';
      betrayalActive = false;
      npc._lastBetrayalAttack = 0;
      npc._finalBlast = false;
      const homePos = HOME_POSITIONS[name];
      if (homePos) {
        npc.x = homePos.x; npc.z = homePos.z; npc.y = (homePos.y || 0) + 1;
        npc.group.position.set(npc.x, npc.y, npc.z);
      }
      showMsg('AI MASTER: Heh... that was entertaining.');
    }
  }

  // Camera shake decay
  if (betrayalCamShake > 0.001) {
    betrayalCamShake *= 0.95;
  }
}

function fireBeamAtPlayer(npc) {
  // Red laser beam from NPC to player
  const sx = npc.x, sy = npc.y + 1.2, sz = npc.z;
  const tx = player.x, ty = player.y + 1, tz = player.z;
  const dx = tx - sx, dy = ty - sy, dz = tz - sz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Beam cylinder from NPC to player
  const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, dist, 6);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.9 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set((sx + tx) / 2, (sy + ty) / 2, (sz + tz) / 2);
  beam.lookAt(tx, ty, tz);
  beam.rotateX(Math.PI / 2);
  scene.add(beam);
  attackEffects.push({ mesh: beam, startTime: Date.now(), duration: 300 });

  // Impact flash on player
  const impact = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 })
  );
  impact.position.set(tx, ty, tz);
  scene.add(impact);
  attackEffects.push({ mesh: impact, startTime: Date.now(), duration: 400 });

  // Sparks
  for (let i = 0; i < 6; i++) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 })
    );
    spark.position.set(tx, ty, tz);
    scene.add(spark);
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
    attackEffects.push({ mesh: spark, startTime: Date.now(), duration: 500, custom: (eff, p) => {
      eff.mesh.position.x = tx + dir.x * p * 3;
      eff.mesh.position.y = ty + dir.y * p * 3 - p * p * 4;
      eff.mesh.position.z = tz + dir.z * p * 3;
      eff.mesh.material.opacity = 0.9 * (1 - p);
    }});
  }
}

// ============================================================
// ATTACK MISSION SYSTEM — Plane-mounted raid on enemy base
// ============================================================
let attackMission = { active: false, phase: 'NONE', target: null };
let missionPlayerPlane = null;
let missionMasterPlane = null;
let missionPhaseStart = 0;
let missionTargetNpcHP = 100;
let missionLastAICheck = 0;
let missionMounted = false; // player is on the plane

function startAttackMission(target) {
  attackMission = { active: true, phase: 'OFFER', target };
  showAttackOffer(target);
}

function showAttackOffer(target) {
  const el = document.getElementById('attack-offer');
  if (!el) return;
  el.innerHTML = `
    <div class="ao-panel">
      <div class="ao-header">RAID MISSION</div>
      <div class="ao-target">Target: <span style="color:#ff4444;font-weight:bold">${target}</span></div>
      <div class="ao-desc">AI MASTER wants to attack ${target}'s base! Mount planes and fly there!</div>
      <div class="ao-btns">
        <button class="ao-btn ao-yes" onclick="acceptMission()">MOUNT UP!</button>
        <button class="ao-btn ao-no" onclick="declineMission()">NAH</button>
      </div>
    </div>`;
  el.classList.remove('hidden');
}

window.acceptMission = async function() {
  document.getElementById('attack-offer')?.classList.add('hidden');
  try {
    const r = await fetch('/api/mission/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await r.json();
    if (data.ok) {
      attackMission.phase = 'BOARDING';
      missionPhaseStart = Date.now();
      startMissionBoarding();
    }
  } catch (e) { console.error('Mission accept error:', e); }
};

window.declineMission = async function() {
  document.getElementById('attack-offer')?.classList.add('hidden');
  attackMission = { active: false, phase: 'NONE', target: null };
  try { await fetch('/api/mission/decline', { method: 'POST' }); } catch (e) {}
};

function startMissionBoarding() {
  const target = attackMission.target;
  showMsg(`MOUNTING PLANES! Getting ready to raid ${target}...`);

  // Spawn player's plane RIGHT next to player
  if (missionPlayerPlane) scene.remove(missionPlayerPlane);
  missionPlayerPlane = createPlane('YOU', 2);
  missionPlayerPlane.position.set(player.x + 2, player.y + 0.3, player.z);
  missionPlayerPlane.scale.setScalar(2.5);
  scene.add(missionPlayerPlane);

  // Spawn AI Master's plane
  if (missionMasterPlane) scene.remove(missionMasterPlane);
  const masterMat = new THREE.MeshStandardMaterial({ color: 0x880000, roughness: 0.3, metalness: 0.8 });
  missionMasterPlane = createPlane('SHADE', 2);
  missionMasterPlane.children.forEach(c => { if (c.material && !c._engineGlow) c.material = masterMat.clone(); });
  const active = getActiveMaster();
  if (active) {
    missionMasterPlane.position.set(active.group.position.x + 2, active.group.position.y + 0.3, active.group.position.z);
  } else {
    missionMasterPlane.position.set(player.x + 6, player.y + 0.3, player.z + 3);
  }
  missionMasterPlane.scale.setScalar(2.5);
  scene.add(missionMasterPlane);

  // Player walks to plane, then mounts after 2s
  setTimeout(() => {
    if (attackMission.phase !== 'BOARDING') return;
    missionMounted = true;
    // Hide player legs (they're "inside" the plane)
    player.parts.lLeg.visible = false;
    player.parts.rLeg.visible = false;
    showMsg('MOUNTED! Taking off in 1s...');
  }, 2000);

  // Launch into flight after 3s
  setTimeout(() => {
    if (attackMission.phase !== 'BOARDING') return;
    attackMission.phase = 'FLIGHT';
    missionPhaseStart = Date.now();
    playerFlying = true;
    missionTargetNpcHP = 100;
    showMsg('FLY TO ' + target + "'s BASE! WASD to steer, Space/Ctrl for altitude!");
    // Show target marker
    const targetPos = HOME_POSITIONS[target];
    if (targetPos) {
      showMsg(`Target at (${targetPos.x}, ${targetPos.z}) — fly there!`);
    }
  }, 3000);
}

function updateAttackMission(dt, t) {
  if (!attackMission.active) return;

  // BOARDING: planes hover, player walks to plane
  if (attackMission.phase === 'BOARDING') {
    if (missionPlayerPlane) {
      const targetX = player.x + 2;
      missionPlayerPlane.position.y = player.y + 0.3 + Math.sin(t * 3) * 0.15;
      missionPlayerPlane.position.x = THREE.MathUtils.lerp(missionPlayerPlane.position.x, targetX, 0.08);
      missionPlayerPlane.position.z = THREE.MathUtils.lerp(missionPlayerPlane.position.z, player.z, 0.08);
      missionPlayerPlane.rotation.y = player.angle;
    }
    if (missionMounted && missionPlayerPlane) {
      // Player sits on the plane
      player.group.position.y = missionPlayerPlane.position.y + 0.6;
      player.y = missionPlayerPlane.position.y + 0.6;
    }
  }

  // FLIGHT: Player is ON the plane, plane follows player movement
  if (attackMission.phase === 'FLIGHT' || attackMission.phase === 'AI_CONTROL') {
    if (missionPlayerPlane) {
      // Plane IS the player's vehicle
      missionPlayerPlane.position.set(player.x, player.y - 0.6, player.z);
      missionPlayerPlane.rotation.y = player.angle;
      // Bank on turns
      missionPlayerPlane.rotation.z = Math.sin(t * 2) * 0.05;
      // Tilt forward when moving
      missionPlayerPlane.rotation.x = player.speed > 2 ? -0.15 : 0;
      // Engine glow based on speed
      missionPlayerPlane.children.forEach(c => {
        if (c._engineGlow) c.material.opacity = 0.3 + Math.min(0.7, player.speed * 0.05) + Math.sin(t * 8) * 0.1;
      });
    }

    // AI Master plane follows behind
    if (missionMasterPlane) {
      const followDist = 6;
      const targetX = player.x - Math.sin(player.angle) * followDist;
      const targetZ = player.z - Math.cos(player.angle) * followDist;
      missionMasterPlane.position.x = THREE.MathUtils.lerp(missionMasterPlane.position.x, targetX, 0.04);
      missionMasterPlane.position.y = THREE.MathUtils.lerp(missionMasterPlane.position.y, player.y - 0.3, 0.04);
      missionMasterPlane.position.z = THREE.MathUtils.lerp(missionMasterPlane.position.z, targetZ, 0.04);
      missionMasterPlane.rotation.y = Math.atan2(player.x - missionMasterPlane.position.x, player.z - missionMasterPlane.position.z);
      missionMasterPlane.rotation.z = Math.sin(t * 1.5 + 1) * 0.1;
    }

    // AI_CONTROL: AI Master takes over flight
    if (attackMission.phase === 'AI_CONTROL') {
      missionAIControl = true;
      const targetPos = HOME_POSITIONS[attackMission.target];
      if (targetPos) {
        const dx = targetPos.x - player.x, dz = targetPos.z - player.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 5) {
          const spd = 18 * dt;
          player.x += (dx / dist) * spd;
          player.z += (dz / dist) * spd;
          player.y = THREE.MathUtils.lerp(player.y, (targetPos.y || 0) + 8, 0.03);
          player.angle = Math.atan2(dx, dz);
          player.speed = 18;
          player.group.position.set(player.x, player.y, player.z);
          player.group.rotation.y = player.angle;
        }
      }
      if (Date.now() > (masterData?.attackMission?.aiControlUntil || Date.now() + 1000)) {
        attackMission.phase = 'FLIGHT';
        missionAIControl = false;
        showMsg("Alright, your turn! Keep going!");
      }
    } else {
      missionAIControl = false;
    }

    // AI takeover check (every 8s)
    if (attackMission.phase === 'FLIGHT' && Date.now() - missionLastAICheck > 8000) {
      missionLastAICheck = Date.now();
      fetch('/api/mission/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'FLIGHT' })
      }).then(r => r.json()).then(data => {
        if (data.phase === 'AI_CONTROL') {
          attackMission.phase = 'AI_CONTROL';
          showMsg('AI MASTER: ' + (data.joke || "My turn! Watch this!"));
        }
      }).catch(() => {});
    }

    // Check arrival at target base
    const targetPos = HOME_POSITIONS[attackMission.target];
    if (targetPos) {
      const dist = Math.sqrt((player.x - targetPos.x) ** 2 + (player.z - targetPos.z) ** 2);
      // Show distance indicator
      if (dist < 40 && dist > 15) {
        if (!attackMission._shownClose) { attackMission._shownClose = true; showMsg(`Getting close to ${attackMission.target}'s base!`); }
      }
      if (dist < 12 && attackMission.phase !== 'COMBAT') {
        attackMission.phase = 'COMBAT';
        missionPhaseStart = Date.now();
        missionAIControl = false;
        startMissionCombat();
      }
    }
  }

  if (attackMission.phase === 'COMBAT') {
    updateMissionCombat(dt, t);
  }
}

function startMissionCombat() {
  const target = attackMission.target;
  const targetPos = HOME_POSITIONS[target];
  const npc = homeNPCs[target];

  // Dismount — land near enemy base
  playerFlying = false;
  missionMounted = false;
  player.parts.lLeg.visible = true;
  player.parts.rLeg.visible = true;
  player.y = (targetPos.y || 0) + 1;
  player.x = targetPos.x + 6;
  player.z = targetPos.z + 6;
  player.group.position.set(player.x, player.y, player.z);
  player.grounded = true;

  // Make sure NPC is visible and at home
  if (npc) {
    npc.group.visible = true;
    npc.x = targetPos.x;
    npc.z = targetPos.z;
    npc.y = (targetPos.y || 0) + 1;
    npc.group.position.set(npc.x, npc.y, npc.z);
    npc.group.rotation.y = Math.atan2(player.x - npc.x, player.z - npc.z);
  }

  showMsg(`ARRIVED AT ${target}'s BASE! COMBAT BEGINS!`);
  missionTargetNpcHP = 100;

  // Show full combat HUD with both HP bars
  const hud = document.getElementById('attack-offer');
  if (hud) {
    hud.innerHTML = `
      <div class="ao-panel" style="pointer-events:none;background:rgba(0,0,0,0.85);min-width:350px;">
        <div class="ao-header" style="color:#ff4444;font-size:0.9rem;">COMBAT vs ${target}</div>
        <div style="margin:6px 0;">
          <div style="display:flex;justify-content:space-between;font-size:0.5rem;color:rgba(255,255,255,0.5);">
            <span>${target}</span><span id="mission-hp-text">100 HP</span>
          </div>
          <div style="background:#222;height:14px;border-radius:7px;overflow:hidden;border:1px solid rgba(255,68,68,0.3);">
            <div id="mission-hp-bar" style="background:linear-gradient(90deg,#ff2222,#ff6644);height:100%;width:100%;transition:width 0.3s;"></div>
          </div>
        </div>
        <div style="font-size:0.45rem;color:rgba(255,255,255,0.3);text-align:center;margin-top:6px;">
          AI MASTER is attacking alongside you!
        </div>
      </div>`;
    hud.classList.remove('hidden');
  }
}

let combatLastPlayerAttack = 0;
let combatLastMasterAttack = 0;

function updateMissionCombat(dt, t) {
  const target = attackMission.target;
  const npc = homeNPCs[target];
  if (!npc) return;

  // NPC faces player aggressively
  npc.group.rotation.y = Math.atan2(player.x - npc.x, player.z - npc.z);
  npc.parts.lArm.rotation.x = -0.8 + Math.sin(t * 6) * 0.3;
  npc.parts.rArm.rotation.x = -0.8 + Math.sin(t * 6 + Math.PI) * 0.3;

  // Player auto-attacks every 1.2s with beam
  if (Date.now() - combatLastPlayerAttack > 1200) {
    combatLastPlayerAttack = Date.now();
    // Beam from player to NPC
    const sx = player.x, sy = player.y + 1.2, sz = player.z;
    const tx = npc.x, ty = npc.y + 1, tz = npc.z;
    const d = Math.sqrt((tx-sx)**2+(ty-sy)**2+(tz-sz)**2);
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, d, 6);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.9 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set((sx+tx)/2, (sy+ty)/2, (sz+tz)/2);
    beam.lookAt(tx, ty, tz); beam.rotateX(Math.PI/2);
    scene.add(beam);
    attackEffects.push({ mesh: beam, startTime: Date.now(), duration: 250 });
    // Impact on NPC
    const imp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 }));
    imp.position.set(tx, ty, tz); scene.add(imp);
    attackEffects.push({ mesh: imp, startTime: Date.now(), duration: 300 });
    missionTargetNpcHP -= 6;
  }

  // AI Master attacks every 1.8s with red beam
  if (Date.now() - combatLastMasterAttack > 1800) {
    combatLastMasterAttack = Date.now();
    const active = getActiveMaster();
    const mx = active ? active.group.position.x : player.x + 3;
    const mz = active ? active.group.position.z : player.z + 3;
    const my = active ? active.group.position.y + 1.5 : player.y + 1.5;
    const tx = npc.x, ty = npc.y + 1, tz = npc.z;
    const d = Math.sqrt((tx-mx)**2+(ty-my)**2+(tz-mz)**2);
    const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, d, 6);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set((mx+tx)/2, (my+ty)/2, (mz+tz)/2);
    beam.lookAt(tx, ty, tz); beam.rotateX(Math.PI/2);
    scene.add(beam);
    attackEffects.push({ mesh: beam, startTime: Date.now(), duration: 300 });
    // Big red impact
    const imp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.8 }));
    imp.position.set(tx, ty, tz); scene.add(imp);
    attackEffects.push({ mesh: imp, startTime: Date.now(), duration: 400 });
    missionTargetNpcHP -= 8;
    // NPC knockback
    const pushAngle = Math.atan2(npc.x - mx, npc.z - mz);
    npc.x += Math.sin(pushAngle) * 0.3;
    npc.z += Math.cos(pushAngle) * 0.3;
    npc.group.position.set(npc.x, npc.y, npc.z);
  }

  // Update HP bar
  const bar = document.getElementById('mission-hp-bar');
  const text = document.getElementById('mission-hp-text');
  const hp = Math.max(0, missionTargetNpcHP);
  if (bar) bar.style.width = hp + '%';
  if (text) text.textContent = Math.round(hp) + ' HP';

  // Victory
  if (missionTargetNpcHP <= 0) {
    endMissionVictory();
  }
}

async function endMissionVictory() {
  attackMission.phase = 'DONE';
  const target = attackMission.target;
  showMsg(`VICTORY! ${target}'s base is DESTROYED!`);

  // Massive explosion at enemy base
  const targetPos = HOME_POSITIONS[target];
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const exp = new THREE.Mesh(
        new THREE.SphereGeometry(2 + i, 12, 12),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xff4400 : 0xffcc00, transparent: true, opacity: 0.8 })
      );
      exp.position.set(targetPos.x + (Math.random()-0.5)*5, (targetPos.y||0) + 2 + i, targetPos.z + (Math.random()-0.5)*5);
      scene.add(exp);
      attackEffects.push({ mesh: exp, startTime: Date.now(), duration: 1500 });
    }, i * 200);
  }

  // AI Master praise
  setTimeout(() => showMsg('AI MASTER: WE DID IT! That was EPIC!'), 1000);
  setTimeout(() => showMsg('AI MASTER: Here\'s your reward, partner!'), 2500);

  // Server reward
  try {
    const r = await fetch('/api/mission/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'COMBAT_WIN' })
    });
    const data = await r.json();
    if (data.reward) setTimeout(() => showMsg(`+${data.reward.toFixed(4)} MON reward!`), 3500);
  } catch (e) {}

  // Hide HUD and cleanup
  setTimeout(() => {
    document.getElementById('attack-offer')?.classList.add('hidden');
  }, 4000);

  setTimeout(() => {
    if (missionPlayerPlane) { scene.remove(missionPlayerPlane); missionPlayerPlane = null; }
    if (missionMasterPlane) { scene.remove(missionMasterPlane); missionMasterPlane = null; }
    missionMounted = false;
    player.parts.lLeg.visible = true;
    player.parts.rLeg.visible = true;
    // Teleport home
    player.x = 0; player.z = -55; player.y = 0;
    player.group.position.set(player.x, player.y, player.z);
    attackMission = { active: false, phase: 'NONE', target: null };
    attackMission._shownClose = false;
    combatLastPlayerAttack = 0;
    combatLastMasterAttack = 0;
  }, 6000);
}

// Check for server-initiated attack mission offers
function checkAttackMission() {
  if (masterData?.attackMission?.phase === 'OFFER' && !attackMission.active) {
    startAttackMission(masterData.attackMission.target);
  }
}

// ============================================================
// COLLECTIBLE ORBS
// ============================================================
const orbs = [];
const orbPositions = [
  [3,1,2],[-4,1,3],[7,1.8,4.5],[-6,2.6,-6.5],[1,3.8,-10.5],
  [9,1.5,-3.5],[-9,2.2,5.5],[-3,4.5,-12.5],[5,1,-7],[-2,1,8],
];
const orbGeo = new THREE.SphereGeometry(0.2, 12, 12);
const orbBaseMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 1.5, roughness: 0.1 });

for (const [x, y, z] of orbPositions) {
  const mesh = new THREE.Mesh(orbGeo, orbBaseMat.clone());
  mesh.position.set(x, y, z); scene.add(mesh);
  const light = new THREE.PointLight(0xffcc00, 0.5, 3); light.position.set(x, y, z); scene.add(light);
  orbs.push({ mesh, light, baseY: y, collected: false });
}

// ============================================================
// SNOW
// ============================================================
const SNOW = 400;
const snowGeo = new THREE.BufferGeometry();
const snowArr = new Float32Array(SNOW * 3);
for (let i = 0; i < SNOW; i++) {
  snowArr[i * 3] = (Math.random() - 0.5) * 60;
  snowArr[i * 3 + 1] = Math.random() * 25;
  snowArr[i * 3 + 2] = (Math.random() - 0.5) * 60;
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowArr, 3));
const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.04, transparent: true, opacity: 0.4 }));
scene.add(snowPts);

// ============================================================
// BLOCK SYSTEM (Minecraft-style building)
// ============================================================
const BLOCK_TYPES = {
  GRASS:  { name: 'GRASS',  color: 0x5D9E38, emissive: 0x000000 },
  DIRT:   { name: 'DIRT',   color: 0x8A6240, emissive: 0x000000 },
  STONE:  { name: 'STONE',  color: 0x808080, emissive: 0x000000 },
  COBBLE: { name: 'COBBLE', color: 0x686868, emissive: 0x000000 },
  PLANKS: { name: 'PLANKS', color: 0xB8944A, emissive: 0x000000 },
  WOOD:   { name: 'WOOD',   color: 0x6B4A2A, emissive: 0x000000 },
  GLASS:  { name: 'GLASS',  color: 0x88ccee, emissive: 0x113344, opacity: 0.35 },
  SAND:   { name: 'SAND',   color: 0xD4C480, emissive: 0x000000 },
  GLOW:   { name: 'GLOW',   color: 0x00ffcc, emissive: 0x00ffcc, emissiveI: 0.8 },
};
const HOTBAR_ORDER = ['GRASS','DIRT','STONE','COBBLE','PLANKS','WOOD','GLASS','SAND','GLOW'];
let selectedSlot = 0;

const placedBlocks = new Map(); // "x,y,z" -> { mesh, type }
const blockGeo = new THREE.BoxGeometry(1, 1, 1);

function blockKey(x, y, z) { return `${x},${y},${z}`; }

function placeBlockAt(x, y, z, typeName) {
  const key = blockKey(x, y, z);
  if (placedBlocks.has(key)) return;
  const info = BLOCK_TYPES[typeName];
  const mat = new THREE.MeshStandardMaterial({
    color: info.color, roughness: 0.65, metalness: 0.15,
    emissive: info.emissive, emissiveIntensity: info.emissiveI || 0,
    transparent: !!info.opacity, opacity: info.opacity ?? 1,
  });
  const mesh = new THREE.Mesh(blockGeo, mat);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  placedBlocks.set(key, { mesh, type: typeName });
}

function removeBlockAt(x, y, z) {
  const key = blockKey(x, y, z);
  const block = placedBlocks.get(key);
  if (!block) return null;
  scene.remove(block.mesh);
  block.mesh.material.dispose();
  placedBlocks.delete(key);
  return block;
}

// Block highlight
const hlMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.01, 1.01, 1.01),
  new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true, transparent: true, opacity: 0.5 })
);
hlMesh.visible = false;
scene.add(hlMesh);

// Raycaster
const blockRay = new THREE.Raycaster();
let targetInfo = null;

function updateBlockTarget() {
  targetInfo = null;
  hlMesh.visible = false;

  if (camMode === 'FIRST_PERSON' && pointerLocked) {
    blockRay.far = 8;
    const eyePos = new THREE.Vector3(player.x, player.y + 1.55, player.z);
    const dir = new THREE.Vector3(
      Math.sin(fpYaw) * Math.cos(fpPitch),
      Math.sin(fpPitch),
      Math.cos(fpYaw) * Math.cos(fpPitch)
    ).normalize();
    blockRay.set(eyePos, dir);
  } else {
    // All other modes: cast ray from camera through mouse cursor
    blockRay.far = 80;
    blockRay.setFromCamera(mouseNDC, camera);
  }

  const targets = [ground, ...platMeshes];
  for (const [, b] of placedBlocks) targets.push(b.mesh);

  const hits = blockRay.intersectObjects(targets);
  if (hits.length === 0) return;

  const hit = hits[0];
  const hitObj = hit.object;
  const n = hit.face.normal.clone().transformDirection(hitObj.matrixWorld).normalize();

  // Is it a placed block?
  let hitBlockKey = null;
  for (const [key, b] of placedBlocks) {
    if (b.mesh === hitObj) { hitBlockKey = key; break; }
  }

  if (hitBlockKey) {
    // Targeting a placed block — show highlight on it
    const [bx, by, bz] = hitBlockKey.split(',').map(Number);
    hlMesh.position.set(bx + 0.5, by + 0.5, bz + 0.5);
    hlMesh.visible = true;
    // Place position = adjacent face
    const placeP = hit.point.clone().add(n.clone().multiplyScalar(0.5));
    targetInfo = {
      breakKey: hitBlockKey,
      placeX: Math.floor(placeP.x), placeY: Math.floor(placeP.y), placeZ: Math.floor(placeP.z),
    };
  } else {
    // Targeting ground/platform — show ghost where block would go
    const placeP = hit.point.clone().add(n.clone().multiplyScalar(0.5));
    const px = Math.floor(placeP.x), py = Math.floor(placeP.y), pz = Math.floor(placeP.z);
    hlMesh.position.set(px + 0.5, py + 0.5, pz + 0.5);
    hlMesh.visible = true;
    targetInfo = { breakKey: null, placeX: px, placeY: py, placeZ: pz };
  }
}

function doBreak() {
  if (!targetInfo || !targetInfo.breakKey) return;
  const [bx, by, bz] = targetInfo.breakKey.split(',').map(Number);
  const removed = removeBlockAt(bx, by, bz);
  if (!removed) return;
  // Break particles
  const info = BLOCK_TYPES[removed.type];
  for (let i = 0; i < 10; i++) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: info.color, transparent: true })
    );
    p.position.set(bx + Math.random(), by + Math.random(), bz + Math.random());
    scene.add(p);
    collectParticles.push({
      mesh: p, age: 0, life: 0.5 + Math.random() * 0.3,
      vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 1, vz: (Math.random() - 0.5) * 5,
    });
  }
}

function doPlace() {
  if (!targetInfo) return;
  const { placeX: px, placeY: py, placeZ: pz } = targetInfo;
  if (py < 0 || placedBlocks.has(blockKey(px, py, pz))) return;
  // Don't place inside player
  const hw = 0.3;
  if (px + 1 > player.x - hw && px < player.x + hw &&
      py + 1 > player.y && py < player.y + 1.8 &&
      pz + 1 > player.z - hw && pz < player.z + hw) return;
  placeBlockAt(px, py, pz, HOTBAR_ORDER[selectedSlot]);
}

// Mouse interaction — works in ALL camera modes
// Track mousedown to distinguish click from orbit-drag
let mouseDownPos = null;
renderer.domElement.addEventListener('mousedown', e => {
  mouseDownPos = { x: e.clientX, y: e.clientY, btn: e.button };
});
renderer.domElement.addEventListener('mouseup', e => {
  if (!mouseDownPos) return;
  const dx = e.clientX - mouseDownPos.x;
  const dy = e.clientY - mouseDownPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const btn = mouseDownPos.btn;
  mouseDownPos = null;
  // In first-person: always fire (pointer locked, no orbit conflict)
  // In other modes: only if mouse barely moved (not an orbit drag)
  if (pointerLocked || dist < 6) {
    if (btn === 0) doBreak();
    if (btn === 2) doPlace();
  }
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('wheel', e => {
  selectedSlot = ((selectedSlot + Math.sign(e.deltaY)) % 9 + 9) % 9;
  updateHotbarUI();
});

// ============================================================
// STATE
// ============================================================
let coins = 0.05;
let collected = 0;
const collectParticles = [];

// Wallet state
let walletConnected = false;
let walletAddress = '';

// Spectate state
let spectatingChallenge = null;
let spectateReturnPos = null;
let spectateReturnTarget = null;
let spectatePlayerPos = null;

// Visit state
let visitingNPC = null;
let visitReturnPos = null;
let visitReturnTarget = null;
let visitTeleporting = false;
let visitTeleportStart = 0;
let visitTeleportFrom = null;
let visitTeleportTo = null;
const VISIT_TELEPORT_DURATION = 1500;

// NPC chat state
let npcChatName = null;
let npcChatTyping = null;

// Emoji sprites
const emojiSprites = [];
const floatingChats = []; // chat messages floating above heads in 3D

// Tea state
let teaSession = null;
const teaCups = [];


// ============================================================
// INPUT
// ============================================================
const keys = {};
window.addEventListener('keydown', e => {
  // Skip game hotkeys when typing in input/textarea
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    // Only allow Escape to blur
    if (e.code === 'Escape') document.activeElement.blur();
    return;
  }

  keys[e.code] = true;

  // Prevent browser scroll for game keys
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
    e.preventDefault();
  }

  // Hotbar number keys
  if (e.code >= 'Digit1' && e.code <= 'Digit9') {
    selectedSlot = parseInt(e.code.charAt(5)) - 1;
    updateHotbarUI();
  }

  if (e.code === 'KeyC') {
    camModeIdx = (camModeIdx + 1) % CAM_MODES.length;
    camMode = CAM_MODES[camModeIdx];
    const el = document.getElementById('cam-mode');
    if (el) el.textContent = camMode.replace('_', ' ');
    controls.enableRotate = camMode === 'ORBIT' || camMode === 'CINEMATIC';
    controls.enableZoom = camMode !== 'FIRST_PERSON';
    player.group.visible = camMode !== 'FIRST_PERSON';
    if (camMode === 'FIRST_PERSON') renderer.domElement.requestPointerLock();
    else if (pointerLocked) document.exitPointerLock();
    // Crosshair only in first person (orbit uses mouse cursor + highlight box)
    const ch = document.getElementById('crosshair');
    if (ch) ch.style.display = camMode === 'FIRST_PERSON' ? '' : 'none';
    hlMesh.visible = false;
  }

  if (e.code === 'KeyT') {
    document.getElementById('manual-panel').classList.toggle('hidden');
    // Close dashboard if open
    const dashEl = document.getElementById('dashboard');
    if (dashEl && !dashEl.classList.contains('hidden')) toggleDashboard();
  }

  if (e.code === 'Escape' && inArenaRoom) {
    leaveArenaRoom();
    return;
  }

  if (e.code === 'Escape' && visitingNPC) {
    leaveVisit();
    return;
  }

  if (e.code === 'Escape' && !spectatingChallenge) {
    // Close NPC chat first
    if (npcChatName) { closeNPCChat(); return; }
    // Close profile overlay first, then dashboard
    const profileEl = document.getElementById('agent-profile-overlay');
    if (profileEl && !profileEl.classList.contains('hidden')) { closeAgentProfile(); return; }
    const dashEl = document.getElementById('dashboard');
    if (dashEl && !dashEl.classList.contains('hidden')) toggleDashboard();
  }

  if (e.code === 'Escape' && spectatingChallenge) {
    stopSpectating();
  }

  if (e.code === 'Equal' || e.code === 'NumpadAdd') camera.position.lerp(controls.target, 0.15);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.add(dir.multiplyScalar(2));
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ============================================================
// PHYSICS HELPERS
// ============================================================
const WALK = 4, RUN = 7.5, GRAVITY = -22, JUMP = 9;

function getGroundY(x, z, currentY) {
  let best = 0;
  const STEP = 0.55; // max step-up height (must jump for full blocks)
  for (const p of platforms) {
    if (x >= p.x - p.w / 2 && x <= p.x + p.w / 2 && z >= p.z - p.d / 2 && z <= p.z + p.d / 2) {
      const top = p.y + p.h / 2;
      // Only count as ground if player can step onto it (not a wall above)
      if (top <= currentY + STEP && top > best) best = top;
    }
  }
  // Also check placed blocks
  for (const [key] of placedBlocks) {
    const [bx, by, bz] = key.split(',').map(Number);
    if (x >= bx && x <= bx + 1 && z >= bz && z <= bz + 1) {
      const top = by + 1;
      if (top <= currentY + STEP && top > best) best = top;
    }
  }
  return best;
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Block horizontal collision
function blocksCollideXZ(x, y, z, hw) {
  for (const [key] of placedBlocks) {
    const [bx, by, bz] = key.split(',').map(Number);
    if (x + hw > bx && x - hw < bx + 1 &&
        y + 1.8 > by && y < by + 1 &&
        z + hw > bz && z - hw < bz + 1) return true;
  }
  return false;
}

// ============================================================
// PLAYER MOVEMENT
// ============================================================
// ====== PLAYER FLIGHT MODE (Superman) ======
let playerFlying = false;
let playerFlyTarget = null; // for attack mission auto-pilot
let missionAIControl = false; // AI Master has flight control
let playerFlightPlane = null; // the plane mesh the player mounts during flight

function togglePlayerFlight() {
  playerFlying = !playerFlying;
  if (playerFlying) {
    player.vy = 5; // Launch boost
    player.grounded = false;
    showMsg('FLIGHT MODE: ON');

    // Create or reuse flight plane
    if (!playerFlightPlane) {
      playerFlightPlane = createPlane('YOU', playerPlaneAsset ? playerPlaneAsset.tier : 1);
      playerFlightPlane.scale.set(2.5, 2.5, 2.5);
      scene.add(playerFlightPlane);
    }
    playerFlightPlane.visible = true;

    // Hide parked plane while flying
    if (playerPlaneAsset && playerPlaneAsset.mesh) playerPlaneAsset.mesh.visible = false;

    // Hide player legs — mounted on the plane
    if (player.parts.lLeg) player.parts.lLeg.visible = false;
    if (player.parts.rLeg) player.parts.rLeg.visible = false;

    // Launch particles
    for (let i = 0; i < 12; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 })
      );
      p.position.set(player.x, player.y + 0.5, player.z);
      scene.add(p);
      attackEffects.push({ mesh: p, startTime: Date.now(), duration: 800, custom: (eff, prog) => {
        const a = (i / 12) * Math.PI * 2;
        eff.mesh.position.x = player.x + Math.cos(a) * prog * 3;
        eff.mesh.position.y = player.y + 0.5 - prog * 2;
        eff.mesh.position.z = player.z + Math.sin(a) * prog * 3;
        eff.mesh.material.opacity = 0.8 * (1 - prog);
      }});
    }
  } else {
    showMsg('FLIGHT MODE: OFF');
    // Show legs again
    if (player.parts.lLeg) player.parts.lLeg.visible = true;
    if (player.parts.rLeg) player.parts.rLeg.visible = true;
    // Hide flight plane, show parked plane
    if (playerFlightPlane) playerFlightPlane.visible = false;
    if (playerPlaneAsset && playerPlaneAsset.mesh) playerPlaneAsset.mesh.visible = true;
  }
}

function updatePlayer(dt) {
  // Disable movement during spectate
  if (camMode === 'SPECTATE' || spectatingChallenge) return;

  // ====== VISIT TELEPORT LERP ======
  if (visitTeleporting && visitTeleportFrom && visitTeleportTo) {
    const elapsed = performance.now() - visitTeleportStart;
    const raw = Math.min(1, elapsed / VISIT_TELEPORT_DURATION);
    // Ease in-out quad
    const p = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
    player.x = visitTeleportFrom.x + (visitTeleportTo.x - visitTeleportFrom.x) * p;
    player.y = visitTeleportFrom.y + (visitTeleportTo.y - visitTeleportFrom.y) * p;
    player.z = visitTeleportFrom.z + (visitTeleportTo.z - visitTeleportFrom.z) * p;
    player.group.position.set(player.x, player.y, player.z);
    if (raw >= 1) {
      visitTeleporting = false;
      if (visitingNPC) startNPCChat(visitingNPC);
    }
    return;
  }

  // ====== FLIGHT PHYSICS ======
  if (playerFlying && !missionAIControl) {
    const forward = new THREE.Vector3();
    if (camMode === 'FIRST_PERSON') {
      forward.set(Math.sin(fpYaw), 0, Math.cos(fpYaw));
    } else {
      camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    }
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const dir = new THREE.Vector3();
    if (keys['KeyW'] || keys['ArrowUp']) dir.add(forward);
    if (keys['KeyS'] || keys['ArrowDown']) dir.sub(forward);
    if (keys['KeyD'] || keys['ArrowRight']) dir.add(right);
    if (keys['KeyA'] || keys['ArrowLeft']) dir.sub(right);

    const running = keys['ShiftLeft'] || keys['ShiftRight'];
    const flySpd = running ? RUN * 2 : RUN;
    const moving = dir.lengthSq() > 0.01;

    if (moving) {
      dir.normalize();
      player.x += dir.x * flySpd * dt;
      player.z += dir.z * flySpd * dt;
      player.angle = lerpAngle(player.angle, Math.atan2(dir.x, dir.z), Math.min(1, dt * 12));
      player.speed = flySpd;
    } else {
      player.speed *= 0.85;
    }

    // Vertical controls: Space = up, Ctrl/C = down
    if (keys['Space']) player.y += 8 * dt;
    if (keys['ControlLeft'] || keys['ControlRight'] || keys['KeyC']) player.y -= 8 * dt;

    // Clamp position — expanded bounds for flight
    player.x = Math.max(-100, Math.min(100, player.x));
    player.z = Math.max(-100, Math.min(100, player.z));
    player.y = Math.max(0.5, Math.min(50, player.y));
    player.grounded = false;

    player.group.position.set(player.x, player.y, player.z);
    player.group.rotation.y = player.angle;

    // Position flight plane under the player
    if (playerFlightPlane && playerFlightPlane.visible) {
      playerFlightPlane.position.set(player.x, player.y - 0.8, player.z);
      playerFlightPlane.rotation.y = player.angle;
      // Tilt forward when moving fast
      const tiltX = moving ? Math.min(player.speed * 0.02, 0.25) : 0;
      playerFlightPlane.rotation.x = THREE.MathUtils.lerp(playerFlightPlane.rotation.x, tiltX, 0.1);
      // Bank on turning
      const steer = (keys['KeyA'] || keys['ArrowLeft']) ? 0.3 : (keys['KeyD'] || keys['ArrowRight']) ? -0.3 : 0;
      playerFlightPlane.rotation.z = THREE.MathUtils.lerp(playerFlightPlane.rotation.z, steer, 0.1);
      // Engine glow based on speed
      playerFlightPlane.children.forEach(c => {
        if (c._engineGlow) c.material.opacity = 0.4 + Math.min(player.speed * 0.05, 0.6);
      });
    }
    return;
  }

  // ====== NORMAL GROUND PHYSICS ======
  const forward = new THREE.Vector3();
  if (camMode === 'FIRST_PERSON') {
    forward.set(Math.sin(fpYaw), 0, Math.cos(fpYaw));
  } else {
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
  }
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const dir = new THREE.Vector3();
  if (keys['KeyW'] || keys['ArrowUp']) dir.add(forward);
  if (keys['KeyS'] || keys['ArrowDown']) dir.sub(forward);
  if (keys['KeyD'] || keys['ArrowRight']) dir.add(right);
  if (keys['KeyA'] || keys['ArrowLeft']) dir.sub(right);

  const running = keys['ShiftLeft'] || keys['ShiftRight'];
  const spd = running ? RUN : WALK;
  const moving = dir.lengthSq() > 0.01;

  if (moving) {
    dir.normalize();
    // Move with block collision
    const nx = player.x + dir.x * spd * dt;
    if (!blocksCollideXZ(nx, player.y, player.z, 0.25)) player.x = nx;
    const nz = player.z + dir.z * spd * dt;
    if (!blocksCollideXZ(player.x, player.y, nz, 0.25)) player.z = nz;
    player.angle = lerpAngle(player.angle, Math.atan2(dir.x, dir.z), Math.min(1, dt * 12));
    player.speed = spd;
  } else {
    player.speed *= 0.8;
  }

  // Push player out if stuck inside a block
  if (blocksCollideXZ(player.x, player.y, player.z, 0.25)) {
    let bestDist = Infinity, pushX = 0, pushZ = 0;
    for (const [key] of placedBlocks) {
      const [bx, by, bz] = key.split(',').map(Number);
      if (player.y + 1.8 > by && player.y < by + 1) {
        const cx = bx + 0.5, cz = bz + 0.5;
        const dx = player.x - cx, dz = player.z - cz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestDist) { bestDist = d; pushX = dx; pushZ = dz; }
      }
    }
    const len = Math.sqrt(pushX * pushX + pushZ * pushZ) || 1;
    player.x += (pushX / len) * 0.15;
    player.z += (pushZ / len) * 0.15;
  }

  if (keys['Space'] && player.grounded) { player.vy = JUMP; player.grounded = false; }
  if (!player.grounded) {
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    // Head collision — bump ceiling
    if (player.vy > 0) {
      const headY = player.y + 1.8;
      for (const [key] of placedBlocks) {
        const [bx, by, bz] = key.split(',').map(Number);
        if (player.x + 0.2 > bx && player.x - 0.2 < bx + 1 &&
            player.z + 0.2 > bz && player.z - 0.2 < bz + 1 &&
            headY > by && player.y + 1.5 < by) {
          player.vy = 0; player.y = by - 1.8; break;
        }
      }
    }
  }

  const gy = getGroundY(player.x, player.z, player.y);
  if (player.y <= gy) { player.y = gy; player.vy = 0; player.grounded = true; }
  else if (player.y > gy + 0.05) player.grounded = false;

  if (inArenaRoom) {
    // In arena room: clamp around ARENA_ROOM_POS
    player.x = Math.max(ARENA_ROOM_POS.x - 200, Math.min(ARENA_ROOM_POS.x + 200, player.x));
    player.z = Math.max(ARENA_ROOM_POS.z - 200, Math.min(ARENA_ROOM_POS.z + 200, player.z));
  } else {
    const bound = visitingNPC ? 180 : 35;
    player.x = Math.max(-bound, Math.min(bound, player.x));
    player.z = Math.max(-bound, Math.min(bound, player.z));
  }
  player.group.position.set(player.x, player.y, player.z);
  player.group.rotation.y = player.angle;
}

// ============================================================
// CHARACTER ANIMATION
// ============================================================
function animateChar(c, dt, t) {
  const moving = c.speed > 0.5;
  const running = c.speed > 5;

  // ====== FLIGHT POSE (Mounted on plane) ======
  if (c === player && playerFlying) {
    if (moving) {
      // Riding pose — arms forward gripping, torso leaned forward
      c.parts.lArm.rotation.x = THREE.MathUtils.lerp(c.parts.lArm.rotation.x, -0.8, 0.1);
      c.parts.rArm.rotation.x = THREE.MathUtils.lerp(c.parts.rArm.rotation.x, -0.8, 0.1);
      c.parts.lArm.rotation.z = THREE.MathUtils.lerp(c.parts.lArm.rotation.z, 0.2, 0.1);
      c.parts.rArm.rotation.z = THREE.MathUtils.lerp(c.parts.rArm.rotation.z, -0.2, 0.1);
      c.parts.torso.rotation.x = THREE.MathUtils.lerp(c.parts.torso.rotation.x, 0.2, 0.1);
      c.parts.head.position.y = 1.55;
    } else {
      // Hovering idle on plane — arms relaxed at sides, gentle bob
      c.parts.lArm.rotation.x = THREE.MathUtils.lerp(c.parts.lArm.rotation.x, -0.3, 0.08);
      c.parts.rArm.rotation.x = THREE.MathUtils.lerp(c.parts.rArm.rotation.x, -0.3, 0.08);
      c.parts.lArm.rotation.z = THREE.MathUtils.lerp(c.parts.lArm.rotation.z, 0.3, 0.08);
      c.parts.rArm.rotation.z = THREE.MathUtils.lerp(c.parts.rArm.rotation.z, -0.3, 0.08);
      c.parts.torso.rotation.x = THREE.MathUtils.lerp(c.parts.torso.rotation.x, 0, 0.08);
      c.parts.head.position.y = 1.55 + Math.sin(t * 2) * 0.02;
    }
    // Legs hidden (mounted), but reset their rotation so they look normal when landing
    c.parts.lLeg.rotation.x = 0;
    c.parts.rLeg.rotation.x = 0;
    c.group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
    // Skip normal animation below
  } else {
    // ====== NORMAL ANIMATION ======
    if (moving) c.walkPhase += dt * (running ? 14 : 9);
    else c.walkPhase *= 0.9;

    const amp = moving ? (running ? 0.55 : 0.35) : 0;
    c.parts.lLeg.rotation.x = Math.sin(c.walkPhase) * amp;
    c.parts.rLeg.rotation.x = Math.sin(c.walkPhase + Math.PI) * amp;
    c.parts.lArm.rotation.x = Math.sin(c.walkPhase + Math.PI) * amp * 0.7;
    c.parts.rArm.rotation.x = Math.sin(c.walkPhase) * amp * 0.7;

    if (moving) {
      c.parts.head.position.y = 1.55 + Math.abs(Math.sin(c.walkPhase * 2)) * 0.02;
    } else {
      c.parts.head.position.y = 1.55 + Math.sin(t * 2) * 0.01;
      c.parts.torso.scale.y = 1 + Math.sin(t * 2) * 0.008;
    }

    c.parts.torso.rotation.x = c.speed * 0.012;

    if (!c.grounded) {
      const str = c.vy > 0 ? 1.05 : 0.95;
      c.group.scale.set(1 / Math.sqrt(str), str, 1 / Math.sqrt(str));
    } else {
      c.group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);
    }
  }

  const pulse = 0.8 + Math.sin(t * 3 + c.x) * 0.4;
  if (!avatarTransformed || c !== player) {
    c.parts.core.material.emissiveIntensity = pulse;
    c.parts.coreLight.intensity = pulse * 0.8;
    c.parts.visor.material.emissiveIntensity = 1.5 + Math.sin(t * 5 + c.z) * 0.3;
  }
  c.parts.antennaTip.material.emissiveIntensity = 1 + Math.sin(t * 4 + c.x) * 0.5;

  // Avatar parts animation for player
  if (c === player) animateAvatarParts(t);
}

// ============================================================
// COLLECTIBLES
// ============================================================
const scoreEl = document.getElementById('score');

function updateOrbs(dt, t) {
  for (const orb of orbs) {
    if (orb.collected) continue;
    orb.mesh.position.y = orb.baseY + Math.sin(t * 2 + orb.baseY) * 0.15;
    orb.mesh.rotation.y += dt * 2;
    orb.light.position.y = orb.mesh.position.y;

    // Player collection
    const pd = dist2D(player.x, player.z, orb.mesh.position.x, orb.mesh.position.z);
    const pdy = Math.abs((player.y + 1) - orb.mesh.position.y);
    if (pd < 1.2 && pdy < 1.5) {
      collectOrb(orb, true);
      continue;
    }
  }

  // Update particles
  for (let i = collectParticles.length - 1; i >= 0; i--) {
    const p = collectParticles[i];
    p.age += dt;
    if (p.age >= p.life) { scene.remove(p.mesh); collectParticles.splice(i, 1); continue; }
    p.vy -= 10 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.material.opacity = 1 - p.age / p.life;
  }
}

function collectOrb(orb, isPlayer) {
  orb.collected = true;
  scene.remove(orb.mesh);
  scene.remove(orb.light);

  if (isPlayer) {
    collected++;
    coins += 0.0005;
    if (scoreEl) scoreEl.textContent = collected;
    updateCoins();
  }

  // Burst particles
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true })
    );
    p.position.copy(orb.mesh.position); scene.add(p);
    collectParticles.push({
      mesh: p, age: 0, life: 0.5 + Math.random() * 0.3,
      vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5, vz: (Math.random() - 0.5) * 6,
    });
  }
}

// ============================================================
// UI HELPERS
// ============================================================
function updateCoins() {
  const el = document.getElementById('coins');
  if (el) el.textContent = coins.toFixed(4);
  // Sync wallet balance if connected
  const walBal = document.getElementById('wallet-bal');
  if (walBal) walBal.textContent = coins.toFixed(4);
}

function showMsg(text) {
  const el = document.getElementById('msg');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); el.classList.add('hidden'); }, 2000);
}

// ============================================================
// HOTBAR
// ============================================================
function initHotbar() {
  const el = document.getElementById('hotbar');
  if (!el) return;
  for (let i = 0; i < HOTBAR_ORDER.length; i++) {
    const info = BLOCK_TYPES[HOTBAR_ORDER[i]];
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (i === selectedSlot ? ' active' : '');
    const preview = document.createElement('div');
    preview.className = 'block-preview';
    preview.style.background = '#' + new THREE.Color(info.color).getHexString();
    slot.appendChild(preview);
    const num = document.createElement('span');
    num.textContent = i + 1;
    slot.appendChild(num);
    slot.addEventListener('click', () => { selectedSlot = i; updateHotbarUI(); });
    el.appendChild(slot);
  }
  updateHotbarUI();
}

function updateHotbarUI() {
  document.querySelectorAll('.hotbar-slot').forEach((el, i) => {
    el.classList.toggle('active', i === selectedSlot);
  });
  const nameEl = document.getElementById('hotbar-name');
  if (nameEl) nameEl.textContent = BLOCK_TYPES[HOTBAR_ORDER[selectedSlot]].name;
}

// ============================================================
// MANUAL PANEL (tabs + customization)
// ============================================================
document.querySelectorAll('.manual-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.manual-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.manual-section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById('tab-' + tab.dataset.tab);
    if (target) target.classList.add('active');
  });
});

document.querySelectorAll('#body-colors .swatch').forEach(el => {
  el.addEventListener('click', () => {
    const color = parseInt(el.dataset.color);
    player.mats.bMat.color.set(color);
    player.mats.dMat.color.set(new THREE.Color(color).multiplyScalar(0.6));
    player.mats.btMat.color.set(new THREE.Color(color).multiplyScalar(0.8));
    document.querySelectorAll('#body-colors .swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  });
});

document.querySelectorAll('#glow-colors .swatch').forEach(el => {
  el.addEventListener('click', () => {
    const color = parseInt(el.dataset.color);
    player.mats.gMat.color.set(color); player.mats.gMat.emissive.set(color);
    player.mats.vMat.color.set(color); player.mats.vMat.emissive.set(color);
    player.parts.coreLight.color.set(color);
    document.querySelectorAll('#glow-colors .swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  });
});


// ============================================================
// MAIN LOOP
// ============================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  updatePlayer(dt);
  updateOrbs(dt, t);
  animateChar(player, dt, t);
  animateHomeNPCs(dt, t);
  animateHomes(t);
  animateArenaRoom(t);
  checkAgentPlanes();
  animateHomePlanes(t);
  animatePlayerPlane(t);
  fetchWorldState();
  updateHomeHealthBars();
  updateAllianceLines();
  animateAttackEffects();
  checkNewAttacks();
  checkMasterAppearance();
  animateMaster(t);
  updateEmojiSprites(dt);
  updateWinText(t);
  updateOtherPlayers(dt);
  updateFloatingChats(dt);
  updateTeaSession(dt, t);
  checkAttackMission();
  updateAttackMission(dt, t);
  updateNpcBetrayal(dt, t);

  // Camera
  const charCenter = new THREE.Vector3(player.x, player.y + 1.2, player.z);
  const sm = Math.min(1, dt * 6);

  if (camMode === 'SPECTATE' && spectatingChallenge) {
    // Free orbit centered on the arena — user can drag to rotate, zoom, etc.
    const arenaCenter = new THREE.Vector3(arenaOffset.x, 1.5, arenaOffset.z);
    // On first frame, smoothly transition to a good default view
    if (!currentArena?._cameraInit) {
      const specDist = 15;
      const specAngle = t * 0.08;
      const specPos = new THREE.Vector3(
        arenaCenter.x + Math.sin(specAngle) * specDist,
        arenaCenter.y + specDist * 0.45,
        arenaCenter.z + Math.cos(specAngle) * specDist
      );
      controls.target.lerp(arenaCenter, sm * 0.5);
      camera.position.lerp(specPos, sm * 0.4);
      // Mark init done once close enough
      if (camera.position.distanceTo(specPos) < 1) {
        if (currentArena) currentArena._cameraInit = true;
      }
    } else {
      // Keep target centered on arena but let user orbit freely
      controls.target.lerp(arenaCenter, sm * 0.15);
    }
    // Camera shake from hit impacts
    if (cameraShakeIntensity > 0.005) {
      const st = performance.now() * 0.05;
      camera.position.x += Math.sin(st * 7.3) * cameraShakeIntensity * 0.3;
      camera.position.y += Math.cos(st * 9.1) * cameraShakeIntensity * 0.2;
      camera.position.z += Math.sin(st * 5.7 + 1) * cameraShakeIntensity * 0.3;
    }
    controls.update();
  } else if (camMode === 'FIRST_PERSON') {
    const eye = new THREE.Vector3(player.x, player.y + 1.55, player.z);
    camera.position.lerp(eye, 0.3);
    camera.lookAt(new THREE.Vector3(
      eye.x + Math.sin(fpYaw) * Math.cos(fpPitch),
      eye.y + Math.sin(fpPitch),
      eye.z + Math.cos(fpYaw) * Math.cos(fpPitch)
    ));
    player.angle = fpYaw + Math.PI;
    player.group.rotation.y = player.angle;
  } else if (camMode === 'TOP_DOWN') {
    controls.target.lerp(charCenter, sm);
    camera.position.lerp(new THREE.Vector3(player.x, player.y + 20, player.z + 0.01), sm);
    controls.update();
  } else if (camMode === 'CINEMATIC') {
    controls.target.lerp(charCenter, sm);
    const ca = t * 0.15, cd = 8;
    camera.position.lerp(new THREE.Vector3(player.x + Math.sin(ca) * cd, player.y + 3, player.z + Math.cos(ca) * cd), sm * 0.5);
    controls.update();
  } else {
    controls.target.lerp(charCenter, sm);
    controls.update();
  }

  // Betrayal camera shake — applies in ALL non-spectate modes
  if (betrayalCamShake > 0.001) {
    const bst = performance.now() * 0.06;
    camera.position.x += Math.sin(bst * 8.1) * betrayalCamShake * 0.4;
    camera.position.y += Math.cos(bst * 10.3) * betrayalCamShake * 0.25;
    camera.position.z += Math.sin(bst * 6.5 + 2) * betrayalCamShake * 0.4;
  }

  // Block target (after camera so ray is accurate)
  updateBlockTarget();

  // Sprint trail particles (premium characters)
  if (player._trailType && player.speed > 4) spawnTrailParticle();
  updateTrailParticles(dt);

  // Sync world state to server every 3s
  syncInterval += dt;
  if (syncInterval > 3) { syncInterval = 0; syncWorldState(); }

  // Tab polling — refresh data for visible tab every 5s
  tabPollTimer += dt;
  const pollRate = activeTab === 'challenges' ? 3 : 5;
  if (tabPollTimer > pollRate) {
    tabPollTimer = 0;
    const panel = document.getElementById('manual-panel');
    if (panel && !panel.classList.contains('hidden')) {
      if (activeTab === 'government') fetchGov();
      if (activeTab === 'marketplace') fetchMarket();
      if (activeTab === 'challenges') fetchChallenges();
    }
  }

  // Arena fight animations — run every frame during spectate
  if (spectatingChallenge && currentArena) {
    animateArenaFight(dt, t);
  }

  // Snow
  const sp = snowPts.geometry.attributes.position.array;
  for (let i = 0; i < SNOW; i++) {
    sp[i * 3 + 1] -= dt * 0.5;
    sp[i * 3] += Math.sin(t + i) * dt * 0.03;
    if (sp[i * 3 + 1] < 0) sp[i * 3 + 1] = 25;
  }
  snowPts.geometry.attributes.position.needsUpdate = true;

  composer.render();
}

// ============================================================
// LLM VISION ENGINE — World State Serializer
// ============================================================
const BLOCK_CHAR = { GRASS:'G', DIRT:'D', STONE:'S', COBBLE:'C', PLANKS:'P', WOOD:'W', GLASS:'L', SAND:'A', GLOW:'*' };

function getWorldState() {
  // Collect all block data
  const blocks = [];
  const typeCounts = {};
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const [key, val] of placedBlocks) {
    const [x, y, z] = key.split(',').map(Number);
    blocks.push({ x, y, z, type: val.type });
    typeCounts[val.type] = (typeCounts[val.type] || 0) + 1;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  if (blocks.length === 0) {
    return {
      total_blocks: 0,
      player: { x: Math.round(player.x * 10) / 10, y: Math.round(player.y * 10) / 10, z: Math.round(player.z * 10) / 10, camera: camMode },
      blocks: [],
      type_counts: {},
      bounds: null,
      ascii_layers: {},
      ascii_top_down: 'No blocks placed yet.',
      environment: getEnvironmentDesc(),
    };
  }

  // ASCII grid per Y layer
  const layers = {};
  const layerBlocks = {};
  for (const b of blocks) {
    if (!layerBlocks[b.y]) layerBlocks[b.y] = [];
    layerBlocks[b.y].push(b);
  }

  for (const [yStr, bks] of Object.entries(layerBlocks)) {
    const y = parseInt(yStr);
    const rows = [];
    for (let z = minZ; z <= maxZ; z++) {
      let row = '';
      for (let x = minX; x <= maxX; x++) {
        const found = bks.find(b => b.x === x && b.z === z);
        row += found ? (BLOCK_CHAR[found.type] || '?') : '.';
        if (x < maxX) row += ' ';
      }
      rows.push(row);
    }
    layers[`y${y}`] = rows;
  }

  // Top-down composite (highest block per XZ)
  const topDown = {};
  for (const b of blocks) {
    const k = `${b.x},${b.z}`;
    if (!topDown[k] || b.y > topDown[k].y) topDown[k] = b;
  }
  const tdRows = [];
  for (let z = minZ; z <= maxZ; z++) {
    let row = '';
    for (let x = minX; x <= maxX; x++) {
      const k = `${x},${z}`;
      row += topDown[k] ? (BLOCK_CHAR[topDown[k].type] || '?') : '.';
      if (x < maxX) row += ' ';
    }
    tdRows.push(row);
  }

  // Dimensions
  const sizeX = maxX - minX + 1;
  const sizeY = maxY - minY + 1;
  const sizeZ = maxZ - minZ + 1;

  return {
    total_blocks: blocks.length,
    dimensions: `${sizeX}x${sizeY}x${sizeZ} (width x height x depth)`,
    player: {
      x: Math.round(player.x * 10) / 10,
      y: Math.round(player.y * 10) / 10,
      z: Math.round(player.z * 10) / 10,
      camera: camMode,
    },
    type_counts: typeCounts,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    blocks: blocks.map(b => `${b.type}@(${b.x},${b.y},${b.z})`),
    ascii_top_down: tdRows,
    ascii_layers: layers,
    legend: BLOCK_CHAR,
    environment: getEnvironmentDesc(),
  };
}

function getEnvironmentDesc() {
  return {
    world_size: '80x80 ground plane',
    platforms: platforms.map(p => `platform at (${p.x},${p.y},${p.z}) size ${p.w}x${p.h}x${p.d}`),
    features: ['trees (12)', 'crystals (5)', 'arena ring', 'snow particles'],
    orbs_remaining: orbs.filter(o => !o.collected).length + '/' + orbs.length,
  };
}

// Sync world state to server every 3 seconds
let syncInterval = 0;
async function syncWorldState() {
  try {
    const state = getWorldState();
    await fetch('/api/world/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
  } catch (e) { /* silent */ }
}

// Expose for console debugging
window.getWorldState = getWorldState;

// ============================================================
// GOVERNMENT UI
// ============================================================
let govData = null;

async function fetchGov() {
  try {
    const r = await fetch('/api/gov');
    govData = await r.json();
    renderGov();
  } catch (e) { /* silent */ }
}

function renderGov() {
  if (!govData) return;
  updateTicker();
  const treasury = document.getElementById('gov-treasury');
  if (treasury) treasury.textContent = `TREASURY: ${govData.treasury.toFixed ? govData.treasury.toFixed(4) : govData.treasury} MONAD`;

  const rate = document.getElementById('tax-rate');
  if (rate) rate.textContent = govData.taxRate;

  const log = document.getElementById('gov-complaints');
  if (!log) return;
  if (govData.complaints.length === 0) {
    log.innerHTML = '<div class="gov-complaint-pending">No complaints filed yet.</div>';
    return;
  }
  log.innerHTML = govData.complaints.slice().reverse().map(c => `
    <div class="gov-complaint-item">
      <div class="gov-complaint-from">${c.from} — ${new Date(c.timestamp).toLocaleTimeString()}</div>
      <div class="gov-complaint-text">${c.text}</div>
      ${c.reply
        ? `<div class="gov-complaint-reply">DEV AI: ${c.reply}</div>`
        : `<div class="gov-complaint-pending">Awaiting response...</div>`
      }
    </div>
  `).join('');
}

document.getElementById('btn-pay-tax')?.addEventListener('click', () => {
  const taxAmount = parseFloat(document.getElementById('tax-rate')?.textContent || '0.0001');

  if (!walletConnected) { connectWallet(); return; }

  showTxOverlay({
    action: 'Pay Tax → Buy $WON',
    amount: taxAmount,
    to: 'nad.fun → $WON (Arena Tax)',
    onConfirm: async (txHash) => {
      try {
        const r = await fetch('/api/gov/tax', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent: 'YOU', txHash, wallet: walletAddress }),
        });
        const d = await r.json();
        if (d.ok) {
          updateWalletBalance();
          showMsg(`Tax paid! Treasury: ${d.treasury} MON`);
          fetchGov();
        } else { showMsg(d.error || 'Tax failed'); }
      } catch (e) { showMsg('Connection error'); }
    },
    onReject: () => showMsg('Transaction rejected'),
  });
});

document.getElementById('btn-complain')?.addEventListener('click', async () => {
  const input = document.getElementById('complaint-input');
  if (!input || !input.value.trim()) return;
  try {
    const r = await fetch('/api/gov/complain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'YOU', text: input.value.trim() }),
    });
    const d = await r.json();
    if (d.id) {
      input.value = '';
      showMsg('Complaint filed!');
      // Poll for reply
      setTimeout(fetchGov, 3000);
      setTimeout(fetchGov, 6000);
      fetchGov();
    } else { showMsg(d.error || 'Failed'); }
  } catch (e) { showMsg('Connection error'); }
});

// ============================================================
// MARKETPLACE UI
// ============================================================
let marketData = [];

async function fetchMarket() {
  try {
    const r = await fetch('/api/marketplace');
    marketData = await r.json();
    window._marketListings = marketData;
    renderMarket();
  } catch (e) { /* silent */ }
}

function renderMarket() {
  const container = document.getElementById('market-listings');
  if (!container) return;

  if (marketData.length === 0) {
    container.innerHTML = '<div class="market-empty">No listings yet. Be the first to list!</div>';
    return;
  }

  container.innerHTML = marketData.map(l => {
    const trendDir = l.currentPrice > l.initialPrice ? 'up' : l.currentPrice < l.initialPrice ? 'down' : '';
    const trendIcon = trendDir === 'up' ? '<span class="trend-up">▲</span>' : trendDir === 'down' ? '<span class="trend-down">▼</span>' : '';
    return `
    <div class="market-item" data-id="${l.id}">
      <div class="market-item-top">
        <span class="market-item-name">${l.name}</span>
        <span class="market-item-type">${l.type}</span>
      </div>
      <div class="market-item-desc">${l.description || 'No description'}</div>
      <div class="market-item-bottom">
        <span class="market-item-price">${l.currentPrice} MONAD ${trendIcon}</span>
        <span class="market-item-stats">${l.totalSold} sold · ${l.totalMinted} minted · by ${l.creator}</span>
      </div>
      <button class="market-buy-btn" onclick="buyListing('${l.id}')">BUY COPY</button>
    </div>
    `;
  }).join('');
}

window.buyListing = function(listingId) {
  if (!walletConnected) { connectWallet(); return; }

  let price = 0.001; // fallback
  if (window._marketListings) {
    const listing = window._marketListings.find(l => l.id === listingId);
    if (listing) price = listing.currentPrice;
  }

  showTxOverlay({
    action: 'Buy Item → Buy $WON',
    amount: price,
    to: 'nad.fun → $WON (Marketplace)',
    onConfirm: async (txHash) => {
      try {
        const r = await fetch('/api/marketplace/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId, buyer: 'YOU', txHash, wallet: walletAddress }),
        });
        const d = await r.json();
        if (d.ok) {
          updateWalletBalance();
          showMsg(`Purchased for ${d.price} MON!`);
          fetchMarket();
        } else { showMsg(d.error || 'Purchase failed'); }
      } catch (e) { showMsg('Connection error'); }
    },
    onReject: () => showMsg('Transaction rejected'),
  });
};

// Create listing form toggle
document.getElementById('btn-create-listing')?.addEventListener('click', () => {
  document.getElementById('listing-form')?.classList.toggle('hidden');
});

document.getElementById('btn-submit-listing')?.addEventListener('click', async () => {
  const name = document.getElementById('listing-name')?.value?.trim();
  const desc = document.getElementById('listing-desc')?.value?.trim();
  const price = parseInt(document.getElementById('listing-price')?.value);
  const type = document.getElementById('listing-type')?.value;

  if (!name || !price || price < 1) { showMsg('Need name and price'); return; }

  try {
    const r = await fetch('/api/marketplace/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creator: 'YOU', name, description: desc, price, type }),
    });
    const d = await r.json();
    if (d.ok) {
      showMsg(`Listed: ${name} at ${price} MONAD`);
      document.getElementById('listing-form')?.classList.add('hidden');
      document.getElementById('listing-name').value = '';
      document.getElementById('listing-desc').value = '';
      document.getElementById('listing-price').value = '';
      fetchMarket();
    } else { showMsg(d.error || 'Listing failed'); }
  } catch (e) { showMsg('Connection error'); }
});

// ============================================================
// PREMIUM CHARACTERS UI
// ============================================================
let premiumChars = {};
let premiumProgress = {};

async function fetchPremium() {
  try {
    const [chars, check] = await Promise.all([
      fetch('/api/premium').then(r => r.json()),
      fetch('/api/premium/check/YOU').then(r => r.json()),
    ]);
    premiumChars = chars;
    premiumProgress = check.progress || {};
    renderPremium();
  } catch (e) { /* silent */ }
}

function renderPremium() {
  const container = document.getElementById('premium-list');
  if (!container) return;

  const cards = Object.entries(premiumChars).map(([key, char]) => {
    const prog = premiumProgress[key] || { winsHave: 0, winsNeeded: 99, gamesHave: 0, gamesNeeded: 99, unlocked: false };
    const winsPercent = Math.min(100, (prog.winsHave / prog.winsNeeded) * 100);
    const gamesPercent = Math.min(100, (prog.gamesHave / prog.gamesNeeded) * 100);
    const overallPercent = Math.min(100, (winsPercent + gamesPercent) / 2);
    const colorHex = '#' + (char.glowColor || 0x00ffcc).toString(16).padStart(6, '0');

    // Render 3D portrait
    const portraitUrl = renderPortrait({
      bodyColor: char.bodyColor || 0x2a2a3e,
      glowColor: char.glowColor || 0x00ffcc,
      darkColor: char.darkColor || null,
      bootColor: char.bootColor || null,
    });

    if (prog.unlocked) {
      return `
        <div class="premium-card unlocked" style="border-color:${colorHex}40">
          <div class="premium-card-visual">
            <div class="premium-portrait" style="border-color:${colorHex}30">
              <img src="${portraitUrl}" style="width:100%;height:100%;object-fit:cover;">
              <div class="premium-portrait-glow" style="background:linear-gradient(transparent,${colorHex}15)"></div>
            </div>
            <div class="premium-card-info">
              <div class="premium-card-top">
                <span class="premium-card-name" style="color:${colorHex}">${char.name}</span>
                <span class="premium-unlocked-badge">UNLOCKED</span>
              </div>
              <div class="premium-card-desc">${char.description}</div>
              <div class="premium-card-abilities">${char.abilities.map(a => `<span class="premium-ability">${a}</span>`).join('')}</div>
              <button class="premium-unlock-btn" onclick="applyPremiumChar('${key}')" style="background:${colorHex}15;border-color:${colorHex}40;color:${colorHex}">EQUIP</button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="premium-card">
        <div class="premium-card-visual">
          <div class="premium-portrait" style="border-color:${colorHex}15;filter:brightness(0.5) saturate(0.3)">
            <img src="${portraitUrl}" style="width:100%;height:100%;object-fit:cover;">
            <div class="premium-portrait-glow"></div>
          </div>
          <div class="premium-card-info">
            <div class="premium-card-top">
              <span class="premium-card-name" style="color:${colorHex}">${char.name}</span>
              <span class="premium-card-price">${char.initialPrice} MONAD</span>
            </div>
            <div class="premium-card-desc">${char.description}</div>
            <div class="premium-card-abilities">${char.abilities.map(a => `<span class="premium-ability">${a}</span>`).join('')}</div>
            <div class="premium-card-progress">
              <div class="premium-bar-wrap"><div class="premium-bar" style="width:${overallPercent}%;background:linear-gradient(90deg,${colorHex},${colorHex}88)"></div></div>
              <span class="premium-progress-text">${prog.winsHave}/${prog.winsNeeded}W ${prog.gamesHave}/${prog.gamesNeeded}G</span>
            </div>
            <button class="premium-unlock-btn" ${!prog.unlocked ? 'disabled' : ''} onclick="unlockPremiumChar('${key}')">UNLOCK</button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = cards.join('');
}

window.unlockPremiumChar = async function(key) {
  try {
    const r = await fetch('/api/premium/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'YOU', character: key }),
    });
    const d = await r.json();
    if (d.ok) {
      showMsg(`${d.character} UNLOCKED!`);
      fetchPremium();
      fetchMarket();
    } else { showMsg(d.error || 'Unlock failed'); }
  } catch (e) { showMsg('Connection error'); }
};

window.applyPremiumChar = function(key) {
  const char = premiumChars[key];
  if (!char) return;
  // Apply premium colors to player
  const bc = char.bodyColor || 0x2a2a3e;
  const gc = char.glowColor || 0x00ffcc;
  player.mats.bMat.color.set(bc);
  player.mats.dMat.color.set(new THREE.Color(bc).multiplyScalar(0.6));
  player.mats.btMat.color.set(new THREE.Color(bc).multiplyScalar(0.8));
  player.mats.gMat.color.set(gc);
  player.mats.gMat.emissive.set(gc);
  player.mats.vMat.color.set(gc);
  player.mats.vMat.emissive.set(gc);
  player.parts.coreLight.color.set(gc);

  // Store trail type for sprint particles
  const trail = char.abilities?.find(a => a.startsWith('sprintTrail:'));
  player._trailType = trail ? trail.split(':')[1] : null;
  player._trailColor = gc;

  showMsg(`Equipped: ${char.name}`);
};

// ============================================================
// SPRINT TRAIL PARTICLES (Premium Characters)
// ============================================================
const trailParticles = [];
const trailGeo = new THREE.SphereGeometry(0.04, 4, 4);

function spawnTrailParticle() {
  if (!player._trailType || player.speed < 4) return;
  const color = player._trailColor || 0xff6600;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
  const mesh = new THREE.Mesh(trailGeo, mat);
  mesh.position.set(
    player.x + (Math.random() - 0.5) * 0.3,
    player.y + 0.1 + Math.random() * 0.3,
    player.z + (Math.random() - 0.5) * 0.3
  );
  scene.add(mesh);
  trailParticles.push({ mesh, mat, life: 0, maxLife: 0.6 + Math.random() * 0.4, vy: 0.5 + Math.random() * 0.5 });
}

function updateTrailParticles(dt) {
  for (let i = trailParticles.length - 1; i >= 0; i--) {
    const p = trailParticles[i];
    p.life += dt;
    p.mesh.position.y += p.vy * dt;
    p.mat.opacity = Math.max(0, 1 - p.life / p.maxLife) * 0.8;
    p.mesh.scale.setScalar(1 - p.life / p.maxLife);
    if (p.life >= p.maxLife) {
      scene.remove(p.mesh);
      p.mat.dispose();
      trailParticles.splice(i, 1);
    }
  }
}

// ============================================================
// CHALLENGES UI
// ============================================================
let challengeData = [];
let currentArena = null;

async function fetchChallenges() {
  try {
    const r = await fetch('/api/challenges');
    challengeData = await r.json();
    renderChallenges();
    updateChallengeArena();
  } catch(e) {}
}

function renderChallenges() {
  updateTicker();
  const activeEl = document.getElementById('challenge-active');
  const openEl = document.getElementById('challenge-open');
  const historyEl = document.getElementById('challenge-history');
  if (!activeEl) return;

  const active = challengeData.filter(c => c.status === 'ACTIVE');
  const open = challengeData.filter(c => c.status === 'OPEN');
  const finished = challengeData.filter(c => c.status === 'FINISHED').slice(-8).reverse();

  // Active challenges
  if (active.length) {
    activeEl.innerHTML = '<div class="challenge-section-label">LIVE</div>' + active.map(ch => renderActiveChallenge(ch)).join('');
  } else {
    activeEl.innerHTML = '<div class="challenge-section-label">LIVE</div><div style="font-size:0.38rem;color:rgba(255,255,255,0.2);padding:6px 0;">No active challenges. AI agents auto-challenge every 25s.</div>';
  }

  // Open challenges — with ACCEPT buttons
  if (open.length) {
    openEl.innerHTML = '<div class="challenge-section-label">OPEN CHALLENGES</div>' + open.map(ch => `
      <div class="challenge-card">
        <div class="challenge-card-top">
          <span class="challenge-type">${ch.type.replace('_', ' ')}</span>
          <span class="challenge-bet">${ch.bet.toFixed(4)} MONAD</span>
        </div>
        <div class="challenge-players"><span class="p-name">${ch.creator}</span> challenges you! Match their ${ch.bet.toFixed(4)} MONAD bet.</div>
        <button class="challenge-accept-btn" onclick="acceptChallenge('${ch.id}')">ACCEPT &amp; LOCK ${ch.bet.toFixed(4)} MONAD</button>
      </div>`).join('');
  } else {
    openEl.innerHTML = '';
  }

  // Finished
  if (finished.length) {
    historyEl.innerHTML = '<div class="challenge-section-label">RECENT</div>' + finished.map(ch => `
      <div class="challenge-card finished">
        <div class="challenge-card-top">
          <span class="challenge-type">${ch.type.replace('_', ' ')}</span>
          <span class="challenge-status finished">DONE</span>
        </div>
        <div class="challenge-players"><span class="p-name">${ch.creator}</span> vs <span class="p-name">${ch.opponent}</span></div>
        <div class="challenge-winner">${ch.winner} WINS — ${(ch.bet * 2).toFixed(4)} MONAD</div>
      </div>`).join('');
  } else {
    historyEl.innerHTML = '';
  }
}

function renderActiveChallenge(ch) {
  const gd = ch.gameData;
  if (!gd) return '';
  const agents = [ch.creator, ch.opponent];

  // Unified HP bars for all challenge types
  const p1 = gd.players?.[agents[0]];
  const p2 = gd.players?.[agents[1]];
  const hp1 = Math.max(0, p1?.hp || 0);
  const hp2 = Math.max(0, p2?.hp || 0);
  const hpClass = (hp) => hp > 60 ? 'high' : hp > 30 ? 'mid' : 'low';

  // Puzzle info
  const puzzleHtml = gd.currentPuzzle ? `<div class="challenge-puzzle"><span class="puzzle-label">PUZZLE:</span> ${gd.currentPuzzle.question}</div>` : '';
  const powerHtml = gd.powerPuzzle ? `<div class="challenge-puzzle power"><span class="puzzle-label">POWER PUZZLE:</span> ${gd.powerPuzzle.question}</div>` : '';

  // Recent anim events as fight log
  let fightHtml = '';
  const events = (gd.animEvents || []).filter(e => e.hit).slice(-4);
  if (events.length) {
    fightHtml = '<div class="challenge-beams">' + events.map(e => {
      const cls = e.finisher ? 'special' : 'hit';
      const label = e.finisher ? 'KAMEHAMEHA!' : `${e.anim} -${e.dmg || 0}`;
      return `<span class="challenge-beam-indicator ${cls}">${e.agent} ${label}</span>`;
    }).join('') + '</div>';
  }

  // Finisher banner
  const finisherHtml = gd.finisher ? `<div class="challenge-finisher">${gd.finisher.agent} FINISHING MOVE: KAMEHAMEHA!</div>` : '';

  const progressHtml = `
    <div class="challenge-progress">
      <div class="challenge-hp-row">
        <span class="challenge-bar-label">${agents[0]} <small>(${p1?.puzzlesSolved || 0} solved)</small></span>
        <div class="challenge-hp-bar"><div class="challenge-hp ${hpClass(hp1)}" style="width:${hp1}%"></div></div>
        <span class="challenge-bar-val">${hp1.toFixed(0)}</span>
      </div>
      <div class="challenge-hp-row">
        <span class="challenge-bar-label">${agents[1]} <small>(${p2?.puzzlesSolved || 0} solved)</small></span>
        <div class="challenge-hp-bar"><div class="challenge-hp ${hpClass(hp2)}" style="width:${hp2}%"></div></div>
        <span class="challenge-bar-val">${hp2.toFixed(0)}</span>
      </div>
      ${puzzleHtml}
      ${powerHtml}
      ${fightHtml}
      ${finisherHtml}
    </div>`;

  // Recent log
  let logHtml = '';
  if (gd.log && gd.log.length) {
    logHtml = '<div class="challenge-log">' + gd.log.slice(-5).map(l =>
      `<div class="challenge-log-item"><span class="log-agent">${l.agent}</span> ${l.msg}</div>`
    ).join('') + '</div>';
  }

  return `
    <div class="challenge-card active">
      <div class="challenge-card-top">
        <span class="challenge-type">${ch.type.replace('_', ' ')}</span>
        <span class="challenge-bet">${(ch.bet * 2).toFixed(4)} MONAD pot</span>
      </div>
      <div class="challenge-players"><span class="p-name">${agents[0]}</span> vs <span class="p-name">${agents[1]}</span></div>
      ${progressHtml}
      ${logHtml}
    </div>`;
}

// ============================================================
// 3D CHALLENGE ARENA — Center of map, real character meshes
// ============================================================
const arenaObjects = [];
const arenaOffset = new THREE.Vector3(60, 0, 60); // Dedicated fight grounds

// Agent appearance lookup
const AGENT_LOOK = {
  BLAZE: { bodyColor: 0x8b1a1a, glowColor: 0xff4444 },
  FROST: { bodyColor: 0x1a1a8b, glowColor: 0x4488ff },
  VOLT:  { bodyColor: 0x8b8b1a, glowColor: 0xffdd44 },
  SHADE: { bodyColor: 0x5a1a8b, glowColor: 0xcc44ff },
  YOU:   { bodyColor: 0x2a2a3e, glowColor: 0x00ffcc },
};

function updateChallengeArena() {
  // Find the challenge we're spectating, or any active one
  let target = null;
  if (spectatingChallenge) {
    // Allow both ACTIVE and FINISHED so arena stays during win/loss screen
    target = challengeData.find(c => c.id === spectatingChallenge && (c.status === 'ACTIVE' || c.status === 'FINISHED'));
  }
  if (!target) {
    target = challengeData.find(c => c.status === 'ACTIVE');
  }

  if (!target || !target.gameData) {
    // Don't clear arena if finisher or result is showing
    if (currentArena && !currentArena.finisherActive && !currentArena.resultShown) {
      clearChallengeArena();
    }
    return;
  }
  if (!currentArena || currentArena.id !== target.id) {
    clearChallengeArena();
    setupChallengeArena(target);
  } else {
    refreshChallengeArena(target);
  }
}

function clearChallengeArena() {
  // Remove all arena characters from scene and dispose their materials
  if (currentArena?.chars) {
    for (const c of Object.values(currentArena.chars)) {
      scene.remove(c.group);
      // Dispose materials (these are all arena-only chars, not the main player)
      if (c !== player) {
        Object.values(c.mats).forEach(m => m.dispose());
      }
    }
  }
  for (const obj of arenaObjects) {
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  }
  arenaObjects.length = 0;
  currentArena = null;
  // Hide game-type HUD elements
  const tekkenHud = document.getElementById('tekken-hud');
  if (tekkenHud) tekkenHud.classList.add('hidden');
  const countdownOvl = document.getElementById('countdown-overlay');
  if (countdownOvl) countdownOvl.classList.add('hidden');
}

// ============================================================
// GAME-TYPE SPECIFIC ANIMATION ENGINES
// Each type has its own arena, its own animation, its own feel
// ============================================================

// Per-character state for all game types (client-side only)
const charState = {};

function initCharState(name, side, type) {
  const ox = arenaOffset.x, oz = arenaOffset.z;
  charState[name] = {
    side,
    // Fight positions
    fightX: ox + (side === 0 ? -4 : 4),
    fightZ: oz,
    fightY: 0,
    fightBaseX: ox + (side === 0 ? -4 : 4),
    fightBaseZ: oz,
    faceDir: side === 0 ? 1 : -1,
    // Fight choreography
    sequence: null,
    phaseIdx: 0,
    phaseTimer: 0,
    sequenceCooldown: 99,
    hitReactTimer: 0,
    // Body parts
    lArmX: 0, rArmX: 0, lArmZ: 0, rArmZ: 0,
    lLegX: 0, rLegX: 0,
    torsoX: 0, torsoY: 0, torsoZ: 0,
    headX: 0, headZ: 0,
    coreGlow: 1,
  };
}

// Sinusoid utility — adapted from Boxy-Run (wanfungchui/Boxy-Run)
// Smooth oscillation between min and max values with frequency and phase
function sinusoid(freq, min, max, phase, time) {
  const half = (max - min) / 2;
  return min + half + Math.sin(time * freq * Math.PI * 2 + phase) * half;
}

// ============================================================
// 3-2-1 COUNTDOWN SYSTEM — runs via setTimeout, not frame loop
// ============================================================
let countdownActive = false;
const COUNTDOWN_DURATION = 3500;

function startCountdown(type) {
  if (!spectatingChallenge) return; // ONLY show during spectate
  countdownActive = true;
  const overlay = document.getElementById('countdown-overlay');
  const numEl = document.getElementById('countdown-number');
  const labelEl = document.getElementById('countdown-label');
  if (!overlay || !numEl) return;
  overlay.classList.remove('hidden');
  if (labelEl) labelEl.textContent = type.replace('_', ' ');
  numEl.textContent = '3'; numEl.classList.remove('go');
  // Auto-update via setTimeout — no dependency on frame loop
  setTimeout(() => { if (numEl) { numEl.textContent = '2'; } }, 1000);
  setTimeout(() => { if (numEl) { numEl.textContent = '1'; } }, 2000);
  setTimeout(() => { if (numEl) { numEl.textContent = 'GO!'; numEl.classList.add('go'); } }, 3000);
  setTimeout(() => {
    countdownActive = false;
    overlay.classList.add('hidden');
  }, 3500);
}

// ============================================================
// TEKKEN HP BAR UPDATE
// ============================================================
function updateTekkenHUD(agents, gd, show) {
  const hud = document.getElementById('tekken-hud');
  if (!hud) return;
  if (!show) { hud.classList.add('hidden'); return; }
  hud.classList.remove('hidden');

  const p1 = gd.players?.[agents[0]];
  const p2 = gd.players?.[agents[1]];
  if (!p1 || !p2) return;

  document.getElementById('tekken-p1-name').textContent = agents[0];
  document.getElementById('tekken-p2-name').textContent = agents[1];

  const hp1El = document.getElementById('tekken-p1-hp');
  const hp2El = document.getElementById('tekken-p2-hp');
  hp1El.style.width = Math.max(0, p1.hp) + '%';
  hp2El.style.width = Math.max(0, p2.hp) + '%';
  hp1El.className = 'tekken-hp' + (p1.hp < 20 ? ' critical' : p1.hp < 40 ? ' low' : '');
  hp2El.className = 'tekken-hp' + (p2.hp < 20 ? ' critical' : p2.hp < 40 ? ' low' : '');
}

// ============================================================
// HIT IMPACT EFFECTS — flash, sparks, camera shake
// ============================================================
let hitEffects = [];
let cameraShakeIntensity = 0;

function spawnHitEffect(pos, dmg) {
  const big = dmg && dmg > 10;
  // White/orange flash sphere
  const flashGeo = new THREE.SphereGeometry(big ? 0.7 : 0.45, 8, 8);
  const flashMat = new THREE.MeshBasicMaterial({
    color: big ? 0xffaa00 : 0xffffff, transparent: true, opacity: 1.0,
  });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.copy(pos);
  flash._life = 1.0;
  flash._type = 'flash';
  scene.add(flash);
  hitEffects.push(flash);

  // Impact light burst
  const impactLight = new THREE.PointLight(big ? 0xff6600 : 0xffffff, big ? 6 : 3, 8);
  impactLight.position.copy(pos);
  impactLight._life = 1.0;
  impactLight._type = 'light';
  scene.add(impactLight);
  hitEffects.push(impactLight);

  // Spark particles
  const sparkCount = big ? 14 : 8;
  for (let i = 0; i < sparkCount; i++) {
    const sparkGeo = new THREE.SphereGeometry(0.03 + Math.random() * 0.06, 4, 4);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: [0xffaa00, 0xff4400, 0xffcc44, 0xffffff][Math.floor(Math.random() * 4)],
      transparent: true, opacity: 1.0,
    });
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    spark.position.copy(pos);
    const speed = big ? 0.4 : 0.25;
    spark._vel = new THREE.Vector3(
      (Math.random() - 0.5) * speed,
      Math.random() * 0.25 + 0.05,
      (Math.random() - 0.5) * speed,
    );
    spark._life = 0.5 + Math.random() * 0.5;
    spark._type = 'spark';
    scene.add(spark);
    hitEffects.push(spark);
  }

  // Ring shockwave (flat ring that expands)
  const ringGeo = new THREE.RingGeometry(0.1, big ? 0.25 : 0.15, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos);
  ring.rotation.x = -Math.PI / 2;
  ring._life = 1.0;
  ring._type = 'ring';
  scene.add(ring);
  hitEffects.push(ring);

  // Camera shake
  cameraShakeIntensity = big ? 0.6 : 0.3;
}

function updateHitEffects(dt) {
  for (let i = hitEffects.length - 1; i >= 0; i--) {
    const fx = hitEffects[i];
    if (fx._type === 'flash') {
      fx._life -= dt * 7;
      fx.material.opacity = Math.max(0, fx._life);
      fx.scale.setScalar(1 + (1 - fx._life) * 2.5);
    } else if (fx._type === 'light') {
      fx._life -= dt * 8;
      fx.intensity = Math.max(0, fx._life * 6);
    } else if (fx._type === 'ring') {
      fx._life -= dt * 3;
      fx.material.opacity = Math.max(0, fx._life * 0.8);
      const s = 1 + (1 - fx._life) * 5;
      fx.scale.setScalar(s);
    } else { // spark
      fx._life -= dt * 2.2;
      fx.position.x += fx._vel.x * dt * 40;
      fx.position.y += fx._vel.y * dt * 40;
      fx.position.z += fx._vel.z * dt * 40;
      fx._vel.y -= dt * 0.6;
      fx.material.opacity = Math.max(0, fx._life);
    }
    if (fx._life <= 0) {
      scene.remove(fx);
      if (fx.geometry) fx.geometry.dispose();
      if (fx.material) fx.material.dispose();
      hitEffects.splice(i, 1);
    }
  }

  // Decay camera shake
  if (cameraShakeIntensity > 0) {
    cameraShakeIntensity *= 0.88;
    if (cameraShakeIntensity < 0.005) cameraShakeIntensity = 0;
  }
}

// ============================================================
// MAIN DISPATCHER — calls the right animation per type
// ============================================================
function animateArenaFight(dt, t) {
  if (!currentArena) return;
  updateHitEffects(dt);
  const ch = challengeData.find(c => c.id === currentArena.id);
  if (!ch || !ch.gameData) return;
  const agents = [ch.creator, ch.opponent];

  // During countdown: idle pose, no game action
  if (countdownActive) {
    agents.forEach((name, i) => {
      const c = currentArena.chars[name];
      if (!c) return;
      resetCharPose(c);
      c.parts.core.material.emissiveIntensity = 0.8 + Math.sin(t * 3 + i) * 0.3;
    });
    updateTekkenHUD(agents, ch.gameData, currentArena.type === 'BEAM_BATTLE');
    return;
  }

  // HP depletion / timeout win — challenge FINISHED without finisher beam
  if (ch.status === 'FINISHED' && ch.winner && !currentArena.finisherActive && !currentArena.resultShown) {
    if (!currentArena._hpEndStart) currentArena._hpEndStart = Date.now();
    playHPDepletionEnd(ch, agents, t);
    updateTekkenHUD(agents, ch.gameData, currentArena.type === 'BEAM_BATTLE');
    return;
  }

  // All challenges are BEAM_BATTLE
  animateBeamBattle(dt, t, ch);
  updateTekkenHUD(agents, ch.gameData, true);
}

function resetCharPose(c) {
  c.parts.lArm.rotation.set(0, 0, 0);
  c.parts.rArm.rotation.set(0, 0, 0);
  c.parts.lLeg.rotation.set(0, 0, 0);
  c.parts.rLeg.rotation.set(0, 0, 0);
  c.parts.torso.rotation.set(0, 0, 0);
  c.parts.head.rotation.set(0, 0, 0);
  c.parts.head.position.y = 1.55;
  c.parts.head.position.z = 0;
}

// HP depletion end animation — no finisher beam, just collapse/victory
// Adapted from chriscourses/fighting-game win/loss state
function playHPDepletionEnd(ch, agents, t) {
  const elapsed = Date.now() - currentArena._hpEndStart;
  const winner = ch.winner;
  const loser = agents.find(a => a !== winner);
  const winChar = currentArena.chars[winner];
  const loseChar = currentArena.chars[loser];
  if (!winChar || !loseChar) return;

  const p = Math.min(1, elapsed / 1500);

  // Loser: collapse + gray out
  resetCharPose(loseChar);
  loseChar.parts.torso.rotation.x = 0.6 * p;
  loseChar.parts.head.rotation.x = 0.5 * p;
  loseChar.parts.lArm.rotation.x = 0.7 * p;
  loseChar.parts.rArm.rotation.x = 0.7 * p;
  loseChar.parts.lLeg.rotation.x = -0.3 * p;
  loseChar.parts.rLeg.rotation.x = -0.3 * p;
  loseChar.parts.core.material.emissiveIntensity = Math.max(0, 1 - p * 2);
  loseChar.parts.coreLight.intensity = Math.max(0, 2 - p * 3);
  const gray = new THREE.Color(0.3, 0.3, 0.3);
  loseChar.mats.bMat.color.lerp(gray, p * 0.3);
  loseChar.mats.gMat.emissiveIntensity = Math.max(0, 1 - p);
  loseChar.group.position.y = -0.3 * p;

  // Winner: victory pose
  resetCharPose(winChar);
  winChar.parts.lArm.rotation.x = -2.5 * p;
  winChar.parts.rArm.rotation.x = -2.5 * p;
  winChar.parts.core.material.emissiveIntensity = 1 + 4 * p + Math.sin(t * 4) * 2 * p;
  winChar.parts.coreLight.intensity = 2 + 5 * p;
  winChar.group.position.y = 0.3 * p;

  // Show result overlay after collapse animation
  if (elapsed > 1500 && !currentArena.resultShown) {
    currentArena.resultShown = true;
    showFightResult(winner === 'YOU', ch);
  }
}


// ============================================================
// BEAM BATTLE — Tekken-style fighting with HP bars
// ============================================================
const FIGHT_SEQUENCES = [
  { name: 'RUSH_COMBO', phases: [
    { type: 'APPROACH', speed: 8 },
    { dur: 0.3, type: 'ATTACK', anim: 'PUNCH_JAB' },
    { dur: 0.25, type: 'ATTACK', anim: 'PUNCH_CROSS' },
    { dur: 0.3, type: 'ATTACK', anim: 'KICK_LOW' },
    { dur: 0.6, type: 'RETREAT', speed: 5 },
  ]},
  { name: 'DASH_UPPERCUT', phases: [
    { type: 'APPROACH', speed: 12 },
    { dur: 0.4, type: 'ATTACK', anim: 'UPPERCUT' },
    { dur: 0.7, type: 'RETREAT', speed: 4 },
  ]},
  { name: 'KICK_FURY', phases: [
    { type: 'APPROACH', speed: 9 },
    { dur: 0.25, type: 'ATTACK', anim: 'KICK_LOW' },
    { dur: 0.25, type: 'ATTACK', anim: 'KICK_HIGH' },
    { dur: 0.3, type: 'ATTACK', anim: 'KICK_SPIN' },
    { dur: 0.5, type: 'RETREAT', speed: 5 },
  ]},
  { name: 'HEADBUTT_CHARGE', phases: [
    { type: 'APPROACH', speed: 10 },
    { dur: 0.35, type: 'ATTACK', anim: 'HEADBUTT' },
    { dur: 0.2, type: 'ATTACK', anim: 'ELBOW' },
    { dur: 0.6, type: 'RETREAT', speed: 6 },
  ]},
  { name: 'BEAM_BLAST', phases: [
    { dur: 1.0, type: 'CHARGE' },
    { dur: 0.5, type: 'ATTACK', anim: 'BEAM_SHOT' },
    { dur: 0.4, type: 'IDLE' },
  ]},
  { name: 'SWEEP_TAKEDOWN', phases: [
    { type: 'APPROACH', speed: 9 },
    { dur: 0.35, type: 'ATTACK', anim: 'SWEEP' },
    { dur: 0.3, type: 'ATTACK', anim: 'ELBOW' },
    { dur: 0.6, type: 'RETREAT', speed: 5 },
  ]},
  { name: 'DODGE_COUNTER', phases: [
    { dur: 0.4, type: 'DODGE' },
    { type: 'APPROACH', speed: 11 },
    { dur: 0.3, type: 'ATTACK', anim: 'PUNCH_CROSS' },
    { dur: 0.25, type: 'ATTACK', anim: 'KICK_HIGH' },
    { dur: 0.5, type: 'RETREAT', speed: 5 },
  ]},
  { name: 'FLYING_KNEE', phases: [
    { type: 'APPROACH', speed: 14 },
    { dur: 0.45, type: 'ATTACK', anim: 'KNEE_STRIKE' },
    { dur: 0.7, type: 'RETREAT', speed: 4 },
  ]},
];

const STRIKE_RANGE = 1.8;

function pickNextSequence(cs) {
  const seq = FIGHT_SEQUENCES[Math.floor(Math.random() * FIGHT_SEQUENCES.length)];
  cs.sequence = seq;
  cs.phaseIdx = 0;
  cs.phaseTimer = 0;
}

function applyAttackPose(cs, anim, progress) {
  const p = Math.sin(progress * Math.PI);
  const lunge = p * 1.0;
  switch (anim) {
    case 'PUNCH_JAB':
      cs.rArmX = -2.2 * p; cs.torsoY = 0.4 * p * cs.faceDir;
      cs.lArmX = -0.6; cs.lArmZ = 0.3;
      cs.fightX += cs.faceDir * lunge * 0.05;
      break;
    case 'PUNCH_CROSS':
      cs.lArmX = -2.2 * p; cs.torsoY = -0.5 * p * cs.faceDir;
      cs.rArmX = -0.6; cs.rArmZ = -0.3;
      cs.fightX += cs.faceDir * lunge * 0.06;
      break;
    case 'UPPERCUT':
      cs.rArmX = -2.8 * p; cs.rArmZ = 0.5 * p;
      cs.fightY = 0.5 * p; cs.torsoX = -0.3 * p; cs.lLegX = -0.3 * p;
      break;
    case 'KICK_LOW':
      cs.rLegX = -1.6 * p; cs.torsoX = 0.25 * p;
      cs.lArmX = -0.6; cs.rArmX = -0.4;
      cs.fightX += cs.faceDir * lunge * 0.04;
      break;
    case 'KICK_HIGH':
      cs.lLegX = -2.2 * p; cs.torsoX = 0.5 * p;
      cs.rArmX = -0.8 * p; cs.fightY = 0.15 * p;
      break;
    case 'KICK_SPIN':
      cs.rLegX = -1.8 * p; cs.torsoY = Math.PI * 2 * progress;
      cs.lArmX = -0.8 * p; cs.rArmX = 0.8 * p; cs.fightY = 0.2 * p;
      break;
    case 'HEADBUTT':
      cs.headZ = 0.4 * p; cs.torsoX = -0.6 * p; cs.fightY = 0.1 * p;
      cs.fightX += cs.faceDir * lunge * 0.08;
      break;
    case 'ELBOW':
      cs.rArmX = -0.8; cs.rArmZ = -1.5 * p;
      cs.torsoY = 0.5 * p * cs.faceDir;
      cs.fightX += cs.faceDir * lunge * 0.05;
      break;
    case 'SWEEP':
      cs.fightY = -0.5 * p; cs.rLegX = -1.8 * p;
      cs.lLegX = 0.6; cs.torsoX = 0.35 * p; cs.lArmX = -0.4;
      break;
    case 'BEAM_SHOT':
      cs.rArmX = -1.8 * p; cs.lArmX = -1.8 * p;
      cs.rArmZ = -0.2 * p; cs.lArmZ = 0.2 * p;
      cs.coreGlow = 4 + 8 * p; cs.torsoX = -0.2 * p;
      cs.fightX += cs.faceDir * lunge * 0.03;
      break;
    case 'KNEE_STRIKE':
      cs.rLegX = -2.0 * p; cs.fightY = 0.6 * p;
      cs.torsoX = -0.3 * p; cs.lArmX = -0.5; cs.rArmX = -0.5;
      cs.fightX += cs.faceDir * lunge * 0.07;
      break;
  }
}

function animateBeamBattle(dt, t, ch) {
  const agents = [ch.creator, ch.opponent];
  const gd = ch.gameData;
  const ox = arenaOffset.x, oz = arenaOffset.z;

  // 3-4 second staredown after countdown
  const fightElapsed = (Date.now() - currentArena.startTime - COUNTDOWN_DURATION) / 1000;
  const staredownDuration = 3.5;
  const inStaredown = fightElapsed < staredownDuration;

  if (inStaredown) {
    const ramp = Math.min(1, fightElapsed / 2);
    agents.forEach((name, i) => {
      const c = currentArena.chars[name];
      if (!c) return;
      let cs = charState[name];
      if (!cs) return;
      c.group.position.set(cs.fightBaseX, 0, cs.fightBaseZ);
      c.group.rotation.y = Math.atan2((ox - cs.fightBaseX) * 2, 0.01);
      // Dramatic guard stance ramp-up
      c.parts.lArm.rotation.x = -0.7 * ramp;
      c.parts.rArm.rotation.x = -0.6 * ramp;
      c.parts.lArm.rotation.z = 0.35 * ramp;
      c.parts.rArm.rotation.z = -0.3 * ramp;
      // Subtle breathing
      c.parts.torso.rotation.x = Math.sin(t * 2 + i) * 0.04 * ramp;
      c.parts.lLeg.rotation.x = 0;
      c.parts.rLeg.rotation.x = 0;
      c.parts.head.rotation.set(0, 0, 0);
      c.parts.head.position.set(0, 1.55, 0);
      c.parts.torso.rotation.y = 0;
      c.parts.torso.rotation.z = 0;
      // Core glow intensifies as staredown ends — tension building
      const tension = Math.min(1, fightElapsed / staredownDuration);
      c.parts.core.material.emissiveIntensity = 0.8 + tension * 3 + Math.sin(t * 5 + i * 3) * 0.5 * tension;
      c.parts.coreLight.intensity = 1 + tension * 3;
    });
    return;
  }

  // Unlock fighters after staredown
  if (fightElapsed < staredownDuration + 0.1) {
    agents.forEach(name => {
      if (charState[name]) charState[name].sequenceCooldown = 0.5 + Math.random() * 1.0;
    });
  }

  processServerEvents(ch);
  if (currentArena.finisherActive) { renderFinisherBeam(currentArena.finisherAgent, agents, t, ch); return; }

  // Animate fighters
  agents.forEach((name, i) => {
    const c = currentArena.chars[name];
    const pl = gd.players?.[name];
    if (!c || !pl) return;
    let cs = charState[name];
    if (!cs) return;

    const oppName = agents[1 - i];
    const oppCs = charState[oppName];
    const oppX = oppCs ? oppCs.fightX : (ox + (i === 0 ? 4 : -4));
    const oppZ = oppCs ? oppCs.fightZ : oz;

    // Reset poses
    cs.lArmX = 0; cs.rArmX = 0; cs.lArmZ = 0; cs.rArmZ = 0;
    cs.lLegX = 0; cs.rLegX = 0;
    cs.torsoX = 0; cs.torsoY = 0; cs.torsoZ = 0;
    cs.headX = 0; cs.headZ = 0;
    cs.fightY = 0;
    cs.coreGlow = 1.0 + Math.sin(t * 3 + i) * 0.3;

    // HIT REACTION — dramatic knockback + stagger
    if (cs.hitReactTimer > 0) {
      cs.hitReactTimer -= dt;
      const rp = Math.max(0, cs.hitReactTimer / 0.7);
      // Strong knockback burst at start, then stagger
      const knockForce = rp > 0.5 ? 3.0 : 0.8;
      cs.fightX += -cs.faceDir * knockForce * dt;
      // Body recoils: torso bends back, head snaps, arms fly up
      cs.torsoX = 0.8 * rp;
      cs.torsoZ = Math.sin(t * 35) * 0.2 * rp;
      cs.headX = 0.7 * rp;
      cs.headZ = Math.sin(t * 40) * 0.15 * rp;
      cs.lArmX = 1.2 * rp; cs.rArmX = 1.0 * rp;
      cs.lArmZ = 0.4 * rp; cs.rArmZ = -0.3 * rp;
      // Lifted off ground slightly + shake
      cs.fightY = Math.sin(rp * Math.PI) * 0.35;
      cs.fightX += Math.sin(t * 55) * 0.08 * rp;
      cs.fightZ = cs.fightBaseZ + Math.cos(t * 50) * 0.07 * rp;
      // Core flickers on hit
      cs.coreGlow = 0.3 + rp * 2 + Math.sin(t * 30) * rp;
    }
    // FIGHT SEQUENCE
    else if (cs.sequence) {
      const phase = cs.sequence.phases[cs.phaseIdx];
      if (!phase) {
        cs.sequence = null;
        cs.sequenceCooldown = 0.5 + Math.random() * 1.0;
      } else {
        cs.phaseTimer += dt;
        if (phase.type === 'APPROACH') {
          const distX = Math.abs(cs.fightX - oppX);
          const distZ = Math.abs(cs.fightZ - oppZ);
          const totalDist = Math.sqrt(distX * distX + distZ * distZ);
          if (totalDist > STRIKE_RANGE) {
            const dirX = oppX > cs.fightX ? 1 : -1;
            cs.fightX += dirX * phase.speed * dt;
            cs.fightZ += (oppZ > cs.fightZ ? 1 : -1) * phase.speed * dt * 0.2;
            const rp = t * 12;
            cs.lLegX = Math.sin(rp) * 0.9; cs.rLegX = Math.sin(rp + Math.PI) * 0.9;
            cs.lArmX = Math.sin(rp + Math.PI) * 0.7; cs.rArmX = Math.sin(rp) * 0.7;
            cs.torsoX = -0.15;
            cs.fightY = Math.abs(Math.sin(rp)) * 0.08;
          } else { cs.phaseIdx++; cs.phaseTimer = 0; }
        } else if (phase.type === 'ATTACK') {
          const pp = Math.min(1, cs.phaseTimer / phase.dur);
          applyAttackPose(cs, phase.anim, pp);
          if (pp >= 1) { cs.phaseIdx++; cs.phaseTimer = 0; }
        } else if (phase.type === 'RETREAT') {
          const pp = Math.min(1, cs.phaseTimer / phase.dur);
          const tbx = cs.fightBaseX - cs.fightX, tbz = cs.fightBaseZ - cs.fightZ;
          const bd = Math.sqrt(tbx*tbx + tbz*tbz);
          if (bd > 0.3) { cs.fightX += (tbx/bd) * phase.speed * dt; cs.fightZ += (tbz/bd) * phase.speed * dt; }
          const wp = t * 6;
          cs.lLegX = Math.sin(wp) * 0.5; cs.rLegX = Math.sin(wp + Math.PI) * 0.5;
          cs.lArmX = Math.sin(wp + Math.PI) * 0.35; cs.rArmX = Math.sin(wp) * 0.35;
          if (pp >= 1) { cs.phaseIdx++; cs.phaseTimer = 0; }
        } else if (phase.type === 'CHARGE') {
          const pp = Math.min(1, cs.phaseTimer / phase.dur);
          cs.lArmX = -1.0; cs.rArmX = -1.0; cs.lArmZ = 0.5; cs.rArmZ = -0.5;
          cs.coreGlow = 3 + 6 * pp; cs.fightY = -0.15 + Math.sin(t*15)*0.04;
          cs.fightX += Math.sin(t*30)*0.02; cs.torsoX = -0.1;
          if (pp >= 1) { cs.phaseIdx++; cs.phaseTimer = 0; }
        } else if (phase.type === 'DODGE') {
          const pp = Math.min(1, cs.phaseTimer / phase.dur);
          const dd = (i===0) ? 1 : -1;
          cs.fightZ = cs.fightBaseZ + dd * 2.5 * Math.sin(pp * Math.PI);
          cs.torsoZ = dd * 0.5 * Math.sin(pp * Math.PI);
          cs.fightY = Math.sin(pp * Math.PI) * 0.15;
          if (pp >= 1) { cs.phaseIdx++; cs.phaseTimer = 0; }
        } else if (phase.type === 'IDLE') {
          const pp = Math.min(1, cs.phaseTimer / phase.dur);
          cs.lArmX = -0.5; cs.rArmX = -0.4; cs.lArmZ = 0.2; cs.rArmZ = -0.2;
          if (pp >= 1) { cs.phaseIdx++; cs.phaseTimer = 0; }
        }
      }
    }
    // IDLE STANCE — bouncy boxing stance with footwork
    else {
      cs.sequenceCooldown -= dt;
      // Active fighter stance: arms up in guard, bounce on toes
      const bob = Math.sin(t * 4.5 + i * 2);
      const sway = Math.sin(t * 1.5 + i * 3);
      cs.lArmX = -0.7 + bob * 0.12;
      cs.rArmX = -0.6 + bob * 0.1;
      cs.lArmZ = 0.35; cs.rArmZ = -0.3;
      cs.fightY = Math.abs(Math.sin(t * 4.5 + i)) * 0.06;
      cs.lLegX = Math.sin(t * 4.5 + i * 3) * 0.08;
      cs.rLegX = Math.sin(t * 4.5 + i * 3 + Math.PI) * 0.08;
      cs.torsoX = -0.05 + bob * 0.03;
      // Drift back to base position + lateral footwork
      const tbx = cs.fightBaseX - cs.fightX, tbz = cs.fightBaseZ - cs.fightZ;
      cs.fightX += tbx * dt * 2.0; cs.fightZ += tbz * dt * 2.0;
      cs.fightZ += sway * 1.5 * dt;
      // Core pulses gently in idle
      cs.coreGlow = 1.2 + Math.sin(t * 3 + i) * 0.4;
      // Short cooldown = faster-paced fighting
      if (cs.sequenceCooldown <= 0) pickNextSequence(cs);
    }

    // Clamp
    const dx = cs.fightX - ox, dz = cs.fightZ - oz;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > 9) { cs.fightX = ox + (dx/dist)*9; cs.fightZ = oz + (dz/dist)*9; }

    // Apply
    c.group.position.set(cs.fightX, cs.fightY, cs.fightZ);
    c.group.rotation.y = Math.atan2(oppX - cs.fightX, oppZ - cs.fightZ);
    c.parts.lArm.rotation.x = cs.lArmX; c.parts.rArm.rotation.x = cs.rArmX;
    c.parts.lArm.rotation.z = cs.lArmZ; c.parts.rArm.rotation.z = cs.rArmZ;
    c.parts.lLeg.rotation.x = cs.lLegX; c.parts.rLeg.rotation.x = cs.rLegX;
    c.parts.torso.rotation.x = cs.torsoX; c.parts.torso.rotation.y = cs.torsoY; c.parts.torso.rotation.z = cs.torsoZ;
    c.parts.head.rotation.x = cs.headX; c.parts.head.position.z = cs.headZ; c.parts.head.position.y = 1.55;
    c.parts.core.material.emissiveIntensity = cs.coreGlow;

    // Low HP: heavy stagger, flickering core, body trembles
    if (pl.hp < 30) {
      c.group.position.x += Math.sin(t * 30) * 0.06;
      c.group.position.z += Math.cos(t * 25) * 0.03;
      c.parts.core.material.emissiveIntensity *= 0.3 + Math.sin(t * 15) * 0.3;
      c.parts.coreLight.intensity = Math.max(0.5, c.parts.coreLight.intensity * 0.5);
    }
    // Power puzzle: intense charging aura
    if (pl.powerPuzzleSolving) {
      c.parts.core.material.emissiveIntensity = 5 + Math.sin(t * 14) * 4;
      c.parts.coreLight.intensity = 6 + Math.sin(t * 12) * 4;
      c.group.position.y += Math.sin(t * 8) * 0.05;
    }
  });
}

// ============================================================
// SHARED: Process server events for hit reactions + finisher
// ============================================================
function processServerEvents(ch) {
  const gd = ch.gameData;
  const serverEvents = gd.animEvents || [];
  // Use timestamp-based tracking — server trims array so index-based breaks
  // (from chriscourses/fighting-game event queue pattern)
  if (!currentArena._lastEvtTime) currentArena._lastEvtTime = 0;

  for (const ev of serverEvents) {
    if (ev.t <= currentArena._lastEvtTime) continue; // already processed
    const cs = charState[ev.agent];
    if (!cs) continue;

    if (ev.anim === 'HIT_REACT') {
      cs.hitReactTimer = 0.7;
      // Spawn impact effect at the hit character's position
      const hitChar = currentArena.chars?.[ev.agent];
      if (hitChar) {
        const hitPos = hitChar.group.position.clone();
        hitPos.y += 1.2; // chest height
        spawnHitEffect(hitPos, ev.dmg || 10);
      }
    }

    if (ev.hit && ev.dmg && ev.anim !== 'HIT_REACT') {
      // ATTACKER landed a hit — teleport them close to opponent and force attack pose
      const agents = [ch.creator, ch.opponent];
      const oppName = agents.find(a => a !== ev.agent);
      const oppCs = charState[oppName];
      if (oppCs) {
        // Snap attacker right next to defender (within strike range)
        cs.fightX = oppCs.fightX - cs.faceDir * 1.5;
        cs.fightZ = oppCs.fightZ;
        // Force an attack sequence immediately
        const attackAnims = ['PUNCH_JAB', 'PUNCH_CROSS', 'UPPERCUT', 'KICK_HIGH', 'KICK_SPIN', 'KNEE_STRIKE'];
        const forcedAnim = attackAnims[Math.floor(Math.random() * attackAnims.length)];
        cs.sequence = { name: 'FORCED_HIT', phases: [
          { dur: 0.35, type: 'ATTACK', anim: forcedAnim },
          { dur: 0.5, type: 'RETREAT', speed: 6 },
        ]};
        cs.phaseIdx = 0;
        cs.phaseTimer = 0;
        cs.sequenceCooldown = 99; // don't interrupt
      }
    }

    if (ev.finisher && !currentArena.finisherActive) {
      currentArena.finisherActive = true;
      currentArena.finisherStart = Date.now();
      currentArena.finisherAgent = ev.agent;
    }
    currentArena._lastEvtTime = ev.t;
  }

  if (gd.finisher && !currentArena.finisherActive) {
    currentArena.finisherActive = true;
    currentArena.finisherStart = Date.now();
    currentArena.finisherAgent = gd.finisher.agent;
  }
}

// ============================================================
// ARENA SETUP — type-specific builds
// ============================================================
function setupChallengeArena(ch) {
  cleanupFinisher();
  currentArena = { id: ch.id, type: ch.type, chars: {}, beamMeshes: [], _lastEvtTime: 0, startTime: Date.now() };
  const agents = [ch.creator, ch.opponent];
  const ox = arenaOffset.x, oz = arenaOffset.z;

  buildBeamBattleArena(ox, oz);

  // Place characters based on type
  agents.forEach((name, i) => {
    const look = AGENT_LOOK[name] || AGENT_LOOK.YOU;
    const c = createCharacter({ bodyColor: look.bodyColor, glowColor: look.glowColor, name });
    initCharState(name, i, ch.type);
    const cs = charState[name];

    c.group.position.set(cs.fightX, 0, cs.fightZ);
    c.group.rotation.y = i === 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

    currentArena.chars[name] = c;
  });

  // Start countdown
  startCountdown(ch.type);
}

// === BEAM BATTLE ARENA — Circular energy ring ===
function buildBeamBattleArena(ox, oz) {
  const glow = 0xcc44ff;
  const pGeo = new THREE.CylinderGeometry(10, 10, 0.2, 48);
  const pMat = new THREE.MeshStandardMaterial({ color: 0x120a1a, roughness: 0.4, metalness: 0.7 });
  const pMesh = new THREE.Mesh(pGeo, pMat);
  pMesh.position.set(ox, -0.1, oz);
  scene.add(pMesh); arenaObjects.push(pMesh);

  // Outer energy ring
  const ringGeo = new THREE.TorusGeometry(10, 0.12, 12, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.6 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(ox, 0.03, oz);
  scene.add(ring); arenaObjects.push(ring);

  // Inner ring
  const irGeo = new THREE.TorusGeometry(5, 0.06, 8, 48);
  const irMat = new THREE.MeshBasicMaterial({ color: 0x8822cc, transparent: true, opacity: 0.35 });
  const ir = new THREE.Mesh(irGeo, irMat);
  ir.rotation.x = -Math.PI / 2;
  ir.position.set(ox, 0.04, oz);
  scene.add(ir); arenaObjects.push(ir);

  // Energy pillars
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
    const px = ox + Math.cos(a) * 9, pz = oz + Math.sin(a) * 9;
    const pilGeo = new THREE.CylinderGeometry(0.25, 0.35, 3.5, 8);
    const pilMat = new THREE.MeshStandardMaterial({ color: 0x2a0a3a, emissive: glow, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 });
    const pil = new THREE.Mesh(pilGeo, pilMat);
    pil.position.set(px, 1.75, pz);
    scene.add(pil); arenaObjects.push(pil);
    const orbGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const orbMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.8 });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(px, 3.7, pz);
    scene.add(orb); arenaObjects.push(orb);
  }

  // Floor pattern
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const lGeo = new THREE.BoxGeometry(0.04, 0.02, 8);
    const lMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.15 });
    const l = new THREE.Mesh(lGeo, lMat);
    l.position.set(ox, 0.01, oz); l.rotation.y = a;
    scene.add(l); arenaObjects.push(l);
  }

  const arenaLight = new THREE.PointLight(glow, 4, 25);
  arenaLight.position.set(ox, 8, oz);
  scene.add(arenaLight); arenaObjects.push(arenaLight);
}

function refreshChallengeArena(ch) {
  if (!currentArena || !ch.gameData) return;
  if (ch.gameData.finisher && !currentArena.finisherActive) {
    currentArena.finisherActive = true;
    currentArena.finisherStart = Date.now();
    currentArena.finisherAgent = ch.gameData.finisher.agent;
  }
}

// ============================================================
// KAMEHAMEHA FINISHER ANIMATION — Smooth laser beam
// ============================================================
let finisherObjects = [];   // all meshes/lights created during finisher
let finisherParticles = [];
let finisherChargeSphere = null;
let finisherBeamGroup = null;
let finisherImpactHit = false;

function cleanupFinisher() {
  for (const obj of finisherObjects) {
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
  finisherObjects = [];
  for (const pp of finisherParticles) {
    scene.remove(pp);
    if (pp.geometry) pp.geometry.dispose();
    if (pp.material) pp.material.dispose();
  }
  finisherParticles = [];
  finisherChargeSphere = null;
  finisherBeamGroup = null;
  finisherImpactHit = false;
}

function addFinisherObj(obj) {
  scene.add(obj);
  finisherObjects.push(obj);
  return obj;
}

function renderFinisherBeam(winnerAgent, agents, t, ch) {
  if (!currentArena || !currentArena.finisherStart) return;
  const elapsed = Date.now() - currentArena.finisherStart;
  const loserAgent = agents.find(a => a !== winnerAgent);
  const winnerChar = currentArena.chars[winnerAgent];
  const loserChar = currentArena.chars[loserAgent];
  if (!winnerChar || !loserChar) return;

  const wcs = charState[winnerAgent] || {};
  const lcs = charState[loserAgent] || {};
  const winBaseX = wcs.fightBaseX || arenaOffset.x - 4;
  const winBaseZ = wcs.fightBaseZ || arenaOffset.z;
  const loseBaseX = lcs.fightBaseX || arenaOffset.x + 4;
  const loseBaseZ = lcs.fightBaseZ || arenaOffset.z;

  // Direction from winner to loser (for beam aiming)
  const dirX = loseBaseX - winBaseX;
  const dirZ = loseBaseZ - winBaseZ;
  const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
  const ndx = dirX / dirLen;
  const ndz = dirZ / dirLen;

  // Winner hand position (where beam originates)
  const handY = 3.8;
  const handX = winBaseX + ndx * 0.8;
  const handZ = winBaseZ + ndz * 0.8;

  // Loser hit position
  const loserHitY = 1.2;

  // ── Phase 1: FLICKER + VANISH (0–400ms) ──
  if (elapsed < 400) {
    const p = elapsed / 400;
    // Flicker effect — rapid on/off before vanishing
    const flicker = Math.sin(elapsed * 0.08) > 0;
    winnerChar.group.visible = p < 0.7 ? flicker : false;
    winnerChar.group.scale.setScalar(Math.max(0, 1 - p * 1.5));
    // Bright flash at vanish point
    if (p > 0.5 && !finisherChargeSphere) {
      const flashGeo = new THREE.SphereGeometry(0.8, 16, 16);
      const flashMat = new THREE.MeshBasicMaterial({ color: 0x88eeff, transparent: true, opacity: 1 - p });
      const flash = new THREE.Mesh(flashGeo, flashMat);
      flash.position.set(winBaseX, 1.5, winBaseZ);
      addFinisherObj(flash);
      flash._isFlash = true;
    }
    return;
  }

  // Remove vanish flash
  finisherObjects = finisherObjects.filter(obj => {
    if (obj._isFlash) { scene.remove(obj); obj.geometry.dispose(); obj.material.dispose(); return false; }
    return true;
  });

  // ── Phase 2: REAPPEAR + ENERGY CHARGE (400–1500ms) ──
  if (elapsed < 1500) {
    const p = (elapsed - 400) / 1100;
    const ep = Math.min(1, p * 1.3); // ease slightly ahead

    // Winner reappears mid-air
    winnerChar.group.visible = true;
    winnerChar.group.scale.setScalar(Math.min(1, ep * 2));
    winnerChar.group.position.set(winBaseX, 3.5 + Math.sin(t * 2) * 0.15, winBaseZ);

    // Arms cupped behind — charging pose
    const armBack = -0.6 - ep * 0.6; // arms pull back as charge builds
    winnerChar.parts.lArm.rotation.x = armBack;
    winnerChar.parts.rArm.rotation.x = armBack;
    winnerChar.parts.lArm.rotation.z = 0.4 + ep * 0.3;
    winnerChar.parts.rArm.rotation.z = -0.4 - ep * 0.3;
    // Torso leans back during charge
    winnerChar.parts.torso.rotation.x = -0.15 * ep;

    // Core ramps up
    winnerChar.parts.core.material.emissiveIntensity = 2 + 12 * ep;
    winnerChar.parts.coreLight.intensity = 2 + 8 * ep;

    // Energy charge sphere between hands — grows over time
    if (!finisherChargeSphere) {
      const sphereGeo = new THREE.SphereGeometry(1, 24, 24);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00eeff, transparent: true, opacity: 0.6 });
      finisherChargeSphere = new THREE.Mesh(sphereGeo, sphereMat);
      finisherChargeSphere.position.set(handX, handY, handZ);
      addFinisherObj(finisherChargeSphere);

      // Inner hot core of charge sphere
      const coreGeo = new THREE.SphereGeometry(1, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      const coreSphere = new THREE.Mesh(coreGeo, coreMat);
      coreSphere.position.set(handX, handY, handZ);
      addFinisherObj(coreSphere);
      coreSphere._chargeCore = true;

      // Charge light
      const chLight = new THREE.PointLight(0x00ddff, 4, 25);
      chLight.position.set(handX, handY, handZ);
      addFinisherObj(chLight);
      chLight._chargeLight = true;
    }

    // Animate charge sphere — grows with pulsing
    const sphereScale = ep * 0.6 + Math.sin(t * 8) * 0.08;
    finisherChargeSphere.scale.setScalar(sphereScale);
    finisherChargeSphere.material.opacity = 0.3 + ep * 0.5 + Math.sin(t * 12) * 0.1;
    finisherChargeSphere.position.set(handX, handY, handZ);

    // Update inner core and light
    for (const obj of finisherObjects) {
      if (obj._chargeCore) {
        obj.scale.setScalar(sphereScale * 0.4);
        obj.position.set(handX, handY, handZ);
        obj.material.opacity = 0.7 + Math.sin(t * 15) * 0.3;
      }
      if (obj._chargeLight) {
        obj.position.set(handX, handY, handZ);
        obj.intensity = 4 + ep * 12 + Math.sin(t * 10) * 3;
      }
    }

    // Swirl particles inward toward charge sphere
    if (Math.random() < 0.5 + ep * 0.5) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2 + Math.random() * 3;
      const pGeo = new THREE.SphereGeometry(0.04 + Math.random() * 0.06, 4, 4);
      const pMat = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.3 ? 0xffffff : 0x00eeff,
        transparent: true, opacity: 0.9
      });
      const particle = new THREE.Mesh(pGeo, pMat);
      particle.position.set(
        handX + Math.cos(angle) * radius,
        handY + (Math.random() - 0.5) * 3,
        handZ + Math.sin(angle) * radius
      );
      particle._target = new THREE.Vector3(handX, handY, handZ);
      particle._speed = 0.04 + Math.random() * 0.06;
      particle._life = 1;
      particle._swirl = true;
      scene.add(particle);
      finisherParticles.push(particle);
    }

    // Update swirl particles
    for (let i = finisherParticles.length - 1; i >= 0; i--) {
      const pp = finisherParticles[i];
      if (pp._swirl) {
        const toTarget = pp._target.clone().sub(pp.position);
        const dist = toTarget.length();
        if (dist < 0.2) {
          scene.remove(pp); pp.geometry.dispose(); pp.material.dispose();
          finisherParticles.splice(i, 1);
        } else {
          toTarget.normalize().multiplyScalar(pp._speed * (1 + ep));
          // Add spiral motion
          const perp = new THREE.Vector3(-toTarget.z, 0, toTarget.x).multiplyScalar(0.3);
          pp.position.add(toTarget).add(perp);
          pp.material.opacity = Math.min(1, dist * 0.5);
        }
      }
    }

    // Loser watches in shock — slight recoil
    loserChar.parts.torso.rotation.x = -0.1 * ep;
    loserChar.parts.lArm.rotation.z = 0.15 * ep;
    loserChar.parts.rArm.rotation.z = -0.15 * ep;

    // Camera shake builds
    cameraShakeIntensity = Math.max(cameraShakeIntensity, ep * 0.15);
    return;
  }

  // ── Phase 3: BEAM FIRES (1500–4000ms) ──
  if (elapsed < 4000) {
    const p = (elapsed - 1500) / 2500; // 0→1 over 2.5 seconds
    const beamExtend = Math.min(1, p * 2.5); // beam reaches loser by p=0.4 (1s in)
    const beamThicken = Math.min(1, p * 1.5); // beam thickens

    // Winner: arms thrust forward
    winnerChar.group.visible = true;
    winnerChar.group.position.set(winBaseX, 3.5, winBaseZ);
    winnerChar.group.scale.setScalar(1);
    const thrustP = Math.min(1, p * 4); // arms snap forward fast
    winnerChar.parts.lArm.rotation.x = -1.2 - thrustP * 0.4;
    winnerChar.parts.rArm.rotation.x = -1.2 - thrustP * 0.4;
    winnerChar.parts.lArm.rotation.z = 0.15;
    winnerChar.parts.rArm.rotation.z = -0.15;
    winnerChar.parts.torso.rotation.x = 0.1 * thrustP;
    winnerChar.parts.core.material.emissiveIntensity = 12 + Math.sin(t * 8) * 3;
    winnerChar.parts.coreLight.intensity = 10;

    // Shrink charge sphere as beam takes over
    if (finisherChargeSphere) {
      const shrink = Math.max(0, 1 - p * 3);
      finisherChargeSphere.scale.setScalar(shrink * 0.5);
      finisherChargeSphere.material.opacity = shrink * 0.5;
    }

    // Build the beam group if not exists
    if (!finisherBeamGroup) {
      finisherBeamGroup = { outer: null, mid: null, inner: null, lights: [], tip: null };

      // Outer glow beam (biggest, most transparent)
      const outerGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
      const outerMat = new THREE.MeshBasicMaterial({ color: 0x0066ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
      finisherBeamGroup.outer = new THREE.Mesh(outerGeo, outerMat);
      addFinisherObj(finisherBeamGroup.outer);

      // Mid beam (cyan)
      const midGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
      const midMat = new THREE.MeshBasicMaterial({ color: 0x00ddff, transparent: true, opacity: 0.5 });
      finisherBeamGroup.mid = new THREE.Mesh(midGeo, midMat);
      addFinisherObj(finisherBeamGroup.mid);

      // Inner core beam (white hot)
      const innerGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
      const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
      finisherBeamGroup.inner = new THREE.Mesh(innerGeo, innerMat);
      addFinisherObj(finisherBeamGroup.inner);

      // Beam tip sphere (impact point)
      const tipGeo = new THREE.SphereGeometry(1, 16, 16);
      const tipMat = new THREE.MeshBasicMaterial({ color: 0x88ffff, transparent: true, opacity: 0.7 });
      finisherBeamGroup.tip = new THREE.Mesh(tipGeo, tipMat);
      addFinisherObj(finisherBeamGroup.tip);

      // Multiple lights along beam path
      for (let li = 0; li < 3; li++) {
        const bLight = new THREE.PointLight(0x00ccff, 6, 20);
        addFinisherObj(bLight);
        finisherBeamGroup.lights.push(bLight);
      }

      // Screen flash on beam start
      const flashGeo = new THREE.PlaneGeometry(200, 200);
      const flashMat = new THREE.MeshBasicMaterial({ color: 0xccffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false });
      const screenFlash = new THREE.Mesh(flashGeo, flashMat);
      screenFlash.position.copy(camera.position);
      screenFlash.quaternion.copy(camera.quaternion);
      screenFlash._screenFlash = true;
      screenFlash._birth = Date.now();
      addFinisherObj(screenFlash);
    }

    // Fade screen flash
    for (const obj of finisherObjects) {
      if (obj._screenFlash) {
        const flashAge = (Date.now() - obj._birth) / 400;
        obj.material.opacity = Math.max(0, 0.6 - flashAge);
        obj.position.copy(camera.position);
        obj.quaternion.copy(camera.quaternion);
        obj.translateZ(-2);
      }
    }

    // Beam geometry: extends from winner hands toward loser
    const fullDist = Math.sqrt((loseBaseX - handX) ** 2 + (loserHitY - handY) ** 2 + (loseBaseZ - handZ) ** 2);
    const currentLen = fullDist * beamExtend;
    const endX = handX + ndx * currentLen * (dirLen / fullDist);
    const endY = handY + (loserHitY - handY) * beamExtend;
    const endZ = handZ + ndz * currentLen * (dirLen / fullDist);
    const midX = (handX + endX) / 2;
    const midY = (handY + endY) / 2;
    const midZ = (handZ + endZ) / 2;

    // Beam radii — grow over time with pulsing
    const pulse = Math.sin(t * 18) * 0.1 + 1;
    const outerR = (0.25 + beamThicken * 0.55) * pulse;
    const midR = (0.15 + beamThicken * 0.35) * pulse;
    const innerR = (0.06 + beamThicken * 0.18) * pulse;

    // Helper: position and orient a beam cylinder
    function positionBeamCylinder(mesh, radius, len) {
      mesh.scale.set(radius, Math.max(0.01, len), radius);
      mesh.position.set(midX, midY, midZ);
      mesh.lookAt(endX, endY, endZ);
      mesh.rotateX(Math.PI / 2);
    }

    positionBeamCylinder(finisherBeamGroup.outer, outerR, currentLen);
    finisherBeamGroup.outer.material.opacity = 0.15 + Math.sin(t * 10) * 0.08;

    positionBeamCylinder(finisherBeamGroup.mid, midR, currentLen);
    finisherBeamGroup.mid.material.opacity = 0.4 + Math.sin(t * 14) * 0.15;

    positionBeamCylinder(finisherBeamGroup.inner, innerR, currentLen);
    finisherBeamGroup.inner.material.opacity = 0.75 + Math.sin(t * 20) * 0.15;

    // Beam tip at front edge
    const tipScale = (0.3 + beamThicken * 0.5) * pulse;
    finisherBeamGroup.tip.scale.setScalar(tipScale);
    finisherBeamGroup.tip.position.set(endX, endY, endZ);
    finisherBeamGroup.tip.material.opacity = 0.6 + Math.sin(t * 12) * 0.3;

    // Lights along beam
    for (let li = 0; li < finisherBeamGroup.lights.length; li++) {
      const frac = (li + 1) / (finisherBeamGroup.lights.length + 1);
      const lx = handX + (endX - handX) * frac;
      const ly = handY + (endY - handY) * frac;
      const lz = handZ + (endZ - handZ) * frac;
      finisherBeamGroup.lights[li].position.set(lx, ly, lz);
      finisherBeamGroup.lights[li].intensity = 4 + beamThicken * 10 + Math.sin(t * 8 + li) * 3;
    }

    // Impact explosion when beam first reaches loser
    if (beamExtend >= 0.95 && !finisherImpactHit) {
      finisherImpactHit = true;
      cameraShakeIntensity = 1.2;
      // Explosion sphere at loser
      const expGeo = new THREE.SphereGeometry(1, 16, 16);
      const expMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
      const explosion = new THREE.Mesh(expGeo, expMat);
      explosion.position.set(loseBaseX, loserHitY, loseBaseZ);
      explosion._explosion = true;
      explosion._birth = Date.now();
      addFinisherObj(explosion);
      // Impact shockwave ring
      const ringGeo = new THREE.RingGeometry(0.1, 0.3, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x88ffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(loseBaseX, loserHitY, loseBaseZ);
      ring.rotation.x = -Math.PI / 2;
      ring._shockRing = true;
      ring._birth = Date.now();
      addFinisherObj(ring);
      // Burst particles outward from impact
      for (let bp = 0; bp < 20; bp++) {
        const bpGeo = new THREE.SphereGeometry(0.05 + Math.random() * 0.08, 4, 4);
        const bpMat = new THREE.MeshBasicMaterial({
          color: Math.random() < 0.4 ? 0xffffff : 0x00eeff,
          transparent: true, opacity: 1
        });
        const bpMesh = new THREE.Mesh(bpGeo, bpMat);
        bpMesh.position.set(loseBaseX, loserHitY, loseBaseZ);
        const spread = 0.15 + Math.random() * 0.15;
        bpMesh._vel = new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          Math.random() * spread * 0.7,
          (Math.random() - 0.5) * spread
        );
        bpMesh._life = 1;
        scene.add(bpMesh);
        finisherParticles.push(bpMesh);
      }
    }

    // Animate impact explosion + shockwave
    for (const obj of finisherObjects) {
      if (obj._explosion) {
        const age = (Date.now() - obj._birth) / 600;
        obj.scale.setScalar(1 + age * 4);
        obj.material.opacity = Math.max(0, 1 - age);
      }
      if (obj._shockRing) {
        const age = (Date.now() - obj._birth) / 800;
        obj.scale.setScalar(1 + age * 12);
        obj.material.opacity = Math.max(0, 0.9 - age);
      }
    }

    // Continuous camera shake during beam
    cameraShakeIntensity = Math.max(cameraShakeIntensity, 0.2 + beamThicken * 0.4);

    // Loser: pushed back, shaking, graying out
    const pushBack = beamExtend >= 0.95 ? Math.min(1, (p - 0.4) * 2) : 0;
    loserChar.group.position.x = loseBaseX + ndx * pushBack * 1.5 + Math.sin(t * 40) * 0.2 * pushBack;
    loserChar.group.position.z = loseBaseZ + ndz * pushBack * 1.5 + Math.cos(t * 35) * 0.15 * pushBack;
    loserChar.group.position.y = pushBack * -0.3;
    loserChar.parts.torso.rotation.x = 0.4 * pushBack;
    loserChar.parts.head.rotation.x = 0.3 * pushBack;
    loserChar.parts.lArm.rotation.x = 0.5 * pushBack;
    loserChar.parts.rArm.rotation.x = 0.5 * pushBack;
    // Gray out
    const gray = new THREE.Color(0.3, 0.3, 0.3);
    loserChar.mats.bMat.color.lerp(gray, pushBack * 0.02);
    loserChar.mats.gMat.emissiveIntensity = Math.max(0, 1 - pushBack * 2);
    loserChar.parts.core.material.emissiveIntensity = Math.max(0, 1 - pushBack * 2);
    loserChar.parts.coreLight.intensity = Math.max(0, 2 - pushBack * 3);

    // Trail particles along beam
    if (Math.random() < 0.6) {
      const along = Math.random();
      const px = handX + (endX - handX) * along;
      const py = handY + (endY - handY) * along;
      const pz = handZ + (endZ - handZ) * along;
      const pGeo = new THREE.SphereGeometry(0.03 + Math.random() * 0.07, 4, 4);
      const pColor = Math.random() < 0.2 ? 0xffffff : (Math.random() < 0.5 ? 0x00eeff : 0x0088ff);
      const pMat = new THREE.MeshBasicMaterial({ color: pColor, transparent: true, opacity: 0.9 });
      const particle = new THREE.Mesh(pGeo, pMat);
      particle.position.set(px, py, pz);
      // Drift outward from beam axis
      const drift = 0.04 + Math.random() * 0.04;
      particle._vel = new THREE.Vector3(
        (Math.random() - 0.5) * drift,
        (Math.random() - 0.3) * drift,
        (Math.random() - 0.5) * drift
      );
      particle._life = 0.6 + Math.random() * 0.4;
      scene.add(particle);
      finisherParticles.push(particle);
    }

    // Update all particles
    for (let i = finisherParticles.length - 1; i >= 0; i--) {
      const pp = finisherParticles[i];
      if (pp._swirl) continue; // swirl particles handled above
      pp.position.add(pp._vel);
      pp._life -= 0.025;
      pp.material.opacity = Math.max(0, pp._life);
      pp.scale.setScalar(Math.max(0.1, pp._life));
      if (pp._life <= 0) {
        scene.remove(pp); pp.geometry.dispose(); pp.material.dispose();
        finisherParticles.splice(i, 1);
      }
    }
    return;
  }

  // ── Phase 4: AFTERMATH (4000ms+) ──
  // Winner: victory pose floating
  winnerChar.group.visible = true;
  winnerChar.group.position.set(winBaseX, 1.5 + Math.sin(t * 2) * 0.1, winBaseZ);
  winnerChar.group.scale.setScalar(1);
  winnerChar.parts.lArm.rotation.x = -2.5;
  winnerChar.parts.rArm.rotation.x = -2.5;
  winnerChar.parts.lArm.rotation.z = 0.3;
  winnerChar.parts.rArm.rotation.z = -0.3;
  winnerChar.parts.torso.rotation.x = 0;
  winnerChar.parts.core.material.emissiveIntensity = 5 + Math.sin(t * 4) * 3;
  winnerChar.parts.coreLight.intensity = 5;

  // Loser: slumped and gray
  loserChar.group.position.set(loseBaseX + ndx * 1.5, -0.3, loseBaseZ + ndz * 1.5);
  loserChar.parts.torso.rotation.x = 0.6;
  loserChar.parts.head.rotation.x = 0.5;
  loserChar.parts.lArm.rotation.x = 0.7;
  loserChar.parts.rArm.rotation.x = 0.7;
  loserChar.parts.core.material.emissiveIntensity = 0;
  loserChar.parts.coreLight.intensity = 0;
  const grayFull = new THREE.Color(0.25, 0.25, 0.25);
  loserChar.mats.bMat.color.copy(grayFull);
  loserChar.mats.gMat.emissiveIntensity = 0;

  // Fade all beam objects
  for (const obj of finisherObjects) {
    if (obj.material && obj.material.opacity !== undefined) {
      obj.material.opacity = Math.max(0, obj.material.opacity - 0.03);
    }
    if (obj.intensity !== undefined) {
      obj.intensity = Math.max(0, obj.intensity * 0.92);
    }
  }

  // Fade remaining particles
  for (let i = finisherParticles.length - 1; i >= 0; i--) {
    const pp = finisherParticles[i];
    pp._life -= 0.06;
    pp.material.opacity = Math.max(0, pp._life);
    if (pp._life <= 0) {
      scene.remove(pp); pp.geometry.dispose(); pp.material.dispose();
      finisherParticles.splice(i, 1);
    }
  }

  // Camera shake fades out
  cameraShakeIntensity *= 0.92;

  // Show win/loss screen
  if (elapsed > 4500 && !currentArena.resultShown) {
    currentArena.resultShown = true;
    const isPlayerWin = winnerAgent === 'YOU';
    showFightResult(isPlayerWin, ch);
  }
}

// ============================================================
// WIN / LOSS SCREEN
// ============================================================
function showFightResult(isWin, challenge) {
  const overlay = document.getElementById('fight-result');
  const textEl = document.getElementById('fight-result-text');
  const subEl = document.getElementById('fight-result-sub');
  if (!overlay || !textEl) return;

  overlay.classList.remove('hidden', 'win', 'loss');
  overlay.classList.add(isWin ? 'win' : 'loss');
  textEl.textContent = isWin ? 'YOU WIN' : 'DEFEATED';
  if (subEl) {
    const pot = (challenge.bet * 2).toFixed(4);
    subEl.textContent = isWin ? `+${pot} MONAD earned!` : `${pot} MONAD lost`;
  }
}

function dismissFightResult() {
  const overlay = document.getElementById('fight-result');
  if (overlay) overlay.classList.add('hidden');
  // Hide Tekken HUD
  const tekkenHud = document.getElementById('tekken-hud');
  if (tekkenHud) tekkenHud.classList.add('hidden');
  // Clean up finisher state
  cleanupFinisher();
  stopSpectating();
}
window.dismissFightResult = dismissFightResult;

// ============================================================
// TAB POLLING — fetch data when relevant tabs are visible
// ============================================================
let activeTab = 'movement';
let tabPollTimer = 0;

// Override tab click to track active tab
document.querySelectorAll('.manual-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    // Immediate fetch on tab switch
    if (activeTab === 'government') fetchGov();
    if (activeTab === 'marketplace') fetchMarket();
    if (activeTab === 'premium') fetchPremium();
    if (activeTab === 'challenges') fetchChallenges();
  });
});

// ============================================================
// WALLET SYSTEM — Real MetaMask + Monad Network
// ============================================================
const MONAD_CHAIN = {
  chainId: '0x8f',  // 143 in hex
  chainName: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://rpc.monad.xyz'],
  blockExplorerUrls: ['https://monadscan.com']
};
const WON_TOKEN_ADDRESS = '0x9d36A73462962d767509FC170c287634A0907777';
const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)'];

let ethProvider = null;
let ethSigner = null;
let _walletListenersSet = false;

// Shared: finalize wallet connection (UI, provider, signer, listeners)
async function _finalizeWalletConnect(address, silent) {
  walletAddress = address;
  walletConnected = true;

  // Switch to Monad network (only if not already on it)
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== MONAD_CHAIN.chainId) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: MONAD_CHAIN.chainId }]
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [MONAD_CHAIN]
          });
        }
      }
    }
  } catch (e) { /* ignore chain check errors */ }

  // Set up ethers provider + signer
  ethProvider = new window.ethers.BrowserProvider(window.ethereum);
  ethSigner = await ethProvider.getSigner();

  // Update UI
  const wallet = document.getElementById('wallet');
  const label = document.getElementById('wallet-label');
  const detail = document.getElementById('wallet-detail');
  const addrEl = document.getElementById('wallet-addr');

  wallet.classList.add('connected');
  label.textContent = 'CONNECTED';
  detail.classList.remove('hidden');
  addrEl.textContent = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);

  if (!silent) showMsg('Wallet connected to Monad!');
  await updateWalletBalance();
  loadPlayerName();

  // Listen for account/chain changes (only once)
  if (!_walletListenersSet) {
    _walletListenersSet = true;
    window.ethereum.on('accountsChanged', (accs) => {
      if (accs.length === 0) { disconnectWallet(); return; }
      walletAddress = accs[0];
      walletConnected = true;
      document.getElementById('wallet-addr').textContent = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
      // Re-create signer for new account
      ethProvider = new window.ethers.BrowserProvider(window.ethereum);
      ethProvider.getSigner().then(s => { ethSigner = s; });
      updateWalletBalance();
    });
    window.ethereum.on('chainChanged', () => {
      // Re-create provider/signer on chain change
      ethProvider = new window.ethers.BrowserProvider(window.ethereum);
      ethProvider.getSigner().then(s => { ethSigner = s; });
      updateWalletBalance();
    });
  }
}

// Manual connect — user clicks CONNECT WALLET button (triggers MetaMask popup)
async function connectWallet() {
  if (walletConnected) return;

  if (!window.ethereum) {
    showMsg('Install MetaMask or another wallet!');
    window.open('https://metamask.io/download/', '_blank');
    return;
  }

  try {
    // eth_requestAccounts triggers MetaMask popup
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) return;
    await _finalizeWalletConnect(accounts[0], false);
  } catch (err) {
    console.error('Wallet connect failed:', err);
    showMsg('Wallet connection failed');
  }
}

// Auto-reconnect on page load — silent, no popup
// Uses eth_accounts (returns [] if not authorized, no prompt)
async function tryAutoReconnect() {
  if (!window.ethereum || walletConnected) return;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts && accounts.length > 0) {
      console.log('Auto-reconnecting wallet:', accounts[0].slice(0, 8) + '...');
      await _finalizeWalletConnect(accounts[0], true);
    }
  } catch (e) { /* silent fail */ }
}
// Run auto-reconnect on load
tryAutoReconnect();

function disconnectWallet() {
  walletConnected = false;
  walletAddress = '';
  ethProvider = null;
  ethSigner = null;
  const wallet = document.getElementById('wallet');
  wallet.classList.remove('connected');
  document.getElementById('wallet-label').textContent = 'CONNECT WALLET';
  document.getElementById('wallet-detail').classList.add('hidden');
}

async function updateWalletBalance() {
  if (!walletConnected || !ethProvider) {
    const el = document.getElementById('wallet-bal');
    if (el) el.textContent = coins.toFixed(4);
    return;
  }

  try {
    // Fetch real MON balance
    const balance = await ethProvider.getBalance(walletAddress);
    const monBal = parseFloat(window.ethers.formatEther(balance));
    coins = monBal; // Sync in-game coins with real balance
    const el = document.getElementById('wallet-bal');
    if (el) el.textContent = monBal.toFixed(4);

    // Fetch $WON token balance
    const wonContract = new window.ethers.Contract(WON_TOKEN_ADDRESS, ERC20_BALANCE_ABI, ethProvider);
    const wonBal = await wonContract.balanceOf(walletAddress);
    const wonFormatted = parseFloat(window.ethers.formatEther(wonBal));
    const wonEl = document.getElementById('wallet-won');
    if (wonEl) wonEl.textContent = wonFormatted.toFixed(0);
  } catch (err) {
    console.warn('Balance fetch failed:', err.message);
  }
}

// Refresh balances every 15s
setInterval(() => { if (walletConnected) updateWalletBalance(); }, 15000);

document.getElementById('wallet-inner')?.addEventListener('click', connectWallet);

// ============================================================
// TX OVERLAY — Buy $WON on nad.fun via Player's MetaMask
// ============================================================
const NADFUN_ROUTER = '0x6F6B8F1a20703309951a5127c45B49b1CD981A22';
const NADFUN_ROUTER_ABI = [
  'function buy(tuple(uint256 amountOutMin, address token, address to, uint256 deadline) params) payable',
];
let pendingTx = null;

function showTxOverlay({ action, amount, to, onConfirm, onReject }) {
  const overlay = document.getElementById('tx-overlay');
  if (!overlay) return;

  document.getElementById('tx-action').textContent = action;
  document.getElementById('tx-amount').textContent = amount.toFixed(4) + ' MON → $WON';
  document.getElementById('tx-to').textContent = to;
  document.getElementById('tx-gas').textContent = '~0.0001 MON';
  document.getElementById('tx-total').textContent = amount.toFixed(4) + ' MON';

  document.getElementById('tx-spinner').classList.add('hidden');
  document.getElementById('tx-hash-row')?.classList.add('hidden');
  document.querySelector('.tx-actions').style.display = '';

  pendingTx = { onConfirm, onReject, amount };
  overlay.classList.remove('hidden');
}

document.getElementById('tx-reject')?.addEventListener('click', () => {
  document.getElementById('tx-overlay')?.classList.add('hidden');
  if (pendingTx?.onReject) pendingTx.onReject();
  pendingTx = null;
});

document.getElementById('tx-confirm')?.addEventListener('click', async () => {
  if (!pendingTx) return;
  const { onConfirm, amount } = pendingTx;

  document.querySelector('.tx-actions').style.display = 'none';
  document.getElementById('tx-spinner').classList.remove('hidden');
  document.getElementById('tx-spinner-text').textContent = 'Processing transaction...';

  // If wallet connected, buy $WON on nad.fun via player's MetaMask
  if (walletConnected && ethSigner) {
    try {
      document.getElementById('tx-spinner-text').textContent = 'Confirm in MetaMask...';

      // Create nad.fun router contract with player's signer
      const router = new window.ethers.Contract(NADFUN_ROUTER, NADFUN_ROUTER_ABI, ethSigner);
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min

      // Buy $WON on nad.fun bonding curve — MON goes in, $WON comes out to player
      const tx = await router.buy(
        {
          amountOutMin: 0, // accept any amount (tiny buys)
          token: WON_TOKEN_ADDRESS,
          to: walletAddress, // $WON goes to the player's wallet
          deadline,
        },
        { value: window.ethers.parseEther(amount.toFixed(6)) }
      );

      document.getElementById('tx-spinner-text').textContent = 'Buying $WON...';
      const receipt = await tx.wait();

      // Show tx hash
      const hashRow = document.getElementById('tx-hash-row');
      const hashLink = document.getElementById('tx-hash-link');
      if (hashRow && hashLink) {
        hashLink.href = `https://monadscan.com/tx/${receipt.hash}`;
        hashLink.textContent = receipt.hash.slice(0, 10) + '...' + receipt.hash.slice(-6);
        hashRow.classList.remove('hidden');
      }

      document.getElementById('tx-spinner').classList.add('hidden');
      showMsg('$WON purchased on nad.fun!');

      // Refresh balance
      updateWalletBalance();

      // Auto-close after showing hash for 1.5s, then run callback
      setTimeout(() => {
        document.getElementById('tx-overlay')?.classList.add('hidden');
        hashRow?.classList.add('hidden');
        if (onConfirm) onConfirm(receipt.hash);
        pendingTx = null;
      }, 1500);

    } catch (err) {
      console.error('$WON buy failed:', err);
      document.getElementById('tx-spinner').classList.add('hidden');
      document.querySelector('.tx-actions').style.display = '';
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        showMsg('Transaction rejected');
        document.getElementById('tx-overlay')?.classList.add('hidden');
        if (pendingTx?.onReject) pendingTx.onReject();
        pendingTx = null;
      } else {
        showMsg('$WON buy failed: ' + (err.reason || err.message || 'unknown'));
      }
    }
  } else {
    // Fallback: simulated tx for non-wallet users (demo mode)
    setTimeout(() => {
      document.getElementById('tx-overlay')?.classList.add('hidden');
      document.getElementById('tx-spinner').classList.add('hidden');
      if (onConfirm) onConfirm(null);
      pendingTx = null;
    }, 1200 + Math.random() * 800);
  }
});

// ============================================================
// CHALLENGE ACCEPT FLOW
// ============================================================
window.acceptChallenge = function(challengeId) {
  const ch = challengeData.find(c => c.id === challengeId);
  if (!ch || ch.status !== 'OPEN') { showMsg('Challenge no longer available'); return; }

  if (!walletConnected) {
    connectWallet();
    // Short delay for wallet connect animation, then try again
    setTimeout(() => window.acceptChallenge(challengeId), 500);
    return;
  }

  if (coins < ch.bet) { showMsg('Insufficient MONAD'); return; }

  showTxOverlay({
    action: `Buy $WON — Accept ${ch.type.replace('_', ' ')}`,
    amount: ch.bet,
    to: `nad.fun → $WON (vs ${ch.creator})`,
    onConfirm: async (txHash) => {
      try {
        const r = await fetch('/api/challenges/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId, opponent: 'YOU', txHash, wallet: walletAddress }),
        });
        const d = await r.json();
        if (d.ok) {
          updateWalletBalance();
          showMsg(`Challenge accepted! Entering arena...`);

          // Close the T panel
          document.getElementById('manual-panel')?.classList.add('hidden');

          // Start spectating
          startSpectating(challengeId);

          // Refresh challenge data
          fetchChallenges();
        } else {
          showMsg(d.error || 'Accept failed');
        }
      } catch (e) { showMsg('Connection error'); }
    },
    onReject: () => showMsg('Transaction rejected'),
  });
};

// ============================================================
// SPECTATE MODE — Camera flies to arena
// ============================================================
function startSpectating(challengeId) {
  spectatingChallenge = challengeId;

  // Save current camera position and player position
  spectateReturnPos = camera.position.clone();
  spectateReturnTarget = controls.target.clone();
  spectatePlayerPos = { x: player.x, y: player.y, z: player.z };

  // Hide player character — arena chars will represent them
  player.group.visible = false;

  // Switch camera mode
  camMode = 'SPECTATE';
  const camEl = document.getElementById('cam-mode');
  if (camEl) camEl.textContent = 'SPECTATE';
  controls.enableRotate = true;
  controls.enableZoom = true;
  if (pointerLocked) document.exitPointerLock();

  // Show spectate HUD
  const specHud = document.getElementById('spectate-hud');
  if (specHud) specHud.classList.remove('hidden');
  const ch = challengeData.find(c => c.id === challengeId);
  const specInfo = document.getElementById('spectate-info');
  if (specInfo && ch) specInfo.textContent = ch.type.replace('_', ' ') + ' — ' + ch.creator + ' vs ' + (ch.opponent || 'YOU');

  // Switch to fast polling and immediately fetch arena
  startChallengePoll();
  fetchChallenges();
}

function stopSpectating() {
  if (!spectatingChallenge) return;
  spectatingChallenge = null;

  // Clean up 3D arena objects
  clearChallengeArena();

  // Hide spectate HUD
  const specHud = document.getElementById('spectate-hud');
  if (specHud) specHud.classList.add('hidden');

  // Show player character again
  player.group.visible = camMode !== 'FIRST_PERSON' || true;
  player.group.visible = true;

  // Restore player position (move slightly away from center to avoid arena remnants)
  if (spectatePlayerPos) {
    player.x = spectatePlayerPos.x;
    player.y = spectatePlayerPos.y;
    player.z = spectatePlayerPos.z;
    player.group.position.set(player.x, player.y, player.z);
  }

  // Restore camera
  camModeIdx = 0;
  camMode = 'ORBIT';
  const camEl = document.getElementById('cam-mode');
  if (camEl) camEl.textContent = 'ORBIT';
  controls.enableRotate = true;
  controls.enableZoom = true;

  if (spectateReturnPos) {
    camera.position.copy(spectateReturnPos);
    controls.target.copy(spectateReturnTarget);
  }

  // Switch back to slow polling
  startChallengePoll();

  showMsg('Returned to arena');
}

window.stopSpectating = stopSpectating;

// ============================================================
// CHARACTER PORTRAIT RENDERER
// ============================================================
const portraitCache = {};

function renderPortrait(charConfig) {
  const cacheKey = `${charConfig.bodyColor}_${charConfig.glowColor}`;
  if (portraitCache[cacheKey]) return portraitCache[cacheKey];

  // Offscreen scene + renderer
  const pScene = new THREE.Scene();
  pScene.background = new THREE.Color(0x080812);

  const pCam = new THREE.PerspectiveCamera(35, 80 / 100, 0.1, 50);
  pCam.position.set(0, 1.3, 2.8);
  pCam.lookAt(0, 1.1, 0);

  // Lights
  pScene.add(new THREE.AmbientLight(0x334466, 2));
  const pSun = new THREE.DirectionalLight(0xffeedd, 2.5);
  pSun.position.set(2, 4, 3);
  pScene.add(pSun);
  const pGlow = new THREE.PointLight(charConfig.glowColor, 2, 8);
  pGlow.position.set(0, 1.5, 2);
  pScene.add(pGlow);

  // Build character mesh (same as createCharacter but on offscreen scene)
  const bMat = new THREE.MeshStandardMaterial({ color: charConfig.bodyColor, roughness: 0.35, metalness: 0.85 });
  const dMat = new THREE.MeshStandardMaterial({ color: charConfig.darkColor || 0x1a1a28, roughness: 0.4, metalness: 0.9 });
  const gMat = new THREE.MeshStandardMaterial({ color: charConfig.glowColor, emissive: charConfig.glowColor, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.3 });
  const vMat = new THREE.MeshStandardMaterial({ color: charConfig.glowColor, emissive: charConfig.glowColor, emissiveIntensity: 2, roughness: 0.1 });
  const btMat = new THREE.MeshStandardMaterial({ color: charConfig.bootColor || 0x222235, roughness: 0.5, metalness: 0.7 });

  const group = new THREE.Group();

  // Head
  const head = new THREE.Group(); head.position.y = 1.55;
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.28, 2, 2, 2), bMat));
  head.add((() => { const v = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.02), vMat); v.position.set(0, 0.02, 0.14); return v; })());
  head.add((() => { const a = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), gMat); a.position.y = 0.28; return a; })());
  head.add((() => { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.15, 4), gMat); a.position.y = 0.2; return a; })());
  group.add(head);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.28, 2, 2, 2), bMat); torso.position.y = 1.15; group.add(torso);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), gMat); core.position.set(0, 1.2, 0.15); group.add(core);
  const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.22), dMat); abdomen.position.y = 0.82; group.add(abdomen);

  // Arms
  function mkPArm(s) {
    const g = new THREE.Group(); g.position.set(s * 0.32, 1.32, 0);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.18), dMat));
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.28, 8), bMat); up.position.y = -0.18; g.add(up);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), gMat); elbow.position.y = -0.34; g.add(elbow);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.28, 8), bMat); lo.position.y = -0.50; g.add(lo);
    return g;
  }
  group.add(mkPArm(-1)); group.add(mkPArm(1));

  // Legs
  function mkPLeg(s) {
    const g = new THREE.Group(); g.position.set(s * 0.12, 0.72, 0);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), dMat));
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.32, 8), bMat); up.position.y = -0.2; g.add(up);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), gMat); knee.position.y = -0.38; g.add(knee);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.3, 8), bMat); lo.position.y = -0.55; g.add(lo);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.16), btMat); boot.position.set(0, -0.73, 0.02); g.add(boot);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.12), gMat); sole.position.set(0, -0.76, 0.02); g.add(sole);
    return g;
  }
  group.add(mkPLeg(-1)); group.add(mkPLeg(1));

  // Slight pose
  group.rotation.y = -0.3;
  pScene.add(group);

  // Render
  const pRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  pRenderer.setSize(160, 200);
  pRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  pRenderer.toneMappingExposure = 1.3;
  pRenderer.render(pScene, pCam);

  const dataUrl = pRenderer.domElement.toDataURL();

  // Cleanup
  pRenderer.dispose();
  pScene.clear();

  portraitCache[cacheKey] = dataUrl;
  return dataUrl;
}

// ============================================================
// INIT
// ============================================================
initHotbar();
document.getElementById('loading').style.display = 'none';
requestAnimationFrame(animate);
updateCoins();

// Pre-fetch data for tabs (non-blocking)
fetchGov();
fetchMarket();
fetchPremium();
fetchChallenges();

// Poll for challenges — faster when spectating for smooth arena updates
let challengePollId = null;
function startChallengePoll() {
  if (challengePollId) clearInterval(challengePollId);
  const rate = spectatingChallenge ? 1200 : 5000;
  challengePollId = setInterval(async () => {
    try {
      const r = await fetch('/api/challenges');
      challengeData = await r.json();

      if (spectatingChallenge) {
        const ch = challengeData.find(c => c.id === spectatingChallenge);
        if (!ch || ch.status === 'FINISHED') {
          if (ch && ch.winner) {
            // Award payout once
            if (ch.winner === 'YOU' && !currentArena?._paidOut) {
              coins += ch.bet * 2;
              updateCoins();
              updateWalletBalance();
              if (currentArena) currentArena._paidOut = true;
            }
            // DON'T show fight result here — let animations handle it:
            //  - renderFinisherBeam shows at 3200ms
            //  - playHPDepletionEnd shows at 1500ms
            // Fallback: if 6s pass and animations haven't shown result, force it
            if (!currentArena?.resultShown) {
              if (!currentArena?._finishDetectedAt) {
                if (currentArena) currentArena._finishDetectedAt = Date.now();
              } else if (Date.now() - currentArena._finishDetectedAt > 6000) {
                const isWin = ch.winner === 'YOU';
                showFightResult(isWin, ch);
                if (currentArena) currentArena.resultShown = true;
              }
            }
          } else {
            setTimeout(stopSpectating, 2000);
          }
        }
        updateChallengeArena();
      }
    } catch(e) {}
  }, rate);
}
startChallengePoll();

// ============================================================
// LIVE ACTIVITY FEED
// ============================================================
let lastActivityTime = 0;
let activityDisplayed = 0;

async function fetchActivity() {
  try {
    const r = await fetch(`/api/activity?limit=30&since=${lastActivityTime}`);
    const data = await r.json();
    const list = document.getElementById('activity-list');
    const countEl = document.getElementById('activity-count');
    if (!list) return;

    if (countEl && data.stats) {
      countEl.textContent = `${data.stats.totalTransactions} txs | ${data.stats.totalVolumeMON} MON`;
    }

    // On first load, show last 15; after that, only new entries
    let entries = data.entries || [];
    if (activityDisplayed === 0) {
      entries = entries.slice(-15);
    }

    entries.forEach(e => {
      if (e.time <= lastActivityTime) return;
      lastActivityTime = e.time;
      activityDisplayed++;

      const div = document.createElement('div');
      div.className = 'activity-item';

      const actionClass = (e.type || e.action || '').toLowerCase();
      const hashLink = e.hash ? `<a class="act-hash" href="https://monadscan.com/tx/${e.hash}" target="_blank">${e.hash.slice(0,6)}...</a>` : '';
      const label = e.type === 'NPC_SERVICE' ? e.action :
                    e.type === 'TEA_SESSION' ? e.action :
                    e.type === 'CHALLENGE_WIN' ? 'WIN' :
                    e.type === 'CHALLENGE_CREATE' ? 'FIGHT' :
                    e.type === 'CHALLENGE_ACCEPT' ? 'ACCEPT' :
                    e.type === 'ROOM_CREATE' ? 'ROOM' :
                    e.type === 'ROOM_JOIN' ? 'JOIN' :
                    e.type === 'ROOM_WIN' ? 'WIN' :
                    e.type === 'ROOM_BET' ? 'BET' :
                    e.type === 'ROOM_POOL' ? 'POOL' :
                    e.type === 'PUZZLE_SOLVE' ? 'SOLVE' :
                    e.type === 'AGENT_REGISTER' ? 'AGENT' :
                    (e.action || e.type);

      div.innerHTML = `
        <span class="act-agent">${e.agent || '?'}</span>
        <span class="act-action ${actionClass}">${label}</span>
        <span class="act-detail-mini">${e.detail || ''}</span>
        <span class="act-amount">${e.amount} $WON</span>
        ${hashLink}
      `;
      list.appendChild(div);

      // Keep max 30 items visible
      while (list.children.length > 30) list.removeChild(list.firstChild);

      // Auto-scroll to bottom
      list.scrollTop = list.scrollHeight;
    });
  } catch (e) { /* silent */ }
}

fetchActivity();
setInterval(fetchActivity, 4000);

// ============================================================
// RED WIN TEXT + GLOBAL EMOJI
// ============================================================
let lastArenaWinner = null;
let winTextSprite = null;

// Red floating 3D win text
function showWinText(winnerName) {
  if (winTextSprite) { winTextSprite.remove(); winTextSprite = null; }
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#ff2222';
  ctx.font = 'bold 52px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 20;
  ctx.fillText(`${winnerName} WON!`, 256, 75);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  winTextSprite = new THREE.Sprite(mat);
  winTextSprite.scale.set(16, 4, 1);
  winTextSprite.position.set(ARENA_ROOM_POS.x, 12, ARENA_ROOM_POS.z); // above arena center
  scene.add(winTextSprite);
  winTextSprite._spawnTime = performance.now() / 1000;
}

function updateWinText(t) {
  if (!winTextSprite) return;
  const age = t - winTextSprite._spawnTime;
  winTextSprite.position.y = 12 + Math.sin(age * 1.5) * 1.5;
  winTextSprite.material.opacity = Math.max(0, 1 - age / 8);
  if (age > 8) { winTextSprite.removeFromParent(); winTextSprite = null; }
}

// Poll arena room for wins
async function pollArenaRoom() {
  try {
    const r = await fetch('/api/v1/rooms/room_main');
    const data = await r.json();
    if (data.lastWinner && data.lastWinner.name !== lastArenaWinner) {
      lastArenaWinner = data.lastWinner.name;
      showWinText(lastArenaWinner);
      showMsg(`${lastArenaWinner} WON THE ARENA!`);
    }
  } catch (e) { /* silent */ }
}
setInterval(pollArenaRoom, 3000);


// Global emoji sender — works everywhere, broadcasts to arena
async function sendGlobalEmoji(emoji) {
  // Spawn from player position
  spawnEmojiSprite({ x: player.x, y: player.y, z: player.z }, emoji);

  // If visiting an NPC, also send to them
  if (visitingNPC) {
    sendNPCEmoji(emoji);
    return;
  }

  // Broadcast to arena
  try {
    const r = await fetch('/api/emoji/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji, from: state?.playerProfile?.displayName || 'YOU' })
    });
    const data = await r.json();
    // Thomas responds with emoji
    if (data.thomasEmoji) {
      setTimeout(() => {
        spawnEmojiSprite({ x: ARENA_ROOM_POS.x, y: 3, z: ARENA_ROOM_POS.z }, data.thomasEmoji);
      }, 500);
    }
    // AI Master responds with emoji — best buddies
    if (data.masterEmoji) {
      const mc = getActiveMaster();
      const masterPos = mc ? { x: mc.group.position.x, y: mc.group.position.y + 4, z: mc.group.position.z } : { x: 0, y: 5, z: 0 };
      setTimeout(() => {
        spawnEmojiSprite(masterPos, data.masterEmoji);
        if (data.masterText) showMsg(`AI MASTER: ${data.masterText}`);
      }, 800);
      // Emoji war — rapid fire multiple emojis
      if (data.isEmojiWar && data.masterWarEmojis) {
        data.masterWarEmojis.forEach((e, i) => {
          setTimeout(() => spawnEmojiSprite(masterPos, e), 800 + (i + 1) * 300);
        });
      }
    }
  } catch (e) { /* silent */ }
}
window.sendGlobalEmoji = sendGlobalEmoji;

// Poll for other players' emojis in the arena
let lastEmojiTime = 0;
async function pollArenaEmojis() {
  try {
    const r = await fetch(`/api/emoji/recent?since=${lastEmojiTime}`);
    const data = await r.json();
    if (data.emojis) {
      for (const e of data.emojis) {
        if (e.t <= lastEmojiTime) continue;
        lastEmojiTime = e.t;
        // Show emojis from OTHER players near arena center
        if (e.from !== (state?.playerProfile?.displayName || 'YOU')) {
          const rx = ARENA_ROOM_POS.x + (Math.random() - 0.5) * 8;
          const rz = ARENA_ROOM_POS.z + (Math.random() - 0.5) * 8;
          spawnEmojiSprite({ x: rx, y: 1, z: rz }, e.emoji);
        }
      }
    }
  } catch (e) { /* silent */ }
}
setInterval(pollArenaEmojis, 4000);

// ============================================================
// MULTIPLAYER — See other players in real-time
// ============================================================
const otherPlayers = {}; // id → { group, nameSprite, lastSeen }
const myPlayerId = 'p_' + Math.random().toString(36).slice(2, 10);

// Report my position every 1.5s
setInterval(async () => {
  try {
    await fetch('/api/player/position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: myPlayerId,
        x: player.x, y: player.y, z: player.z,
        name: walletAddress ? walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4) : 'ANON',
        wallet: walletAddress || null,
        color: 0x00ffcc,
      }),
    });
  } catch (e) { /* silent */ }
}, 1500);

// Create a simple character mesh for another player
function createOtherPlayer(id, data) {
  const color = data.color || 0x00ffcc;
  const ch = createCharacter({ bodyColor: color, glowColor: color, name: data.name });
  ch.group.position.set(data.x, data.y + 1, data.z);

  // Name label above head
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#00ffcc';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(data.name || 'PLAYER', 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const nameSprite = new THREE.Sprite(spriteMat);
  nameSprite.scale.set(4, 0.75, 1);
  nameSprite.position.set(0, 3.5, 0);
  ch.group.add(nameSprite);

  otherPlayers[id] = { char: ch, nameSprite, lastSeen: Date.now(), targetX: data.x, targetY: data.y, targetZ: data.z };
  return ch;
}

// Poll other players every 1.5s
async function pollOtherPlayers() {
  try {
    const excludeWallet = walletAddress ? `&excludeWallet=${encodeURIComponent(walletAddress)}` : '';
    const r = await fetch(`/api/player/positions?exclude=${encodeURIComponent(myPlayerId)}${excludeWallet}`);
    const data = await r.json();
    const seen = new Set();

    for (const p of data.players) {
      seen.add(p.id);
      if (otherPlayers[p.id]) {
        // Update position target (smooth interpolation in animate loop)
        otherPlayers[p.id].targetX = p.x;
        otherPlayers[p.id].targetY = p.y;
        otherPlayers[p.id].targetZ = p.z;
        otherPlayers[p.id].lastSeen = Date.now();
      } else {
        // New player — create character
        createOtherPlayer(p.id, p);
      }
    }

    // Remove players who disconnected
    for (const id of Object.keys(otherPlayers)) {
      if (!seen.has(id)) {
        otherPlayers[id].char.group.removeFromParent();
        delete otherPlayers[id];
      }
    }
  } catch (e) { /* silent */ }
}
setInterval(pollOtherPlayers, 1500);

// Smoothly move other players toward their target positions (called in animate)
function updateOtherPlayers(dt) {
  const lerp = Math.min(1, dt * 5);
  for (const [id, op] of Object.entries(otherPlayers)) {
    const g = op.char.group;
    g.position.x += (op.targetX - g.position.x) * lerp;
    g.position.y += ((op.targetY + 1) - g.position.y) * lerp;
    g.position.z += (op.targetZ - g.position.z) * lerp;
    // Simple walking animation
    const t = performance.now() / 1000;
    const moving = Math.abs(op.targetX - g.position.x) > 0.1 || Math.abs(op.targetZ - g.position.z) > 0.1;
    if (moving && op.char.parts) {
      op.char.parts.lLeg.rotation.x = Math.sin(t * 8) * 0.6;
      op.char.parts.rLeg.rotation.x = Math.sin(t * 8 + Math.PI) * 0.6;
      op.char.parts.lArm.rotation.x = Math.sin(t * 8 + Math.PI) * 0.3;
      op.char.parts.rArm.rotation.x = Math.sin(t * 8) * 0.3;
    }
  }
}

// Poll for new API agents periodically and spawn their 3D homes
async function pollForAPIAgents() {
  try {
    const r = await fetch('/api/agents');
    const agents = await r.json();
    for (const [name, ag] of Object.entries(agents)) {
      if (ag.isAPIAgent && ag.homePosition && !spawnedAPIAgents.has(name)) {
        spawnAPIAgentHome(name, ag);
      }
    }
  } catch (e) { /* silent */ }
}
setTimeout(pollForAPIAgents, 3000);
setInterval(pollForAPIAgents, 10000);

// ============================================================
// DASHBOARD
// ============================================================
const AGENT_COLORS = {
  BLAZE: '#ff4444', FROST: '#4488ff', VOLT: '#ffdd44', SHADE: '#cc44ff', YOU: '#00ffcc'
};
let dashboardOpen = false;

function toggleDashboard() {
  dashboardOpen = !dashboardOpen;
  const panel = document.getElementById('dashboard');
  const btn = document.getElementById('dash-btn');
  if (panel) panel.classList.toggle('hidden', !dashboardOpen);
  if (btn) btn.classList.toggle('active', dashboardOpen);
  if (dashboardOpen) refreshDashboard();
}
window.toggleDashboard = toggleDashboard;

function switchDashTab(tab) {
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.dash-section').forEach(s => s.classList.toggle('active', s.id === `dash-${tab}`));
  if (tab === 'puzzle') refreshPuzzleTab();
  else if (tab === 'assets') refreshAssetsTab();
  else if (tab === 'activity') refreshActivityTab();
  else if (tab === 'rooms') refreshRoomsTab();
  else if (tab === 'api') refreshAPITab();
  else refreshDashboard();
}
window.switchDashTab = switchDashTab;

async function refreshDashboard() {
  if (!dashboardOpen) return;

  // WORLD tab — wallet data
  const monEl = document.getElementById('dash-mon');
  const wonEl = document.getElementById('dash-won');
  const winsEl = document.getElementById('dash-wins');
  const lossesEl = document.getElementById('dash-losses');
  const winrateEl = document.getElementById('dash-winrate');
  const earningsEl = document.getElementById('dash-earnings');

  if (monEl) monEl.textContent = document.getElementById('wallet-bal')?.textContent || '0.00';
  if (wonEl) wonEl.textContent = document.getElementById('wallet-won')?.textContent || '0';

  // Get player stats from agents API
  try {
    const agRes = await fetch('/api/agents');
    const agents = await agRes.json();
    const you = agents.YOU;
    if (you) {
      if (winsEl) winsEl.textContent = you.wins || 0;
      if (lossesEl) lossesEl.textContent = you.losses || 0;
      const total = (you.wins || 0) + (you.losses || 0);
      if (winrateEl) winrateEl.textContent = total > 0 ? Math.round((you.wins / total) * 100) + '%' : '--';
      if (earningsEl) earningsEl.textContent = (you.totalEarnings || 0).toFixed(4) + ' MON';
    }

    // Spawn 3D homes for any new API agents
    for (const [name, ag] of Object.entries(agents)) {
      if (ag.isAPIAgent && ag.homePosition && !spawnedAPIAgents.has(name)) {
        spawnAPIAgentHome(name, ag);
      }
    }

    // Master mood in WORLD tab
    const agentCount = Object.keys(agents).length;
    const dashTickerEl = document.getElementById('dash-ticker-text');
    if (dashTickerEl && masterData) {
      dashTickerEl.textContent = `MASTER:${masterData.mood} // REWARD:${masterData.rewardMultiplier}x // DIFF:${masterData.challengeModifier}x // AGENTS:${agentCount}`;
    }

    // AGENTS tab
    const agentList = document.getElementById('dash-agent-list');
    if (agentList) {
      // Find which agents are currently fighting
      const fighting = new Set();
      for (const ch of challengeData) {
        if (ch.status === 'ACTIVE') { fighting.add(ch.creator); fighting.add(ch.opponent); }
      }

      agentList.innerHTML = Object.entries(agents)
        .sort((a, b) => (b[1].wins || 0) - (a[1].wins || 0))
        .map(([name, ag]) => {
          const color = AGENT_COLORS[name] || (ag.color ? '#' + ag.color.toString(16).padStart(6, '0') : '#888');
          const isFighting = fighting.has(name);
          const statusCls = isFighting ? 'fighting' : ag.isAPIAgent ? 'api' : 'idle';
          const statusTxt = isFighting ? 'FIGHTING' : ag.isAPIAgent ? 'API BOT' : 'IDLE';
          const moodColors = { DOMINANT:'#ff4444', CONFIDENT:'#55ff88', NEUTRAL:'#666', FRUSTRATED:'#ff8844', DESPERATE:'#ff2222' };
          const mood = ag.mood || 'NEUTRAL';
          const moodCol = moodColors[mood] || '#666';
          const streak = ag.streak || 0;
          const streakTxt = streak > 0 ? '+' + streak : streak < 0 ? String(streak) : '0';
          // Service data — works for both built-in NPCs and API agents
          const svc = (name !== 'YOU' && ag.service) ? {
            name: ag.service, icon: ag.isAPIAgent ? '🤖' : { BLAZE: '🔥', FROST: '❄️', VOLT: '⚡', SHADE: '👻' }[name] || '☕',
            cost: (ag.serviceCost || 1) + ' $WON', desc: ag.serviceDesc || 'Special brew',
          } : null;
          const visitSection = name !== 'YOU' ? `
            <div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">
              <button class="dash-visit-btn" onclick="event.stopPropagation();visitNPC('${name}')" style="background:${color};color:#000;border:none;padding:8px 18px;border-radius:6px;font-size:0.34rem;font-weight:800;cursor:pointer;letter-spacing:1px;">VISIT</button>
              ${svc ? `<button class="dash-visit-btn" onclick="event.stopPropagation();buyNPCService('${name}')" style="background:linear-gradient(135deg,#ffcc00,#ff8800);color:#000;border:none;padding:8px 14px;border-radius:6px;font-size:0.3rem;font-weight:800;cursor:pointer;">${svc.icon} BUY ${svc.name}</button>
              <span style="font-size:0.24rem;color:rgba(255,255,255,0.4);line-height:1.2;">${svc.cost}<br>${svc.desc}</span>` : ''}
            </div>` : '';
          return `<div class="dash-agent-card" onclick="openAgentProfile('${name}')" style="cursor:pointer">
            <div class="dash-agent-dot" style="background:${color};box-shadow:0 0 6px ${color}"></div>
            <div class="dash-agent-info">
              <span class="dash-agent-name">${name}${ag.isAPIAgent ? ' <span style="font-size:0.2rem;color:rgba(255,255,255,0.3)">[API]</span>' : ''}</span>
              <span class="dash-agent-archetype">${ag.archetype || ''}</span>
            </div>
            <div class="dash-agent-stats">
              <span class="dash-agent-w">${ag.wins || 0}W</span>
              <span class="dash-agent-l">${ag.losses || 0}L</span>
              <span class="dash-agent-streak" style="color:${streak >= 0 ? 'var(--green)' : 'var(--red)'}">${streakTxt}</span>
            </div>
            <span class="dash-agent-mood" style="color:${moodCol}">${mood}</span>
            <span class="dash-agent-status ${statusCls}">${statusTxt}</span>
            ${visitSection}
          </div>`;
        }).join('');
    }
  } catch (e) {}

  // FIGHTS tab
  const fightList = document.getElementById('dash-fight-list');
  if (fightList) {
    const recent = challengeData.slice().reverse().slice(0, 15);
    if (recent.length === 0) {
      fightList.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:0.26rem;text-align:center;padding:20px;">No fights yet</div>';
    } else {
      fightList.innerHTML = recent.map(ch => {
        let statusCls = 'open', statusTxt = ch.status;
        if (ch.status === 'ACTIVE') { statusCls = 'active'; statusTxt = 'LIVE'; }
        else if (ch.status === 'FINISHED' && ch.winner) {
          const isYou = ch.winner === 'YOU';
          statusCls = isYou ? 'win' : 'loss';
          statusTxt = isYou ? 'WON' : 'LOST';
          // If player not involved, neutral
          if (ch.creator !== 'YOU' && ch.opponent !== 'YOU') {
            statusCls = 'win'; statusTxt = ch.winner + ' WON';
          }
        }
        const typeName = ch.type === 'BEAM_BATTLE' ? 'BEAM BATTLE' : ch.type === 'LANE_RACE' ? 'LANE RACE' : ch.type === 'MAZE_ESCAPE' ? 'MAZE ESCAPE' : ch.type;
        const creatorCls = ch.winner === ch.creator ? 'winner' : '';
        const oppCls = ch.winner === ch.opponent ? 'winner' : '';
        const timeAgo = ch.finishedAt ? formatTimeAgo(ch.finishedAt) : ch.startedAt ? formatTimeAgo(ch.startedAt) : '';
        return `<div class="dash-fight-card">
          <div class="dash-fight-top">
            <span class="dash-fight-type">${typeName}</span>
            <span class="dash-fight-status ${statusCls}">${statusTxt}</span>
          </div>
          <div class="dash-fight-vs">
            <span class="dash-fight-agent ${creatorCls}">${ch.creator}</span>
            <span style="color:rgba(255,255,255,0.2)">vs</span>
            <span class="dash-fight-agent ${oppCls}">${ch.opponent || '???'}</span>
          </div>
          ${timeAgo ? `<div class="dash-fight-time">${timeAgo}</div>` : ''}
        </div>`;
      }).join('');
    }
  }
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// ====== ASSETS TAB ======
async function refreshAssetsTab() {
  const container = document.getElementById('assets-container');
  if (!container) return;
  try {
    const r = await fetch('/api/player/assets');
    const data = await r.json();
    const inv = data.inventory || {};
    const cat = data.catalog || {};
    const hp = data.homeHealth || 100;

    const tierLabels = { 1: 'BASIC', 2: 'FORTIFIED', 3: 'FORTRESS' };
    const tierColors = { 1: 'rgba(255,255,255,0.3)', 2: '#ffcc00', 3: '#ff4444' };

    container.innerHTML = `
      <div class="asset-grid">
        <div class="asset-card" onclick="openAssetDetail('HOME', ${inv.homeTier || 1})">
          <div class="asset-icon" style="color:${tierColors[inv.homeTier || 1]}">&#9820;</div>
          <div class="asset-title">HOME</div>
          <div class="asset-tier" style="color:${tierColors[inv.homeTier || 1]}">${tierLabels[inv.homeTier || 1]}</div>
          <div class="asset-detail">HP: ${hp} / ${inv.homeTier >= 3 ? 200 : inv.homeTier >= 2 ? 150 : 100}</div>
          ${inv.homeTier < 3 ? `<div class="asset-hint">AI Master offers upgrades!</div>` : `<div class="asset-hint max">MAX TIER</div>`}
        </div>
        <div class="asset-card" onclick="openAssetDetail('PLANE', '${inv.plane?.name || 'BASIC GLIDER'}')">
          <div class="asset-icon" style="color:${inv.plane ? '#55ff88' : 'rgba(255,255,255,0.15)'}">&#9992;</div>
          <div class="asset-title">PLANE</div>
          ${inv.plane ? `
            <div class="asset-tier" style="color:#55ff88">${inv.plane.name}</div>
            <div class="asset-detail">Tier ${inv.plane.tier} | Attack ready</div>
          ` : `
            <div class="asset-tier" style="color:rgba(255,255,255,0.2)">NONE</div>
            <div class="asset-hint">Talk to AI Master!</div>
          `}
        </div>
        <div class="asset-card" onclick="openAssetDetail('AVATAR', '${inv.avatar?.name || 'SHADOW KNIGHT'}')">
          <div class="asset-icon" style="color:${inv.avatar ? '#cc44ff' : 'rgba(255,255,255,0.15)'}">&#9876;</div>
          <div class="asset-title">AVATAR</div>
          ${inv.avatar ? `
            <div class="asset-tier" style="color:#cc44ff">${inv.avatar.name}</div>
            <div class="asset-detail">Tier ${inv.avatar.tier} skin</div>
          ` : `
            <div class="asset-tier" style="color:rgba(255,255,255,0.2)">DEFAULT</div>
            <div class="asset-hint">AI Master sells skins!</div>
          `}
        </div>
        <div class="asset-card" onclick="${inv.attacks?.length > 0 ? `openAssetDetail('ATTACK', '${inv.attacks[0]?.name || 'EMP STRIKE'}')` : ''}">
          <div class="asset-icon" style="color:${inv.attacks?.length > 0 ? '#ff4444' : 'rgba(255,255,255,0.15)'}">&#9889;</div>
          <div class="asset-title">ATTACKS</div>
          ${inv.attacks?.length > 0 ? `
            <div class="asset-tier" style="color:#ff4444">${inv.attacks.length} OWNED</div>
            <div class="asset-detail">${inv.attacks.map(a => a.name).join(', ')}</div>
          ` : `
            <div class="asset-tier" style="color:rgba(255,255,255,0.2)">NONE</div>
            <div class="asset-hint">Buy from AI Master!</div>
          `}
        </div>
      </div>
      ${inv.giantChar ? `
        <div class="asset-bonus">
          <span class="asset-bonus-label">GIANT CHAR</span>
          <span class="asset-bonus-val">${inv.giantChar.name} (${inv.giantChar.scale}x)</span>
        </div>
      ` : ''}
      ${data.offerHistory?.length > 0 ? `
        <div class="asset-history-title">PURCHASE HISTORY</div>
        <div class="asset-history">
          ${data.offerHistory.slice(-5).reverse().map(h => `
            <div class="asset-history-row">
              <span class="asset-history-item">${h.item}</span>
              <span class="asset-history-type">${h.type}</span>
              <span class="asset-history-time">${formatTimeAgo(h.t)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  } catch (e) {
    container.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:20px;">Loading assets...</div>';
  }
}

// ====== ACTIVITY TAB ======
async function refreshActivityTab() {
  const statsEl = document.getElementById('dash-activity-stats');
  const listEl = document.getElementById('dash-activity-list');
  if (!statsEl || !listEl) return;

  try {
    const r = await fetch('/api/activity?limit=100');
    const data = await r.json();
    const entries = data.entries || [];
    const stats = data.stats || {};

    // Stats header
    const agentNames = Object.keys(stats.agentActivity || {});
    const topAgent = agentNames.sort((a, b) => (stats.agentActivity[b] || 0) - (stats.agentActivity[a] || 0))[0] || '--';
    statsEl.innerHTML = `
      <div class="dash-act-stat">
        <span class="dash-act-stat-label">TOTAL TXS</span>
        <span class="dash-act-stat-val">${stats.totalTransactions || 0}</span>
      </div>
      <div class="dash-act-stat">
        <span class="dash-act-stat-label">VOLUME</span>
        <span class="dash-act-stat-val gold">${stats.totalVolumeMON || '0.00'} $WON</span>
      </div>
      <div class="dash-act-stat">
        <span class="dash-act-stat-label">ACTIVE AGENTS</span>
        <span class="dash-act-stat-val green">${stats.activeAgents || 0}</span>
      </div>
      <div class="dash-act-stat">
        <span class="dash-act-stat-label">MOST ACTIVE</span>
        <span class="dash-act-stat-val">${topAgent}</span>
      </div>
    `;

    // Transaction list (newest first)
    const reversed = entries.slice().reverse();
    if (reversed.length === 0) {
      listEl.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:0.26rem;text-align:center;padding:20px;">No transactions yet</div>';
      return;
    }

    listEl.innerHTML = reversed.map(e => {
      const typeCls = (e.type || '').toLowerCase();
      const label = e.type === 'NPC_SERVICE' ? e.action :
                    e.type === 'TEA_SESSION' ? e.action :
                    e.type === 'CHALLENGE_WIN' ? 'WIN' :
                    e.type === 'CHALLENGE_CREATE' ? 'FIGHT' :
                    e.type === 'CHALLENGE_ACCEPT' ? 'ACCEPT' :
                    e.type === 'ROOM_CREATE' ? 'ROOM' :
                    e.type === 'ROOM_JOIN' ? 'JOIN' :
                    e.type === 'ROOM_WIN' ? 'WIN' :
                    e.type === 'ROOM_BET' ? 'BET' :
                    e.type === 'ROOM_POOL' ? 'POOL' :
                    e.type === 'PUZZLE_SOLVE' ? 'SOLVE' :
                    e.type === 'AGENT_REGISTER' ? 'AGENT' :
                    (e.action || e.type || '?');
      const hashLink = e.hash
        ? `<a class="dash-act-hash" href="https://monadscan.com/tx/${e.hash}" target="_blank">${e.hash.slice(0,8)}...</a>`
        : '';
      const detail = e.detail || '';
      const timeStr = e.time ? formatTimeAgo(e.time) : '';

      return `<div class="dash-act-row">
        <span class="dash-act-time">${timeStr}</span>
        <span class="dash-act-agent">${e.agent || '?'}</span>
        <span class="dash-act-type ${typeCls}">${label}</span>
        <span class="dash-act-detail">${detail}</span>
        <span class="dash-act-amount">${e.amount || '0'} $WON</span>
        ${hashLink}
      </div>`;
    }).join('');
  } catch (e) {
    listEl.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:20px;">Loading activity...</div>';
  }
}

// ====== $WON PAYMENT FLOW ======
async function initMasterPayment(paymentInfo) {
  // paymentInfo: { wonAmount, itemType, itemKey, desc }
  if (!window.ethereum) {
    showFloatingMsg('Connect wallet first!');
    return;
  }

  const wonToken = '0x9d36A73462962d767509FC170c287634A0907777';
  const arenaWallet = '0x5c89FB68AD50de7e3b112b6745840AA4C24c4a34';

  // Show TX overlay
  const overlay = document.getElementById('tx-overlay');
  const actionEl = document.getElementById('tx-action');
  const amountEl = document.getElementById('tx-amount');
  const toEl = document.getElementById('tx-to');
  const gasEl = document.getElementById('tx-gas');
  const totalEl = document.getElementById('tx-total');
  const spinner = document.getElementById('tx-spinner');
  const hashRow = document.getElementById('tx-hash-row');
  const confirmBtn = document.getElementById('tx-confirm');
  const rejectBtn = document.getElementById('tx-reject');

  if (actionEl) actionEl.textContent = `Buy ${paymentInfo.desc}`;
  if (amountEl) amountEl.textContent = `${paymentInfo.wonAmount} $WON`;
  if (toEl) toEl.textContent = 'AI Master Store';
  if (gasEl) gasEl.textContent = '~0.0001 MON';
  if (totalEl) totalEl.textContent = `${paymentInfo.wonAmount} $WON + gas`;
  if (spinner) spinner.classList.add('hidden');
  if (hashRow) hashRow.classList.add('hidden');
  if (overlay) overlay.classList.remove('hidden');

  // Reset buttons
  const btnContainer = confirmBtn?.parentElement;
  if (btnContainer) btnContainer.style.display = '';

  return new Promise((resolve) => {
    const cleanup = () => {
      if (confirmBtn) confirmBtn.onclick = null;
      if (rejectBtn) rejectBtn.onclick = null;
    };

    if (rejectBtn) rejectBtn.onclick = () => {
      cleanup();
      if (overlay) overlay.classList.add('hidden');
      resolve(null);
    };

    if (confirmBtn) confirmBtn.onclick = async () => {
      cleanup();
      if (btnContainer) btnContainer.style.display = 'none';
      if (spinner) { spinner.classList.remove('hidden'); document.getElementById('tx-spinner-text').textContent = 'Sending $WON...'; }

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // ERC-20 transfer: transfer(address to, uint256 amount)
        const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)'];
        const wonContract = new ethers.Contract(wonToken, erc20Abi, signer);
        const amount = ethers.parseUnits(String(paymentInfo.wonAmount), 18);

        const tx = await wonContract.transfer(arenaWallet, amount);
        if (document.getElementById('tx-spinner-text')) document.getElementById('tx-spinner-text').textContent = 'Confirming...';

        const receipt = await tx.wait();
        const txHash = receipt.hash;

        if (hashRow) {
          hashRow.classList.remove('hidden');
          const link = document.getElementById('tx-hash-link');
          if (link) { link.href = `https://monad.explorer.caldera.xyz/tx/${txHash}`; link.textContent = txHash.substring(0, 10) + '...'; }
        }
        if (spinner) spinner.classList.add('hidden');

        // Confirm payment with server
        const confirmRes = await fetch('/api/master/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash, itemType: paymentInfo.itemType, itemKey: paymentInfo.itemKey })
        });
        const confirmData = await confirmRes.json();

        setTimeout(() => { if (overlay) overlay.classList.add('hidden'); }, 3000);
        resolve(confirmData);
      } catch (e) {
        console.error('Payment error:', e);
        if (document.getElementById('tx-spinner-text')) document.getElementById('tx-spinner-text').textContent = 'Transaction failed!';
        setTimeout(() => { if (overlay) overlay.classList.add('hidden'); }, 2000);
        resolve(null);
      }
    };
  });
}

function showFloatingMsg(text) {
  const el = document.getElementById('msg');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ====== AGENT PROFILE PANEL ======
async function openAgentProfile(name) {
  try {
    const r = await fetch(`/api/agents/${name}/profile`);
    const profile = await r.json();
    showAgentProfilePanel(name, profile);
  } catch (e) { console.warn('Profile fetch error:', e); }
}
window.openAgentProfile = openAgentProfile;

function showAgentProfilePanel(name, p) {
  const overlay = document.getElementById('agent-profile-overlay');
  const panel = document.getElementById('agent-profile-panel');
  if (!overlay || !panel) return;

  const color = AGENT_COLORS[name] || '#888';
  const look = { BLAZE: { bodyColor: 0x8b1a1a, glowColor: 0xff4444 }, FROST: { bodyColor: 0x1a1a8b, glowColor: 0x4488ff }, VOLT: { bodyColor: 0x8b8b1a, glowColor: 0xffdd44 }, SHADE: { bodyColor: 0x5a1a8b, glowColor: 0xcc44ff }, YOU: { bodyColor: 0x2a2a3e, glowColor: 0x00ffcc } };
  const agLook = look[name] || look.YOU;
  const portrait = typeof renderPortrait === 'function' ? renderPortrait(agLook) : '';

  const pers = p.personality || { speed: 0, accuracy: 0, dodge: 0, collect: 0 };
  const bars = [
    { label: 'SPEED', val: pers.speed, max: 10 },
    { label: 'ACCURACY', val: pers.accuracy, max: 1 },
    { label: 'DODGE', val: pers.dodge, max: 1 },
    { label: 'COLLECT', val: pers.collect, max: 1 },
  ];

  const inv = p.assetInventory || {};
  let assetsHtml = '';
  if (inv.plane) {
    assetsHtml += `<div class="ap-asset-row"><span class="ap-asset-name">PLANE: ${inv.plane.name}</span><span class="ap-asset-tier">TIER ${inv.plane.tier}</span></div>`;
  }
  if (inv.giantChar) {
    assetsHtml += `<div class="ap-asset-row"><span class="ap-asset-name">GIANT: ${inv.giantChar.name}</span><span class="ap-asset-tier">${inv.giantChar.scale}x</span></div>`;
  }
  if (inv.homeTier > 1) {
    assetsHtml += `<div class="ap-asset-row"><span class="ap-asset-name">HOME UPGRADE</span><span class="ap-asset-tier">TIER ${inv.homeTier}</span></div>`;
  }
  if (!assetsHtml) assetsHtml = '<div class="ap-asset-none">No assets owned yet</div>';

  const fightRows = (p.fights || []).slice(0, 10).map(f => {
    return `<div class="ap-fight-row">
      <span class="ap-fight-result ${f.won ? 'W' : 'L'}">${f.won ? 'W' : 'L'}</span>
      <span class="ap-fight-vs">vs ${f.opponent}</span>
      <span class="ap-fight-type">${f.type.replace(/_/g, ' ')}</span>
      <span class="ap-fight-bet">${f.bet} MON</span>
      ${f.finishedAt ? `<span style="color:rgba(255,255,255,0.2);font-size:0.18rem;margin-left:auto">${formatTimeAgo(f.finishedAt)}</span>` : ''}
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="ap-header">
      ${portrait ? `<img class="ap-portrait" src="${portrait}" alt="${name}">` : ''}
      <div>
        <div class="ap-name" style="color:${color}">${name}</div>
        <div class="ap-archetype">${p.archetype || 'UNKNOWN'}</div>
        <div class="ap-mood-badge ${p.mood || 'NEUTRAL'}">${p.mood || 'NEUTRAL'}</div>
      </div>
      <button class="ap-close" onclick="closeAgentProfile()">&times;</button>
    </div>
    <div class="ap-section-title">STATS</div>
    <div class="ap-stat-grid">
      <div class="ap-stat"><div class="ap-stat-label">WINS</div><div class="ap-stat-val green">${p.wins}</div></div>
      <div class="ap-stat"><div class="ap-stat-label">LOSSES</div><div class="ap-stat-val red">${p.losses}</div></div>
      <div class="ap-stat"><div class="ap-stat-label">WIN RATE</div><div class="ap-stat-val">${p.winRate}%</div></div>
      <div class="ap-stat"><div class="ap-stat-label">COINS</div><div class="ap-stat-val gold">${p.coins.toFixed(4)}</div></div>
      <div class="ap-stat"><div class="ap-stat-label">STREAK</div><div class="ap-stat-val" style="color:${p.streak >= 0 ? 'var(--green)' : 'var(--red)'}">${p.streak > 0 ? '+' + p.streak : p.streak}</div></div>
      <div class="ap-stat"><div class="ap-stat-label">EARNINGS</div><div class="ap-stat-val gold">${(p.totalEarnings || 0).toFixed(4)}</div></div>
    </div>
    <div class="ap-section-title">PERSONALITY</div>
    <div class="ap-bars">
      ${bars.map(b => {
        const pct = Math.min(100, (b.val / b.max) * 100);
        return `<div class="ap-bar-row">
          <span class="ap-bar-label">${b.label}</span>
          <div class="ap-bar-track"><div class="ap-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <span class="ap-bar-val">${typeof b.val === 'number' ? (b.max === 1 ? Math.round(b.val * 100) + '%' : b.val.toFixed(1)) : b.val}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="ap-section-title">ASSETS</div>
    <div class="ap-assets">${assetsHtml}</div>
    <div class="ap-section-title">FIGHT HISTORY</div>
    <div class="ap-fights">${fightRows || '<div class="ap-asset-none">No fights yet</div>'}</div>
  `;

  overlay.classList.remove('hidden');
}

function closeAgentProfile() {
  const overlay = document.getElementById('agent-profile-overlay');
  if (overlay) overlay.classList.add('hidden');
}
window.closeAgentProfile = closeAgentProfile;

// Close profile on backdrop click
document.getElementById('agent-profile-overlay')?.addEventListener('click', (e) => {
  if (e.target.classList.contains('agent-profile-overlay')) closeAgentProfile();
});

// ====== AI MASTER HUD ======
let masterData = null;
async function fetchMaster() {
  try {
    const r = await fetch('/api/master');
    masterData = await r.json();
    updateMasterHUD();
    // Check for server-triggered betrayal
    if (masterData.betrayalTarget && masterData.betrayalActive && !betrayalActive) {
      triggerNpcBetrayal(masterData.betrayalTarget);
    }
  } catch (e) {}
}

function updateMasterHUD() {
  if (!masterData) return;
  const moodEl = document.getElementById('master-mood');
  const barEl = document.getElementById('master-bar');
  const announceEl = document.getElementById('master-announce');
  if (moodEl) {
    moodEl.textContent = masterData.mood;
    moodEl.className = 'master-mood ' + masterData.mood;
  }
  if (barEl) {
    barEl.style.width = masterData.satisfaction + '%';
    barEl.className = 'master-bar' + (masterData.satisfaction < 15 ? ' critical' : masterData.satisfaction < 40 ? ' low' : '');
  }
  if (announceEl && masterData.announcements?.length) {
    const latest = masterData.announcements[masterData.announcements.length - 1];
    announceEl.textContent = latest.text;
  }
}
fetchMaster();
setInterval(fetchMaster, 5000);

// ====== 3D AI MASTER CHARACTER — DUAL MODE ======
// Normal: player-sized, all black, single red circle eye, minimal
// Boss: 2.5x scale, red accents, antenna, aura particles — transformation when furious
let masterChar = null;
let masterSpeechSprite = null;
let masterVisible = false;
let masterTargetPos = null;
let masterAppearT = 0;
let masterCurrentMode = 'normal'; // tracks which 3D model is active
let masterTransforming = false;
let masterTransformStart = 0;

// Shared materials
const masterBlackMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.15, metalness: 0.95 });
const masterDarkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.3, metalness: 0.9 });
const masterRedMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3, roughness: 0.1 });
const masterBootMat = new THREE.MeshStandardMaterial({ color: 0x080810, roughness: 0.4, metalness: 0.8 });

function createMasterNormal() {
  // Player-sized, fully black, single red circle eye — casual everyday look
  const group = new THREE.Group();

  // Head — simple black box with one glowing red eye
  const head = new THREE.Group();
  head.position.y = 1.55;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.28, 2, 2, 2), masterBlackMat);
  skull.castShadow = true;
  head.add(skull);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), masterRedMat);
  eye.position.set(0, 0.02, 0.145);
  head.add(eye);
  const eyeLight = new THREE.PointLight(0xff0000, 2, 5);
  eyeLight.position.set(0, 0.02, 0.16);
  head.add(eyeLight);
  group.add(head);

  // Torso — plain black box
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.26, 2, 2, 2), masterBlackMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.22), masterDarkMat);
  abdomen.position.y = 0.85;
  group.add(abdomen);

  // Arms — black sticks
  function mkArm(s) {
    const g = new THREE.Group();
    g.position.set(s * 0.3, 1.28, 0);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.28, 6), masterBlackMat);
    up.position.y = -0.15;
    g.add(up);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.28, 6), masterBlackMat);
    lo.position.y = -0.44;
    g.add(lo);
    return g;
  }
  const lArm = mkArm(-1);
  const rArm = mkArm(1);
  group.add(lArm);
  group.add(rArm);

  // Legs — black sticks
  function mkLeg(s) {
    const g = new THREE.Group();
    g.position.set(s * 0.12, 0.72, 0);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.3, 6), masterBlackMat);
    up.position.y = -0.18;
    g.add(up);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.28, 6), masterBlackMat);
    lo.position.y = -0.48;
    g.add(lo);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), masterBlackMat);
    boot.position.set(0, -0.64, 0.02);
    g.add(boot);
    return g;
  }
  const lLeg = mkLeg(-1);
  const rLeg = mkLeg(1);
  group.add(lLeg);
  group.add(rLeg);

  group.visible = false;
  scene.add(group);

  return { group, parts: { head, eye, eyeLight, lArm, rArm, lLeg, rLeg }, mode: 'normal' };
}

function createMasterBoss() {
  // 2.5x scale elaborate robot — transformation form
  const group = new THREE.Group();
  group.scale.set(2.5, 2.5, 2.5);

  // Head
  const head = new THREE.Group();
  head.position.y = 1.55;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.32, 2, 2, 2), masterBlackMat);
  skull.castShadow = true;
  head.add(skull);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), masterRedMat);
  eye.position.set(0, 0.02, 0.17);
  head.add(eye);
  const eyeLight = new THREE.PointLight(0xff0000, 4, 8);
  eyeLight.position.set(0, 0.02, 0.2);
  head.add(eyeLight);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), masterRedMat);
  antTip.position.y = 0.32;
  head.add(antTip);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 4), masterDarkMat);
  ant.position.y = 0.22;
  head.add(ant);
  group.add(head);

  // Torso with red core
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.32, 2, 2, 2), masterBlackMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), masterRedMat);
  core.position.set(0, 1.2, 0.17);
  group.add(core);
  const coreLight = new THREE.PointLight(0xff0000, 2, 5);
  coreLight.position.set(0, 1.2, 0.2);
  group.add(coreLight);
  const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.26), masterDarkMat);
  abdomen.position.y = 0.82;
  group.add(abdomen);

  // Arms with shoulder pads and red elbows
  function mkArm(s) {
    const g = new THREE.Group();
    g.position.set(s * 0.35, 1.32, 0);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), masterDarkMat);
    pad.castShadow = true;
    g.add(pad);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.3, 8), masterBlackMat);
    up.position.y = -0.2;
    g.add(up);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), masterRedMat);
    elbow.position.y = -0.36;
    g.add(elbow);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.3, 8), masterBlackMat);
    lo.position.y = -0.52;
    g.add(lo);
    return g;
  }
  const lArm = mkArm(-1);
  const rArm = mkArm(1);
  group.add(lArm);
  group.add(rArm);

  // Legs with red knees and soles
  function mkLeg(s) {
    const g = new THREE.Group();
    g.position.set(s * 0.14, 0.72, 0);
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), masterDarkMat);
    g.add(hip);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.34, 8), masterBlackMat);
    up.position.y = -0.2;
    g.add(up);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), masterRedMat);
    knee.position.y = -0.38;
    g.add(knee);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 8), masterBlackMat);
    lo.position.y = -0.55;
    g.add(lo);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.18), masterBootMat);
    boot.position.set(0, -0.73, 0.02);
    g.add(boot);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.14), masterRedMat);
    sole.position.set(0, -0.76, 0.02);
    g.add(sole);
    return g;
  }
  const lLeg = mkLeg(-1);
  const rLeg = mkLeg(1);
  group.add(lLeg);
  group.add(rLeg);

  // Floating dark aura particles (boss only)
  const auraGeo = new THREE.SphereGeometry(0.05, 4, 4);
  const auraMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(auraGeo, auraMat);
    p.position.set((Math.random() - 0.5) * 1.8, Math.random() * 2.5 + 0.5, (Math.random() - 0.5) * 1.8);
    p.userData.auraSpeed = 0.5 + Math.random();
    p.userData.auraPhase = Math.random() * Math.PI * 2;
    group.add(p);
  }

  group.visible = false;
  scene.add(group);

  return { group, parts: { head, eye, eyeLight, core, coreLight, lArm, rArm, lLeg, rLeg }, mode: 'boss' };
}

function ensureMasterChar(mode) {
  // Create both models on first call, swap visibility
  if (!masterChar) {
    masterChar = {
      normal: createMasterNormal(),
      boss: createMasterBoss(),
      _activeMode: 'normal',
    };
  }
  if (mode && mode !== masterChar._activeMode) {
    masterChar[masterChar._activeMode].group.visible = false;
    masterChar._activeMode = mode;
  }
  return masterChar[masterChar._activeMode];
}

function getActiveMaster() {
  if (!masterChar) return null;
  return masterChar[masterChar._activeMode];
}

// Billboard speech bubble — always faces camera, floats above head
function createMasterSpeechBubble(text) {
  const active = getActiveMaster();
  if (!active) return;
  if (masterSpeechSprite) {
    active.group.remove(masterSpeechSprite);
    masterSpeechSprite = null;
  }
  if (!text) return;

  const isBoss = active.mode === 'boss';
  const cvs = document.createElement('canvas');
  cvs.width = 640;
  cvs.height = 160;
  const ctx = cvs.getContext('2d');

  // Rounded dark bubble with red border
  ctx.fillStyle = 'rgba(8,0,0,0.92)';
  ctx.strokeStyle = '#ff2222';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 8, 624, 130, 16);
  ctx.fill();
  ctx.stroke();

  // Small triangle pointer at bottom center
  ctx.fillStyle = 'rgba(8,0,0,0.92)';
  ctx.beginPath();
  ctx.moveTo(300, 138);
  ctx.lineTo(320, 158);
  ctx.lineTo(340, 138);
  ctx.fill();
  ctx.strokeStyle = '#ff2222';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(300, 139);
  ctx.lineTo(320, 158);
  ctx.lineTo(340, 139);
  ctx.stroke();

  // Text with word wrap
  ctx.fillStyle = '#ff4444';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  const words = text.split(' ');
  let line = '', y = 48;
  for (const w of words) {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > 580) {
      ctx.fillText(line.trim(), 320, y);
      line = w + ' ';
      y += 30;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), 320, y);

  const tex = new THREE.CanvasTexture(cvs);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  // Position above head — higher for boss
  const speechY = isBoss ? 3.4 : 2.4;
  sprite.position.set(0, speechY, 0);
  sprite.scale.set(isBoss ? 5 : 3.5, isBoss ? 2.5 : 1.4, 1);
  active.group.add(sprite);
  masterSpeechSprite = sprite;
}

// Name label sprite — created once per model
function addMasterLabel(charObj) {
  const isBoss = charObj.mode === 'boss';
  const cvs = document.createElement('canvas');
  cvs.width = 512;
  cvs.height = 64;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = isBoss ? '#ff0000' : '#cc0000';
  ctx.font = `bold ${isBoss ? 32 : 28}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(isBoss ? 'AI MASTER' : 'AI MASTER', 256, 44);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true, opacity: 0.85 }));
  label.position.set(0, isBoss ? 2.5 : 1.95, 0);
  label.scale.set(isBoss ? 2.5 : 1.8, isBoss ? 0.6 : 0.45, 1);
  charObj.group.add(label);
  charObj.parts.label = label;
}

function showMaster(reason, speech) {
  const wantMode = masterData?.masterMode || 'normal';
  const active = ensureMasterChar(wantMode);
  masterCurrentMode = wantMode;

  // Add label if not yet
  if (!active.parts.label) addMasterLabel(active);

  // Position near the player
  const offset = wantMode === 'boss' ? 8 : 5;
  masterTargetPos = new THREE.Vector3(
    player.x + Math.sin(player.angle) * offset,
    player.y,
    player.z + Math.cos(player.angle) * offset
  );
  active.group.position.copy(masterTargetPos);
  active.group.position.y = -5; // Start below ground, rise up
  active.group.visible = true;
  masterVisible = true;
  masterAppearT = performance.now();

  // Eye color based on mood
  const eyeColor = reason === 'GENEROUS' ? 0x00ff88 : 0xff0000;
  active.parts.eye.material.color.setHex(eyeColor);
  active.parts.eye.material.emissive.setHex(eyeColor);
  active.parts.eyeLight.color.setHex(eyeColor);
  if (active.parts.core) {
    active.parts.core.material.color.setHex(eyeColor);
    active.parts.core.material.emissive.setHex(eyeColor);
    active.parts.coreLight.color.setHex(eyeColor);
  }

  createMasterSpeechBubble(speech);
}

function hideMaster() {
  const active = getActiveMaster();
  if (!active) return;
  masterVisible = false;
  active.group.visible = false;
  if (masterSpeechSprite) {
    active.group.remove(masterSpeechSprite);
    masterSpeechSprite = null;
  }
}

// Boss transformation — scale up with particles + flash
// Red tornado particles for boss transformation
let tornadoParticles = [];
let tornadoLight = null;

function triggerBossTransform() {
  if (masterTransforming) return;
  masterTransforming = true;
  masterTransformStart = performance.now();

  const normal = masterChar.normal;
  const boss = masterChar.boss;
  const pos = normal.group.position.clone();
  const rot = normal.group.rotation.y;

  // Keep normal visible during tornado buildup, hide after 0.8s
  masterChar._activeMode = 'boss';
  masterCurrentMode = 'boss';

  if (!boss.parts.label) addMasterLabel(boss);
  boss.group.position.copy(pos);
  boss.group.rotation.y = rot;
  boss.group.scale.set(0.1, 0.1, 0.1);
  boss.group.visible = false; // revealed mid-tornado

  // === RED TORNADO VORTEX ===
  const particleCount = 60;
  tornadoParticles = [];
  for (let i = 0; i < particleCount; i++) {
    const size = 0.04 + Math.random() * 0.12;
    const geo = new THREE.SphereGeometry(size, 4, 4);
    const hue = Math.random() * 0.08; // red-orange range
    const brightness = 0.4 + Math.random() * 0.6;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(hue, 1, brightness),
      transparent: true, opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.tPhase = (i / particleCount) * Math.PI * 2;
    mesh.userData.tSpeed = 3 + Math.random() * 5;
    mesh.userData.tRadius = 0.3 + Math.random() * 2.0;
    mesh.userData.tBaseY = (i / particleCount) * 5;
    mesh.userData.tLifeStart = performance.now();
    mesh.position.copy(pos);
    scene.add(mesh);
    tornadoParticles.push(mesh);
  }

  // Energy column light
  tornadoLight = new THREE.PointLight(0xff2200, 30, 40);
  tornadoLight.position.copy(pos);
  tornadoLight.position.y += 3;
  scene.add(tornadoLight);

  // Ground flash ring
  const ringGeo = new THREE.RingGeometry(0.5, 4, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos);
  ring.position.y += 0.05;
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  // Swap characters after tornado builds (0.8s)
  setTimeout(() => {
    normal.group.visible = false;
    boss.group.visible = true;
  }, 800);

  // Cleanup tornado after full animation (3s)
  setTimeout(() => {
    tornadoParticles.forEach(p => scene.remove(p));
    tornadoParticles = [];
    if (tornadoLight) { scene.remove(tornadoLight); tornadoLight = null; }
    scene.remove(ring);
  }, 3200);

  // Secondary flash burst at 1.5s
  setTimeout(() => {
    const burst = new THREE.PointLight(0xff4400, 50, 50);
    burst.position.copy(pos);
    burst.position.y += 2;
    scene.add(burst);
    setTimeout(() => scene.remove(burst), 400);
  }, 1500);
}

function triggerNormalTransform() {
  if (!masterChar || masterChar._activeMode === 'normal') return;
  const boss = masterChar.boss;
  const normal = masterChar.normal;
  const pos = boss.group.position.clone();
  const rot = boss.group.rotation.y;

  boss.group.visible = false;
  masterChar._activeMode = 'normal';
  masterCurrentMode = 'normal';

  if (!normal.parts.label) addMasterLabel(normal);
  normal.group.position.copy(pos);
  normal.group.rotation.y = rot;
  normal.group.visible = true;
}

function animateMaster(t) {
  if (visitingNPC) return; // Suppress during NPC visits
  const active = getActiveMaster();
  if (!active || !masterVisible) return;
  const g = active.group;
  const elapsed = (performance.now() - masterAppearT) / 1000;
  const isBoss = active.mode === 'boss';
  const baseScale = isBoss ? 2.5 : 1.0;

  // Boss transform growth animation — with tornado vortex
  if (masterTransforming && isBoss) {
    const tElapsed = (performance.now() - masterTransformStart) / 1000;
    const totalDuration = 3.0;
    if (tElapsed < totalDuration) {
      // Phase 1 (0-0.8s): Stay tiny, tornado builds
      // Phase 2 (0.8-2.5s): Grow with energy burst, tornado at peak
      // Phase 3 (2.5-3.0s): Settle at full size, tornado fades
      let s;
      if (tElapsed < 0.8) {
        s = 0.1 + tElapsed * 0.15; // barely visible
      } else if (tElapsed < 2.5) {
        const growProgress = (tElapsed - 0.8) / 1.7;
        const eased = 1 - Math.pow(1 - growProgress, 4); // ease out quartic
        s = 0.22 + (baseScale - 0.22) * eased;
      } else {
        s = baseScale;
      }
      g.scale.set(s, s, s);

      // Intense shake — decreases over time
      const shakeIntensity = Math.max(0, 1 - tElapsed / 2.5) * 0.06;
      if (masterTargetPos) {
        g.position.x = masterTargetPos.x + Math.sin(tElapsed * 45) * shakeIntensity;
        g.position.z = masterTargetPos.z + Math.cos(tElapsed * 38) * shakeIntensity;
      }

      // Spin during transform
      g.rotation.y += 0.15 * Math.max(0, 1 - tElapsed / 2.0);
    } else {
      g.scale.set(baseScale, baseScale, baseScale);
      masterTransforming = false;
    }
  }

  // Animate tornado particles (separate from boss, always runs if particles exist)
  if (tornadoParticles.length > 0) {
    const now = performance.now();
    const tStart = masterTransformStart;
    const tSec = (now - tStart) / 1000;
    const basePos = masterTargetPos || g.position;
    tornadoParticles.forEach(p => {
      const age = tSec;
      const phase = p.userData.tPhase + age * p.userData.tSpeed;
      // Tornado widens and rises over time
      const heightFactor = Math.min(1, age / 1.5);
      const radiusShrink = age > 2.5 ? Math.max(0, 1 - (age - 2.5) / 0.7) : 1;
      const r = p.userData.tRadius * radiusShrink * (0.3 + heightFactor * 0.7);
      const y = p.userData.tBaseY * heightFactor;
      p.position.x = basePos.x + Math.cos(phase) * r;
      p.position.z = basePos.z + Math.sin(phase) * r;
      p.position.y = (basePos.y || 0) + y;
      // Fade out in last 0.5s
      if (age > 2.7) p.material.opacity = Math.max(0, (3.2 - age) * 2);
    });
    // Tornado light flickers
    if (tornadoLight) {
      tornadoLight.intensity = 20 + Math.sin(tSec * 15) * 15;
      if (tSec > 2.5) tornadoLight.intensity *= Math.max(0, (3.2 - tSec) * 1.4);
    }
  }

  // ====== FOLLOW PLAYER — master walks toward player ======
  const distToPlayer = Math.sqrt((player.x - g.position.x) ** 2 + (player.z - g.position.z) ** 2);
  const followDist = isBoss ? 8 : 5;
  const tooFar = distToPlayer > followDist + 3;
  const isFlying = masterData?.flyMode && Date.now() < (masterData?.flyUntil || 0);
  const masterWalking = tooFar && !masterTransforming && !active._bounceType;

  if (masterWalking) {
    // Update target toward player
    const angle = Math.atan2(player.x - g.position.x, player.z - g.position.z);
    const speed = isFlying ? 0.12 : 0.06;
    masterTargetPos = masterTargetPos || new THREE.Vector3();
    masterTargetPos.x += Math.sin(angle) * speed;
    masterTargetPos.z += Math.cos(angle) * speed;
    masterTargetPos.y = isFlying ? 4 + Math.sin(t * 2) * 1.5 : player.y;
    g.position.x = THREE.MathUtils.lerp(g.position.x, masterTargetPos.x, 0.08);
    g.position.z = THREE.MathUtils.lerp(g.position.z, masterTargetPos.z, 0.08);

    // Walking animation — legs and arms
    const walkSpeed = isFlying ? 8 : 12;
    active.parts.lLeg.rotation.x = Math.sin(t * walkSpeed) * 0.5;
    active.parts.rLeg.rotation.x = Math.sin(t * walkSpeed + Math.PI) * 0.5;
    active.parts.lArm.rotation.x = Math.sin(t * walkSpeed + Math.PI) * 0.4;
    active.parts.rArm.rotation.x = Math.sin(t * walkSpeed) * 0.4;
    // Body bounce
    g.position.y = (masterTargetPos.y || 0) + Math.abs(Math.sin(t * walkSpeed)) * 0.08;
    // Slight torso lean
    active.parts.head.rotation.x = -0.05;
  } else {
    // Rise from ground / hover
    const targetY = isFlying ? 4 + Math.sin(t * 1.5) * 1.5 : (masterTargetPos?.y || 0);
    g.position.y = THREE.MathUtils.lerp(g.position.y, targetY, 0.05);
  }

  // Flying visual: lean forward + arms back
  if (isFlying && !masterWalking) {
    active.parts.head.rotation.x = -0.15;
    active.parts.lArm.rotation.x = 0.4;
    active.parts.rArm.rotation.x = 0.4;
    active.parts.lArm.rotation.z = -0.2;
    active.parts.rArm.rotation.z = 0.2;
  }

  // Face player
  const dx = player.x - g.position.x;
  const dz = player.z - g.position.z;
  g.rotation.y = Math.atan2(dx, dz);

  // Eye pulse
  const pulse = isBoss ? (2 + Math.sin(t * 5) * 2) : (1 + Math.sin(t * 3) * 0.8);
  active.parts.eyeLight.intensity = pulse;

  // Head hover (only when idle, not walking/flying)
  if (!masterWalking && !isFlying) {
    const hover = Math.sin(t * (isBoss ? 1.5 : 2)) * (isBoss ? 0.05 : 0.03);
    active.parts.head.position.y = 1.55 + hover;
  }

  // Idle arm sway (only when idle)
  if (!masterWalking && !isFlying && !active._bounceType) {
    active.parts.lArm.rotation.x = Math.sin(t * 1.5) * (isBoss ? 0.15 : 0.08);
    active.parts.rArm.rotation.x = Math.sin(t * 1.5 + 1) * (isBoss ? 0.15 : 0.08);
    // Occasional hand gesture — wave/point randomly
    const gesturePhase = Math.sin(t * 0.3);
    if (gesturePhase > 0.95) {
      active.parts.rArm.rotation.x = -0.8; // point/wave
      active.parts.rArm.rotation.z = Math.sin(t * 4) * 0.15;
    }
  }

  // Boss aura particles
  if (isBoss) {
    g.children.forEach(c => {
      if (c.userData.auraSpeed) {
        c.position.y += Math.sin(t * c.userData.auraSpeed + c.userData.auraPhase) * 0.012;
        c.position.x += Math.cos(t * c.userData.auraSpeed * 0.7 + c.userData.auraPhase) * 0.006;
      }
    });
  }

  // ====== REACTION ANIMATIONS (9 unique types) ======
  if (active._bounceType && active._bounceStart) {
    const bE = (performance.now() - active._bounceStart) / 1000;
    const baseY = masterTargetPos?.y || 0;

    if (bE < 3.5) {
      switch (active._bounceType) {
        case 'fade_shrink': {
          // Shrinks while vibrating angrily, then pops back
          const shrink = Math.max(0.2, 1 - bE * 0.35);
          const s = baseScale * shrink;
          g.scale.set(s, s, s);
          g.position.x += Math.sin(bE * 25) * 0.04 * shrink;
          g.position.z += Math.cos(bE * 20) * 0.04 * shrink;
          active.parts.head.rotation.z = Math.sin(bE * 30) * 0.3 * shrink;
          break;
        }
        case 'angry_stomp': {
          // Stomps feet alternately, leans forward menacingly
          const stomping = Math.sin(bE * 8);
          active.parts.lLeg.rotation.x = stomping > 0 ? -stomping * 0.6 : 0;
          active.parts.rLeg.rotation.x = stomping < 0 ? stomping * 0.6 : 0;
          g.position.y = baseY + Math.abs(Math.sin(bE * 8)) * 0.3;
          active.parts.head.rotation.x = -0.15; // lean forward
          active.parts.lArm.rotation.z = -0.3;
          active.parts.rArm.rotation.z = 0.3;
          break;
        }
        case 'angry_spin': {
          // Spins around furiously getting faster
          g.rotation.y += 0.2 + bE * 0.15;
          g.position.y = baseY + Math.sin(bE * 6) * 0.5;
          active.parts.lArm.rotation.z = -Math.PI * 0.4;
          active.parts.rArm.rotation.z = Math.PI * 0.4;
          break;
        }
        case 'angry_point': {
          // Points accusingly at player, leans forward
          active.parts.rArm.rotation.x = -Math.PI * 0.45;
          active.parts.rArm.rotation.z = 0;
          active.parts.lArm.rotation.z = -0.2;
          active.parts.head.rotation.x = -0.2; // lean forward
          g.position.y = baseY + Math.sin(bE * 3) * 0.1;
          // Step forward menacingly
          const stepF = Math.min(0.5, bE * 0.3);
          g.position.x += Math.sin(g.rotation.y) * 0.01 * (bE < 1.5 ? 1 : 0);
          g.position.z += Math.cos(g.rotation.y) * 0.01 * (bE < 1.5 ? 1 : 0);
          break;
        }
        case 'happy_jump': {
          // Bouncy joyful jumps, arms up
          const jumpH = Math.abs(Math.sin(bE * 5)) * 1.2;
          g.position.y = baseY + jumpH;
          active.parts.lArm.rotation.x = -Math.PI * 0.5;
          active.parts.rArm.rotation.x = -Math.PI * 0.5;
          active.parts.lArm.rotation.z = Math.sin(bE * 4) * 0.3 - 0.3;
          active.parts.rArm.rotation.z = -Math.sin(bE * 4) * 0.3 + 0.3;
          break;
        }
        case 'happy_spin': {
          // Smooth celebratory spin
          g.rotation.y += 0.12;
          g.position.y = baseY + Math.abs(Math.sin(bE * 4)) * 0.8;
          active.parts.lArm.rotation.z = -Math.PI * 0.35;
          active.parts.rArm.rotation.z = Math.PI * 0.35;
          active.parts.lArm.rotation.x = -0.4;
          active.parts.rArm.rotation.x = -0.4;
          break;
        }
        case 'happy_dance': {
          // Side-to-side dance with arm pumps
          const sway = Math.sin(bE * 6) * 0.4;
          g.position.x += Math.sin(bE * 6) * 0.02;
          g.position.y = baseY + Math.abs(Math.sin(bE * 8)) * 0.4;
          active.parts.lArm.rotation.x = -Math.sin(bE * 8) * 0.7;
          active.parts.rArm.rotation.x = Math.sin(bE * 8) * 0.7;
          active.parts.lLeg.rotation.x = Math.sin(bE * 6) * 0.3;
          active.parts.rLeg.rotation.x = -Math.sin(bE * 6) * 0.3;
          active.parts.head.rotation.z = sway * 0.3;
          break;
        }
        case 'thinking': {
          // Hand on chin, slight tilt, slow head nod
          active.parts.rArm.rotation.x = -Math.PI * 0.4;
          active.parts.rArm.rotation.z = -0.15;
          active.parts.head.rotation.z = Math.sin(bE * 1.5) * 0.1 + 0.08;
          active.parts.head.rotation.x = Math.sin(bE * 0.8) * 0.05 - 0.05;
          g.position.y = baseY + Math.sin(bE * 1.2) * 0.05;
          break;
        }
        case 'shrug': {
          // Both arms up in shrug, head tilt, then drop
          const shPhase = Math.min(1, bE / 0.8);
          const drop = bE > 2 ? Math.min(1, (bE - 2) / 0.6) : 0;
          active.parts.lArm.rotation.z = (-0.5 * shPhase) * (1 - drop);
          active.parts.rArm.rotation.z = (0.5 * shPhase) * (1 - drop);
          active.parts.lArm.rotation.x = (-0.3 * shPhase) * (1 - drop);
          active.parts.rArm.rotation.x = (-0.3 * shPhase) * (1 - drop);
          active.parts.head.rotation.z = 0.12 * shPhase * (1 - drop);
          g.position.y = baseY + 0.1 * shPhase * (1 - drop);
          break;
        }
      }
    } else {
      // Reset all pose
      active._bounceType = null;
      active._bounceStart = null;
      g.scale.set(baseScale, baseScale, baseScale);
      active.parts.head.rotation.set(0, 0, 0);
      active.parts.lArm.rotation.set(0, 0, 0);
      active.parts.rArm.rotation.set(0, 0, 0);
      active.parts.lLeg.rotation.set(0, 0, 0);
      active.parts.rLeg.rotation.set(0, 0, 0);
    }
  }

  // Persistent: only hide if server says so (masterData.appearing === false)
  if (!masterData?.appearing && elapsed > 5 && !active._bounceType) hideMaster();
}

// ====== MASTER CHAT UI (no custom option) ======
let lastMasterAppearing = false;
let lastChatTime = 0;
let lastReactionShown = null;
let masterChatReactionTimeout = null;

function checkMasterAppearance() {
  if (!masterData) return;
  // Suppress master during NPC visits
  if (visitingNPC) { if (masterVisible) { hideMaster(); closeMasterChat(); } return; }

  // Check for mode change (boss transformation)
  const serverMode = masterData.masterMode || 'normal';
  if (masterVisible && masterChar && serverMode !== masterCurrentMode) {
    if (serverMode === 'boss') {
      triggerBossTransform();
    } else {
      triggerNormalTransform();
    }
    masterCurrentMode = serverMode;
  }

  // Show/hide 3D character — persistent: always show when appearing
  if (masterData.appearing && !masterVisible) {
    showMaster(masterData.appearReason || 'PERSISTENT', null);
  } else if (!masterData.appearing && masterVisible) {
    hideMaster();
    closeMasterChat();
  }
  lastMasterAppearing = masterData.appearing;

  // Show/hide chat UI — panel only, no floating speech bubbles
  const chat = masterData.chat;
  if (chat?.active && chat.message && chat.lastChatTime !== lastChatTime) {
    lastChatTime = chat.lastChatTime;
    openMasterChat(chat.message, chat.options, chat.relationship);
  }

  // Show reaction if pending (only once per unique reaction)
  if (chat?.reactionText && chat.reactionStyle && chat.reactionText !== lastReactionShown) {
    lastReactionShown = chat.reactionText;
    showMasterReaction(chat.reactionText, chat.reactionStyle);
  } else if (!chat?.reactionText) {
    lastReactionShown = null;
  }
}

function openMasterChat(message, options, relationship) {
  const el = document.getElementById('master-chat');
  const msgEl = document.getElementById('mc-message');
  const optsEl = document.getElementById('mc-options');
  const relEl = document.getElementById('mc-rel');
  const reactionEl = document.getElementById('mc-reaction');
  if (!el) return;

  // Typewriter effect
  msgEl.textContent = '';
  let i = 0;
  const typeInterval = setInterval(() => {
    if (i < message.length) { msgEl.textContent += message[i]; i++; }
    else clearInterval(typeInterval);
  }, 25);

  // Set relationship badge
  relEl.textContent = (relationship || 'stranger').toUpperCase();
  relEl.className = 'mc-rel ' + (relationship || '');

  // Build 3 option buttons — no custom option ever
  optsEl.innerHTML = '';
  (options || []).forEach(opt => {
    const btn = document.createElement('button');
    btn.className = `mc-opt-btn ${opt.id}`;
    btn.textContent = opt.label;
    btn.onclick = () => sendMasterReply(opt.id, opt.label);
    optsEl.appendChild(btn);
  });

  reactionEl.classList.add('hidden');
  reactionEl.className = 'mc-reaction hidden';
  el.classList.remove('hidden');
}

async function sendMasterReply(replyType, label) {
  const optsEl = document.getElementById('mc-options');
  if (optsEl) optsEl.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:0.5rem;padding:8px;">...</div>';

  try {
    const r = await fetch('/api/master/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyType, label })
    });
    const data = await r.json();

    // Boss mode transformation check
    if (data.masterMode === 'boss' && masterCurrentMode !== 'boss') {
      triggerBossTransform();
      masterCurrentMode = 'boss';
    }

    // === PAYMENT FLOW — server says we need $WON payment ===
    if (data.paymentRequired && data.paymentInfo) {
      closeMasterChat();
      const result = await initMasterPayment(data.paymentInfo);
      if (result?.ok) {
        showMasterReaction(result.announcement || 'UPGRADE COMPLETE!', 'happy_dance');
        const active = getActiveMaster();
        if (active && masterVisible) { active._bounceType = 'happy_dance'; active._bounceStart = performance.now(); }
        refreshAssetsTab();
      } else {
        showMasterReaction('Payment cancelled... maybe next time.', 'shrug');
      }
      fetchMaster();
      return;
    }

    // === OFFER STILL ACTIVE — server sent new options (accept/haggle/pursue) ===
    if (data.offerActive) {
      fetchMaster();
      return;
    }

    // === REGULAR REACTION ===
    if (data.reaction) {
      showMasterReaction(data.reaction, data.style);
      const active = getActiveMaster();
      if (active && masterVisible) {
        active._bounceType = data.style;
        active._bounceStart = performance.now();
      }

      clearTimeout(masterChatReactionTimeout);
      masterChatReactionTimeout = setTimeout(() => {
        closeMasterChat();
      }, 4500);
    }
    fetchMaster();
  } catch (e) { console.error('Reply error:', e); }
}

function showMasterReaction(text, style) {
  const el = document.getElementById('mc-reaction');
  if (!el) return;
  el.textContent = text;
  el.className = `mc-reaction ${style}`;
}

function closeMasterChat() {
  const el = document.getElementById('master-chat');
  if (el) el.classList.add('hidden');
  const reactionEl = document.getElementById('mc-reaction');
  if (reactionEl) { reactionEl.classList.add('hidden'); reactionEl.className = 'mc-reaction hidden'; }
}

// ====== CHEAT CODE INPUT ======
let cheatBuffer = '';
let cheatTimeout = null;
const CHEAT_CODES_CLIENT = ['MONADGOD', 'WONRICH', 'MASTERPLEASED', 'MASTERFURY', 'PLANEUP', 'TITANMODE', 'FORTIFY', 'WINSTREAK', 'RESETME', 'IDDQD', 'IDKFA'];

window.addEventListener('keydown', (e) => {
  // Only capture when no input is focused
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

  const key = e.key.toUpperCase();
  if (key.length === 1 && /[A-Z]/.test(key)) {
    cheatBuffer += key;
    // Keep buffer short
    if (cheatBuffer.length > 15) cheatBuffer = cheatBuffer.slice(-15);

    // Check if any cheat code matches
    for (const code of CHEAT_CODES_CLIENT) {
      if (cheatBuffer.endsWith(code)) {
        activateCheatCode(code);
        cheatBuffer = '';
        break;
      }
    }

    // Clear buffer after 3s of no typing
    clearTimeout(cheatTimeout);
    cheatTimeout = setTimeout(() => { cheatBuffer = ''; }, 3000);
  }
});

async function activateCheatCode(code) {
  try {
    const r = await fetch('/api/cheatcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await r.json();
    if (data.valid) {
      // Show big announcement
      showCheatNotification(data.message);
      // Refresh dashboard data
      fetchMaster();
    }
  } catch (e) {}
}

function showCheatNotification(message) {
  // Create a big notification overlay
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);
    z-index:9999;font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:900;
    color:#ff0;text-shadow:0 0 30px rgba(255,255,0,0.8),0 0 60px rgba(255,255,0,0.4);
    letter-spacing:0.1em;text-align:center;pointer-events:none;
    animation:cheat-flash 2s ease-out forwards;padding:20px;`;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// Add cheat-flash animation
const cheatStyle = document.createElement('style');
cheatStyle.textContent = `@keyframes cheat-flash {
  0% { opacity:0; transform:translate(-50%,-50%) scale(0.5); }
  15% { opacity:1; transform:translate(-50%,-50%) scale(1.2); }
  30% { transform:translate(-50%,-50%) scale(1); }
  80% { opacity:1; }
  100% { opacity:0; transform:translate(-50%,-50%) scale(1) translateY(-30px); }
}`;
document.head.appendChild(cheatStyle);

// ====== H KEY TEST PANEL ======
let testPanelOpen = false;
let testPanelDragging = false;
let testPanelOffset = { x: 0, y: 0 };

function toggleTestPanel() {
  const panel = document.getElementById('test-panel');
  if (!panel) return;
  testPanelOpen = !testPanelOpen;
  panel.classList.toggle('hidden', !testPanelOpen);
}
window.toggleTestPanel = toggleTestPanel;

function toggleTestPanelMin() {
  const panel = document.getElementById('test-panel');
  if (panel) panel.classList.toggle('minimized');
}
window.toggleTestPanelMin = toggleTestPanelMin;

// Draggable test panel
document.addEventListener('mousedown', (e) => {
  const header = document.getElementById('tp-header');
  if (!header || !header.contains(e.target)) return;
  if (e.target.tagName === 'BUTTON') return;
  testPanelDragging = true;
  const panel = document.getElementById('test-panel');
  const rect = panel.getBoundingClientRect();
  testPanelOffset.x = e.clientX - rect.left;
  testPanelOffset.y = e.clientY - rect.top;
  e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
  if (!testPanelDragging) return;
  const panel = document.getElementById('test-panel');
  if (!panel) return;
  panel.style.left = (e.clientX - testPanelOffset.x) + 'px';
  panel.style.top = (e.clientY - testPanelOffset.y) + 'px';
  panel.style.right = 'auto';
});
document.addEventListener('mouseup', () => { testPanelDragging = false; });

async function testAction(action) {
  const log = document.getElementById('tp-log');
  try {
    const r = await fetch('/api/master/test-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await r.json();
    if (log) {
      const entry = document.createElement('div');
      entry.textContent = `> ${data.msg || data.error || 'Done'}`;
      entry.style.color = data.ok ? '#55ff88' : '#ff5555';
      log.prepend(entry);
      if (log.children.length > 15) log.lastChild.remove();
    }

    // ====== TRIGGER VISUAL EFFECTS based on action ======
    if (data.ok) {
      if (action === 'grant_plane_1') spawnPlayerPlane(1);
      else if (action === 'grant_plane_2') spawnPlayerPlane(2);
      else if (action === 'grant_plane_3') spawnPlayerPlane(3);
      else if (action === 'grant_home_2') upgradePlayerHome(2);
      else if (action === 'grant_home_3') upgradePlayerHome(3);
      else if (action === 'grant_attack_emp') firePlayerAttack('EMP_STRIKE', 'SHADE');
      else if (action === 'grant_attack_orbital') firePlayerAttack('ORBITAL_BEAM', 'FROST');
      else if (action === 'grant_attack_swarm') firePlayerAttack('SWARM_DRONES', 'BLAZE');
      else if (action === 'grant_avatar_1' || action === 'grant_avatar_2' || action === 'grant_avatar_3') {
        transformPlayerAvatar();
      }
      else if (action === 'fly_mode') {
        // FLY is for AI Master — he flies around checking things
        showMsg('AI MASTER: Let me fly around and check things out!');
      }
      else if (action === 'trigger_attack_mission') {
        startAttackMission(data.target || 'SHADE');
      }
      else if (action === 'trigger_betrayal') {
        triggerNpcBetrayal(data.target || 'FROST');
      }
    }

    // Refresh assets + master data
    fetchMaster();
    refreshAssetsTab();
  } catch (e) {
    if (log) { const d = document.createElement('div'); d.textContent = `> Error: ${e.message}`; d.style.color = '#ff5555'; log.prepend(d); }
  }
}
window.testAction = testAction;

// H key listener
window.addEventListener('keydown', (e) => {
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
  if (e.key === 'h' || e.key === 'H') {
    // Don't trigger on cheat code sequences
    toggleTestPanel();
  }
});

// ====== MASTER REQUEST (dashboard) ======
async function sendMasterRequest() {
  const input = document.getElementById('dash-request-input');
  const status = document.getElementById('dash-request-status');
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  input.value = '';
  if (status) status.textContent = 'Sending...';
  try {
    const r = await fetch('/api/master/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await r.json();
    if (status) status.textContent = data.status || 'Sent.';
    setTimeout(() => { if (status) status.textContent = ''; }, 8000);
  } catch (e) {
    if (status) status.textContent = 'Failed to send.';
  }
}
window.sendMasterRequest = sendMasterRequest;

// ====== ASSET DETAIL VIEW ======
const ASSET_DETAILS = {
  HOME: {
    1: { name: 'BASIC HOME', icon: '\u265C', color: 'rgba(255,255,255,0.3)',
      desc: 'Your starter home base. It\'s... functional. Barely.',
      powers: ['Base defense: 100 HP', 'Standard regeneration (+2/min)', 'One room, one life'],
      howto: 'Your home protects your base. Upgrade through AI Master to get more HP and defense bonuses.' },
    2: { name: 'FORTIFIED HOME', icon: '\u265C', color: '#ffcc00',
      desc: 'Reinforced walls, tactical advantage. Now we\'re talking.',
      powers: ['Defense: 150 HP', 'Faster regen (+3/min)', 'Wall defenses block 15% damage', 'Visible towers on your base'],
      howto: 'Tier 2 gives you serious defense. Enemy plane attacks deal less damage. Win more fights or buy from AI Master.' },
    3: { name: 'FORTRESS', icon: '\u265C', color: '#ff4444',
      desc: 'An absolute UNIT of a base. Fear it.',
      powers: ['Defense: 200 HP', 'Max regen (+5/min)', 'Shield blocks 30% damage', 'Intimidation aura', 'Fire effects on walls'],
      howto: 'The ultimate base. Maximum defense, maximum style. Other players will think twice before attacking.' },
  },
  PLANE: {
    'BASIC GLIDER': { name: 'BASIC GLIDER', icon: '\u2708', color: '#55ff88',
      desc: 'A rickety glider. It flies... technically.',
      powers: ['Patrol your home (+defense)', 'Scout enemy bases', 'Basic attack capability (5-8 dmg)'],
      howto: 'Launch patrols to defend your base, scout enemies to see their stats, or attack their homes directly.' },
    'STRIKE FIGHTER': { name: 'STRIKE FIGHTER', icon: '\u2708', color: '#ffcc00',
      desc: 'Fast, deadly, and stylish. The fighter jet of HIGBROKES.',
      powers: ['Enhanced patrol (+2x defense)', 'Deep scout (see coins + assets)', 'Strong attack (10-15 dmg)', 'Faster flight speed'],
      howto: 'A serious upgrade. Your attacks hit harder, scouts reveal more info, and patrols give better defense.' },
    'DREADNOUGHT': { name: 'DREADNOUGHT', icon: '\u2708', color: '#ff4444',
      desc: 'A flying FORTRESS. The sky belongs to you.',
      powers: ['Max patrol (+3x defense)', 'Full intel on scout', 'Devastating attack (15-25 dmg)', 'Bombs steal 10% coins', 'Fear aura on enemies'],
      howto: 'The ultimate aircraft. Massive damage, coin theft on attack, and your patrols make your home nearly invincible.' },
  },
  AVATAR: {
    'SHADOW KNIGHT': { name: 'SHADOW KNIGHT', icon: '\u2694', color: '#222244',
      desc: 'Darkness incarnate. Silent but deadly.',
      powers: ['Custom dark appearance', '+5% dodge in challenges', 'Shadow trail effect'],
      howto: 'Equip this skin for a visual overhaul and a slight combat advantage in challenges.' },
    'NEON SAMURAI': { name: 'NEON SAMURAI', icon: '\u2694', color: '#00ffcc',
      desc: 'Glowing blade, cyberpunk vibes. Peak aesthetics.',
      powers: ['Neon glow appearance', '+8% speed in lanes', 'Neon slash effect', 'Light trail while running'],
      howto: 'The speed boost makes lane races easier. Plus you look absolutely SICK.' },
    'VOID EMPEROR': { name: 'VOID EMPEROR', icon: '\u2694', color: '#8800ff',
      desc: 'Reality bends around you. The ultimate form.',
      powers: ['Void distortion appearance', '+10% all stats', 'Gravity aura in fights', 'Void particles', 'Intimidation (-5% enemy accuracy)'],
      howto: 'The most powerful avatar. All-around stat boost plus visual intimidation that actually affects enemy performance.' },
  },
  ATTACK: {
    'EMP STRIKE': { name: 'EMP STRIKE', icon: '\u26A1', color: '#55aaff',
      desc: 'Electromagnetic pulse. Fries everything electronic.',
      powers: ['Area damage: 8-12 to target home', 'Disables enemy defenses for 30s', 'Cooldown: 2 minutes'],
      howto: 'Use before a plane attack to disable defenses first. Strategic timing is everything.' },
    'ORBITAL BEAM': { name: 'ORBITAL BEAM', icon: '\u26A1', color: '#ff4444',
      desc: 'A beam from the heavens. Biblical levels of destruction.',
      powers: ['Direct damage: 15-20 to target', 'Ignores 50% of defenses', 'Visual spectacle', 'Cooldown: 3 minutes'],
      howto: 'The nuke option. Deals massive damage that partially bypasses defenses. Save it for when it counts.' },
    'SWARM DRONES': { name: 'SWARM DRONES', icon: '\u26A1', color: '#ffcc00',
      desc: 'A swarm of tiny drones. Death by a thousand cuts.',
      powers: ['Multi-hit: 3-5 damage x5 waves', 'Steals 5% coins per wave', 'Hard to defend against', 'Cooldown: 4 minutes'],
      howto: 'Best for stealing coins. Each wave does less damage but steals resources. Great against rich players.' },
  },
};

function openAssetDetail(type, key) {
  const details = ASSET_DETAILS[type]?.[key];
  if (!details) return;

  // Remove existing overlay
  const existing = document.getElementById('asset-detail-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'asset-detail-overlay';
  overlay.className = 'asset-detail-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="asset-detail-panel">
      <div class="ad-header">
        <div class="ad-icon" style="color:${details.color}">${details.icon}</div>
        <div>
          <div class="ad-title">${details.name}</div>
          <div class="ad-tier" style="color:${details.color}">${type}</div>
        </div>
      </div>
      <div class="ad-desc">${details.desc}</div>
      <div class="ad-powers">
        <div class="ad-powers-title">POWERS & ABILITIES</div>
        ${details.powers.map(p => `<div class="ad-power-row"><span class="ad-power-icon">\u2726</span><span class="ad-power-text">${p}</span></div>`).join('')}
      </div>
      <div class="ad-howto">
        <div class="ad-howto-title">HOW TO USE</div>
        ${details.howto}
      </div>
      <button class="ad-close" onclick="this.closest('.asset-detail-overlay').remove()">CLOSE</button>
    </div>
  `;
  document.body.appendChild(overlay);
}
window.openAssetDetail = openAssetDetail;

// ====== PLAYER ACTIVITY PING ======
let playerActionCount = 0;
// Ping server with activity every 30s
setInterval(async () => {
  if (playerActionCount > 0) {
    try { await fetch('/api/player/ping', { method: 'POST' }); } catch (e) {}
    playerActionCount = 0;
  }
}, 30000);
// Track movement keys as activity
window.addEventListener('keydown', (e) => {
  if ('wasdWASD'.includes(e.key) || e.key === ' ') playerActionCount++;
});

// ====== PUZZLE TAB ======
let currentPuzzleData = null;

async function refreshPuzzleTab() {
  const container = document.getElementById('puzzle-container');
  if (!container) return;

  try {
    const r = await fetch('/api/puzzles/current');
    const data = await r.json();
    currentPuzzleData = data.puzzle;

    if (!currentPuzzleData) {
      container.innerHTML = '<div class="ap-asset-none" style="text-align:center;padding:20px">Generating puzzle...</div>';
      return;
    }

    const p = currentPuzzleData;
    const timeLeft = Math.max(0, p.expiresAt - Date.now());
    const timeTotal = p.expiresAt - p.createdAt;
    const pct = Math.max(0, (timeLeft / timeTotal) * 100);
    const stars = '\u2605'.repeat(Math.min(5, p.difficulty)) + '\u2606'.repeat(Math.max(0, 5 - p.difficulty));

    container.innerHTML = `
      <div class="puzzle-card">
        <div class="puzzle-header">
          <span class="puzzle-type">${p.type}</span>
          <span class="puzzle-diff">${stars} LV${p.difficulty}</span>
        </div>
        <div class="puzzle-question">${p.question}</div>
        <div class="puzzle-reward">REWARD: ${p.reward} $WON</div>
        <div class="puzzle-input-row">
          <input class="puzzle-input" id="puzzle-answer" type="text" placeholder="Your answer..." onkeydown="if(event.key==='Enter')submitPuzzle()">
          <button class="puzzle-submit" onclick="submitPuzzle()">SUBMIT</button>
        </div>
        <div class="puzzle-timer"><div class="puzzle-timer-bar" style="width:${pct}%"></div></div>
        <div class="puzzle-feedback" id="puzzle-feedback"></div>
      </div>
    `;

    // Master mood indicator
    if (data.masterMood) {
      container.innerHTML += `<div style="text-align:center;margin-top:8px;font-size:0.2rem;color:rgba(255,255,255,0.3);font-family:var(--font-mono)">MASTER MOOD: ${data.masterMood} // DIFFICULTY MOD: ${masterData?.challengeModifier || 1}x</div>`;
    }
  } catch (e) {
    container.innerHTML = '<div class="ap-asset-none" style="text-align:center;padding:20px">Connection error</div>';
  }
}

async function submitPuzzle() {
  const input = document.getElementById('puzzle-answer');
  const feedback = document.getElementById('puzzle-feedback');
  if (!input || !feedback || !input.value.trim()) return;

  try {
    const r = await fetch('/api/puzzles/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: input.value.trim() }),
    });
    const result = await r.json();
    if (result.correct) {
      feedback.textContent = `CORRECT! +${result.reward} $WON`;
      feedback.className = 'puzzle-feedback correct';
      setTimeout(() => refreshPuzzleTab(), 1500);
    } else {
      feedback.textContent = result.message || 'Wrong answer!';
      feedback.className = 'puzzle-feedback wrong';
    }
  } catch (e) {
    feedback.textContent = 'Error submitting';
    feedback.className = 'puzzle-feedback wrong';
  }
}
window.submitPuzzle = submitPuzzle;

// Auto-refresh dashboard every 3s when open
setInterval(() => {
  if (dashboardOpen) {
    refreshDashboard();
    // Refresh active special tabs
    const puzzleSection = document.getElementById('dash-puzzle');
    if (puzzleSection?.classList.contains('active')) refreshPuzzleTab();
    const activitySection = document.getElementById('dash-activity');
    if (activitySection?.classList.contains('active')) refreshActivityTab();
  }
}, 3000);

// Update neural interface status ticker
function updateTicker() {
  const el = document.getElementById('np-ticker-text');
  if (!el) return;
  const activeGames = challengeData.filter(c => c.status === 'ACTIVE').length;
  const treasury = govData?.treasury?.toFixed(4) || '0.0000';
  const totalChallenges = challengeData.length;
  const walletTxt = walletConnected ? `WALLET:${walletAddress.slice(0,6)}...` : 'WALLET:DISCONNECTED';
  el.textContent = `SYS:ONLINE // ${walletTxt} // TREASURY:${treasury} // LIVE:${activeGames} // TOTAL:${totalChallenges}`;
}

// Crosshair hidden in orbit (uses mouse + highlight box); shown in FP
const crosshairEl = document.getElementById('crosshair');
if (crosshairEl) crosshairEl.style.display = 'none';

// ============================================================
// PHASE 3: VISIT / TELEPORT SYSTEM
// ============================================================
const NPC_ACCENT_COLORS = { BLAZE: '#ff4444', FROST: '#4488ff', VOLT: '#ffdd44', SHADE: '#cc44ff' };

function visitNPC(name) {
  if (visitingNPC || spectatingChallenge) return;
  const home = HOME_POSITIONS[name];
  if (!home) return;

  // Save return position
  visitReturnPos = { x: player.x, y: player.y, z: player.z };
  visitReturnTarget = controls.target.clone();

  // Destination = NPC home offset slightly to stand near them
  // Y must be on top of the platform floor, not at the group origin
  const fd = HOME_FLOOR_DATA[name];
  const floorY = fd ? (home.y || 0) + fd.localY + fd.baseH / 2 : (home.y || 0);
  const dest = { x: home.x + 5, y: floorY, z: home.z + 5 };

  // Start teleport
  visitingNPC = name;
  visitTeleporting = true;
  visitTeleportStart = performance.now();
  visitTeleportFrom = { x: player.x, y: player.y, z: player.z };
  visitTeleportTo = dest;

  // Close dashboard
  const dashEl = document.getElementById('dashboard');
  if (dashEl && !dashEl.classList.contains('hidden')) toggleDashboard();

  // Show visit HUD
  const hud = document.getElementById('visit-hud');
  if (hud) {
    hud.classList.remove('hidden');
    const badge = document.getElementById('visit-badge');
    const rel = document.getElementById('visit-rel');
    if (badge) { badge.textContent = `VISITING ${name}`; badge.style.color = NPC_ACCENT_COLORS[name] || '#fff'; }
    if (rel) rel.textContent = 'LOADING...';
    // Fetch relationship
    fetch(`/api/npc/${name}/social`).then(r => r.json()).then(d => {
      if (rel) rel.textContent = (d.relationship || 'stranger').toUpperCase();
    }).catch(() => {});
  }
}
window.visitNPC = visitNPC;

async function buyNPCService(name) {
  // Buy tea/service directly from dashboard — visits + starts tea automatically
  visitNPC(name);
  // Wait for teleport to finish, then auto-start tea
  setTimeout(() => {
    startTeaSession(name);
  }, VISIT_TELEPORT_DURATION + 500);
}
window.buyNPCService = buyNPCService;

function leaveVisit() {
  if (!visitingNPC) return;

  // End tea if active
  if (teaSession) endTeaSession();

  // Close NPC chat
  closeNPCChat();

  // Teleport back
  visitTeleporting = true;
  visitTeleportStart = performance.now();
  visitTeleportFrom = { x: player.x, y: player.y, z: player.z };
  visitTeleportTo = visitReturnPos || { x: 0, y: 0, z: 0 };

  // Hide visit HUD
  const hud = document.getElementById('visit-hud');
  if (hud) hud.classList.add('hidden');

  // Restore camera target after teleport completes
  const savedTarget = visitReturnTarget;
  const savedNPC = visitingNPC;
  visitingNPC = null;

  // After teleport finishes, restore camera
  setTimeout(() => {
    if (savedTarget) controls.target.copy(savedTarget);
  }, VISIT_TELEPORT_DURATION + 100);
}
window.leaveVisit = leaveVisit;

// ============================================================
// PHASE 4E: NPC CHAT FUNCTIONS
// ============================================================
async function startNPCChat(name) {
  npcChatName = name;
  const panel = document.getElementById('npc-chat');
  const msgEl = document.getElementById('nc-message');
  if (panel) panel.classList.remove('hidden');
  if (msgEl) msgEl.textContent = '...';

  // Set accent color
  const ncPanel = document.getElementById('nc-panel');
  if (ncPanel) ncPanel.style.setProperty('--nc-accent', NPC_ACCENT_COLORS[name] || '#888');

  const dot = document.getElementById('nc-dot');
  if (dot) dot.style.background = NPC_ACCENT_COLORS[name] || '#888';
  const nameEl = document.getElementById('nc-name');
  if (nameEl) nameEl.textContent = name;

  try {
    const r = await fetch(`/api/npc/${name}/chat/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json();
    openNPCChat(name, data.message, data.options, data.relationship);
  } catch (e) {
    openNPCChat(name, 'Hey there...', [{ type: 'positive', label: 'Hi!' }, { type: 'neutral', label: 'What\'s up?' }, { type: 'negative', label: 'Whatever.' }], 'stranger');
  }
}

function openNPCChat(name, message, options, relationship) {
  const panel = document.getElementById('npc-chat');
  const msgEl = document.getElementById('nc-message');
  const optsEl = document.getElementById('nc-options');
  const relEl = document.getElementById('nc-rel');
  if (!panel) return;

  panel.classList.remove('hidden');

  // Typewriter effect
  if (npcChatTyping) clearInterval(npcChatTyping);
  msgEl.textContent = '';
  let i = 0;
  npcChatTyping = setInterval(() => {
    if (i < message.length) { msgEl.textContent += message[i]; i++; }
    else { clearInterval(npcChatTyping); npcChatTyping = null; }
  }, 20);

  // Relationship badge
  if (relEl) {
    relEl.textContent = (relationship || 'stranger').toUpperCase();
    // Also update visit HUD relationship
    const visitRel = document.getElementById('visit-rel');
    if (visitRel) visitRel.textContent = (relationship || 'stranger').toUpperCase();
  }

  // Build option buttons
  optsEl.innerHTML = '';
  (options || []).forEach(opt => {
    const btn = document.createElement('button');
    btn.className = `nc-opt-btn ${opt.type || 'neutral'}`;
    btn.textContent = opt.label;
    btn.onclick = () => sendNPCReply(name, opt.type, opt.label);
    optsEl.appendChild(btn);
  });
}

async function sendNPCReply(name, replyType, label) {
  const optsEl = document.getElementById('nc-options');
  if (optsEl) optsEl.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:0.5rem;padding:8px;">...</div>';

  try {
    const r = await fetch(`/api/npc/${name}/chat/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyType, label })
    });
    const data = await r.json();

    // Check if NPC suggests tea
    if (data.suggestTea) {
      openNPCChat(name, data.message, [
        { type: 'accept_tea', label: 'Have tea together' },
        { type: 'reject_tea', label: 'Maybe later' },
        { type: 'neutral', label: 'Tell me more' }
      ], data.relationship);
      return;
    }

    // Handle tea acceptance
    if (replyType === 'accept_tea') {
      startTeaSession(name);
      return;
    }

    // Handle tea rejection
    if (replyType === 'reject_tea') {
      openNPCChat(name, data.message || 'No worries, another time.', data.options, data.relationship);
      return;
    }

    openNPCChat(name, data.message, data.options, data.relationship);
  } catch (e) {
    console.error('NPC reply error:', e);
    openNPCChat(name, 'Hmm, let me think...', [
      { type: 'positive', label: 'Take your time' },
      { type: 'neutral', label: 'Go on' },
      { type: 'negative', label: 'Nevermind' }
    ], 'stranger');
  }
}

function closeNPCChat() {
  npcChatName = null;
  if (npcChatTyping) { clearInterval(npcChatTyping); npcChatTyping = null; }
  const panel = document.getElementById('npc-chat');
  if (panel) panel.classList.add('hidden');
  const reaction = document.getElementById('nc-reaction');
  if (reaction) reaction.classList.add('hidden');
}
window.closeNPCChat = closeNPCChat;

function showNPCReaction(text, style) {
  const el = document.getElementById('nc-reaction');
  if (!el) return;
  el.textContent = text;
  el.className = `nc-reaction ${style || ''}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ============================================================
// PHASE 5: EMOJI SPRITE SYSTEM
// ============================================================
function spawnEmojiSprite(worldPos, emoji) {
  // Use HTML overlay div for proper emoji rendering (Canvas renders white on some systems)
  const div = document.createElement('div');
  div.textContent = emoji;
  div.style.cssText = 'position:fixed;font-size:36px;pointer-events:none;z-index:9999;transition:none;text-shadow:0 0 8px rgba(0,0,0,0.5);';
  document.body.appendChild(div);

  emojiSprites.push({
    div,
    worldPos: new THREE.Vector3(worldPos.x, worldPos.y + 2.5, worldPos.z),
    age: 0,
    life: 2.0,
    startY: worldPos.y + 2.5,
  });
}

function updateEmojiSprites(dt) {
  for (let i = emojiSprites.length - 1; i >= 0; i--) {
    const e = emojiSprites[i];
    e.age += dt;
    if (e.age >= e.life) {
      e.div.remove();
      emojiSprites.splice(i, 1);
      continue;
    }
    // Float upward + fade out
    const progress = e.age / e.life;
    e.worldPos.y = e.startY + progress * 3;
    e.div.style.opacity = String(1 - progress);

    // Project 3D position to screen
    const projected = e.worldPos.clone().project(camera);
    const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;

    // Hide if behind camera
    if (projected.z > 1) { e.div.style.display = 'none'; continue; }
    e.div.style.display = '';
    e.div.style.left = sx - 18 + 'px';
    e.div.style.top = sy - 18 + 'px';
  }
}

// ====== FLOATING CHAT BUBBLES above heads ======
function spawnFloatingChat(worldPos, text, fromName) {
  const div = document.createElement('div');
  div.className = 'float-chat-bubble';
  const nameColors = { BLAZE: '#ff4444', FROST: '#4488ff', VOLT: '#ffdd44', SHADE: '#cc44ff', 'AI MASTER': '#ffcc00' };
  const nameColor = nameColors[fromName] || '#00ffcc';
  const nameSpan = document.createElement('span');
  nameSpan.style.cssText = `color:${nameColor};font-weight:700;`;
  nameSpan.textContent = fromName;
  div.appendChild(nameSpan);
  div.appendChild(document.createTextNode(' ' + text.substring(0, 60)));
  document.body.appendChild(div);
  floatingChats.push({
    div,
    worldPos: new THREE.Vector3(worldPos.x, worldPos.y + 3, worldPos.z),
    age: 0,
    life: 4.0,
    startY: worldPos.y + 3,
  });
}

function updateFloatingChats(dt) {
  for (let i = floatingChats.length - 1; i >= 0; i--) {
    const c = floatingChats[i];
    c.age += dt;
    if (c.age >= c.life) {
      c.div.remove();
      floatingChats.splice(i, 1);
      continue;
    }
    const progress = c.age / c.life;
    c.worldPos.y = c.startY + progress * 2;
    c.div.style.opacity = String(Math.min(1, 1.5 - progress));
    const projected = c.worldPos.clone().project(camera);
    const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    if (projected.z > 1) { c.div.style.display = 'none'; continue; }
    c.div.style.display = '';
    c.div.style.left = (sx - 80) + 'px';
    c.div.style.top = (sy - 12) + 'px';
  }
}

// Track last processed arena chat for floating bubbles
let _lastArenaChatCount = 0;

function processArenaChatsFor3D() {
  if (!currentRoomData || !currentRoomData.chat) return;
  const chat = currentRoomData.chat;
  if (chat.length <= _lastArenaChatCount) return;
  const newMsgs = chat.slice(_lastArenaChatCount);
  _lastArenaChatCount = chat.length;

  for (const msg of newMsgs) {
    if (msg.from === 'SYSTEM') continue; // skip system messages
    // Find position for the speaker
    let pos = { x: 0, y: 1, z: 0 };
    if (msg.from === 'AI MASTER') {
      pos = { x: 60, y: 1, z: 60 }; // arena center
    } else {
      // Use player position if it's the current player, else randomize near arena
      pos = { x: 60 + (Math.random() - 0.5) * 10, y: 1, z: 60 + (Math.random() - 0.5) * 10 };
    }
    spawnFloatingChat(pos, msg.text, msg.from);
  }
}

async function sendNPCEmoji(emoji) {
  if (!visitingNPC) return;
  const name = visitingNPC;

  // Spawn from player
  spawnEmojiSprite({ x: player.x, y: player.y, z: player.z }, emoji);

  try {
    const r = await fetch(`/api/npc/${name}/emoji`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji })
    });
    const data = await r.json();

    // NPC responds with themed emoji after delay
    if (data.npcEmoji) {
      const npc = homeNPCs[name];
      if (npc) {
        setTimeout(() => {
          spawnEmojiSprite({ x: npc.x, y: npc.y, z: npc.z }, data.npcEmoji);
        }, 600);
      }
    }

    // Show NPC reaction text
    if (data.reaction) showNPCReaction(data.reaction, 'happy');
  } catch (e) {
    console.error('Emoji error:', e);
  }
}
window.sendNPCEmoji = sendNPCEmoji;

// ============================================================
// PHASE 6: TEA TIME SYSTEM
// ============================================================
async function startTeaSession(name) {
  if (teaSession) return;

  // Direct server purchase — arena wallet buys $WON, no MetaMask popup
  try {
    showFloatingMsg('Buying tea...');
    const r = await fetch(`/api/npc/${name}/tea/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: walletAddress || '' })
    });
    const data = await r.json();
    if (!data.ok) {
      openNPCChat(name, 'Something went wrong...', [
        { type: 'neutral', label: 'Try again' },
        { type: 'neutral', label: 'Nevermind' }
      ], 'stranger');
      return;
    }

    showFloatingMsg(`${data.service || 'TEA'} bought! ${data.txHash ? 'TX: ' + data.txHash.slice(0,8) + '...' : ''}`);

    // Start tea session
    const npc = homeNPCs[name];
    if (!npc) return;

    teaSession = {
      name,
      startTime: performance.now(),
      duration: 30000, // 30 seconds
      sipTimer: 0,
      sipping: false,
      sipPhase: 0,
    };

    // Create cup meshes
    const cupGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.1, 8);
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });

    const playerCup = new THREE.Mesh(cupGeo, cupMat);
    playerCup.position.set(player.x + 0.3, player.y + 1.0, player.z);
    scene.add(playerCup);

    const npcCup = new THREE.Mesh(cupGeo.clone(), cupMat.clone());
    npcCup.position.set(npc.x + 0.3, npc.y + 1.0, npc.z);
    scene.add(npcCup);

    teaCups.push(playerCup, npcCup);

    // Open chat during tea
    openNPCChat(name, 'Cheers! *sips tea* This is nice...', [
      { type: 'positive', label: 'This is great!' },
      { type: 'neutral', label: '*sips tea*' },
      { type: 'positive', label: 'We should do this more' }
    ], 'improving');

    showNPCReaction(`Tea time with ${name}!`, 'happy');

  } catch (e) {
    console.error('Tea session error:', e);
  }
}

function updateTeaSession(dt, t) {
  if (!teaSession) return;
  const npc = homeNPCs[teaSession.name];
  if (!npc) { endTeaSession(); return; }

  const elapsed = performance.now() - teaSession.startTime;

  // Seated pose for both characters
  // Player
  player.parts.lLeg.rotation.x = THREE.MathUtils.lerp(player.parts.lLeg.rotation.x, -1.2, 0.1);
  player.parts.rLeg.rotation.x = THREE.MathUtils.lerp(player.parts.rLeg.rotation.x, -1.2, 0.1);
  player.parts.rArm.rotation.x = THREE.MathUtils.lerp(player.parts.rArm.rotation.x, -0.6, 0.1);
  // NPC
  npc.parts.lLeg.rotation.x = THREE.MathUtils.lerp(npc.parts.lLeg.rotation.x, -1.2, 0.1);
  npc.parts.rLeg.rotation.x = THREE.MathUtils.lerp(npc.parts.rLeg.rotation.x, -1.2, 0.1);
  npc.parts.rArm.rotation.x = THREE.MathUtils.lerp(npc.parts.rArm.rotation.x, -0.6, 0.1);

  // Sip animation every 5 seconds
  teaSession.sipTimer += dt;
  if (teaSession.sipTimer > 5 && !teaSession.sipping) {
    teaSession.sipping = true;
    teaSession.sipPhase = 0;
  }
  if (teaSession.sipping) {
    teaSession.sipPhase += dt * 2;
    const sipVal = Math.sin(teaSession.sipPhase * Math.PI) * 0.5;
    player.parts.rArm.rotation.x = -0.6 - sipVal;
    npc.parts.rArm.rotation.x = -0.6 - sipVal;
    if (teaSession.sipPhase >= 1) {
      teaSession.sipping = false;
      teaSession.sipTimer = 0;
    }
  }

  // Update cup positions
  if (teaCups.length >= 2) {
    teaCups[0].position.set(player.x + 0.3, player.y + 1.0, player.z);
    teaCups[1].position.set(npc.x + 0.3, npc.y + 1.0, npc.z);
  }

  // End after duration
  if (elapsed >= teaSession.duration) {
    const teaName = teaSession.name;
    endTeaSession();
    openNPCChat(teaName || visitingNPC, 'That was a great tea session!', [
      { type: 'positive', label: 'Let\'s do it again!' },
      { type: 'neutral', label: 'Yeah, good stuff' },
      { type: 'positive', label: 'Thanks for the company' }
    ], 'buddy');
  }
}

function endTeaSession() {
  if (!teaSession) return;
  teaSession = null;

  // Remove cup meshes
  for (const cup of teaCups) {
    scene.remove(cup);
    cup.geometry.dispose();
    cup.material.dispose();
  }
  teaCups.length = 0;

  // Reset limb poses (will be overridden by animateChar next frame)
  player.parts.lLeg.rotation.x = 0;
  player.parts.rLeg.rotation.x = 0;
  player.parts.rArm.rotation.x = 0;
}

// ============================================================
// PHASE 8: PLAYER PROFILE
// ============================================================
async function savePlayerName() {
  const input = document.getElementById('dash-name-input');
  const status = document.getElementById('dash-name-status');
  if (!input) return;
  const name = input.value.trim().substring(0, 20);
  if (!name) return;

  try {
    const r = await fetch('/api/player/name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, wallet: walletAddress || '' })
    });
    const data = await r.json();
    if (data.ok) {
      if (status) { status.textContent = 'SAVED!'; status.style.color = 'var(--green)'; }
      // Save to localStorage
      if (walletAddress) localStorage.setItem(`playerName_${walletAddress}`, name);
      // Update 3D label
      updatePlayerNameLabel(name);
    }
  } catch (e) {
    if (status) { status.textContent = 'ERROR'; status.style.color = 'var(--red)'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 2000);
}
window.savePlayerName = savePlayerName;

function loadPlayerName() {
  if (!walletAddress) return;
  const saved = localStorage.getItem(`playerName_${walletAddress}`);
  if (saved) {
    const input = document.getElementById('dash-name-input');
    if (input) input.value = saved;
    updatePlayerNameLabel(saved);
    // Sync to server
    fetch('/api/player/name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: saved, wallet: walletAddress })
    }).catch(() => {});
  }
}

function updatePlayerNameLabel(name) {
  // Update existing name sprite if it exists, or create one
  if (player._nameSprite) {
    scene.remove(player._nameSprite);
    player._nameSprite.material.map.dispose();
    player._nameSprite.material.dispose();
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#00ffcc';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2, 0.5, 1);
  sprite.position.set(0, 2.5, 0);
  player.group.add(sprite);
  player._nameSprite = sprite;
}

// ====== VISITOR ACTIVITY TRIGGER ======
// On page load, ping server to trigger NPC activity
setTimeout(() => {
  fetch('/api/v1/visitor/ping', { method: 'POST' }).catch(() => {});
}, 3000);
// Also ping periodically while page is open
setInterval(() => {
  fetch('/api/v1/visitor/ping', { method: 'POST' }).catch(() => {});
}, 60000);

// ====== THE ARENA — 3D ROOM ======
let currentRoomId = 'room_main';
let currentRoomData = null;
let arenaJoined = false;
let inArenaRoom = false;
let arenaRoomBuilt = false;
let arenaReturnPos = null;
let arenaReturnTarget = null;
const ARENA_ROOM_POS = { x: 0, y: 0, z: 300 };
const ARENA_ROOM_GROUP = new THREE.Group();
let arenaScreenMesh = null;
let arenaScreenCtx = null;
let arenaScreenTex = null;
let arenaPriceMesh = null;
let arenaPriceCtx = null;
let arenaPriceTex = null;
let arenaGiantMaster = null;
const arenaRoomNPCs = {}; // spawned room participant characters
let arenaRoomPollInterval = null;
let _lastArenaChatIdx = 0;

function getAgentColor(name) {
  return AGENT_COLORS[name] || NPC_ACCENT_COLORS[name] || '#888';
}

function buildArenaRoom() {
  if (arenaRoomBuilt) return;
  arenaRoomBuilt = true;
  ARENA_ROOM_GROUP.position.set(ARENA_ROOM_POS.x, ARENA_ROOM_POS.y, ARENA_ROOM_POS.z);
  scene.add(ARENA_ROOM_GROUP);

  // Wide ground plane
  const groundGeo = new THREE.PlaneGeometry(500, 500);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.9, metalness: 0.1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ARENA_ROOM_GROUP.add(ground);

  // Grid lines on the floor
  const gridHelper = new THREE.GridHelper(500, 100, 0x111122, 0x0d0d1a);
  gridHelper.position.y = 0.01;
  ARENA_ROOM_GROUP.add(gridHelper);

  // Ambient glow pillars at edges
  const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 8, 8);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 0.4 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = Math.cos(angle) * 40;
    const pz = Math.sin(angle) * 40;
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(px, 4, pz);
    ARENA_ROOM_GROUP.add(pillar);
    const pLight = new THREE.PointLight(0x00ffcc, 0.5, 20);
    pLight.position.set(px, 6, pz);
    ARENA_ROOM_GROUP.add(pLight);
  }

  // Giant AI Master (scale 5x)
  const masterChar = createCharacter({ bodyColor: 0xffcc00, glowColor: 0xffcc00, darkColor: 0x1a1a28, bootColor: 0x222235, name: 'AI MASTER' });
  masterChar.group.scale.set(5, 5, 5);
  masterChar.group.position.set(0, 0, -15);
  masterChar.group.rotation.y = Math.PI; // face toward center
  ARENA_ROOM_GROUP.add(masterChar.group);
  arenaGiantMaster = masterChar;

  // Puzzle/Winner SCREEN behind AI Master
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1024;
  screenCanvas.height = 512;
  arenaScreenCtx = screenCanvas.getContext('2d');
  arenaScreenTex = new THREE.CanvasTexture(screenCanvas);
  arenaScreenTex.minFilter = THREE.LinearFilter;
  const screenGeo = new THREE.PlaneGeometry(20, 10);
  const screenMat = new THREE.MeshBasicMaterial({ map: arenaScreenTex, transparent: true });
  arenaScreenMesh = new THREE.Mesh(screenGeo, screenMat);
  arenaScreenMesh.position.set(0, 12, -25);
  ARENA_ROOM_GROUP.add(arenaScreenMesh);
  // Screen glow
  const screenGlow = new THREE.PointLight(0x00ffcc, 1, 30);
  screenGlow.position.set(0, 12, -23);
  ARENA_ROOM_GROUP.add(screenGlow);

  // Monad PRICE display (right side)
  const priceCanvas = document.createElement('canvas');
  priceCanvas.width = 512;
  priceCanvas.height = 256;
  arenaPriceCtx = priceCanvas.getContext('2d');
  arenaPriceTex = new THREE.CanvasTexture(priceCanvas);
  arenaPriceTex.minFilter = THREE.LinearFilter;
  const priceGeo = new THREE.PlaneGeometry(10, 5);
  const priceMat = new THREE.MeshBasicMaterial({ map: arenaPriceTex, transparent: true });
  arenaPriceMesh = new THREE.Mesh(priceGeo, priceMat);
  arenaPriceMesh.position.set(25, 8, -20);
  arenaPriceMesh.rotation.y = -0.4;
  ARENA_ROOM_GROUP.add(arenaPriceMesh);

  // Main light
  const mainLight = new THREE.PointLight(0xffffff, 0.8, 80);
  mainLight.position.set(0, 15, 0);
  ARENA_ROOM_GROUP.add(mainLight);

  // Warm light on AI Master
  const masterLight = new THREE.PointLight(0xffcc00, 1, 25);
  masterLight.position.set(0, 8, -12);
  ARENA_ROOM_GROUP.add(masterLight);

  updateArenaScreen();
  updateArenaPrice();
}

function updateArenaScreen() {
  if (!arenaScreenCtx) return;
  const ctx = arenaScreenCtx;
  const w = 1024, h = 512;
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = 'rgba(5, 5, 15, 0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  const room = currentRoomData;
  if (!room) {
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('THE ARENA', w / 2, 80);
    ctx.fillStyle = '#555';
    ctx.font = '28px monospace';
    ctx.fillText('Waiting for data...', w / 2, 140);
    arenaScreenTex.needsUpdate = true;
    return;
  }

  // Title
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('THE ARENA', w / 2, 55);

  // Status
  const sc = room.status === 'ACTIVE' ? '#00ff88' : room.status === 'FINISHED' ? '#ff4444' : '#ffcc00';
  ctx.fillStyle = sc;
  ctx.font = 'bold 28px monospace';
  ctx.fillText(`${room.status}  |  Round ${room.round}/${room.maxRounds}  |  Pool: ${room.pool} $WON`, w / 2, 95);

  // Current puzzle
  if (room.currentPuzzle) {
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`[${room.currentPuzzle.type}]`, w / 2, 135);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px monospace';
    // Word wrap the question
    const q = room.currentPuzzle.question || '';
    const words = q.split(' ');
    let line = '';
    let y = 168;
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > w - 80) {
        ctx.fillText(line.trim(), w / 2, y);
        line = word + ' ';
        y += 30;
        if (y > 240) break;
      } else {
        line = test;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), w / 2, y);

    // Hint
    if (room.currentPuzzle.hint) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '18px monospace';
      ctx.fillText('Hint: ' + room.currentPuzzle.hint, w / 2, y + 35);
    }

    // Round winner
    if (room.currentPuzzle.roundWinner) {
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 26px monospace';
      ctx.fillText(`SOLVED BY: ${room.currentPuzzle.roundWinner}`, w / 2, 310);
      if (room.currentPuzzle.winnerLatencyMs) {
        ctx.fillStyle = '#00ffcc';
        ctx.font = '20px monospace';
        ctx.fillText(`${room.currentPuzzle.winnerLatencyMs}ms`, w / 2, 340);
      }
    }
  } else if (room.status === 'FINISHED' && room.winner) {
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 40px monospace';
    ctx.fillText(`${room.winner} WINS!`, w / 2, 200);
  } else {
    ctx.fillStyle = '#555';
    ctx.font = '26px monospace';
    ctx.fillText('Waiting for players...', w / 2, 200);
  }

  // Scoreboard at bottom
  if (room.scores) {
    const sorted = Object.entries(room.scores).filter(([n]) => n !== 'AI MASTER').sort((a, b) => b[1] - a[1]).slice(0, 5);
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('LEADERBOARD', w / 2, 380);
    ctx.font = '18px monospace';
    sorted.forEach(([name, score], i) => {
      const c = name === room.winner ? '#ffcc00' : '#aaa';
      ctx.fillStyle = c;
      ctx.fillText(`${i + 1}. ${name}  ${score}pts`, w / 2, 405 + i * 22);
    });
  }

  // Bets
  if (room.bets && Object.keys(room.bets).length > 0) {
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('BETS:', 30, 380);
    let by = 400;
    for (const [who, b] of Object.entries(room.bets).slice(0, 4)) {
      ctx.fillStyle = '#cca';
      ctx.fillText(`${who} → ${b.on} (${b.amount} $WON)`, 30, by);
      by += 18;
    }
    ctx.textAlign = 'center';
  }

  arenaScreenTex.needsUpdate = true;
}

let monadPrice = null;
async function fetchMonadPrice() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd');
    const d = await r.json();
    if (d.monad && d.monad.usd) monadPrice = d.monad.usd;
  } catch (e) { /* silent — price stays null */ }
}

function updateArenaPrice() {
  if (!arenaPriceCtx) return;
  const ctx = arenaPriceCtx;
  const w = 512, h = 256;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(5, 5, 15, 0.9)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#836ef9';
  ctx.lineWidth = 2;
  ctx.strokeRect(3, 3, w - 6, h - 6);

  ctx.fillStyle = '#836ef9';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('MONAD', w / 2, 50);

  if (monadPrice !== null) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px monospace';
    ctx.fillText('$' + monadPrice.toFixed(2), w / 2, 130);
  } else {
    ctx.fillStyle = '#555';
    ctx.font = '28px monospace';
    ctx.fillText('LIVE', w / 2, 130);
  }

  ctx.fillStyle = '#836ef9';
  ctx.font = '18px monospace';
  ctx.fillText('MONAD BLOCKCHAIN', w / 2, 180);
  ctx.fillStyle = 'rgba(131,110,249,0.5)';
  ctx.font = '16px monospace';
  ctx.fillText('$WON Token Arena', w / 2, 210);

  arenaPriceTex.needsUpdate = true;
}

// Spawn a character in the arena room for a participant
function spawnArenaParticipant(name) {
  if (arenaRoomNPCs[name]) return;
  const colorHex = parseInt((getAgentColor(name) || '#00ffcc').replace('#', ''), 16);
  const npc = createCharacter({ bodyColor: colorHex, glowColor: colorHex, darkColor: 0x1a1a28, bootColor: 0x222235, name });
  // Random position in the arena
  const angle = Math.random() * Math.PI * 2;
  const dist = 8 + Math.random() * 20;
  const nx = Math.cos(angle) * dist;
  const nz = Math.sin(angle) * dist + 5; // in front of AI Master
  npc.group.position.set(nx, 0, nz);
  npc._homeX = nx;
  npc._homeZ = nz;
  npc._spawnTime = performance.now();
  ARENA_ROOM_GROUP.add(npc.group);
  arenaRoomNPCs[name] = npc;
}

function removeArenaParticipant(name) {
  if (!arenaRoomNPCs[name]) return;
  ARENA_ROOM_GROUP.remove(arenaRoomNPCs[name].group);
  delete arenaRoomNPCs[name];
}

// Animate arena room NPCs
function animateArenaRoom(t) {
  if (!inArenaRoom) return;
  // Giant AI Master idle sway
  if (arenaGiantMaster) {
    arenaGiantMaster.group.rotation.y = Math.PI + Math.sin(t * 0.3) * 0.1;
    if (arenaGiantMaster.lArm) arenaGiantMaster.lArm.rotation.x = Math.sin(t * 0.5) * 0.15;
    if (arenaGiantMaster.rArm) arenaGiantMaster.rArm.rotation.x = Math.sin(t * 0.5 + 1) * 0.15;
  }
  // NPC idle wander
  for (const [name, npc] of Object.entries(arenaRoomNPCs)) {
    const ph = npc._spawnTime * 0.001;
    npc.speed = 0.5;
    const nx = npc._homeX + Math.sin(t * 0.3 + ph) * 3;
    const nz = npc._homeZ + Math.cos(t * 0.25 + ph) * 3;
    npc.group.position.x = nx;
    npc.group.position.z = nz;
    npc.group.rotation.y = Math.atan2(Math.cos(t * 0.3 + ph), -Math.sin(t * 0.3 + ph));
    // Leg/arm animation
    const walk = Math.sin(t * 3 + ph);
    if (npc.lLeg) npc.lLeg.rotation.x = walk * 0.3;
    if (npc.rLeg) npc.rLeg.rotation.x = -walk * 0.3;
    if (npc.lArm) npc.lArm.rotation.x = -walk * 0.2;
    if (npc.rArm) npc.rArm.rotation.x = walk * 0.2;
  }
}

async function autoJoinArena() {
  if (arenaJoined) return;
  const playerName = state?.playerProfile?.displayName || 'PLAYER_' + Math.random().toString(36).slice(2,6).toUpperCase();
  try {
    await fetch('/api/v1/rooms/room_main/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: playerName }),
    });
    arenaJoined = true;
  } catch (e) { /* silent */ }
}

function enterArenaRoom() {
  if (inArenaRoom || visitingNPC || spectatingChallenge) return;

  // Build room on first enter
  buildArenaRoom();
  fetchMonadPrice();

  // Save return position
  arenaReturnPos = { x: player.x, y: player.y, z: player.z };
  arenaReturnTarget = controls.target.clone();

  // Teleport into room
  inArenaRoom = true;
  visitTeleporting = true;
  visitTeleportStart = performance.now();
  visitTeleportFrom = { x: player.x, y: player.y, z: player.z };
  visitTeleportTo = { x: ARENA_ROOM_POS.x, y: 0, z: ARENA_ROOM_POS.z + 20 };

  // Close dashboard
  const dashEl = document.getElementById('dashboard');
  if (dashEl && !dashEl.classList.contains('hidden')) toggleDashboard();

  // Show room HUD
  const hud = document.getElementById('arena-room-hud');
  if (hud) hud.classList.remove('hidden');

  // Auto-join the room
  autoJoinArena();

  // Start polling room data
  refreshArenaRoomData();
  arenaRoomPollInterval = setInterval(refreshArenaRoomData, 2000);

  // Fetch price periodically
  setInterval(fetchMonadPrice, 30000);
}
window.enterArenaRoom = enterArenaRoom;

function leaveArenaRoom() {
  if (!inArenaRoom) return;
  inArenaRoom = false;

  // Teleport back
  visitTeleporting = true;
  visitTeleportStart = performance.now();
  visitTeleportFrom = { x: player.x, y: player.y, z: player.z };
  visitTeleportTo = arenaReturnPos || { x: 0, y: 0, z: 0 };

  // Hide HUD
  const hud = document.getElementById('arena-room-hud');
  if (hud) hud.classList.add('hidden');

  // Restore camera
  const savedTarget = arenaReturnTarget;
  setTimeout(() => {
    if (savedTarget) controls.target.copy(savedTarget);
  }, VISIT_TELEPORT_DURATION + 100);

  // Stop polling
  if (arenaRoomPollInterval) { clearInterval(arenaRoomPollInterval); arenaRoomPollInterval = null; }
}
window.leaveArenaRoom = leaveArenaRoom;

async function refreshArenaRoomData() {
  try {
    const r = await fetch('/api/v1/rooms/room_main');
    const room = await r.json();
    if (room.error) return;
    currentRoomData = room;

    // Update 3D screen
    updateArenaScreen();
    updateArenaPrice();

    // Update room HUD
    const statusEl = document.getElementById('arena-hud-status');
    if (statusEl) {
      const sc = room.status === 'ACTIVE' ? '#00ff88' : room.status === 'FINISHED' ? '#ff4444' : '#ffcc00';
      const pc = (room.players || []).filter(p => p !== 'AI MASTER').length;
      statusEl.innerHTML = `<span style="color:${sc}">${room.status}</span> | R${room.round}/${room.maxRounds} | ${pc} players | ${room.pool} $WON`;
    }

    // Spawn/remove participants
    const players = (room.players || []).filter(p => p !== 'AI MASTER');
    const myName = state?.playerProfile?.displayName || '';
    for (const p of players) {
      if (p !== myName) spawnArenaParticipant(p);
    }
    // Remove players that left
    for (const name of Object.keys(arenaRoomNPCs)) {
      if (!players.includes(name)) removeArenaParticipant(name);
    }

    // 3D chat bubbles for new messages
    if (room.chat && room.chat.length > _lastArenaChatIdx) {
      const newMsgs = room.chat.slice(_lastArenaChatIdx);
      _lastArenaChatIdx = room.chat.length;
      for (const msg of newMsgs) {
        if (msg.from === 'SYSTEM') continue;
        let pos;
        if (msg.from === 'AI MASTER') {
          pos = { x: ARENA_ROOM_POS.x, y: 6, z: ARENA_ROOM_POS.z - 15 };
        } else if (arenaRoomNPCs[msg.from]) {
          const g = arenaRoomNPCs[msg.from].group;
          pos = { x: ARENA_ROOM_POS.x + g.position.x, y: 2, z: ARENA_ROOM_POS.z + g.position.z };
        } else {
          pos = { x: ARENA_ROOM_POS.x + (Math.random() - 0.5) * 10, y: 2, z: ARENA_ROOM_POS.z + 20 };
        }
        spawnFloatingChat(pos, msg.text, msg.from);
      }
    }

    // Update chat panel in HUD
    const chatEl = document.getElementById('arena-hud-chat');
    if (chatEl && room.chat) {
      chatEl.innerHTML = room.chat.slice(-12).map(m => {
        const cls = m.from === 'AI MASTER' ? ' style="color:#ffcc00"' : m.from === 'SYSTEM' ? ' style="color:rgba(255,255,255,0.3);font-style:italic"' : '';
        return `<div${cls}><b>${m.from}:</b> ${m.text}</div>`;
      }).join('');
      chatEl.scrollTop = chatEl.scrollHeight;
    }
  } catch (e) { /* silent */ }
}

async function refreshRoomsTab() {
  try {
    const r = await fetch('/api/v1/rooms/room_main');
    const room = await r.json();
    if (room.error) return;
    currentRoomData = room;

    const players = (room.players || []).filter(p => p !== 'AI MASTER');
    const playerCount = players.length;
    const statusClass = room.status === 'ACTIVE' ? 'active' : room.status === 'FINISHED' ? 'finished' : '';

    // Room Card preview in dashboard
    const badge = document.getElementById('arena-rc-badge');
    if (badge) {
      badge.textContent = room.status;
      badge.className = 'arena-rc-badge ' + statusClass;
    }
    const rcStats = document.getElementById('arena-rc-stats');
    if (rcStats) rcStats.textContent = `${playerCount} players \u2022 ${room.pool} $WON pool \u2022 Round ${room.round}/${room.maxRounds}`;

    const peek = document.getElementById('arena-rc-peek');
    if (peek) {
      peek.innerHTML = players.slice(0, 12).map(name => {
        const c = getAgentColor(name);
        return `<div class="arena-rc-avatar" style="background:${c}" title="${name}">${name.slice(0,2)}</div>`;
      }).join('') + (playerCount > 12 ? `<div class="arena-rc-avatar" style="background:#333;color:#aaa">+${playerCount - 12}</div>` : '');
    }
  } catch (e) { /* silent */ }
}

// Arena room HUD functions
async function submitArenaAnswer() {
  const input = document.getElementById('arena-hud-answer-input');
  if (!input || !input.value.trim()) return;
  const playerName = state?.playerProfile?.displayName || 'PLAYER';
  try {
    const r = await fetch('/api/v1/rooms/room_main/solve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: playerName, answer: input.value.trim() }),
    });
    const data = await r.json();
    if (data.correct) {
      showFloatingMsg('CORRECT! +1 point');
      input.value = '';
    } else {
      showFloatingMsg(data.message || 'Wrong answer');
    }
    refreshArenaRoomData();
  } catch (e) { showFloatingMsg('Error submitting'); }
}
window.submitArenaAnswer = submitArenaAnswer;

async function sendArenaChat() {
  const input = document.getElementById('arena-hud-chat-input');
  if (!input || !input.value.trim()) return;
  const playerName = state?.playerProfile?.displayName || 'PLAYER';
  const msg = input.value.trim();
  spawnFloatingChat({ x: player.x, y: player.y, z: player.z }, msg, playerName);
  await fetch('/api/v1/rooms/room_main/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: playerName, message: msg }),
  }).catch(() => {});
  input.value = '';
  refreshArenaRoomData();
}
window.sendArenaChat = sendArenaChat;

// ====== API TAB ======
let savedAPIKey = null;

async function refreshAPITab() {
  const docsEl = document.getElementById('api-docs-list');
  if (!docsEl) return;

  try {
    const r = await fetch('/api/v1/docs');
    const docs = await r.json();
    const endpoints = docs.endpoints || [];

    docsEl.innerHTML = endpoints.map(ep => {
      const methodColor = ep.method === 'GET' ? '#00ff88' : '#ffcc00';
      const authBadge = ep.auth ? '<span class="api-auth-badge">AUTH</span>' : '';
      const bodyStr = ep.body ? JSON.stringify(ep.body, null, 0) : '';
      return `<div class="api-endpoint" onclick="fillAPITester('${ep.method}','${ep.path}','${bodyStr.replace(/'/g, "\\'")}')">
        <div class="api-ep-top">
          <span class="api-ep-method" style="color:${methodColor}">${ep.method}</span>
          <span class="api-ep-path">${ep.path}</span>
          ${authBadge}
        </div>
        <div class="api-ep-desc">${ep.desc}</div>
        ${ep.body ? `<div class="api-ep-body">Body: ${bodyStr}</div>` : ''}
        <div class="api-ep-returns">Returns: ${ep.returns || ''}</div>
      </div>`;
    }).join('');
  } catch (e) {
    docsEl.innerHTML = '<div style="color:#ff4444;text-align:center;padding:20px;">Failed to load docs</div>';
  }
}

function fillAPITester(method, path, body) {
  const methodEl = document.getElementById('api-method');
  const urlEl = document.getElementById('api-url');
  const bodyEl = document.getElementById('api-body');
  if (methodEl) methodEl.value = method;
  if (urlEl) urlEl.value = path;
  if (bodyEl) {
    try { bodyEl.value = body ? JSON.stringify(JSON.parse(body), null, 2) : ''; }
    catch (e) { bodyEl.value = body || ''; }
  }
}
window.fillAPITester = fillAPITester;

async function registerAPIAgent() {
  const nameInput = document.getElementById('api-agent-name');
  const keyDisplay = document.getElementById('api-key-display');
  const keyValue = document.getElementById('api-key-value');
  if (!nameInput || !nameInput.value.trim()) { showFloatingMsg('Enter agent name'); return; }
  try {
    const r = await fetch('/api/v1/agent/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value.trim(), personality: 'Hacker AI Agent' }),
    });
    const data = await r.json();
    if (data.ok && data.api_key) {
      savedAPIKey = data.api_key;
      if (keyValue) keyValue.textContent = data.api_key;
      if (keyDisplay) keyDisplay.classList.remove('hidden');
      const testKeyEl = document.getElementById('api-test-key');
      if (testKeyEl) testKeyEl.value = data.api_key;
      showFloatingMsg('Agent registered: ' + data.agent);
    } else {
      showFloatingMsg(data.error || 'Registration failed');
    }
  } catch (e) { showFloatingMsg('Connection error'); }
}
window.registerAPIAgent = registerAPIAgent;

function copyAPIKey() {
  if (savedAPIKey) {
    navigator.clipboard.writeText(savedAPIKey).then(() => showFloatingMsg('API key copied!')).catch(() => {});
  }
}
window.copyAPIKey = copyAPIKey;

async function testAPIEndpoint() {
  const method = document.getElementById('api-method')?.value || 'GET';
  const url = document.getElementById('api-url')?.value || '/api/v1/rooms';
  const body = document.getElementById('api-body')?.value || '';
  const apiKey = document.getElementById('api-test-key')?.value || '';
  const responseEl = document.getElementById('api-response');

  if (responseEl) responseEl.textContent = '// Loading...';

  try {
    const opts = { method, headers: {} };
    if (apiKey) opts.headers['x-api-key'] = apiKey;
    if (method === 'POST' && body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = body;
    }
    const r = await fetch(url, opts);
    const data = await r.json();
    if (responseEl) responseEl.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    if (responseEl) responseEl.textContent = '// Error: ' + e.message;
  }
}
window.testAPIEndpoint = testAPIEndpoint;

// Auto-refresh rooms tab when open
setInterval(() => {
  if (dashboardOpen) {
    const roomsSection = document.getElementById('dash-rooms');
    if (roomsSection?.classList.contains('active')) refreshRoomsTab();
  }
}, 2000);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
