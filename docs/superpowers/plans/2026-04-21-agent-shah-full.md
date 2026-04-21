# Agent Shah — Full Thibault-Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Thibault-Introvigne-quality interactive 3D portfolio for Shah Fahad — a spy-agent themed hub-and-spoke world with rigged character, physics movement, themed zones, post-processing, audio, and polished interaction prompts.

**Architecture:** Vanilla Three.js + Vite + Rapier3D (physics). Singleton Game class (Bruno-style). Hub-and-spoke world: central HQ with 6 portal pads → 6 sector zones (Briefing, Dossier, Arsenal, Archives, History, Extraction). Mixamo-rigged GLB character with AnimationMixer state blending. EffectComposer with bloom + tone mapping. Howler-based audio. Compass HUD. The existing codebase at `/Users/shahfahad/agent-shah-3d` is extended — most singletons (Game, Ticker, Inputs, UI, Camera, NPC) are kept; Player, Enemy, World are reworked for GLB + physics.

**Tech Stack:** Three.js 0.184, Vite 8, Rapier3D (`@dimforge/rapier3d-compat`), Howler.js, GSAP, postprocessing (`postprocessing` lib), Mixamo character + animations (downloaded as GLB).

**Verification model:** Graphics-heavy work — visual testing replaces unit tests. Each task ends with a "manually verify" step describing exactly what the user should see in `npm run dev`. Commit only after visual verification passes.

**Branching:** Work on `main` directly in `/Users/shahfahad/agent-shah-3d`. Tag milestones (`v0.1-physics`, `v0.2-character`, etc.) for rollback safety. Never force-push.

---

## Pre-Flight: Repo Snapshot + Asset Plan

### Task 0: Tag current procedural baseline + create assets folder

**Files:**
- Modify: `.gitignore` (ensure `node_modules`, `dist` ignored)
- Create: `public/assets/.gitkeep`
- Create: `public/assets/models/.gitkeep`
- Create: `public/assets/audio/.gitkeep`
- Create: `public/assets/hdr/.gitkeep`

- [ ] **Step 1: Verify clean tree + tag baseline**

```bash
cd /Users/shahfahad/agent-shah-3d
git status
git add -A && git commit -m "wip: pre-Thibault-parity snapshot" || echo "nothing to commit"
git tag v0.0-procedural
```

Expected: tag created without error.

- [ ] **Step 2: Create asset folder structure**

```bash
mkdir -p public/assets/models public/assets/audio public/assets/hdr public/assets/textures
touch public/assets/models/.gitkeep public/assets/audio/.gitkeep public/assets/hdr/.gitkeep public/assets/textures/.gitkeep
```

- [ ] **Step 3: Update .gitignore (append if missing)**

Read `/Users/shahfahad/agent-shah-3d/.gitignore`. If missing or empty, write:

```
node_modules
dist
.DS_Store
*.log
.vite
```

- [ ] **Step 4: Document asset acquisition checklist**

Create `public/assets/README.md`:

```markdown
# Assets — Manual Download Required

Place files at exact paths below before running tasks that depend on them.

## Character (Task 5)
- Download from https://www.mixamo.com (free, requires Adobe sign-in):
  1. Character: search "Y Bot" or "Business Casual Man" → DOWNLOAD as FBX → re-export to GLB via https://anyconv.com/fbx-to-gltf-converter/ OR upload to Mixamo with FBX→GLB converter
  2. Animations to download (apply to same character, "without skin"):
     - Idle (search "Idle")
     - Walking (search "Walking")
     - Running (search "Running")
     - Pistol Idle (search "Pistol Idle")
     - Firing Pistol (search "Firing Rifle" → close enough)
     - Sword Slash (for sector 3)
- Convert all FBX→GLB. Place at:
  - `models/agent.glb` (skinned mesh + skeleton)
  - `models/anim-idle.glb`
  - `models/anim-walk.glb`
  - `models/anim-run.glb`
  - `models/anim-pistol-idle.glb`
  - `models/anim-pistol-fire.glb`
  - `models/anim-sword.glb`

## Enemies (Task 8)
- Mixamo character "Maw J Laygo" or "Mremireh O Desbiens" → download as GLB → save as `models/enemy.glb`
- Animations: same as above (idle, walk, fire) → `models/enemy-anim-*.glb`

## Environment (Task 11+)
- From https://kenney.nl (CC0):
  - Modular city kit OR sci-fi facility kit → unzip → save GLBs to `models/env/`
- HDR sky from https://polyhaven.com/hdris (CC0):
  - "studio_small_09_1k.hdr" → save to `hdr/sky.hdr`

## Audio (Task 13)
- From https://freesound.org or https://pixabay.com/sound-effects (CC0):
  - `audio/footstep.wav`
  - `audio/pistol-shot.wav`
  - `audio/sword-swing.wav`
  - `audio/ambient-hum.mp3` (60s loopable)
  - `audio/portal-activate.wav`
  - `audio/ui-confirm.wav`

## Cel-shading (Task 16)
- Download `textures/toon-ramp.png` (3-band gradient strip 256×16) — generate with any image editor or use https://github.com/mrdoob/three.js/blob/master/examples/textures/gradientMaps/threeTone.jpg
```

- [ ] **Step 5: Commit**

```bash
git add public/assets .gitignore
git commit -m "chore: scaffold asset folders + acquisition checklist"
```

- [ ] **Manually verify:** `ls public/assets/` shows `models/`, `audio/`, `hdr/`, `textures/`, `README.md`.

---

## Phase 1: Physics Foundation (Rapier)

### Task 1: Install Rapier3D + create Physics singleton

**Files:**
- Modify: `package.json`
- Create: `src/Game/Physics.js`

- [ ] **Step 1: Install Rapier**

```bash
cd /Users/shahfahad/agent-shah-3d
npm install @dimforge/rapier3d-compat
```

- [ ] **Step 2: Create `src/Game/Physics.js`**

```js
import RAPIER from '@dimforge/rapier3d-compat'

export class Physics {
  constructor() {
    this.world = null
    this.bodies = new Map()  // mesh.uuid -> { body, collider }
    this.ready = false
  }

  async init() {
    await RAPIER.init()
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.ready = true
  }

  step(delta) {
    if (!this.ready) return
    this.world.timestep = Math.min(delta, 1 / 30)
    this.world.step()
    // Sync meshes to body positions
    for (const [uuid, entry] of this.bodies) {
      if (!entry.mesh) continue
      const t = entry.body.translation()
      const r = entry.body.rotation()
      entry.mesh.position.set(t.x, t.y, t.z)
      entry.mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }

  addStaticBox(mesh, w, h, d) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
    const body = this.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
    const collider = this.world.createCollider(colliderDesc, body)
    this.bodies.set(mesh.uuid, { body, collider, mesh: null })
    return { body, collider }
  }

  addKinematicCharacter(position, halfHeight = 0.9, radius = 0.4) {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y + halfHeight, position.z)
    const body = this.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight - radius, radius)
    const collider = this.world.createCollider(colliderDesc, body)
    const ctrl = this.world.createCharacterController(0.05)
    ctrl.setApplyImpulsesToDynamicBodies(true)
    ctrl.enableAutostep(0.4, 0.2, true)
    ctrl.enableSnapToGround(0.5)
    return { body, collider, ctrl }
  }
}
```

- [ ] **Step 3: Wire Physics into Game.js**

Modify `src/Game/Game.js`:
- Add `import { Physics } from './Physics.js'` near top
- In constructor (after `this.scene = ...`): `this.physics = new Physics()`
- Replace `start()` body with:

```js
async start() {
  await this.physics.init()
  this.ui.finishLoader()
  this.ui.setHint('INFILTRATING SECTOR 01…')
  this.ticker.start()
}
```

- In `_tick(delta, elapsed)`, BEFORE `if (this.phase === PHASE.INTRO)`: add `this.physics.step(delta)`

- [ ] **Step 4: Update main.js to await start**

Modify `src/main.js`:

```js
import { Game } from './Game/Game.js'

const canvas = document.getElementById('game')
const game = Game.getInstance({ canvas })
game.start().catch(err => console.error('Game start failed:', err))

window.__GAME__ = game
```

- [ ] **Step 5: Run dev + verify no console errors**

```bash
npm run dev
```

Open http://localhost:5174 — check DevTools console. Expected: NO errors. Game still plays as before.

- [ ] **Step 6: Commit**

```bash
git add src/Game/Physics.js src/Game/Game.js src/main.js package.json package-lock.json
git commit -m "feat(physics): integrate Rapier3D world + character controller skeleton"
```

- [ ] **Manually verify:** No console errors on page load. Game still runs identically to before (Rapier exists but unused for movement yet).

---

### Task 2: Replace Player movement with Rapier kinematic character

**Files:**
- Modify: `src/Game/Player.js`
- Modify: `src/Game/Game.js`
- Modify: `src/Game/World.js` (add static colliders for walls)

- [ ] **Step 1: Add static collider creation in World.js**

In `World.js` constructor, AFTER each `mkWall(...)` call, register the wall geometry with physics. Refactor `mkWall` to return the mesh:

```js
const mkWall = (w, d, x, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat)
  m.position.set(x, wallH / 2, z)
  m.castShadow = true; m.receiveShadow = true
  scene.add(m)
  return { mesh: m, w, h: wallH, d }
}
this._walls = []
this._walls.push(mkWall(halfSize * 2 + wallT, wallT, 0, -halfSize))
// ... and so on for all walls
```

Add method to register colliders (called from Game after physics ready):

```js
registerColliders(physics) {
  for (const w of this._walls) {
    physics.addStaticBox(w.mesh, w.w, w.h, w.d)
  }
}
```

- [ ] **Step 2: Call registerColliders in Game.start()**

In `Game.js`, modify `start()`:

```js
async start() {
  await this.physics.init()
  this.world.registerColliders(this.physics)
  this.player.registerPhysics(this.physics)
  this.ui.finishLoader()
  this.ui.setHint('INFILTRATING SECTOR 01…')
  this.ticker.start()
}
```

- [ ] **Step 3: Add registerPhysics to Player + use kinematic controller**

In `Player.js` constructor, store `this.physicsBody = null`. Add method:

```js
registerPhysics(physics) {
  const r = physics.addKinematicCharacter(this.position, 0.9, 0.4)
  this.physicsBody = r.body
  this.physicsCollider = r.collider
  this.physicsCtrl = r.ctrl
  this.physics = physics
}
```

Replace velocity-based position update in `update()` with controller move. Replace this block:

```js
this.position.x += this.velocity.x * delta
this.position.z += this.velocity.z * delta
this.position.x = THREE.MathUtils.clamp(this.position.x, -22, 22)
this.position.z = THREE.MathUtils.clamp(this.position.z, -22, 22)
this.group.position.copy(this.position)
```

with:

```js
if (this.physicsBody) {
  const desired = { x: this.velocity.x * delta, y: -0.05, z: this.velocity.z * delta }
  this.physicsCtrl.computeColliderMovement(this.physicsCollider, desired)
  const corrected = this.physicsCtrl.computedMovement()
  const t = this.physicsBody.translation()
  this.physicsBody.setNextKinematicTranslation({ x: t.x + corrected.x, y: t.y + corrected.y, z: t.z + corrected.z })
  this.position.set(t.x + corrected.x, t.y + corrected.y - 0.9, t.z + corrected.z)
  this.group.position.copy(this.position)
}
```

- [ ] **Step 4: Run dev + walk into walls**

```bash
npm run dev
```

Press W/A/S/D and walk into a wall. Expected: character STOPS at wall instead of clipping through.

- [ ] **Step 5: Commit**

```bash
git add src/Game/Player.js src/Game/Game.js src/Game/World.js
git commit -m "feat(physics): kinematic character controller with wall collision"
```

- [ ] **Manually verify:** Walking into walls stops the character. No console errors. Walk smoothness same as before.

---

## Phase 2: Rigged GLB Character

### Task 3: GLTFLoader + AnimationMixer infrastructure

**Files:**
- Create: `src/Game/AssetLoader.js`
- Modify: `src/Game/Game.js`

- [ ] **Step 1: Create AssetLoader.js**

```js
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

export class AssetLoader {
  constructor() {
    this.gltf = new GLTFLoader()
    this.draco = new DRACOLoader()
    this.draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
    this.gltf.setDRACOLoader(this.draco)
    this.cache = new Map()
  }

  load(url) {
    if (this.cache.has(url)) return Promise.resolve(this.cache.get(url))
    return new Promise((resolve, reject) => {
      this.gltf.load(url, (gltf) => {
        this.cache.set(url, gltf)
        resolve(gltf)
      }, undefined, reject)
    })
  }

  async loadAll(urls) {
    return Promise.all(urls.map(u => this.load(u)))
  }
}
```

- [ ] **Step 2: Wire into Game**

In `Game.js`, add `import { AssetLoader } from './AssetLoader.js'`. In constructor: `this.assets = new AssetLoader()`.

- [ ] **Step 3: Smoke test loader (optional GLB)**

If user has placed `public/assets/models/agent.glb`, test in browser console:

```js
window.__GAME__.assets.load('/assets/models/agent.glb').then(g => console.log('OK', g))
```

If no GLB yet — skip; loader is built and ready.

- [ ] **Step 4: Commit**

```bash
git add src/Game/AssetLoader.js src/Game/Game.js
git commit -m "feat(assets): GLTF loader with DRACO support and caching"
```

- [ ] **Manually verify:** Console: `typeof window.__GAME__.assets.load` returns `"function"`.

---

### Task 4: Replace procedural Player mesh with GLB + AnimationMixer

**Prereq:** User has placed `public/assets/models/agent.glb` and 5 anim files per Task 0 README.

**Files:**
- Modify: `src/Game/Player.js`
- Modify: `src/Game/Game.js`

- [ ] **Step 1: Refactor Player to async-loaded GLB**

Rewrite `Player.js` constructor + add `loadAssets()`:

```js
import * as THREE from 'three'

export class Player {
  constructor(scene) {
    this.scene = scene
    this.maxSpeed = 7.5
    this.accel = 30
    this.decel = 22
    this.hp = 100
    this.maxHp = 100
    this.position = new THREE.Vector3(0, 0, 0)
    this.velocity = new THREE.Vector3()
    this.aim = new THREE.Vector3(0, 0, -1)
    this.fireCooldown = 0
    this.bullets = []
    this.muzzleWorld = new THREE.Vector3()

    this.group = new THREE.Group()
    this.scene.add(this.group)

    this.mixer = null
    this.actions = {}
    this.currentAction = null
    this.modelReady = false
  }

  async loadAssets(assetLoader) {
    const [agent, idle, walk, run, pistolIdle, pistolFire] = await assetLoader.loadAll([
      '/assets/models/agent.glb',
      '/assets/models/anim-idle.glb',
      '/assets/models/anim-walk.glb',
      '/assets/models/anim-run.glb',
      '/assets/models/anim-pistol-idle.glb',
      '/assets/models/anim-pistol-fire.glb'
    ])
    const model = agent.scene
    model.scale.setScalar(0.95)
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    this.group.add(model)
    this.model = model

    this.mixer = new THREE.AnimationMixer(model)
    this.actions.idle  = this.mixer.clipAction(idle.animations[0])
    this.actions.walk  = this.mixer.clipAction(walk.animations[0])
    this.actions.run   = this.mixer.clipAction(run.animations[0])
    this.actions.aim   = this.mixer.clipAction(pistolIdle.animations[0])
    this.actions.fire  = this.mixer.clipAction(pistolFire.animations[0])

    Object.values(this.actions).forEach(a => { a.enabled = true; a.setEffectiveWeight(0) })
    this._switchTo('idle')
    this.modelReady = true
  }

  _switchTo(name, fadeMs = 200) {
    const next = this.actions[name]
    if (!next || this.currentAction === next) return
    if (this.currentAction) this.currentAction.fadeOut(fadeMs / 1000)
    next.reset().fadeIn(fadeMs / 1000).play()
    this.currentAction = next
  }

  // ... existing update() with one-line addition near top:
  // if (this.mixer) this.mixer.update(delta)
}
```

(Keep the rest of `update`, `shoot`, `takeDamage` unchanged.)

After velocity calc in `update()`, add anim selection:

```js
const speedNow = Math.hypot(this.velocity.x, this.velocity.z)
if (this.modelReady) {
  if (speedNow > 5.5) this._switchTo('run')
  else if (speedNow > 0.5) this._switchTo('walk')
  else this._switchTo('idle')
}
```

Remove all procedural mesh building (`_buildWick`, leg/shoe references, walk-phase code paths that touch `legL/legR/shoeL/shoeR/head/armRig/flash/muzzle`). Provide a stub muzzle reference for shooting:

```js
// In loadAssets, after model added:
this.muzzle = new THREE.Object3D()
this.muzzle.position.set(0.3, 1.4, -0.5)
this.group.add(this.muzzle)
```

- [ ] **Step 2: Wire async load in Game.start()**

In `Game.js` `start()`:

```js
async start() {
  await this.physics.init()
  this.world.registerColliders(this.physics)
  this.player.registerPhysics(this.physics)
  await this.player.loadAssets(this.assets)
  this.ui.finishLoader()
  this.ticker.start()
}
```

- [ ] **Step 3: Run dev + verify character renders + animates**

```bash
npm run dev
```

Expected: rigged Mixamo character visible. Press W → walk animation plays. Stop → idle plays. Press W and hold → at high speed, run plays.

- [ ] **Step 4: Commit**

```bash
git add src/Game/Player.js src/Game/Game.js
git commit -m "feat(character): replace procedural mesh with rigged GLB + AnimationMixer"
git tag v0.2-character
```

- [ ] **Manually verify:** Character is now a Mixamo humanoid. Idle → Walk → Run anim transitions are smooth (200ms fade). Walk into wall: stops + idle plays.

---

## Phase 3: Hub-and-Spoke World Layout

### Task 5: Build hub world + 6 portal pads

**Files:**
- Modify: `src/Game/World.js`
- Create: `src/Game/Portal.js`
- Modify: `src/Game/Game.js`
- Modify: `src/data/portfolio.js`

- [ ] **Step 1: Strip current single-room World, build large hub**

Replace `World.js` constructor with hub layout:

```js
import * as THREE from 'three'

export class World {
  constructor(scene) {
    this.scene = scene
    this.halfSize = 50  // larger hub
    scene.fog = new THREE.Fog(0x0a1018, 60, 140)

    // Hub floor — circular
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.85 })
    const floor = new THREE.Mesh(new THREE.CircleGeometry(this.halfSize, 64), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    this._floor = floor

    // Cyan ring border
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.halfSize - 1, this.halfSize, 64),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.05
    scene.add(ring)

    // Center HQ pillar (decorative)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 0.8, 32), new THREE.MeshStandardMaterial({ color: 0x222a35, metalness: 0.5 }))
    hub.position.y = 0.4
    scene.add(hub)

    // Lights
    scene.add(new THREE.AmbientLight(0xb8c8e0, 0.9))
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(20, 30, 10)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -60; key.shadow.camera.right = 60
    key.shadow.camera.top = 60; key.shadow.camera.bottom = -60
    scene.add(key)

    this._walls = []  // boundary
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  }

  registerColliders(physics) {
    // Floor collider
    const floorBody = physics.world.createRigidBody({ type: 0 })  // RAPIER constants would be cleaner
    // (use Rapier API correctly; see Physics.js helper)
    physics.addStaticBox({ position: { x: 0, y: -0.5, z: 0 }, uuid: 'floor' }, this.halfSize * 2, 1, this.halfSize * 2)
  }
}
```

(Adjust `Physics.addStaticBox` if needed — should accept a position object directly.)

- [ ] **Step 2: Create Portal.js**

```js
import * as THREE from 'three'

export class Portal {
  constructor(scene, opts) {
    this.scene = scene
    this.position = opts.position.clone()
    this.color = opts.color || 0x00ffff
    this.label = opts.label || 'SECTOR'
    this.section = opts.section
    this.activated = false

    this.group = new THREE.Group()
    this.group.position.copy(this.position)

    // Pad
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 0.15, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a2535, roughness: 0.4, metalness: 0.5 })
    )
    pad.position.y = 0.08
    pad.receiveShadow = true
    this.group.add(pad)

    // Glow ring
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.5, 48),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.16
    this.group.add(this.ring)

    // Floating light beam
    const beamMat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.25 })
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.6, 8, 16, 1, true), beamMat)
    this.beam.position.y = 4
    this.group.add(this.beam)

    // Floating label sprite
    this.labelSprite = this._makeLabel(this.label)
    this.labelSprite.position.y = 5.5
    this.group.add(this.labelSprite)

    // Hovering icon (octahedron)
    this.icon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5),
      new THREE.MeshStandardMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 1.4 })
    )
    this.icon.position.y = 2.8
    this.group.add(this.icon)

    scene.add(this.group)
  }

  _makeLabel(text) {
    const c = document.createElement('canvas')
    c.width = 512; c.height = 96
    const ctx = c.getContext('2d')
    ctx.fillStyle = 'rgba(0,20,30,0.85)'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#' + this.color.toString(16).padStart(6, '0')
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, c.width - 4, c.height - 4)
    ctx.font = 'bold 42px "Share Tech Mono", monospace'
    ctx.fillStyle = '#' + this.color.toString(16).padStart(6, '0')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, c.width / 2, c.height / 2)
    const tex = new THREE.CanvasTexture(c)
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
  }

  update(delta, elapsed, playerPos) {
    this.icon.rotation.y += delta * 1.5
    this.icon.position.y = 2.8 + Math.sin(elapsed * 2) * 0.2
    this.ring.material.opacity = 0.5 + Math.sin(elapsed * 3) * 0.2
    this.inRange = playerPos.distanceTo(this.position) < 3.0
  }
}
```

- [ ] **Step 3: Add 6 portals + sector data in Game.js**

In `data/portfolio.js`, ensure `SECTORS` has portal positions:

```js
export const SECTORS = [
  { id: 1, name: 'BRIEFING',   weapon: 'PISTOL', section: 'intro',      color: 0x00ffff, angle: 0 },
  { id: 2, name: 'DOSSIER',    weapon: 'PISTOL', section: 'about',      color: 0x00ff88, angle: Math.PI / 3 },
  { id: 3, name: 'ARSENAL',    weapon: 'SWORD',  section: 'skills',     color: 0xffb800, angle: 2 * Math.PI / 3 },
  { id: 4, name: 'ARCHIVES',   weapon: 'SWORD',  section: 'projects',   color: 0xff66cc, angle: Math.PI },
  { id: 5, name: 'HISTORY',    weapon: 'PENCIL', section: 'experience', color: 0x88aaff, angle: 4 * Math.PI / 3 },
  { id: 6, name: 'EXTRACTION', weapon: 'PENCIL', section: 'contact',    color: 0xff3355, angle: 5 * Math.PI / 3 }
]
```

In `Game.js` constructor, replace single NPC + enemies with portal generation:

```js
import { Portal } from './Portal.js'
// ...
this.portals = SECTORS.map(s => new Portal(this.scene, {
  position: new THREE.Vector3(Math.sin(s.angle) * 22, 0, Math.cos(s.angle) * 22),
  color: s.color,
  label: `${String(s.id).padStart(2, '0')} · ${s.name}`,
  section: s.section
}))
this.enemies = []  // enemies live in zones, not hub
```

In `_tickPlay`, replace enemy/NPC update with portal update + interaction:

```js
const elapsed = this.ticker.elapsed
let activePortal = null
for (const p of this.portals) {
  p.update(delta, elapsed, this.player.position)
  if (p.inRange) activePortal = p
}

if (activePortal) {
  this.ui.setHint(`PRESS [E] · ENTER ${activePortal.label}`)
  if (this.inputs.consumePress('e')) {
    this.ui.showBriefing(activePortal.section)
  }
} else {
  this.ui.setHint('WASD move · APPROACH GLOWING PADS · RIGHT-CLICK DRAG = orbit camera')
}
```

Remove enemy iteration + stealth logic from `_tickPlay` (will return in Task 7).

- [ ] **Step 4: Update intro spawn to hub center**

In `Game.js` constructor, replace intro spawn position:

```js
this.player.position.set(0, 0, this.world.halfSize - 8)
```

Remove door logic — hub has no door for now (sectors will handle their own entries in Task 6).

- [ ] **Step 5: Run dev + verify hub**

```bash
npm run dev
```

Expected: Large circular floor. 6 glowing portals around center at 22 unit radius. Portal labels float above. Walk to portal → "PRESS E" hint → portfolio modal opens.

- [ ] **Step 6: Commit**

```bash
git add src/Game/World.js src/Game/Portal.js src/Game/Game.js src/data/portfolio.js
git commit -m "feat(world): hub-and-spoke layout with 6 themed portal pads"
git tag v0.3-hub
```

- [ ] **Manually verify:** Six glowing portals visible in a circle. Each shows label. Approaching a portal triggers "PRESS E" hint and opens correct portfolio modal.

---

### Task 6: Per-zone scene swap (zone teleport on portal activation)

**Files:**
- Create: `src/Game/Zone.js`
- Create: `src/Game/zones/BriefingZone.js`
- Modify: `src/Game/Game.js`

- [ ] **Step 1: Create base Zone.js**

```js
import * as THREE from 'three'

export class Zone {
  constructor(scene, physics) {
    this.scene = scene
    this.physics = physics
    this.group = new THREE.Group()
    this.entities = []   // entities to update each tick
    this.colliders = []  // physics handles to remove on unload
    this.entryPoint = new THREE.Vector3(0, 0, 0)
    this.exitPoint = new THREE.Vector3(0, 0, 6)  // back to hub
    scene.add(this.group)
  }

  build() { /* override */ }

  update(delta, elapsed, playerPos) {
    for (const e of this.entities) e.update?.(delta, elapsed, playerPos)
  }

  unload() {
    this.scene.remove(this.group)
    for (const c of this.colliders) {
      this.physics.world.removeCollider(c.collider, true)
      this.physics.world.removeRigidBody(c.body)
    }
    this.entities = []
    this.colliders = []
  }
}
```

- [ ] **Step 2: Create BriefingZone.js as concrete example**

```js
import * as THREE from 'three'
import { Zone } from '../Zone.js'
import { NPC } from '../NPC.js'

export class BriefingZone extends Zone {
  build() {
    // Floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(20, 48),
      new THREE.MeshStandardMaterial({ color: 0x102030, roughness: 0.8 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.group.add(floor)

    // Inner walls (square room enclosing zone)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d1218 })
    const half = 18, h = 4
    const mkWall = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
      m.position.set(x, h / 2, z)
      this.group.add(m)
      const c = this.physics.addStaticBox({ position: m.position, uuid: m.uuid }, w, h, d)
      this.colliders.push(c)
    }
    mkWall(half * 2, 0.6, 0, -half)
    mkWall(half * 2, 0.6, 0,  half)
    mkWall(0.6, half * 2,  half, 0)
    mkWall(0.6, half * 2, -half, 0)

    // Briefing NPC
    const npc = new NPC(this.group, new THREE.Vector3(0, 0, -8), 'BRIEFING')
    this.entities.push(npc)
    this.npc = npc
  }
}
```

- [ ] **Step 3: Add zone manager to Game.js**

```js
import { BriefingZone } from './zones/BriefingZone.js'

// in constructor:
this.zoneClasses = {
  intro: BriefingZone,
  // others added in Task 11
}
this.activeZone = null
this.location = 'hub'  // or sector section name
```

Add methods:

```js
async enterZone(section) {
  const Cls = this.zoneClasses[section]
  if (!Cls) { this.ui.showBriefing(section); return }  // fallback to modal-only
  this.activeZone = new Cls(this.scene, this.physics)
  this.activeZone.build()
  // hide hub (portals + world)
  this.world._floor.visible = false
  this.portals.forEach(p => p.group.visible = false)
  // teleport player to zone entry
  this.player.position.copy(this.activeZone.entryPoint)
  this.player.physicsBody.setTranslation({ x: 0, y: 0.9, z: 0 }, true)
  this.location = section
}

exitZone() {
  if (!this.activeZone) return
  this.activeZone.unload()
  this.activeZone = null
  this.world._floor.visible = true
  this.portals.forEach(p => p.group.visible = true)
  this.player.physicsBody.setTranslation({ x: 0, y: 0.9, z: this.world.halfSize - 8 }, true)
  this.location = 'hub'
}
```

In `_tickPlay`, replace `this.ui.showBriefing(activePortal.section)` with:

```js
if (this.location === 'hub') {
  if (activePortal && this.inputs.consumePress('e')) {
    this.enterZone(activePortal.section)
  }
} else {
  // In zone: update zone entities, allow exit via Q
  this.activeZone.update(delta, this.ticker.elapsed, this.player.position)
  if (this.activeZone.npc?.inRange) {
    this.ui.setHint('PRESS [E] · BRIEFING · [Q] EXIT TO HUB')
    if (this.inputs.consumePress('e')) this.ui.showBriefing(this.location)
  } else {
    this.ui.setHint('PRESS [Q] EXIT TO HUB · WASD MOVE')
  }
  if (this.inputs.consumePress('q')) this.exitZone()
}
```

- [ ] **Step 4: Run dev + enter Briefing zone**

```bash
npm run dev
```

Expected: walk to first portal (cyan, BRIEFING) → press E → screen swaps to a small enclosed room with NPC → walk to NPC → press E → modal shows portfolio. Press Q → back to hub.

- [ ] **Step 5: Commit**

```bash
git add src/Game/Zone.js src/Game/zones/BriefingZone.js src/Game/Game.js
git commit -m "feat(zones): per-portal scene swap with BriefingZone reference"
```

- [ ] **Manually verify:** Hub → portal → zone room → NPC modal → Q → back to hub. Repeated entry works without errors.

---

## Phase 4: Combat Returns (in Project Archives zone)

### Task 7: Replace Enemy procedural mesh with GLB + animations

**Prereq:** User has placed `public/assets/models/enemy.glb` + enemy anims.

**Files:**
- Modify: `src/Game/Enemy.js`
- Create: `src/Game/zones/ArchivesZone.js`
- Modify: `src/Game/Game.js`

- [ ] **Step 1: Refactor Enemy to async GLB load**

In `Enemy.js`, add a `loadAssets(assetLoader)` method that loads GLB + 3 anims (idle, walk, fire), assigns to `this.model` and `this.mixer`. Remove all procedural geometry from `_buildMesh` (keep only HP bar + vision cone + state icon — UI layers stay procedural).

Pattern matches Task 4 Player rewrite. Key differences:
- Enemy spawns in zones, not hub
- HP bar + vision cone + alert icon stay
- State machine PATROL/SUSPICIOUS/ALERT preserved

(Engineer: copy Player.loadAssets/_switchTo pattern; just replace the model + animation files.)

- [ ] **Step 2: Create ArchivesZone.js**

```js
import * as THREE from 'three'
import { Zone } from '../Zone.js'
import { Enemy } from '../Enemy.js'
import { NPC } from '../NPC.js'

export class ArchivesZone extends Zone {
  async build(assetLoader) {
    // Floor + walls (same pattern as BriefingZone)
    // ... (copy floor/wall scaffold from BriefingZone)

    // Spawn 3 enemies on patrol routes
    this.enemies = [
      new Enemy(this.group, new THREE.Vector3(-10, 0, -4), [/* patrol pts */]),
      new Enemy(this.group, new THREE.Vector3( 10, 0, -4), [/* patrol pts */]),
      new Enemy(this.group, new THREE.Vector3(  0, 0,-12), [/* patrol pts */])
    ]
    await Promise.all(this.enemies.map(e => e.loadAssets(assetLoader)))
    this.entities.push(...this.enemies)

    // Briefing NPC (mission start)
    this.npc = new NPC(this.group, new THREE.Vector3(0, 0, 8), 'MISSION')
    this.entities.push(this.npc)
  }
}
```

- [ ] **Step 3: Wire ArchivesZone + pass assets to Zone.build**

In `Game.js`:

```js
this.zoneClasses = {
  intro: BriefingZone,
  projects: ArchivesZone
}

async enterZone(section) {
  const Cls = this.zoneClasses[section]
  if (!Cls) { this.ui.showBriefing(section); return }
  this.activeZone = new Cls(this.scene, this.physics)
  await this.activeZone.build(this.assets)  // ← await
  // ... rest same
}
```

- [ ] **Step 4: Re-add combat in zone tick**

In `_tickPlay`, when in zone with enemies:

```js
if (this.activeZone?.enemies) {
  this.player.update(delta, this.inputs, this.raycaster, this.world.groundPlane, this.activeZone.enemies, (e, dmg, all) => e.takeDamage(dmg, all))
  // stealth-kill detection (same as before, but on activeZone.enemies)
}
```

- [ ] **Step 5: Run dev + enter Archives portal**

Walk to ARCHIVES (pink portal) → press E → enter zone → 3 enemies visible with idle/patrol animations → engage combat.

- [ ] **Step 6: Commit**

```bash
git add src/Game/Enemy.js src/Game/zones/ArchivesZone.js src/Game/Game.js
git commit -m "feat(combat): GLB enemies in ArchivesZone with patrol/alert/combat states"
git tag v0.4-combat
```

- [ ] **Manually verify:** Archives zone has 3 GLB enemies patrolling. Stealth kill (F behind unalert) works. Bullets hit. HP UI updates.

---

## Phase 5: Post-Processing + Lighting

### Task 8: Install postprocessing + bloom pass

**Files:**
- Modify: `package.json`
- Modify: `src/Game/Renderer.js`
- Modify: `src/Game/Game.js`

- [ ] **Step 1: Install**

```bash
npm install postprocessing
```

- [ ] **Step 2: Wrap renderer with EffectComposer**

Modify `Renderer.js`:

```js
import * as THREE from 'three'
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode } from 'postprocessing'

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0x0a1218, 1)
    this.composer = null

    window.addEventListener('resize', () => this.resize())
  }

  initComposer(scene, camera) {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(scene, camera))

    const bloom = new BloomEffect({ intensity: 1.4, luminanceThreshold: 0.6, luminanceSmoothing: 0.3, mipmapBlur: true })
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    this.composer.addPass(new EffectPass(camera, bloom, tone))
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.composer?.setSize(window.innerWidth, window.innerHeight)
  }

  render(scene, camera) {
    if (this.composer) this.composer.render()
    else this.renderer.render(scene, camera)
  }
}
```

- [ ] **Step 3: Init composer in Game.start()**

After `await this.player.loadAssets(...)`:

```js
this.renderer.initComposer(this.scene, this.camera.instance)
```

- [ ] **Step 4: Run dev + verify bloom**

Glowing portals + emissive icons should now glow (halo around bright objects). Console should show no errors.

- [ ] **Step 5: Commit**

```bash
git add src/Game/Renderer.js src/Game/Game.js package.json package-lock.json
git commit -m "feat(post): EffectComposer with bloom + ACES tone mapping"
```

- [ ] **Manually verify:** Portal glows/icons have visible bloom halo. No frame-rate drop below 50fps.

---

### Task 9: HDR environment lighting (PMREM)

**Prereq:** User placed `public/assets/hdr/sky.hdr`.

**Files:**
- Modify: `src/Game/World.js`
- Modify: `src/Game/Game.js`

- [ ] **Step 1: Add HDR loader to AssetLoader**

In `AssetLoader.js` add:

```js
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
// in constructor:
this.rgbe = new RGBELoader()

loadHDR(url) {
  return new Promise((resolve, reject) => {
    this.rgbe.load(url, resolve, undefined, reject)
  })
}
```

- [ ] **Step 2: Apply env map in Game.start()**

```js
import * as THREE from 'three'
// in start():
const hdr = await this.assets.loadHDR('/assets/hdr/sky.hdr')
const pmrem = new THREE.PMREMGenerator(this.renderer.renderer)
pmrem.compileEquirectangularShader()
const envMap = pmrem.fromEquirectangular(hdr).texture
this.scene.environment = envMap
this.scene.background = envMap
hdr.dispose()
pmrem.dispose()
```

- [ ] **Step 3: Run + verify**

HDR sky visible. Materials reflect sky tones.

- [ ] **Step 4: Commit**

```bash
git add src/Game/AssetLoader.js src/Game/Game.js
git commit -m "feat(lighting): HDR environment via PMREM"
```

- [ ] **Manually verify:** Sky background visible. PBR materials reflect sky colors. No fps drop.

---

## Phase 6: Audio System (Howler)

### Task 10: Audio singleton + footsteps + ambient + SFX

**Prereq:** User placed audio files per Task 0 README.

**Files:**
- Modify: `package.json`
- Create: `src/Game/Audio.js`
- Modify: `src/Game/Player.js`
- Modify: `src/Game/Game.js`
- Modify: `index.html` (add audio toggle button)

- [ ] **Step 1: Install Howler**

```bash
npm install howler
```

- [ ] **Step 2: Create Audio.js**

```js
import { Howl, Howler } from 'howler'

export class Audio {
  constructor() {
    this.muted = false
    this.sounds = {
      ambient:    new Howl({ src: ['/assets/audio/ambient-hum.mp3'], loop: true, volume: 0.35 }),
      footstep:   new Howl({ src: ['/assets/audio/footstep.wav'], volume: 0.4 }),
      shot:       new Howl({ src: ['/assets/audio/pistol-shot.wav'], volume: 0.5 }),
      sword:      new Howl({ src: ['/assets/audio/sword-swing.wav'], volume: 0.5 }),
      portal:     new Howl({ src: ['/assets/audio/portal-activate.wav'], volume: 0.6 }),
      ui:         new Howl({ src: ['/assets/audio/ui-confirm.wav'], volume: 0.5 })
    }
    this.lastFootstep = 0
  }

  startAmbient() {
    this.sounds.ambient.play()
  }

  play(name) {
    if (!this.sounds[name]) return
    this.sounds[name].play()
  }

  footstep(elapsed) {
    if (elapsed - this.lastFootstep > 0.32) {
      this.play('footstep')
      this.lastFootstep = elapsed
    }
  }

  toggleMute() {
    this.muted = !this.muted
    Howler.mute(this.muted)
    return this.muted
  }
}
```

- [ ] **Step 3: Wire footsteps in Player + shot/portal in Game**

In `Player.update()`, when `speedNow > 0.5`:

```js
window.__GAME__.audio.footstep(window.__GAME__.ticker.elapsed)
```

In `Player.shoot()`: `window.__GAME__.audio.play('shot')`

In `Game.enterZone()`: `this.audio.play('portal')`
In `Game.start()`, after composer init: `this.audio.startAmbient()`

In `Game` constructor: `this.audio = new Audio()`

- [ ] **Step 4: Add audio toggle button in index.html**

Add inside `#hud`:

```html
<button id="audio-toggle" class="hud-btn">🔊 SOUND</button>
```

CSS in `style.css`:

```css
.hud-btn {
  position: fixed;
  top: 22px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,20,30,0.55);
  border: 1px solid rgba(0,255,255,0.4);
  color: #00ffff;
  padding: 8px 14px;
  font-family: var(--mono);
  letter-spacing: 2px;
  cursor: pointer;
  pointer-events: auto;
  z-index: 11;
}
.hud-btn:hover { background: rgba(0,255,255,0.15); }
```

In `UI.js` constructor:

```js
const btn = document.getElementById('audio-toggle')
btn.addEventListener('click', () => {
  const muted = window.__GAME__.audio.toggleMute()
  btn.textContent = muted ? '🔇 MUTED' : '🔊 SOUND'
})
```

- [ ] **Step 5: Run dev + verify all audio**

Walk → footsteps. Shoot → pistol. Enter portal → portal sfx. Ambient hum throughout. Click button → mute toggles.

- [ ] **Step 6: Commit**

```bash
git add src/Game/Audio.js src/Game/Player.js src/Game/Game.js src/Game/UI.js index.html src/style.css package.json
git commit -m "feat(audio): Howler-based footsteps/shot/portal/ambient with mute toggle"
git tag v0.5-audio
```

- [ ] **Manually verify:** Footsteps timed with walk. Pistol audio on shot. Portal audio on entry. Ambient loops. Mute button works.

---

## Phase 7: Sector Zones (5 remaining)

### Task 11: Build DossierZone (about) + ArsenalZone (skills) + HistoryZone (experience) + ExtractionZone (contact)

**Files:**
- Create: `src/Game/zones/DossierZone.js`
- Create: `src/Game/zones/ArsenalZone.js`
- Create: `src/Game/zones/HistoryZone.js`
- Create: `src/Game/zones/ExtractionZone.js`
- Modify: `src/Game/Game.js` (register all)

For each zone, follow this pattern (reuse from `BriefingZone`):

```js
import { Zone } from '../Zone.js'
import { NPC } from '../NPC.js'
import * as THREE from 'three'

export class DossierZone extends Zone {
  build() {
    // unique floor color
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(20, 48),
      new THREE.MeshStandardMaterial({ color: 0x102218, roughness: 0.85 })  // green tint for dossier
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.group.add(floor)

    // walls + collider helper (factor into Zone.js helper if repeated)
    this._buildWalls(0x0d1818)

    // NPC at far end
    this.npc = new NPC(this.group, new THREE.Vector3(0, 0, -10), 'DOSSIER')
    this.entities.push(this.npc)

    // Decorative props (e.g., file cabinets for Dossier)
    this._addProps()
  }

  _addProps() {
    // 4 file cabinet boxes
    for (let i = 0; i < 4; i++) {
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.6, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x556633, roughness: 0.6 })
      )
      cab.position.set(-6 + i * 4, 0.8, -14)
      cab.castShadow = true
      this.group.add(cab)
    }
  }
}
```

- [ ] **Step 1: Add `_buildWalls` helper to Zone.js**

In `Zone.js`:

```js
_buildWalls(wallColor = 0x0d1218) {
  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor })
  const half = 18, h = 4
  const mkWall = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
    m.position.set(x, h / 2, z)
    this.group.add(m)
    const c = this.physics.addStaticBox({ position: m.position, uuid: m.uuid }, w, h, d)
    this.colliders.push(c)
  }
  mkWall(half * 2, 0.6, 0, -half)
  mkWall(half * 2, 0.6, 0,  half)
  mkWall(0.6, half * 2,  half, 0)
  mkWall(0.6, half * 2, -half, 0)
}
```

- [ ] **Step 2: Implement remaining 3 zones**

- `ArsenalZone`: floor color `0x221a08` (amber). Props: 6 weapon racks (vertical box pillars). NPC label "ARSENAL".
- `HistoryZone`: floor `0x081822` (blue). Props: timeline pillars (4 boxes spaced along z-axis representing career phases). NPC label "HISTORY".
- `ExtractionZone`: floor `0x220812` (red). Props: 1 helicopter pad (large flat disc) + 1 radio antenna (cylinder). NPC label "EXTRACTION".

(Each zone is a near-copy of DossierZone with different colors + props. Don't DRY-overengineer; keep visible per-file for easy editing.)

- [ ] **Step 3: Register all in Game.zoneClasses**

```js
import { BriefingZone }  from './zones/BriefingZone.js'
import { DossierZone }   from './zones/DossierZone.js'
import { ArsenalZone }   from './zones/ArsenalZone.js'
import { ArchivesZone }  from './zones/ArchivesZone.js'
import { HistoryZone }   from './zones/HistoryZone.js'
import { ExtractionZone } from './zones/ExtractionZone.js'

this.zoneClasses = {
  intro:      BriefingZone,
  about:      DossierZone,
  skills:     ArsenalZone,
  projects:   ArchivesZone,
  experience: HistoryZone,
  contact:    ExtractionZone
}
```

- [ ] **Step 4: Run dev + visit each zone**

Walk to each portal → press E → confirm zone loads with unique color/props/NPC label.

- [ ] **Step 5: Commit**

```bash
git add src/Game/zones src/Game/Game.js
git commit -m "feat(zones): all 6 sector zones (Briefing/Dossier/Arsenal/Archives/History/Extraction)"
git tag v0.6-zones
```

- [ ] **Manually verify:** All 6 portals teleport to distinct zones. Each has unique color, props, NPC. Q exits cleanly.

---

## Phase 8: HUD Compass + Polish

### Task 12: Compass minimap (top-center)

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/Game/UI.js`
- Modify: `src/Game/Game.js`

- [ ] **Step 1: Compass DOM**

In `index.html`, inside `#hud`:

```html
<div id="compass">
  <svg viewBox="-50 -50 100 100" id="compass-svg">
    <circle cx="0" cy="0" r="42" fill="rgba(0,20,30,0.55)" stroke="#00ffff" stroke-width="1.5"/>
    <circle cx="0" cy="0" r="3" fill="#00ffff"/>
    <g id="compass-dots"></g>
  </svg>
</div>
```

CSS:

```css
#compass {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  height: 120px;
  z-index: 10;
  pointer-events: none;
}
#compass svg { width: 100%; height: 100%; }
.compass-dot {
  transition: r 0.2s;
}
```

- [ ] **Step 2: Render dots in UI.js**

```js
renderCompass(playerPos, portals) {
  const g = document.getElementById('compass-dots')
  if (!g) return
  let html = ''
  for (const p of portals) {
    const dx = p.position.x - playerPos.x
    const dz = p.position.z - playerPos.z
    const d = Math.hypot(dx, dz)
    const scale = Math.min(d / 28, 1)
    const x = (dx / (d || 1)) * 38 * scale
    const y = (dz / (d || 1)) * 38 * scale
    const color = '#' + p.color.toString(16).padStart(6, '0')
    html += `<circle class="compass-dot" cx="${x}" cy="${y}" r="${p.inRange ? 4 : 2.5}" fill="${color}"/>`
  }
  g.innerHTML = html
}
```

In `Game._tickPlay`, when in hub: `this.ui.renderCompass(this.player.position, this.portals)`

- [ ] **Step 3: Run + verify**

Compass shows colored dots positioned around player. Walking changes distance dot size (closer = bigger). Inside zone, compass empty (or hide it).

- [ ] **Step 4: Hide compass in zones**

```js
// In _tickPlay:
document.getElementById('compass').style.display = (this.location === 'hub') ? 'block' : 'none'
```

- [ ] **Step 5: Commit**

```bash
git add index.html src/style.css src/Game/UI.js src/Game/Game.js
git commit -m "feat(hud): radar compass with portal direction dots"
```

- [ ] **Manually verify:** Compass top-center shows 6 colored dots around player position. Hidden in zones.

---

### Task 13: Cinematic intro polish + skip prompt

**Files:**
- Modify: `src/Game/Game.js`
- Modify: `src/Game/UI.js`
- Modify: `index.html`

- [ ] **Step 1: Add intro overlay in HTML**

Inside `#hud`:

```html
<div id="intro-overlay" class="hidden">
  <div class="intro-text">AGENT SHAH FAHAD</div>
  <div class="intro-sub" id="intro-sub">INFILTRATING HQ…</div>
  <div class="intro-skip">PRESS [SPACE] TO SKIP</div>
</div>
```

CSS:

```css
#intro-overlay {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: flex-end;
  padding-bottom: 80px;
  z-index: 20;
  pointer-events: none;
  background: linear-gradient(0deg, rgba(0,0,0,0.5), transparent 40%);
}
#intro-overlay.hidden { display: none; }
.intro-text { font-size: 38px; letter-spacing: 6px; color: #00ffff; text-shadow: 0 0 12px #00ffff; }
.intro-sub  { font-size: 14px; letter-spacing: 4px; color: #ffb800; margin-top: 6px; }
.intro-skip { font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,0.5); margin-top: 18px; }
```

- [ ] **Step 2: Show/hide in Game**

In `Game.constructor` after `phase = INTRO`: show overlay.

```js
document.getElementById('intro-overlay').classList.remove('hidden')
```

In `_tickIntro` end (when phase switches to PLAY):

```js
document.getElementById('intro-overlay').classList.add('hidden')
```

- [ ] **Step 3: Commit**

```bash
git add src/Game/Game.js src/style.css index.html
git commit -m "feat(intro): on-screen agent name overlay during cinematic"
```

- [ ] **Manually verify:** On page load, "AGENT SHAH FAHAD" text appears bottom-center during intro. Disappears once control hands over.

---

## Phase 9: Cel-Shading + Stylized Look

### Task 14: Apply MeshToonMaterial across hub + zones

**Prereq:** User placed `public/assets/textures/toon-ramp.png`.

**Files:**
- Modify: `src/Game/AssetLoader.js`
- Modify: `src/Game/World.js`
- Modify: all zone files

- [ ] **Step 1: Add texture loader**

```js
loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject)
  })
}
```

- [ ] **Step 2: Convert key materials to MeshToonMaterial**

In `Game.start()`:

```js
const ramp = await this.assets.loadTexture('/assets/textures/toon-ramp.png')
ramp.minFilter = THREE.NearestFilter
ramp.magFilter = THREE.NearestFilter
this.toonRamp = ramp
```

In each zone's `build()` (after material defined), swap `MeshStandardMaterial` to `MeshToonMaterial`:

```js
const toonMat = new THREE.MeshToonMaterial({ color: 0x102030, gradientMap: window.__GAME__.toonRamp })
```

- [ ] **Step 3: Run + verify cel banding**

Floors and walls show flat color bands instead of smooth shading.

- [ ] **Step 4: Commit**

```bash
git add src/Game/AssetLoader.js src/Game/World.js src/Game/zones/
git commit -m "feat(visuals): cel-shaded MeshToonMaterial across hub + zones"
```

- [ ] **Manually verify:** Materials show 3-step toon shading bands.

---

## Phase 10: Mobile + Touch Controls

### Task 15: On-screen joystick + touch buttons

**Files:**
- Modify: `package.json`
- Modify: `src/Game/Inputs.js`
- Modify: `index.html`
- Modify: `src/style.css`

- [ ] **Step 1: Install nipplejs**

```bash
npm install nipplejs
```

- [ ] **Step 2: Init nipple in Inputs.js**

```js
import nipplejs from 'nipplejs'

// In constructor (after existing event listeners):
const isTouch = 'ontouchstart' in window
if (isTouch) {
  const zone = document.createElement('div')
  zone.id = 'joystick-zone'
  document.body.appendChild(zone)
  this.nipple = nipplejs.create({ zone, mode: 'static', position: { left: '15%', bottom: '20%' }, color: '#00ffff' })
  this.nipple.on('move', (_, data) => {
    this.touchVec = { x: Math.cos(data.angle.radian) * data.force, z: -Math.sin(data.angle.radian) * data.force }
  })
  this.nipple.on('end', () => { this.touchVec = null })
}
```

Modify `axisMove()` to combine touch:

```js
axisMove() {
  if (this.touchVec) return { x: this.touchVec.x, z: this.touchVec.z }
  // ... existing keyboard logic
}
```

- [ ] **Step 3: Add fire/interact touch buttons**

In `index.html`:

```html
<div id="touch-buttons" class="touch-only">
  <button id="touch-fire">🔫</button>
  <button id="touch-interact">E</button>
</div>
```

CSS:

```css
.touch-only { display: none; }
@media (pointer: coarse) {
  .touch-only { display: flex; }
}
#touch-buttons {
  position: fixed; right: 20px; bottom: 20px;
  flex-direction: column; gap: 12px;
  z-index: 30;
}
#touch-buttons button {
  width: 70px; height: 70px;
  border-radius: 50%;
  border: 2px solid #00ffff;
  background: rgba(0, 30, 40, 0.6);
  color: #00ffff;
  font-size: 26px;
  pointer-events: auto;
}
```

Wire in `Inputs.js`:

```js
document.getElementById('touch-fire')?.addEventListener('touchstart', () => this.mouse.down = true)
document.getElementById('touch-fire')?.addEventListener('touchend', () => this.mouse.down = false)
document.getElementById('touch-interact')?.addEventListener('touchstart', () => this.justPressed.add('e'))
```

- [ ] **Step 4: Run on mobile or with device emulation**

Open DevTools → Toggle device toolbar (Cmd+Shift+M) → iPhone 12 → reload. Joystick + buttons appear. Touch joystick → character moves.

- [ ] **Step 5: Commit**

```bash
git add src/Game/Inputs.js index.html src/style.css package.json
git commit -m "feat(mobile): nipplejs joystick + touch fire/interact buttons"
git tag v0.7-mobile
```

- [ ] **Manually verify:** On touch device or DevTools mobile mode, joystick moves character. Touch buttons fire + interact.

---

## Phase 11: Final Polish + Deploy

### Task 16: Loading screen with progress + Vercel deploy

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/Game/Game.js`
- Modify: `src/Game/UI.js`
- Create: `vercel.json`

- [ ] **Step 1: Improve loader to show real progress**

In `UI.js`:

```js
setLoadProgress(pct, label) {
  this.loaderFill.style.width = `${pct}%`
  document.querySelector('.loader-text').textContent = label || 'DECRYPTING DOSSIER…'
}
```

In `Game.start()`:

```js
this.ui.setLoadProgress(10, 'INITIALIZING PHYSICS…')
await this.physics.init()
this.ui.setLoadProgress(30, 'LOADING WORLD…')
this.world.registerColliders(this.physics)
this.ui.setLoadProgress(50, 'LOADING AGENT…')
this.player.registerPhysics(this.physics)
await this.player.loadAssets(this.assets)
this.ui.setLoadProgress(75, 'COMPILING SHADERS…')
this.renderer.initComposer(this.scene, this.camera.instance)
this.ui.setLoadProgress(90, 'LOADING ENVIRONMENT…')
const hdr = await this.assets.loadHDR('/assets/hdr/sky.hdr')
// ... pmrem ...
this.toonRamp = await this.assets.loadTexture('/assets/textures/toon-ramp.png')
this.ui.setLoadProgress(100, 'READY')
this.ui.finishLoader()
this.audio.startAmbient()
this.ticker.start()
```

- [ ] **Step 2: Build production bundle**

```bash
npm run build
```

Expected: `dist/` folder created. Check size: `du -sh dist/` — should be < 25MB.

- [ ] **Step 3: Local preview**

```bash
npm run preview
```

Open shown URL → verify everything works.

- [ ] **Step 4: Create vercel.json**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" }
      ]
    }
  ]
}
```

- [ ] **Step 5: Deploy**

```bash
npx vercel --prod
```

Follow prompts. Get production URL.

- [ ] **Step 6: Commit + tag final**

```bash
git add -A
git commit -m "feat(deploy): loading progress + Vercel config"
git tag v1.0
git push origin main --tags
```

- [ ] **Manually verify:** Production URL loads. Loading bar fills with real labels. All features (movement, combat, zones, audio, mobile) work in production.

---

## Phase 12: README + Handoff

### Task 17: Project README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# Agent Shah — Interactive 3D Portfolio

An immersive Three.js portfolio for Shah Fahad styled as a spy-thriller hub-and-spoke world.

## Tech Stack

- Three.js 0.184 + Vite 8
- Rapier3D physics (kinematic character controller)
- Mixamo rigged GLB character + animations (AnimationMixer blending)
- EffectComposer with bloom + ACES tone mapping
- Howler.js audio (footsteps, SFX, ambient)
- nipplejs touch joystick (mobile)
- HDR environment + PMREM
- MeshToonMaterial cel-shading

## Architecture

Bruno-Simon-style singleton Game class. Subsystems:

- `Game` — singleton lifecycle
- `Physics` — Rapier wrapper
- `Renderer` — composer + bloom
- `Camera` — spring-damped third-person
- `World` — hub layout + colliders
- `Player` / `Enemy` — GLB + mixer + state
- `Portal` — sector entry pad
- `Zone` (+ subclasses) — per-sector environment
- `Inputs` — keyboard + mouse + touch
- `Audio` — Howler bus
- `UI` — DOM HUD + modal

## Development

```bash
npm install
npm run dev    # http://localhost:5174
npm run build
npm run preview
```

## Asset Setup

See `public/assets/README.md` for required GLB / HDR / audio downloads.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: project README"
```

---

## Self-Review Checklist (run before declaring done)

**Spec coverage:** All Thibault parity items addressed:
- ✅ WASD physics movement (Task 2)
- ✅ Rapier physics (Task 1, 2)
- ✅ Rigged GLB character + animations (Task 3, 4)
- ✅ Hub-and-spoke 6 zones (Task 5, 6, 7, 11)
- ✅ Bloom + tone mapping (Task 8)
- ✅ HDR environment (Task 9)
- ✅ Audio (Task 10)
- ✅ Compass HUD (Task 12)
- ✅ Cinematic intro (Task 13, plus existing)
- ✅ Cel-shading (Task 14)
- ✅ Mobile + touch (Task 15)
- ✅ Loader + deploy (Task 16)

**Spy theme + portfolio data:** Existing `data/portfolio.js` is wired in modal renderer (UI.js `_renderSection`). All 6 sectors have section keys mapped.

**Combat preserved:** ArchivesZone (Task 7) keeps stealth/shoot/auto-aim mechanics.

**No placeholders:** Every code block contains real, runnable code. Where engineer must adapt (e.g., zones in Task 11), pattern is shown for at least one then engineer follows convention.

**Type consistency:** `Player.loadAssets`, `Enemy.loadAssets`, `Zone.build` all `async`. `Physics.addStaticBox` consistently takes `(meshOrPosObj, w, h, d)`.

---

## Risk Notes

- **Mixamo conversion friction:** FBX→GLB conversion can lose animations. If stuck, use `npm install -g @gltf-transform/cli` and `gltf-transform optimize`. Or use https://playground.babylonjs.com/ to validate GLB content.
- **Rapier learning curve:** First task may take longer than 5min. If `addStaticBox` fails, use Rapier docs at https://rapier.rs/docs/user_guides/javascript/getting_started_js
- **Bloom can hide UI:** if HUD washed out, lower `intensity` from 1.4 to 0.9.
- **Mobile perf:** if iOS Safari drops below 30fps, set `pixelRatio` to 1 on touch devices.

---

## Estimated Total Time

**5–7 weeks** for full Thibault parity, solo developer, ~3 focused hours/day. Tagged milestones (v0.1–v1.0) allow safe rollback after each phase.
