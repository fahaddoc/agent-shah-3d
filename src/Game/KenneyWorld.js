import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// EXAMPLE: Kenney modular stage loader.
//
// HOW TO USE:
// 1. Download a free Kenney pack from https://kenney.nl/assets
//    Recommended for this game: "City Kit (Roads)" or "Tower Defense Kit"
//    Both are CC0 (free, no attribution required).
// 2. Unzip into  /public/assets/kenney/
//    You should end up with .glb files inside that folder, e.g.:
//      /public/assets/kenney/floor_tile_large.glb
//      /public/assets/kenney/wall.glb
//      /public/assets/kenney/wall_corner.glb
//      /public/assets/kenney/barrel.glb
//      /public/assets/kenney/crate.glb
// 3. In src/Game/Game.js, replace:
//       import { World } from './World.js'
//    with:
//       import { KenneyWorld as World } from './KenneyWorld.js'
//
// The class exposes the same public surface as World.js
// (halfSize, doorOpen, isInsideWall, registerColliders, setDoorOpen,
//  spawnHitImpact, spawnWallImpact, updateImpacts, groundPlane)
// so it's a drop-in replacement.

const KENNEY_BASE = '/assets/kenney'
// Wired for Kenney "City Kit (Roads)" pack — drop-in compatible.
// Swap filenames here if you change to a different pack.
const PIECES = {
  floor:   `${KENNEY_BASE}/road-square.glb`,         // open road square — used as floor tile
  wall:    `${KENNEY_BASE}/construction-barrier.glb`, // perimeter wall
  corner:  `${KENNEY_BASE}/construction-light.glb`,   // corner accent
  barrel:  `${KENNEY_BASE}/construction-cone.glb`,    // prop A
  crate:   `${KENNEY_BASE}/light-square.glb`,         // prop B (street light)
}

export class KenneyWorld {
  constructor(scene) {
    this.scene = scene
    this.halfSize = 24
    this.doorOpen = 0
    this.doorWidth = 4
    this._walls = []
    this._impacts = []
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

    // Lights — same as default World for consistent look
    scene.add(new THREE.AmbientLight(0xb8c8e0, 1.0))
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.8))
    const key = new THREE.DirectionalLight(0xffffff, 2.0)
    key.position.set(10, 22, 8)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    scene.fog = new THREE.Fog(0x0a1018, 35, 90)

    // Fallback procedural ground while GLBs load (or if missing)
    const fallbackGround = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.85 })
    )
    fallbackGround.rotation.x = -Math.PI / 2
    fallbackGround.receiveShadow = true
    scene.add(fallbackGround)
    this.fallbackGround = fallbackGround

    // Door + frame — keep procedural for animation control
    this._buildDoor()

    // Async kick off Kenney load — populate stage when ready
    this.ready = this._loadStage()
  }

  async _loadStage() {
    const loader = new GLTFLoader()
    const load = (url) => new Promise((res) => {
      loader.load(url, res, undefined, () => res(null))   // null on 404
    })
    const pieces = {}
    for (const [k, url] of Object.entries(PIECES)) {
      const gltf = await load(url)
      pieces[k] = gltf?.scene || null
    }

    // Bail gracefully — keep fallback ground + warn
    if (!pieces.floor && !pieces.wall) {
      console.warn('[KenneyWorld] No Kenney GLBs found in /public/assets/kenney/. Using fallback ground only. Download a pack from https://kenney.nl/assets')
      return
    }

    // Hide fallback ground once we have real floor tiles
    if (pieces.floor) this.fallbackGround.visible = false

    // Tile floor in a 12x12 grid covering ±halfSize
    if (pieces.floor) {
      const tileSize = 4   // adjust to match your pack's tile dimension
      const tilesPerSide = Math.ceil((this.halfSize * 2) / tileSize)
      for (let i = -tilesPerSide / 2; i < tilesPerSide / 2; i++) {
        for (let j = -tilesPerSide / 2; j < tilesPerSide / 2; j++) {
          const tile = pieces.floor.clone()
          tile.position.set(i * tileSize + tileSize / 2, 0, j * tileSize + tileSize / 2)
          tile.traverse(o => { if (o.isMesh) o.receiveShadow = true })
          this.scene.add(tile)
        }
      }
    }

    // Perimeter walls — one piece per unit along each side
    if (pieces.wall) {
      const wallLen = 4   // adjust to your pack's wall length
      const sideLen = this.halfSize * 2
      const count = Math.ceil(sideLen / wallLen)
      const place = (x, z, rotY) => {
        const w = pieces.wall.clone()
        w.position.set(x, 0, z)
        w.rotation.y = rotY
        w.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
        this.scene.add(w)
        // Register as collider — approximate AABB
        this._walls.push({ mesh: w, w: wallLen, h: 4, d: 0.6 })
      }
      // North + south + east + west loops
      for (let i = 0; i < count; i++) {
        const offset = -this.halfSize + i * wallLen + wallLen / 2
        place(offset, -this.halfSize, 0)              // north
        // south wall — skip pieces around door opening
        if (Math.abs(offset) > this.doorWidth / 2 + 0.5) {
          place(offset, this.halfSize, Math.PI)
        }
        place( this.halfSize, offset, -Math.PI / 2)
        place(-this.halfSize, offset,  Math.PI / 2)
      }
    }

    // Sprinkle some props for atmosphere
    if (pieces.barrel) {
      const spots = [[-8, -8], [8, 8], [-12, 6], [10, -10]]
      for (const [x, z] of spots) {
        const b = pieces.barrel.clone()
        b.position.set(x, 0, z)
        b.traverse(o => { if (o.isMesh) o.castShadow = true })
        this.scene.add(b)
        this._walls.push({ mesh: b, w: 1.0, h: 1.4, d: 1.0 })
      }
    }
    if (pieces.crate) {
      const spots = [[6, -4], [-6, 4], [0, -14]]
      for (const [x, z] of spots) {
        const c = pieces.crate.clone()
        c.position.set(x, 0, z)
        c.traverse(o => { if (o.isMesh) o.castShadow = true })
        this.scene.add(c)
        this._walls.push({ mesh: c, w: 1.2, h: 1.2, d: 1.2 })
      }
    }

    console.log('[KenneyWorld] Stage built. Walls registered:', this._walls.length)
  }

  _buildDoor() {
    // Sliding door pair — same animation as default World
    this.door = new THREE.Group()
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x10181f, metalness: 0.5, roughness: 0.4,
      emissive: 0x002233, emissiveIntensity: 0.6
    })
    const half = new THREE.Mesh(new THREE.BoxGeometry(this.doorWidth / 2 - 0.05, 3.4, 0.4), doorMat)
    this.doorL = half.clone()
    this.doorL.position.set(-this.doorWidth / 4, 1.7, this.halfSize)
    this.scene.add(this.doorL)
    this.doorR = half.clone()
    this.doorR.position.set( this.doorWidth / 4, 1.7, this.halfSize)
    this.scene.add(this.doorR)
    this.doorClosedX = this.doorWidth / 4
    this.doorOpenX   = this.doorWidth / 4 + (this.doorWidth / 2)
  }

  setDoorOpen(t) {
    this.doorOpen = THREE.MathUtils.clamp(t, 0, 1)
    const offset = (this.doorOpenX - this.doorClosedX) * this.doorOpen
    this.doorL.position.x = -this.doorClosedX - offset
    this.doorR.position.x =  this.doorClosedX + offset
  }

  isInsideWall(x, z, pad = 0) {
    for (const w of this._walls) {
      const cx = w.mesh.position.x, cz = w.mesh.position.z
      if (Math.abs(x - cx) < w.w / 2 + pad && Math.abs(z - cz) < w.d / 2 + pad) return true
    }
    return false
  }

  registerColliders(physics) {
    physics.addStaticBox({ position: { x: 0, y: -0.5, z: 0 }, uuid: 'floor' }, 200, 1, 200)
    for (const w of this._walls) physics.addStaticBox(w.mesh, w.w, w.h, w.d)
  }

  // Reuse same impact effects as default World
  spawnHitImpact(x, y, z, hitDir = null) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    flash.position.set(x, y, z)
    this.scene.add(flash)
    this._impacts.push({ mesh: flash, life: 0.18, maxLife: 0.18, isFlash: true })
    const bx = hitDir ? -hitDir.x : 0
    const bz = hitDir ? -hitDir.z : 0
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 5, 4),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xff2020 : 0xff8050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      )
      m.position.set(x, y, z)
      this.scene.add(m)
      this._impacts.push({ mesh: m, life: 0.5, maxLife: 0.5, vx: bx * 3 + (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: bz * 3 + (Math.random() - 0.5) * 4 })
    }
  }

  spawnWallImpact(x, y, z, hitDir = null) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    flash.position.set(x, y, z)
    this.scene.add(flash)
    this._impacts.push({ mesh: flash, life: 0.12, maxLife: 0.12, isFlash: true })
    const bx = hitDir ? -hitDir.x : 0
    const bz = hitDir ? -hitDir.z : 0
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 5, 4),
        new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      )
      m.position.set(x, y, z)
      this.scene.add(m)
      this._impacts.push({ mesh: m, life: 0.45, maxLife: 0.5, vx: bx * 4 + (Math.random() - 0.5) * 3.5, vy: 1.5 + Math.random() * 3.5, vz: bz * 4 + (Math.random() - 0.5) * 3.5 })
    }
  }

  updateImpacts(delta) {
    for (let i = this._impacts.length - 1; i >= 0; i--) {
      const p = this._impacts[i]
      p.life -= delta
      if (p.isFlash) {
        p.mesh.scale.setScalar(1 + (1 - p.life / p.maxLife) * 1.2)
        p.mesh.material.opacity = Math.max(0, p.life / p.maxLife)
      } else {
        p.mesh.position.x += p.vx * delta
        p.mesh.position.y += p.vy * delta
        p.mesh.position.z += p.vz * delta
        p.vy -= 9.8 * delta
        p.mesh.material.opacity = Math.max(0, p.life / p.maxLife)
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh)
        this._impacts.splice(i, 1)
      }
    }
  }
}
