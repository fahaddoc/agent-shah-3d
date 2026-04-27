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

    // No cinematic — player spawns just outside door, controls active immediately
    this.phase = PHASE.PLAY
    const halfSize = this.world.halfSize
    this.player.position.set(0, 0, halfSize + 4)
    this.player.group.position.copy(this.player.position)
    this.player.aim.set(0, 0, -1)
    this.player.group.rotation.y = 0
    // Camera behind player
    this.camera.setInstant(
      new THREE.Vector3(0, this.camera.height, halfSize + 4 + this.camera.distance),
      new THREE.Vector3(0, 1.4, halfSize + 4)
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
    this.ticker.start()
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
    const targetOpen = distToDoor < openRadius ? 1 - (distToDoor / openRadius) : 0
    const doorLerp = Math.min(delta * 3, 1)
    this.world.setDoorOpen(this.world.doorOpen + (targetOpen - this.world.doorOpen) * doorLerp)

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

    if (this.npc.inRange) {
      this.ui.setHint('PRESS [E] · READ BRIEFING')
      if (this.inputs.consumePress('e')) {
        this.ui.showBriefing(this.sector.section)
      }
    } else if (stealthTarget) {
      this.ui.setHint('PRESS [F] · SILENT TAKEDOWN (no alert)')
      if (this.inputs.consumePress('f')) {
        stealthTarget.silentKill()
      }
    } else {
      const aliveLeft = this.enemies.filter(e => e.alive).length
      this.ui.setHint(`WASD · SHOOT mouse/space · 1 pistol · 2 MG · 3 pencil · 4 fight (A/B punch) · F stealth · TARGETS: ${aliveLeft}`)
    }

    this.ui.setHealth(this.player.hp, this.player.maxHp)
    this.camera.follow(this.player.position, delta)
  }
}
