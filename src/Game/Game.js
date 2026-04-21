import * as THREE from 'three'
import { Ticker } from './Ticker.js'
import { Inputs } from './Inputs.js'
import { Renderer } from './Renderer.js'
import { Camera } from './Camera.js'
import { World } from './World.js'
import { Player } from './Player.js'
import { Enemy } from './Enemy.js'
import { NPC } from './NPC.js'
import { UI } from './UI.js'
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

    // Cinematic intro state
    this.phase = PHASE.INTRO
    this.introTime = 0
    const halfSize = this.world.halfSize
    this.player.position.set(0, 0, halfSize + 14)
    this.player.group.position.copy(this.player.position)
    this.player.aim.set(0, 0, -1)
    this.player.group.rotation.y = 0
    // Cinematic camera initial pose
    this.camera.setInstant(
      new THREE.Vector3(8, 3.5, halfSize + 6),
      new THREE.Vector3(0, 1.4, halfSize + 14)
    )

    this.ticker.on((d, e) => this._tick(d, e))
  }

  start() {
    this.ui.finishLoader()
    this.ui.setHint('INFILTRATING SECTOR 01…')
    this.ticker.start()
  }

  _tick(delta, elapsed) {
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
      this.phase = PHASE.PLAY
      this.ui.setHint('WASD move · MOUSE/SPACE shoot · F stealth-kill')
    }

    // Update NPC + enemies (background)
    this.npc.update(delta, elapsed, this.player.position)
    for (const en of this.enemies) {
      en.update(delta, this.player.position, this.camera.instance, () => {})
    }
  }

  _tickPlay(delta, elapsed) {
    // Slowly close door behind player after entering (optional polish)
    if (this.world.doorOpen > 0) {
      this.world.setDoorOpen(this.world.doorOpen - delta * 0.25)
    }

    this.player.update(
      delta,
      this.inputs,
      this.raycaster,
      this.world.groundPlane,
      this.enemies,
      (enemy, dmg, all) => enemy.takeDamage(dmg, all)
    )

    for (const en of this.enemies) {
      en.update(delta, this.player.position, this.camera.instance, (e, dmg) => {
        this.player.takeDamage(dmg)
      })
    }

    this.npc.update(delta, elapsed, this.player.position)

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
      this.ui.setHint(`WASD move · MOUSE/SPACE shoot · F stealth · RIGHT-CLICK DRAG = orbit camera · TARGETS: ${aliveLeft}`)
    }

    this.ui.setHealth(this.player.hp, this.player.maxHp)
    this.camera.follow(this.player.position, delta)
  }
}
