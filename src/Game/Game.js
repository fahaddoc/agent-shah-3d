import * as THREE from 'three'
import { Ticker } from './Ticker.js'
import { Inputs } from './Inputs.js'
import { Renderer } from './Renderer.js'
import { Camera } from './Camera.js'
import { WarehouseWorld as World } from './WarehouseWorld.js'
import { Player } from './Player.js'
import { Enemy } from './Enemy.js'
import { NPC } from './NPC.js'
import { UI } from './UI.js'
import { Physics } from './Physics.js'
import { AssetLoader } from './AssetLoader.js'
import { SECTORS } from '../data/portfolio.js'

const PHASE = { INTRO: 'INTRO', PLAY: 'PLAY' }

export class Game {
  static instance = null
  static getInstance(opts) {
    if (!Game.instance) Game.instance = new Game(opts)
    return Game.instance
  }

  constructor({ canvas }) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.physics = new Physics()
    this.assets = new AssetLoader()
    this.ticker = new Ticker()
    this.inputs = new Inputs(canvas)
    this.renderer = new Renderer(canvas)
    this.camera = new Camera()
    this.ui = new UI()
    this.world = new World(this.scene)
    this.raycaster = new THREE.Raycaster()

    this.player = new Player(this.scene)

    // Sector 1 setup
    this.currentSectorIdx = 0
    this.sector = SECTORS[0]
    this.ui.setSector(`0${this.sector.id} · ${this.sector.name}`)
    this.ui.setWeapon(this.sector.weapon)

    // NPC
    this.npc = new NPC(this.scene, new THREE.Vector3(0, 0, -10), 'BRIEFING')

    // Enemies — patrolling guards (spy stealth mode)
    this.enemies = [
      new Enemy(this.scene, new THREE.Vector3(-12, 0, -4), [
        new THREE.Vector3(-12, 0, -4),
        new THREE.Vector3(-12, 0,  4),
        new THREE.Vector3(-6,  0,  4),
        new THREE.Vector3(-6,  0, -4)
      ]),
      new Enemy(this.scene, new THREE.Vector3(12, 0, -4), [
        new THREE.Vector3(12, 0, -4),
        new THREE.Vector3(12, 0,  4),
        new THREE.Vector3(6,  0,  4),
        new THREE.Vector3(6,  0, -4)
      ]),
      new Enemy(this.scene, new THREE.Vector3(0, 0, -16), [
        new THREE.Vector3(-4, 0, -16),
        new THREE.Vector3( 4, 0, -16)
      ])
    ]

    // No cinematic — player spawns on the entry road outside the south gate
    this.phase = PHASE.PLAY
    const halfSize = this.world.halfSize
    const spawnZ = halfSize + 12   // mid-corridor, 12 units south of door
    this.player.position.set(0, 0, spawnZ)
    this.player.group.position.copy(this.player.position)
    this.player.aim.set(0, 0, -1)
    this.player.group.rotation.y = 0
    // Camera behind player (further south)
    this.camera.setInstant(
      new THREE.Vector3(0, this.camera.height, spawnZ + this.camera.distance),
      new THREE.Vector3(0, 1.4, spawnZ)
    )
    this.world.setDoorOpen(0)

    this.ticker.on((d, e) => this._tick(d, e))
  }

  async start() {
    await this.physics.init()
    // Wait for async stage loaders (e.g. KenneyWorld) before registering colliders
    if (this.world.ready) await this.world.ready
    this.world.registerColliders(this.physics)
    this.player.registerPhysics(this.physics)
    // Hard arena bounds — union of warehouse interior and the south entry road.
    // Walls already block N/E/W and the inner south wall segments; this catches
    // anywhere the player could otherwise drift into the void.
    const hs = this.world.halfSize
    if (hs) {
      this.player.arenaBounds = {
        rects: [
          { minX: -hs + 1, maxX: hs - 1, minZ: -hs + 1, maxZ: hs - 1 },     // warehouse interior
          { minX: -3.5,    maxX: 3.5,    minZ: hs - 1,  maxZ: hs + 17.5 }   // entry road / asphalt pad
        ]
      }
    }
    // Live progress while heavy FBX clips load — keep loader visible until ready.
    // Use Promise.allSettled + per-promise catch so a single bad clip can't block the game.
    const tick = setInterval(() => this.ui.setLoaderProgress(), 100)
    const safe = (p, label) => Promise.resolve(p).catch(err => {
      console.warn(`[Game] ${label} load failed:`, err)
    })
    await Promise.allSettled([
      safe(this.player.ready, 'player'),
      ...this.enemies.map((e, i) => safe(e.ready, `enemy[${i}]`))
    ])
    clearInterval(tick)
    this.ui.finishLoader()
    this.ui.setHint('INFILTRATING SECTOR 01…')
    // Every round: south entry, north exit. Player walks south→north.
    this.world.setExitSide('north')
    // Briefing-close → open exit portal + refill 1 mag of each ranged weapon.
    // Player must walk through the portal to actually advance — no auto-jump.
    this.ui.onBriefingClosed = () => {
      if (this._briefingViewed) {
        this._briefingViewed = false
        this._refillAmmo()
        this._exitPortalArmed = true
        this.world.setExitOpen(true)
      }
    }
    this.ticker.start()
  }

  _refillAmmo() {
    if (!this.player) return
    // 1 magazine of each ranged weapon — capped at maxAmmo.
    const max = this.player.maxAmmo || {}
    const a = this.player.ammo
    if (a.pistol !== undefined) {
      a.pistol = Math.min((max.pistol || 6), (a.pistol || 0) + (max.pistol || 6))
    }
    if (a.machinegun !== undefined) {
      a.machinegun = Math.min((max.machinegun || 30), (a.machinegun || 0) + (max.machinegun || 30))
    }
    // Restore weapon visibility for any slot we just topped up
    if (this.player.weapons?.pistol) this.player.weapons.pistol.visible = (this.player.currentWeapon === 'pistol' && a.pistol > 0)
    if (this.player.weapons?.machinegun) this.player.weapons.machinegun.visible = (this.player.currentWeapon === 'machinegun' && a.machinegun > 0)
    this.player._updateWeaponHUD?.()
  }

  _advanceSector() {
    const nextIdx = this.currentSectorIdx + 1
    if (nextIdx >= SECTORS.length) {
      this.ui.setHint('MISSION COMPLETE · ALL SECTORS CLEARED')
      return
    }
    this.currentSectorIdx = nextIdx
    this.sector = SECTORS[nextIdx]
    this.ui.setSector(`0${this.sector.id} · ${this.sector.name}`)
    this.ui.setWeapon(this.sector.weapon)
    this.world.setSectorTheme(nextIdx)

    // Despawn previous sector's enemies (alive + dead corpses + any sub-meshes
    // they parented onto the scene). Walk all named handles defensively.
    for (const e of this.enemies) {
      for (const key of ['group', 'hpBar', 'visionMesh', 'alertIcon', 'pistolMesh', 'muzzle']) {
        const obj = e[key]
        if (obj && obj.parent === this.scene) this.scene.remove(obj)
      }
    }

    // Spawn fresh wave biased to the NORTH half (player always enters south).
    const count = 3 + nextIdx * 2   // sector 2 = 5, sector 3 = 7, etc.
    const ringR = 9
    const ringCenterZ = -4   // north of origin, between player and exit
    this.enemies = []
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const cx = Math.cos(angle) * ringR
      const cz = ringCenterZ + Math.sin(angle) * ringR
      const home = new THREE.Vector3(cx, 0, cz)
      const path = [
        home.clone().add(new THREE.Vector3( 1.5, 0,  1.5)),
        home.clone().add(new THREE.Vector3(-1.5, 0,  1.5)),
        home.clone().add(new THREE.Vector3(-1.5, 0, -1.5)),
        home.clone().add(new THREE.Vector3( 1.5, 0, -1.5)),
      ]
      this.enemies.push(new Enemy(this.scene, home, path))
    }
    Promise.allSettled(this.enemies.map(e => e.ready)).catch(() => {})

    // Reset transition flags so sector N+1 starts clean
    this._briefingViewed = false
    this._exitPortalArmed = false
    this.world.setExitOpen(false)
    this.world._southExitForceOpen = false
    // Snap the north exit door fully shut — no animated close on top of player.
    this.world.exitDoorOpen = 0
    this.world._exitDoorTarget = 0
    if (this.world.exitDoorL) this.world.exitDoorL.position.x = -this.world.exitDoorClosedX
    if (this.world.exitDoorR) this.world.exitDoorR.position.x =  this.world.exitDoorClosedX
    // Every round repeats sector-1 flow: south entry, north exit.
    this.world.setExitSide('north')

    // Spawn at the south entry road — camera + WASD + view all match sector 1.
    const halfSize = this.world.halfSize
    const spawnZ = halfSize + 12
    this.player.position.set(0, 0, spawnZ)
    this.player.group.position.copy(this.player.position)
    this.player.velocity?.set(0, 0, 0)         // kill carry-over drift from prior sector
    // Hard-teleport the kinematic physics body too — otherwise the next frame
    // re-syncs position from the body's old translation (north exit) and the
    // player visually snaps back to the north door.
    if (this.player.physicsBody) {
      this.player.physicsBody.setTranslation(
        { x: this.player.position.x, y: this.player.position.y + 0.9, z: this.player.position.z },
        true
      )
    }
    this.player.aim.set(0, 0, -1)
    this.player.group.rotation.y = 0
    this.camera.yaw = 0
    this.camera.setInstant(
      new THREE.Vector3(0, this.camera.height, spawnZ + this.camera.distance),
      new THREE.Vector3(0, 1.4, spawnZ)
    )
    this.player.hp = this.player.maxHp
    this.world.setDoorOpen(0)
    this.ui.setHint(`INFILTRATING SECTOR 0${this.sector.id}…`)
  }

  _tick(delta, elapsed) {
    this.physics.step(delta)
    if (this.ui.isBriefingOpen()) {
      this.renderer.render(this.scene, this.camera.instance)
      return
    }

    if (this.phase === PHASE.INTRO) {
      this._tickIntro(delta, elapsed)
    } else {
      this._tickPlay(delta, elapsed)
    }

    this.renderer.render(this.scene, this.camera.instance)
  }

  _tickIntro(delta, elapsed) {
    this.introTime += delta
    const t = this.introTime
    const halfSize = this.world.halfSize

    // Walk forward (-Z)
    const targetZ = halfSize - 6   // final stop just inside the room
    const walkSpeed = 4.5
    if (this.player.position.z > targetZ) {
      this.player.position.z -= walkSpeed * delta
      // walk anim manual
      this.player.walkPhase += delta * 9
      const s = Math.sin(this.player.walkPhase) * 0.25
      this.player.legL.rotation.x =  s
      this.player.legR.rotation.x = -s
    }
    this.player.group.position.copy(this.player.position)
    if (this.player.physicsBody) {
      this.player.physicsBody.setTranslation({ x: this.player.position.x, y: this.player.position.y + 0.9, z: this.player.position.z }, true)
    }
    this.player.group.rotation.y = 0  // face -Z (into room)

    // Door opens when player ~3 units in front of door
    const distToDoor = this.player.position.z - halfSize
    if (distToDoor < 3) {
      const openProgress = THREE.MathUtils.clamp((3 - distToDoor) / 3, 0, 1)
      this.world.setDoorOpen(openProgress)
    }

    // Camera: cinematic side dolly first, then transition to gameplay framing
    const cinematicEnd = 3.2
    if (t < cinematicEnd) {
      const k = t / cinematicEnd
      const camX = THREE.MathUtils.lerp(8, 0, k)
      const camY = THREE.MathUtils.lerp(3.5, this.camera.height, k)
      const camZ = THREE.MathUtils.lerp(halfSize + 6, this.player.position.z + this.camera.distance, k)
      const lookAt = new THREE.Vector3(this.player.position.x, this.player.position.y + 1.4, this.player.position.z)
      this.camera.setInstant(new THREE.Vector3(camX, camY, camZ), lookAt)
    } else {
      this.camera.follow(this.player.position, delta)
    }

    // Skip intro on click/space/key
    if (this.inputs.mouse.down || this.inputs.isDown(' ') || this.inputs.consumePress('enter')) {
      this.player.position.z = targetZ
    }

    // End intro when player reaches target
    if (this.player.position.z <= targetZ + 0.05) {
      this.world.setDoorOpen(1)
      this.world.sealDoor?.(this.physics)
      this.phase = PHASE.PLAY
      this.ui.setHint('WASD move · MOUSE/SPACE shoot · F stealth-kill')
    }

    // Update NPC + enemies (background)
    this.npc.update(delta, elapsed, this.player.position)
    for (const en of this.enemies) {
      en.update(delta, this.player.position, this.camera.instance, () => {}, this.enemies)
    }
  }

  _tickPlay(delta, elapsed) {
    // Auto-open door by proximity (open as player gets closer, close when far)
    const halfSize = this.world.halfSize
    const distToDoor = Math.abs(this.player.position.z - halfSize)
    const openRadius = 6
    let targetOpen = distToDoor < openRadius ? 1 - (distToDoor / openRadius) : 0
    // When south is the armed exit, force the south door fully open regardless of distance.
    if (this.world._southExitForceOpen) targetOpen = 1
    const doorLerp = Math.min(delta * 3, 1)
    this.world.setDoorOpen(this.world.doorOpen + (targetOpen - this.world.doorOpen) * doorLerp)
    // North exit door slide animation
    this.world.updateExitDoor(delta)

    this.player.update(
      delta,
      this.inputs,
      this.raycaster,
      this.world.groundPlane,
      this.enemies,
      (enemy, dmg, all, hitDir, type) => enemy.takeDamage(dmg, all, hitDir, type)
    )

    for (const en of this.enemies) {
      en.update(delta, this.player.position, this.camera.instance, (e, dmg, type) => {
        this.player.takeDamage(dmg, type)
      }, this.enemies)
    }

    this.npc.update(delta, elapsed, this.player.position)
    this.world.updateImpacts(delta)

    // Stealth-kill detection
    let stealthTarget = null
    for (const en of this.enemies) {
      if (!en.alive) continue
      if (en.state === 'ALERT') continue
      if (en.isBehind(this.player.position, 1.8)) { stealthTarget = en; break }
    }

    // Detect player walking into the open exit portal — actually advances sector.
    if (this._exitPortalArmed && this.world.isInExitPortal(this.player.position.x, this.player.position.z)) {
      this._exitPortalArmed = false
      this.world.setExitOpen(false)
      this._advanceSector()
    }

    if (this.npc.inRange) {
      this.ui.setHint('PRESS [E] · READ BRIEFING')
      if (this.inputs.consumePress('e')) {
        this.ui.showBriefing(this.sector.section)
        this._briefingViewed = true
      }
    } else if (stealthTarget) {
      this.ui.setHint('PRESS [F] · SILENT TAKEDOWN (no alert)')
      if (this.inputs.consumePress('f')) {
        stealthTarget.silentKill()
      }
    } else if (this._exitPortalArmed) {
      this.ui.setHint('AMMO RESUPPLIED · EXIT THROUGH THE NORTH DOOR')
    } else {
      const aliveLeft = this.enemies.filter(e => e.alive).length
      this.ui.setHint(`WASD · SHOOT mouse/space · 1 pistol · 2 MG · 3 pencil · 4 fight (V/B punch) · F stealth · M music · TARGETS: ${aliveLeft}`)
    }

    this.ui.setHealth(this.player.hp, this.player.maxHp)
    this.camera.follow(this.player.position, delta)
  }
}
