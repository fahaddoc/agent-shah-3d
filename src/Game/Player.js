import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { loadGlbCached as loadFbxCached } from './glbCache.js'

// Shared DRACO decoder (needed for Mixamo-compressed GLBs)
const SHARED_DRACO = new DRACOLoader()
SHARED_DRACO.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

// Paste your Ready Player Me GLB URL here to swap player model.
// Example: 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb'
// Leave null to use local /assets/models/agent.glb (Soldier)
const PLAYER_AVATAR_URL = null
const ANIM_SOURCE_URL   = '/assets/models/agent.glb'  // Soldier provides idle/walk/run/die clips

// Materials reused
const SUIT  = new THREE.MeshStandardMaterial({ color: 0x121318, roughness: 0.65, metalness: 0.05, flatShading: true })
const SUIT_LT = new THREE.MeshStandardMaterial({ color: 0x1d2029, roughness: 0.65, flatShading: true })
const SHIRT = new THREE.MeshStandardMaterial({ color: 0xe8e8eb, roughness: 0.75, flatShading: true })
const TIE   = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.4, flatShading: true })
const SKIN  = new THREE.MeshStandardMaterial({ color: 0xdba07a, roughness: 0.85, flatShading: true })
const SKIN_SHADOW = new THREE.MeshStandardMaterial({ color: 0xa67556, roughness: 0.9, flatShading: true })
const HAIR  = new THREE.MeshStandardMaterial({ color: 0x0e0a0c, roughness: 0.95, flatShading: true })
const BEARD = new THREE.MeshStandardMaterial({ color: 0x180c0a, roughness: 0.96, flatShading: true })
const GUN   = new THREE.MeshStandardMaterial({ color: 0x18181c, metalness: 0.75, roughness: 0.3, flatShading: true })
const GUN_ACCENT = new THREE.MeshStandardMaterial({ color: 0x52525a, metalness: 0.85, roughness: 0.25, flatShading: true })
const BLOOD = new THREE.MeshStandardMaterial({ color: 0x5c0810, roughness: 0.9 })
const BELT  = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.5, flatShading: true })
const SHOE  = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.35, metalness: 0.15, flatShading: true })

export class Player {
  constructor(scene) {
    this.scene = scene
    this.maxSpeed = 7.5
    this.accel = 30          // ramp up
    this.decel = 22          // ramp down
    this.hp = 100
    this.maxHp = 100
    this.position = new THREE.Vector3(0, 0, 0)
    this.velocity = new THREE.Vector3()
    this.aim = new THREE.Vector3(0, 0, -1)
    this.fireCooldown = 0
    this.bullets = []
    this.muzzleWorld = new THREE.Vector3()
    this.walkPhase = 0

    this.physics = null
    this.physicsBody = null
    this.physicsCollider = null
    this.physicsCtrl = null

    // Ammo per weapon — pistol 6, MG 30 (one mag), pencil/fight unlimited
    this.maxAmmo = { pistol: 6, machinegun: 30, pencil: 2 }
    this.ammo = { pistol: 6, machinegun: 30, pencil: 2 }

    this.group = new THREE.Group()
    scene.add(this.group)
    // Minimal procedural stub — just muzzle/flash/ring — hidden once GLB loads
    this._buildStub()
    this.ready = this._tryLoadGLB()

    // Tracer-style bullet — elongated cylinder, bright additive blend
    this.bulletGeo = new THREE.CylinderGeometry(0.03, 0.012, 0.5, 6)
    this.bulletMat = new THREE.MeshBasicMaterial({
      color: 0xfff0a0,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  }

  _buildStub() {
    // Muzzle + flash (temporary — hand-bone pistol overrides these after GLB load)
    this.muzzle = new THREE.Object3D()
    this.muzzle.position.set(0.3, 1.4, -0.5)
    this.group.add(this.muzzle)
    // Layered flash: bright additive sphere + small core for hot-spark feel
    const flashGroup = new THREE.Group()
    const flashOuter = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffe680,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    const flashCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    flashGroup.add(flashOuter)
    flashGroup.add(flashCore)
    flashGroup.position.copy(this.muzzle.position)
    this.group.add(flashGroup)
    this.flash = flashGroup
    this.flashOuter = flashOuter
    this.flashCore = flashCore
    // Legs/shoes/head as no-op stubs so update() doesn't crash if anims don't fire
    const noop = new THREE.Object3D()
    this.legL = noop; this.legR = noop; this.shoeL = noop; this.shoeR = noop; this.head = noop
    // Aim ring on ground
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.7, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.02
    this.group.add(ring)

    // Stab range indicator — red ring shown only in pencil mode (radius matches STAB_RANGE = 1.8m)
    this.stabRangeRing = new THREE.Mesh(
      new THREE.RingGeometry(1.74, 1.8, 64),
      new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    )
    this.stabRangeRing.rotation.x = -Math.PI / 2
    this.stabRangeRing.position.y = 0.03
    this.stabRangeRing.visible = false
    this.group.add(this.stabRangeRing)

    // Fight (fist) range indicator — orange ring shown only in fight mode (PUNCH_RANGE = 2.5m)
    this.fightRangeRing = new THREE.Mesh(
      new THREE.RingGeometry(2.42, 2.5, 64),
      new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    )
    this.fightRangeRing.rotation.x = -Math.PI / 2
    this.fightRangeRing.position.y = 0.03
    this.fightRangeRing.visible = false
    this.group.add(this.fightRangeRing)
  }

  _buildWick() {
    // LOW-POLY Wick — angular blocky forms, flat shaded, taller adult proportions

    // Torso — tapered jacket (wider shoulders, narrower waist)
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.35, 0.55), SUIT)
    shoulders.position.y = 1.75
    shoulders.castShadow = true
    this.group.add(shoulders)

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.5), SUIT)
    torso.position.y = 1.12
    torso.castShadow = true
    this.group.add(torso)

    // Lapel V (two angled wedges — clear suit silhouette)
    const lapelGeo = new THREE.BoxGeometry(0.12, 0.7, 0.08)
    const lapelL = new THREE.Mesh(lapelGeo, SUIT_LT)
    lapelL.position.set(-0.18, 1.42, -0.27)
    lapelL.rotation.z = 0.22
    this.group.add(lapelL)
    const lapelR = new THREE.Mesh(lapelGeo, SUIT_LT)
    lapelR.position.set(0.18, 1.42, -0.27)
    lapelR.rotation.z = -0.22
    this.group.add(lapelR)

    // White shirt V (visible between lapels)
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.08), SHIRT)
    shirt.position.set(0, 1.3, -0.25)
    this.group.add(shirt)

    // Slim black tie
    const tieKnot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.06), TIE)
    tieKnot.position.set(0, 1.63, -0.23)
    this.group.add(tieKnot)
    const tieBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.72, 0.05), TIE)
    tieBody.position.set(0, 1.2, -0.23)
    this.group.add(tieBody)

    // Belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.09, 0.55), BELT)
    belt.position.y = 0.55
    this.group.add(belt)

    // Pants — longer, slimmer
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.05, 0.38), SUIT)
    legL.position.set(-0.2, 0.0, 0)
    legL.castShadow = true
    this.group.add(legL)
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.05, 0.38), SUIT)
    legR.position.set(0.2, 0.0, 0)
    legR.castShadow = true
    this.group.add(legR)
    this.legL = legL; this.legR = legR

    // Pointy dress shoes
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.72), SHOE)
    shoeL.position.set(-0.2, -0.6, 0.1)
    this.group.add(shoeL)
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.72), SHOE)
    shoeR.position.set(0.2, -0.6, 0.1)
    this.group.add(shoeR)
    this.shoeL = shoeL; this.shoeR = shoeR

    // HEAD GROUP
    const head = new THREE.Group()
    head.position.y = 2.35
    this.group.add(head)
    this.head = head

    // Angular skull (box, not sphere — matches low-poly reference)
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.75, 0.72), SKIN)
    skull.castShadow = true
    head.add(skull)

    // Jaw (slightly narrower below skull)
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.22, 0.64), SKIN_SHADOW)
    jaw.position.set(0, -0.42, 0.0)
    head.add(jaw)

    // Cheekbones (angled boxes on sides)
    const cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.3), SKIN_SHADOW)
    cheekL.position.set(-0.33, -0.15, -0.1)
    cheekL.rotation.y = 0.2
    head.add(cheekL)
    const cheekR = cheekL.clone()
    cheekR.position.x = 0.33
    cheekR.rotation.y = -0.2
    head.add(cheekR)

    // Slicked-back hair — big angular wedge sitting high on top
    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.28, 0.5), HAIR)
    hairTop.position.set(0, 0.4, 0.08)
    head.add(hairTop)
    // Front swept shape (angled forward)
    const hairFront = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.22), HAIR)
    hairFront.position.set(0, 0.38, -0.28)
    hairFront.rotation.x = 0.3
    head.add(hairFront)
    // Side temples
    const hairSideL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.54), HAIR)
    hairSideL.position.set(-0.36, 0.08, 0.0)
    head.add(hairSideL)
    const hairSideR = hairSideL.clone()
    hairSideR.position.x = 0.36
    head.add(hairSideR)
    // Long back (trademark swept mane)
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.18), HAIR)
    hairBack.position.set(0, -0.05, 0.42)
    head.add(hairBack)
    const hairBackLong = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.14), HAIR)
    hairBackLong.position.set(0, -0.48, 0.4)
    head.add(hairBackLong)

    // Beard — full Wick scruff (low-poly angular)
    const beardFront = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.2), BEARD)
    beardFront.position.set(0, -0.42, -0.3)
    head.add(beardFront)
    const beardSideL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.3), BEARD)
    beardSideL.position.set(-0.28, -0.3, -0.15)
    head.add(beardSideL)
    const beardSideR = beardSideL.clone()
    beardSideR.position.x = 0.28
    head.add(beardSideR)
    // Stubble on upper cheek
    const stubbleL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.2), BEARD)
    stubbleL.position.set(-0.3, -0.12, -0.3)
    head.add(stubbleL)
    const stubbleR = stubbleL.clone()
    stubbleR.position.x = 0.3
    head.add(stubbleR)
    // Mustache
    const stache = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), BEARD)
    stache.position.set(0, -0.2, -0.4)
    head.add(stache)

    // Eye sockets (dark recess)
    const eyeBox = new THREE.MeshStandardMaterial({ color: 0x1a0f0a, flatShading: true })
    const socketL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.05), eyeBox)
    socketL.position.set(-0.15, 0.04, -0.37)
    head.add(socketL)
    const socketR = socketL.clone()
    socketR.position.x = 0.15
    head.add(socketR)

    // Eye pupils (tiny dark)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), eyeMat)
    eyeL.position.set(-0.15, 0.03, -0.4)
    head.add(eyeL)
    const eyeR = eyeL.clone()
    eyeR.position.x = 0.15
    head.add(eyeR)

    // Angled brows (slight inward tilt — Wick's focused look)
    const browMat = new THREE.MeshStandardMaterial({ color: 0x0a0608, flatShading: true })
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.06), browMat)
    browL.position.set(-0.14, 0.15, -0.38)
    browL.rotation.z = -0.18
    head.add(browL)
    const browR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.06), browMat)
    browR.position.set(0.14, 0.15, -0.38)
    browR.rotation.z = 0.18
    head.add(browR)

    // Angular nose (ridge + tip)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.14), SKIN)
    nose.position.set(0, -0.05, -0.42)
    head.add(nose)
    const noseTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), SKIN_SHADOW)
    noseTip.position.set(0, -0.14, -0.45)
    head.add(noseTip)

    // Two-hand pistol arms (low-ready tactical stance)
    this.armRig = new THREE.Group()
    this.armRig.position.set(0, 1.4, 0)
    this.group.add(this.armRig)

    // Right arm
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.85), SUIT)
    armR.position.set(0.18, -0.05, -0.42)
    armR.castShadow = true
    this.armRig.add(armR)

    // Left arm bracing
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.7), SUIT)
    armL.position.set(-0.18, -0.05, -0.35)
    armL.castShadow = true
    this.armRig.add(armL)

    // Hands (skin)
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), SKIN)
    handR.position.set(0.15, -0.05, -0.85)
    this.armRig.add(handR)
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), SKIN)
    handL.position.set(-0.05, -0.05, -0.85)
    this.armRig.add(handL)

    // Pistol (slightly extended)
    const pistolBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.5), GUN)
    pistolBody.position.set(0.05, -0.05, -1.15)
    this.armRig.add(pistolBody)
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.5), GUN_ACCENT)
    slide.position.set(0.05, 0.05, -1.15)
    this.armRig.add(slide)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.18), GUN)
    grip.position.set(0.05, -0.22, -0.95)
    this.armRig.add(grip)

    // Muzzle
    this.muzzle = new THREE.Object3D()
    this.muzzle.position.set(0.05, -0.05, -1.42)
    this.armRig.add(this.muzzle)

    // Muzzle flash (hidden by default)
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd44d, transparent: true, opacity: 0 })
    )
    this.flash.position.copy(this.muzzle.position)
    this.armRig.add(this.flash)

    // Aim ring on ground (cyan)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.7, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.02
    this.group.add(ring)
  }

  async _tryLoadGLB() {
    const loader = new GLTFLoader()
    loader.setDRACOLoader(SHARED_DRACO)

    // If custom avatar URL provided, load it + retarget animations from Soldier
    if (PLAYER_AVATAR_URL) {
      try {
        const [avatar, animSrc] = await Promise.all([
          new Promise((res, rej) => loader.load(PLAYER_AVATAR_URL, res, undefined, rej)),
          new Promise((res, rej) => loader.load(ANIM_SOURCE_URL, res, undefined, rej))
        ])
        this._setupCustomAvatar(avatar, animSrc)
        return
      } catch (err) {
        console.warn('Custom avatar load failed, falling back to Soldier:', err)
      }
    }

    // Load Joe-walking + Joe-idle + fire anims in parallel
    const loadGLB = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej))
    const loadFBX = (url) => loadFbxCached(url)
    return Promise.all([
      loadGLB('/assets/models/agent.glb'),
      loadGLB('/assets/models/anim-idle.glb').catch(() => null),
      loadGLB('/assets/models/anim-fire.glb').catch(() => null),
      loadGLB('/assets/models/anim-stab.glb').catch(() => null),
      loadGLB('/assets/models/anim-knife-walk.glb').catch(() => null),
      loadGLB('/assets/models/anim-knife-idle.glb').catch(() => null),
      loadGLB('/assets/models/anim-takedown.glb').catch(() => null),
      loadFBX('/assets/models-glb/hit-stomach.glb').catch(() => null),   // Mixamo "Stomach Hit" — ranged hit
      loadFBX('/assets/models-glb/hit-body.glb').catch(() => null),      // Mixamo "Hit To Body" — melee hit
      loadFBX('/assets/models-glb/fight-idle.glb').catch(() => null),    // Mixamo "Fight Idle" — out-of-ammo stance
      loadFBX('/assets/models-glb/fist-a.glb').catch(() => null),        // Mixamo "Fist Fight A" — A key punch
      loadFBX('/assets/models-glb/fist-b.glb').catch(() => null),        // Mixamo "Fist Fight B" — B key punch
      loadFBX('/assets/models-glb/enemy-outward-slash.glb').catch(() => null), // Mixamo "Outward Slash" — fallback for stab
      loadFBX('/assets/models-glb/pistol-walk-backward.glb').catch(() => null), // Mixamo "Pistol Walk Backward Arc"
      loadFBX('/assets/models-glb/stabbing.glb').catch(() => null),            // Mixamo "Stabbing" — pencil stab anim
      loadFBX('/assets/models-glb/crouched-walking.glb').catch(() => null),    // Mixamo "Crouched Walking" — pencil walk
      loadFBX('/assets/models-glb/death.glb').catch(() => null),               // Mixamo "Death" — player game-over anim
      loadFBX('/assets/models-glb/mma-side-kick.glb').catch(() => null),       // Mixamo "MMA Side Kick" — fight mode space
      loadFBX('/assets/models-glb/punching.glb').catch(() => null),            // Mixamo "Punching" — fight mode space
      loadFBX('/assets/models-glb/fight-run.glb').catch(() => null),           // Mixamo "Running" — fight mode running anim
      loadFBX('/assets/models-glb/running-backward.glb').catch(() => null),    // Mixamo "Running Backward" — backpedal while aiming
      loadFBX('/assets/models-glb/grab-weapon.glb').catch(() => null),         // Mixamo "Grab Rifle From The Side" — gun draw
      loadFBX('/assets/models-glb/strafe-left.glb').catch(() => null),         // Mixamo "Strafe Left"
      loadFBX('/assets/models-glb/strafe-right.glb').catch(() => null),        // Mixamo "Walk Right" — strafe right
      loadFBX('/assets/models-glb/rifle-idle.glb').catch(() => null),          // Mixamo "Rifle Idle" — MG idle stance
      loadFBX('/assets/models-glb/shoot-rifle.glb').catch(() => null),         // Mixamo "Shoot Rifle" — MG firing while moving
      loadFBX('/assets/models-glb/put-back-weapon.glb').catch(() => null),     // Mixamo "Put Back Rifle" — gun holster
      loadFBX('/assets/models-glb/pencil-idle.glb').catch(() => null)          // Mixamo "Pencil Standing Idle" — pencil idle pose
    ]).then(args => this._handleJoeLoaded(...args))
  }

  _handleJoeLoaded(gltf, idleGltf, fireGltf, stabGltf, knifeWalkGltf, knifeIdleGltf, takedownGltf, hitFbx, hitBodyFbx, fightIdleFbx, fistAFbx, fistBFbx, slashFbx, walkBackFbx, stabbingFbx, crouchWalkFbx, deathFbx, kickFbx, punchFbx, fightRunFbx, runBackFbx, grabFbx, strafeLeftFbx, strafeRightFbx, rifleIdleFbx, shootRifleFbx, putBackFbx, pencilIdleFbx) {
    {
        // Hide procedural parts (keep ring on ground)
        for (const child of [...this.group.children]) {
          if (child !== this.muzzle && child !== this.flash) child.visible = false
        }
        const model = gltf.scene
        model.scale.setScalar(1.2)
        // Joe model faces +Z by default — rotate 180° so model forward = -Z (matches movement convention)
        model.rotation.y = Math.PI
        // Dump mesh + bone names once for debugging (only player)
        const meshNames = []
        const boneNames = []
        model.traverse(o => {
          if (o.isMesh) meshNames.push(o.name)
          if (o.isBone) boneNames.push(o.name)
        })
        console.log('Player meshes:', meshNames)
        console.log('Player bones (first 30):', boneNames.slice(0, 30))

        model.traverse(o => {
          if (!o.isMesh) return
          o.castShadow = true
          o.receiveShadow = true
          const lname = (o.name || '').toLowerCase()
          const matName = (o.material?.name || '').toLowerCase()
          console.log('Player mesh:', o.name, 'material:', o.material?.name)
          // Hide helmet / visor / skeleton joints visualizer / eyelashes (artifact)
          if (lname.includes('helmet') || lname.includes('vest') || lname.includes('goggles') ||
              lname.includes('backpack') || lname.includes('visor') ||
              lname.includes('joint') || lname.includes('bone') ||
              matName.includes('joint') || matName.includes('bone')) {
            o.visible = false
            console.log('  → hidden')
            return
          }
          // Keep original textures (Joe's suit/shirt/tie/hair look as-designed)
        })
        this.group.add(model)
        this.glbModel = model

        // Joe GLB already has Suit/Shirt/Tie/Hair/Pants/Shoes meshes — no procedural overlays needed

        // Weapon system — pistol / machinegun / pencil / fight (bare hands)
        this.rightHandBone = this._findBone(model, ['mixamorig:RightHand', 'RightHand'])
        this.weapons = {
          pistol: this._buildHandPistol(),
          machinegun: this._buildHandMachineGun(),
          pencil: this._buildHandPencil(),
          fight: new THREE.Group()   // empty — bare hands stance
        }
        for (const w of Object.values(this.weapons)) this.group.add(w)
        this.setWeapon('pistol')

        // Build mixer + register clips (agent.glb = walk, anim-idle.glb = idle, anim-fire.glb = fire)
        this.mixer = new THREE.AnimationMixer(model)
        this.actions = {}
        // Strip root-motion: remove Hips position tracks so character anim is "in place"
        const stripRootMotion = (clip) => {
          if (!clip) return clip
          clip.tracks = clip.tracks.filter(t => !/Hips\.position$/i.test(t.name))
          return clip
        }
        const makeAction = (clip, label, loop = true) => {
          if (!clip) return null
          stripRootMotion(clip)
          clip.name = label
          const a = this.mixer.clipAction(clip)
          a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
          a.clampWhenFinished = !loop
          return a
        }
        this.actions.walk  = makeAction(gltf.animations?.[0], 'walk', true)
        this.actions.run   = this.actions.walk
        this.actions.idle  = makeAction(idleGltf?.animations?.[0], 'idle', true) || this.actions.walk
        this.actions.fire  = makeAction(fireGltf?.animations?.[0], 'fire', false)
        // Knife stance: regular walk/idle (arms at sides, not tactical)
        this.actions.knifeWalk = makeAction(knifeWalkGltf?.animations?.[0], 'knifeWalk', true) || this.actions.walk
        this.actions.knifeIdle = makeAction(knifeIdleGltf?.animations?.[0], 'knifeIdle', true) || this.actions.idle
        // Stealth Assassination full-body takedown animation
        this.actions.takedown = makeAction(takedownGltf?.animations?.[0], 'takedown', false)

        // Mixamo FBX clips need bone-name normalization (mixamorig:Hips vs mixamorigHips)
        const targetBones = new Set()
        model.traverse(o => { if (o.isBone) targetBones.add(o.name) })
        const targetArr = Array.from(targetBones)
        const normalizeFbxClip = (origClip) => {
          if (!origClip) return null
          // Clone so mutation doesn't pollute shared FBX cache (used by enemies too)
          const clip = origClip.clone()
          for (const t of clip.tracks) {
            const dotIdx = t.name.lastIndexOf('.')
            const rawBone = dotIdx >= 0 ? t.name.slice(0, dotIdx) : t.name
            const propPart = dotIdx >= 0 ? t.name.slice(dotIdx) : ''
            if (targetBones.has(rawBone)) continue
            // Strip pipe namespace prefix (Armature|x)
            const afterPipe = rawBone.includes('|') ? rawBone.split('|').pop() : rawBone
            // Strip mixamorig variants — mixamorig:, mixamorig1, mixamorig9, etc.
            const stripped = afterPipe.replace(/^mixamorig\d*[:_]?/, '')
            const candidates = [
              afterPipe,
              `mixamorig:${stripped}`,
              `mixamorig${stripped}`,
              stripped,
            ]
            let matched = null
            for (const c of candidates) {
              if (targetBones.has(c)) { matched = c; break }
            }
            // Last resort: suffix match against any target bone
            if (!matched && stripped.length > 2) {
              matched = targetArr.find(b => b.endsWith(stripped) || b.endsWith(`:${stripped}`)) || null
            }
            if (matched) t.name = matched + propPart
          }
          return clip
        }
        // Robust FBX clip binder — prefer name-normalize (preserves quaternion data
        // so Mixamo→Mixamo clips don't end up T-posed by retargetClip's matrix transform).
        // Fall back to SkeletonUtils.retargetClip only if normalize binds too few tracks.
        const countBound = (clip) => {
          if (!clip) return 0
          let n = 0
          for (const t of clip.tracks) {
            const dot = t.name.lastIndexOf('.')
            const bone = dot >= 0 ? t.name.slice(0, dot) : t.name
            if (targetBones.has(bone)) n++
          }
          return n
        }
        const bindFbxClip = (fbxScene, label, loop = false) => {
          if (!fbxScene) return null
          const srcClip = (fbxScene.animations || []).find(c => c?.tracks?.length > 0)
          if (!srcClip) {
            console.warn(`[Player] ${label}: no usable animation in FBX`)
            return null
          }
          // Try normalize path first
          const candB = normalizeFbxClip(srcClip)
          const boundB = countBound(candB)
          if (boundB >= 10) {
            console.log(`[Player] ${label}: ✓ normalize bound ${boundB}/${srcClip.tracks.length}`)
            return makeAction(candB, label, loop)
          }
          // Fallback: SkeletonUtils.retargetClip
          let candA = null, boundA = 0
          try {
            candA = SkeletonUtils.retargetClip(model, fbxScene, srcClip, { useTargetMatrix: true })
            boundA = countBound(candA)
          } catch (e) {
            console.warn(`[Player] retarget ${label} failed:`, e.message)
          }
          console.log(`[Player] ${label}: normalize ${boundB}, retargetClip ${boundA} → using ${boundA > boundB ? 'retarget' : 'normalize'} (sample tracks:`, srcClip.tracks.slice(0, 3).map(t => t.name), ')')
          // If neither path bound any meaningful tracks, skip — caller falls back to default idle
          if (Math.max(boundA, boundB) < 5) {
            console.warn(`[Player] ${label}: SKIPPED — too few tracks bound (would T-pose)`)
            return null
          }
          return makeAction(boundA > boundB ? candA : candB, label, loop)
        }
        // "Stomach Hit" — ranged bullet hit
        this.actions.hit = bindFbxClip(hitFbx, 'hit', false)
        // "Hit To Body" — melee/slash hit
        this.actions.hitMelee = bindFbxClip(hitBodyFbx, 'hitMelee', false)
        // "Fight Idle" — looping stance played when player pistol is out of ammo
        this.actions.fightIdle = bindFbxClip(fightIdleFbx, 'fightIdle', true)
        // Fist Fight combos — A and B punch attacks
        this.actions.fistA = bindFbxClip(fistAFbx, 'fistA', false)
        this.actions.fistB = bindFbxClip(fistBFbx, 'fistB', false)
        // Pencil stab — prefer dedicated "Stabbing" clip; fall back to outward slash
        this.actions.stab = bindFbxClip(stabbingFbx, 'stab', false) || bindFbxClip(slashFbx, 'stab', false)
        // Backward pistol walk
        this.actions.walkBack = bindFbxClip(walkBackFbx, 'walkBack', true)
        // Crouched walking — overrides pencil knifeWalk anim for stealthy approach
        const crouched = bindFbxClip(crouchWalkFbx, 'knifeWalk', true)
        if (crouched) this.actions.knifeWalk = crouched
        // Death — played once on HP 0, then frozen on last frame for game over
        this.actions.death = bindFbxClip(deathFbx, 'death', false)
        // Fight mode space attacks — random pick between kick and punch
        this.actions.kick = bindFbxClip(kickFbx, 'kick', false)
        this.actions.punch = bindFbxClip(punchFbx, 'punch', false)
        // Fight mode running anim — used when player moves while in fight mode
        this.actions.fightRun = bindFbxClip(fightRunFbx, 'fightRun', true)
        // Running Backward — backpedal anim while aim-locked on enemy
        this.actions.runBack = bindFbxClip(runBackFbx, 'runBack', true)
        // Grab Rifle From Side — gun draw anim played when switching to pistol/MG
        this.actions.grabWeapon = bindFbxClip(grabFbx, 'grabWeapon', false)
        // Strafe anims — left/right side-step
        this.actions.strafeLeft = bindFbxClip(strafeLeftFbx, 'strafeLeft', true)
        this.actions.strafeRight = bindFbxClip(strafeRightFbx, 'strafeRight', true)
        // Rifle idle — used as idle pose when machinegun weapon is active
        this.actions.rifleIdle = bindFbxClip(rifleIdleFbx, 'rifleIdle', true)
        // Shoot Rifle — looping firing anim used while MG fires + player is moving
        this.actions.shootRifle = bindFbxClip(shootRifleFbx, 'shootRifle', true)
        // Put Back Rifle — gun-to-holster anim, played before grab when swapping guns
        this.actions.putBackWeapon = bindFbxClip(putBackFbx, 'putBackWeapon', false)
        // Pencil Standing Idle — pencil-mode idle stance (overrides knifeIdle for pencil weapon)
        this.actions.pencilIdle = bindFbxClip(pencilIdleFbx, 'pencilIdle', true)
        // Stab anim disabled — using procedural arm rotation instead (reliable across skeletons)
        // Capture right-arm bone for manual thrust animation
        this.rightArmBone = this._findBone(model, ['mixamorig:RightArm', 'RightArm'])
        this.rightForeArmBone = this._findBone(model, ['mixamorig:RightForeArm', 'RightForeArm'])
        this._armRestQuat = this.rightArmBone?.quaternion.clone()
        this._foreArmRestQuat = this.rightForeArmBone?.quaternion.clone()
        this.actions.dodge = this.actions.run

        this._switchTo('idle')
        console.log('Player actions:', Object.keys(this.actions).filter(k => this.actions[k]))
    }
  }

  _setupCustomAvatar(avatarGltf, animGltf) {
    // Hide procedural parts
    for (const child of [...this.group.children]) {
      if (child !== this.muzzle && child !== this.flash) child.visible = false
    }
    const model = avatarGltf.scene
    model.scale.setScalar(1.0)
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    this.group.add(model)
    this.glbModel = model

    // Retarget animations from source skeleton to avatar skeleton
    const animTargetRoot = model
    this.mixer = new THREE.AnimationMixer(animTargetRoot)
    this.actions = {}
    this.clipByName = {}

    // Find source skinned mesh as clip origin
    let srcRoot = animGltf.scene
    const retargetOpts = { useTargetMatrix: true }
    for (const clip of animGltf.animations || []) {
      try {
        const retargeted = SkeletonUtils.retargetClip(animTargetRoot, srcRoot, clip, retargetOpts)
        retargeted.name = clip.name
        this.clipByName[clip.name.toLowerCase()] = this.mixer.clipAction(retargeted)
      } catch (e) {
        // Fallback: use original clip directly (works if bone names match)
        try {
          this.clipByName[clip.name.toLowerCase()] = this.mixer.clipAction(clip)
        } catch {}
      }
    }

    const pick = (...keys) => {
      for (const k of keys) for (const [n, a] of Object.entries(this.clipByName)) if (n.includes(k)) return a
      return null
    }
    this.actions.idle  = pick('idle', 'stand') || Object.values(this.clipByName)[0]
    this.actions.walk  = pick('walk') || this.actions.idle
    this.actions.run   = pick('run', 'jog') || this.actions.walk
    this.actions.fire  = pick('fire', 'shoot') || this.actions.idle
    this.actions.dodge = pick('dodge', 'roll') || this.actions.run

    this._switchTo('idle')

    // Attach pistol to right hand
    const rightHand = this._findBone(model, ['RightHand', 'mixamorigRightHand', 'right_hand', 'Hand_R'])
    if (rightHand) {
      const pistol = this._buildHandPistol()
      rightHand.add(pistol)
      this.muzzle = pistol.userData.muzzle
    }

    console.log('Custom avatar loaded with', Object.keys(this.clipByName).length, 'retargeted animations')
  }

  _findBone(root, nameList) {
    let found = null
    root.traverse(o => {
      if (found) return
      if (!o.isBone && !o.isObject3D) return
      for (const n of nameList) {
        if (o.name === n) { found = o; return }
      }
    })
    if (!found) {
      // Fallback: loose substring match
      root.traverse(o => {
        if (found) return
        for (const n of nameList) {
          if (o.name && o.name.toLowerCase().includes(n.toLowerCase().replace('mixamorig:', ''))) {
            found = o
            return
          }
        }
      })
    }
    return found
  }

  _buildHandPistol() {
    const g = new THREE.Group()
    const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, metalness: 0.85, roughness: 0.35 })
    const slideMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.95, roughness: 0.25 })
    const gripMat  = new THREE.MeshStandardMaterial({ color: 0x050507, metalness: 0.3, roughness: 0.8 })
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.33, 0.14), gripMat)
    grip.position.set(0, 0, 0)
    g.add(grip)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.6), bodyMat)
    body.position.set(0, 0.2, 0.3)
    g.add(body)
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.6), slideMat)
    slide.position.set(0, 0.3, 0.3)
    g.add(slide)
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.06), slideMat)
    sight.position.set(0, 0.37, 0.05)
    g.add(sight)
    const muzzle = new THREE.Object3D()
    muzzle.position.set(0, 0.2, 0.63)
    g.add(muzzle)
    g.userData.muzzle = muzzle
    return g
  }

  _buildHandMachineGun() {
    const g = new THREE.Group()
    const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.85, roughness: 0.45 })
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.95, roughness: 0.3 })
    const stockMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 })
    // Grip at origin
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.13), bodyMat)
    g.add(grip)
    // Magazine in front of grip
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.1), bodyMat)
    mag.position.set(0, -0.05, 0.18)
    g.add(mag)
    // Receiver body — wider + longer than pistol
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.9), bodyMat)
    body.position.set(0, 0.22, 0.4)
    g.add(body)
    // Long barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 12), metalMat)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.22, 1.0)
    g.add(barrel)
    // Stock behind grip
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.4), stockMat)
    stock.position.set(0, 0.22, -0.2)
    g.add(stock)
    // Front sight
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), metalMat)
    sight.position.set(0, 0.34, 1.25)
    g.add(sight)
    const muzzle = new THREE.Object3D()
    muzzle.position.set(0, 0.22, 1.4)
    g.add(muzzle)
    g.userData.muzzle = muzzle
    return g
  }

  _buildHandPencil() {
    const g = new THREE.Group()
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xe8b060, roughness: 0.6 })
    const graphiteMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 })
    const eraserMat = new THREE.MeshStandardMaterial({ color: 0xdd4444, roughness: 0.8 })
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xc08040, metalness: 0.8, roughness: 0.3 })
    // Pencil shifted forward — tip clearly outside fist, eraser end tucked inside palm
    // (half visible, half hidden in grip per design).
    // Lowered y by 0.18 — pencil sits inside fist instead of floating above
    const dy = -0.18
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), woodMat)
    shaft.rotation.x = Math.PI / 2
    shaft.position.set(0, dy, 0.2)
    g.add(shaft)
    // Sharpened tip
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 8), woodMat)
    tip.rotation.x = Math.PI / 2
    tip.position.set(0, dy, 0.46)
    g.add(tip)
    // Graphite point
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 8), graphiteMat)
    point.rotation.x = Math.PI / 2
    point.position.set(0, dy, 0.54)
    g.add(point)
    // Metal band — at fist edge
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.06, 8), bandMat)
    band.rotation.x = Math.PI / 2
    band.position.set(0, dy, -0.04)
    g.add(band)
    // Eraser — tucked inside fist
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.08, 8), eraserMat)
    eraser.rotation.x = Math.PI / 2
    eraser.position.set(0, dy, -0.11)
    g.add(eraser)
    const muzzle = new THREE.Object3D()
    muzzle.position.set(0, dy, 0.58)
    g.add(muzzle)
    g.userData.muzzle = muzzle
    return g
  }

  setWeapon(name) {
    if (!this.weapons) return
    this.currentWeapon = name
    const empty = this.ammo[name] === 0
    for (const [key, mesh] of Object.entries(this.weapons)) {
      mesh.visible = (key === name && !empty)
    }
    this.pistolMesh = this.weapons[name]
    this.muzzle = this.pistolMesh?.userData.muzzle || this.muzzle
    if (this.weapons.pencil && this.weapons.pencil.parent !== this.group) {
      this.group.add(this.weapons.pencil)
    }
    if (this.stabRangeRing) this.stabRangeRing.visible = (name === 'pencil')
    if (this.fightRangeRing) this.fightRangeRing.visible = (name === 'fight')
    this._updateWeaponHUD()
  }

  // Auto-promote weapon when current one runs out: pistol → MG → pencil → fight
  _autoSwitchOnEmpty() {
    const order = ['pistol', 'machinegun', 'pencil', 'fight']
    const idx = order.indexOf(this.currentWeapon)
    for (let i = idx + 1; i < order.length; i++) {
      const next = order[i]
      const a = this.ammo[next]
      if (a === undefined || a > 0) {
        this.setWeapon(next)
        return
      }
    }
  }

  _updateWeaponHUD() {
    const label = { pistol: 'PISTOL', machinegun: 'MACHINE GUN', pencil: 'PENCIL', fight: 'FIGHT' }[this.currentWeapon]
    if (!label) return
    const ammo = this.ammo[this.currentWeapon]
    const text = ammo === undefined ? label : `${label} · ${ammo}/${this.maxAmmo[this.currentWeapon]}`
    if (window.__GAME__?.ui) window.__GAME__.ui.setWeapon(text)
  }

  _switchTo(name, fadeSec = 0.2) {
    if (!this.actions || !this.actions[name]) return
    const next = this.actions[name]
    if (this._currentAction === next) return
    next.reset().fadeIn(fadeSec).play()
    if (this._currentAction) this._currentAction.fadeOut(fadeSec)
    this._currentAction = next
    this._currentActionName = name
  }

  _playOneShot(name, fadeSec = 0.1) {
    if (!this.actions || !this.actions[name]) return false
    const action = this.actions[name]
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.fadeIn(fadeSec).play()
    if (this._currentAction && this._currentAction !== action) this._currentAction.fadeOut(fadeSec)
    this._currentAction = action
    this._currentActionName = name
    return true
  }

  registerPhysics(physics) {
    const r = physics.addKinematicCharacter(this.position, 0.9, 0.4)
    this.physicsBody = r.body
    this.physicsCollider = r.collider
    this.physicsCtrl = r.ctrl
    this.physics = physics
  }

  update(delta, inputs, raycaster, groundPlane, enemies, onHitEnemy) {
    // Dead — let death anim mixer run, drop body to floor as clip plays
    if (this._dead) {
      if (this.mixer) this.mixer.update(delta)
      this._deathT = (this._deathT || 0) + delta
      const p = Math.min(1, this._deathT / (this._deathDur || 1.5))
      const eased = p * p
      this.group.position.y = this.position.y - (this._deathDropTarget || 0.9) * eased
      return
    }
    // Camera-relative input
    const m = inputs.axisMove()
    const cam = window.__GAME__.camera
    const basis = cam.getBasis()
    // desired velocity in world XZ from camera basis
    const desiredX = basis.forward.x * (-m.z) + basis.right.x * m.x
    const desiredZ = basis.forward.z * (-m.z) + basis.right.z * m.x
    const dLen = Math.hypot(desiredX, desiredZ)
    let tx = 0, tz = 0
    if (dLen > 0) {
      tx = (desiredX / dLen) * this.maxSpeed
      tz = (desiredZ / dLen) * this.maxSpeed
    }

    // Velocity smoothing — accel toward target, decel toward 0
    const ramp = (dLen > 0) ? this.accel : this.decel
    const k = Math.min(ramp * delta, 1) * 0.5
    this.velocity.x += (tx - this.velocity.x) * k * 2
    this.velocity.z += (tz - this.velocity.z) * k * 2

    if (this.physicsBody) {
      const desired = { x: this.velocity.x * delta, y: -0.05, z: this.velocity.z * delta }
      this.physicsCtrl.computeColliderMovement(this.physicsCollider, desired)
      const corrected = this.physicsCtrl.computedMovement()
      const t = this.physicsBody.translation()
      let nx = t.x + corrected.x
      let nz = t.z + corrected.z
      // Hard-clamp to playable arena (warehouse interior) — belt-and-suspenders
      // in case any collider has a gap.
      const b = this.arenaBounds
      if (b) {
        if (nx < b.minX) nx = b.minX
        else if (nx > b.maxX) nx = b.maxX
        if (nz < b.minZ) nz = b.minZ
        else if (nz > b.maxZ) nz = b.maxZ
      }
      const next = { x: nx, y: t.y + corrected.y, z: nz }
      this.physicsBody.setNextKinematicTranslation(next)
      // Sync visual position (subtract 0.9 capsule offset to put feet on ground)
      this.position.set(next.x, next.y - 0.9, next.z)
      this.group.position.copy(this.position)
    } else {
      // Fallback before physics is ready (intro/init frames)
      this.position.x += this.velocity.x * delta
      this.position.z += this.velocity.z * delta
      this.group.position.copy(this.position)
    }

    const speedNow = Math.hypot(this.velocity.x, this.velocity.z)
    const moving = speedNow > 0.4
    if (this.mixer) this.mixer.update(delta)

    // Takedown cinematic (overrides everything)
    if (this._takedownActive) {
      this._updateTakedown(delta)
      // freeze player movement
      this.velocity.set(0, 0, 0)
    }
    // Procedural stab arm thrust — rotates right arm + forearm forward briefly
    if (this._stabTime > 0 && this.rightArmBone && this.rightForeArmBone) {
      this._stabTime -= delta
      const t = Math.max(0, this._stabTime)
      const progress = 1 - t / 0.35
      const pulse = Math.sin(progress * Math.PI)   // 0→1→0 ease
      // Rotate shoulder up+forward
      const armRot = new THREE.Euler(-pulse * 1.4, 0, 0)
      const armQuat = new THREE.Quaternion().setFromEuler(armRot)
      this.rightArmBone.quaternion.multiplyQuaternions(this._armRestQuat, armQuat)
      // Extend forearm
      const foreRot = new THREE.Euler(-pulse * 0.6, 0, 0)
      const foreQuat = new THREE.Quaternion().setFromEuler(foreRot)
      this.rightForeArmBone.quaternion.multiplyQuaternions(this._foreArmRestQuat, foreQuat)
    } else if (this.rightArmBone && this._armRestQuat && this._stabTime <= 0 && this._stabTime > -1) {
      // Snap back to rest (then mixer resumes control naturally)
      this._stabTime = -1
    }

    // Track right hand bone position for ALL weapons — only active one is visible
    if (this.weapons && this.rightHandBone) {
      const pos = new THREE.Vector3()
      this.rightHandBone.getWorldPosition(pos)
      this.group.worldToLocal(pos)
      for (const w of Object.values(this.weapons)) {
        w.position.copy(pos)
        w.rotation.set(0, Math.PI, 0)
        w.scale.setScalar(0.33)
      }
      const pencil = this.weapons.pencil
      // Pencil stab thrust animation — bigger forward pulse + slight down angle for stab feel
      if (pencil?.userData.stabTime > 0) {
        pencil.userData.stabTime -= delta
        const t = Math.max(0, pencil.userData.stabTime)
        const progress = 1 - t / 0.3
        const thrust = Math.sin(progress * Math.PI) * 0.5   // stronger forward push
        pencil.position.z -= thrust
        pencil.rotation.x = -Math.sin(progress * Math.PI) * 0.4  // tip dips down like stabbing
      }
    }

    // Anim state machine (GLB only)
    if (this.actions) {
      const wantFireNow = inputs.mouse.down || inputs.isDown(' ') || inputs.isDown('spacebar')
      const dodgePressed = inputs.consumePress('shift')
      if (dodgePressed && !this._dodging) {
        this._dodging = true
        // Instant speed burst in current movement direction (or facing)
        const kickDir = (dLen > 0)
          ? { x: desiredX / dLen, z: desiredZ / dLen }
          : { x: -Math.sin(this.group.rotation.y), z: -Math.cos(this.group.rotation.y) }
        this.velocity.x = kickDir.x * 18
        this.velocity.z = kickDir.z * 18
        if (this.actions.dodge) this._playOneShot('dodge')
        else if (this.actions.run) this._switchTo('run', 0.05)
        setTimeout(() => { this._dodging = false }, 450)
      } else if (this.currentWeapon === 'machinegun' && wantFireNow && moving && this.actions?.shootRifle && !this._punching && !this._hitReacting) {
        this._switchTo('shootRifle')
      } else if (!this._dodging && !this._firing && !this._hitReacting && !this._punching) {
        const isKnife = this.currentWeapon === 'pencil'
        const isFightMode = this.currentWeapon === 'fight'
        const isPistolEmpty = this.currentWeapon === 'pistol' && this.ammo.pistol === 0
        // Fight mode now reuses pencilIdle (per design — same standing pose as option 3)
        const useFightIdle = isPistolEmpty && this.actions.fightIdle
        const usePencilIdle = (isKnife || isFightMode) && this.actions.pencilIdle
        const useRifleIdle = this.currentWeapon === 'machinegun' && this.actions.rifleIdle
        // Backward detection — velocity opposes character facing
        const fcx = -Math.sin(this.group.rotation.y)
        const fcz = -Math.cos(this.group.rotation.y)
        const fwdDot = this.velocity.x * fcx + this.velocity.z * fcz
        const movingBack = moving && fwdDot < -1.0
        // Right vector (perpendicular to forward, pointing right of character)
        const rcx = Math.cos(this.group.rotation.y)
        const rcz = -Math.sin(this.group.rotation.y)
        const rightDot = this.velocity.x * rcx + this.velocity.z * rcz
        const sideDominant = moving && Math.abs(rightDot) > Math.abs(fwdDot) + 0.5
        // Running Backward — when aim-locked on enemy and moving away
        const useRunBack = movingBack && this.autoAimTarget && this.actions.runBack
        const useWalkBack = movingBack && this.currentWeapon === 'pistol' && this.actions.walkBack
        const useFightRun = isFightMode && moving && this.actions.fightRun
        // Strafe anims are rifle-specific — only play when machinegun is held
        const isMG = this.currentWeapon === 'machinegun'
        const useStrafeRight = isMG && sideDominant && rightDot > 0 && this.actions.strafeRight
        const useStrafeLeft = isMG && sideDominant && rightDot < 0 && this.actions.strafeLeft
        const base = moving
          ? (useStrafeLeft ? 'strafeLeft'
            : useStrafeRight ? 'strafeRight'
            : useRunBack ? 'runBack'
            : useWalkBack ? 'walkBack'
            : useFightRun ? 'fightRun'
            : (isKnife ? 'knifeWalk' : (speedNow > 5.5 ? 'run' : 'walk')))
          : (usePencilIdle ? 'pencilIdle'
            : useFightIdle ? 'fightIdle'
            : useRifleIdle ? 'rifleIdle'
            : (isKnife ? 'knifeIdle' : 'idle'))
        this._switchTo(base)
        // Intense knife walk: 1.4x playback speed for purposeful stride
        const ts = isKnife && moving ? 1.4
                 : (speedNow > 5.5 && !isKnife) ? 1.7
                 : 1.0
        if (this._currentAction) this._currentAction.timeScale = ts
      }
    }
    if (moving) {
      const speedRatio = speedNow / this.maxSpeed
      this.walkPhase += delta * (8 + speedRatio * 6)
      const s = Math.sin(this.walkPhase) * 0.3 * speedRatio
      this.legL.rotation.x =  s
      this.legR.rotation.x = -s
      this.shoeL.position.z = 0.05 +  s * 0.2
      this.shoeR.position.z = 0.05 -  s * 0.2
      this.head.position.y = 2.05 + Math.abs(Math.sin(this.walkPhase * 2)) * 0.04 * speedRatio
    } else {
      this.legL.rotation.x *= 0.85
      this.legR.rotation.x *= 0.85
      this.head.position.y += (2.05 - this.head.position.y) * 0.2
    }

    // Auto-aim: any alive enemy within range — engages while walking past
    const AUTO_AIM_RANGE = 10
    let target = null
    let bestDist = AUTO_AIM_RANGE
    for (const en of enemies) {
      if (!en.alive) continue
      const dx = en.position.x - this.position.x
      const dz = en.position.z - this.position.z
      const d = Math.hypot(dx, dz)
      if (d < bestDist) { bestDist = d; target = en }
    }
    this.autoAimTarget = target

    let aimX, aimZ
    if (target) {
      aimX = target.position.x - this.position.x
      aimZ = target.position.z - this.position.z
    } else if (moving) {
      // Face/aim = movement direction
      aimX = this.velocity.x
      aimZ = this.velocity.z
    } else {
      // Idle — keep last aim (derived from group rotation)
      const rot = this.group.rotation.y
      aimX = -Math.sin(rot)
      aimZ = -Math.cos(rot)
    }
    const aimLen = Math.hypot(aimX, aimZ) || 1
    aimX /= aimLen; aimZ /= aimLen
    this.aim.set(aimX, 0, aimZ)

    // Determine fire intent first (affects facing)
    const wantFire = inputs.mouse.down || inputs.isDown(' ') || inputs.isDown('spacebar')

    // Facing: movement direction when moving, else aim (auto-target); mouse ignored
    let desiredYaw
    if (target) {
      desiredYaw = Math.atan2(aimX, aimZ) + Math.PI
    } else if (moving) {
      desiredYaw = Math.atan2(this.velocity.x, this.velocity.z) + Math.PI
    } else {
      desiredYaw = this.group.rotation.y  // hold
    }
    // smooth-rotate
    const cur = this.group.rotation.y
    const diff = Math.atan2(Math.sin(desiredYaw - cur), Math.cos(desiredYaw - cur))
    this.group.rotation.y = cur + diff * Math.min(delta * 14, 1)

    // Weapon switching (1/2/3/4 keys)
    if (inputs.consumePress('1')) this.setWeapon('pistol')
    if (inputs.consumePress('2')) this.setWeapon('machinegun')
    if (inputs.consumePress('3')) this.setWeapon('pencil')
    if (inputs.consumePress('4')) this.setWeapon('fight')

    // Fist combos — A / B keys. Each press is a 3-hit combo timed across the clip.
    const punchA = inputs.consumePress('a')
    const punchB = inputs.consumePress('b')
    if ((punchA || punchB) && !this._punching && !this._takedownActive && !this._hitReacting) {
      const clipName = punchA ? 'fistA' : 'fistB'
      const action = this.actions?.[clipName]
      if (action) {
        this._punching = true
        this._playOneShot(clipName, 0.05)
        const dur = (action.getClip().duration || 1.0) * 1000
        clearTimeout(this._punchTimer)
        this._punchTimer = setTimeout(() => { this._punching = false }, dur)
        // Combo: 3 timed damage events at impact frames (25%, 55%, 85% through the clip)
        clearTimeout(this._comboT1); clearTimeout(this._comboT2); clearTimeout(this._comboT3)
        this._comboT1 = setTimeout(() => this._punchHit(enemies, onHitEnemy), dur * 0.25)
        this._comboT2 = setTimeout(() => this._punchHit(enemies, onHitEnemy), dur * 0.55)
        this._comboT3 = setTimeout(() => this._punchHit(enemies, onHitEnemy), dur * 0.85)
      }
    }

    // Attack — pistol/MG fire bullets, pencil stabs melee
    this.fireCooldown -= delta
    if (wantFire && this.fireCooldown <= 0) {
      if (this.currentWeapon === 'pencil') {
        if (this.ammo.pencil > 0) {
          this._stabMelee(enemies, onHitEnemy)
          this.fireCooldown = 0.55
        }
      } else if (this.currentWeapon === 'fight') {
        // Fight mode space — random kick or punch combo
        if (!this._punching && !this._hitReacting) {
          const pool = []
          if (this.actions?.kick) pool.push('kick')
          if (this.actions?.punch) pool.push('punch')
          if (pool.length > 0) {
            const clipName = pool[Math.floor(Math.random() * pool.length)]
            const action = this.actions[clipName]
            this._punching = true
            this._playOneShot(clipName, 0.05)
            const dur = (action.getClip().duration || 0.8) * 1000
            clearTimeout(this._punchTimer)
            this._punchTimer = setTimeout(() => { this._punching = false }, dur)
            // Damage delivered at mid-clip — strike connects on the swing peak
            clearTimeout(this._kickHitTimer)
            this._kickHitTimer = setTimeout(() => this._punchHit(enemies, onHitEnemy), dur * 0.5)
            this.fireCooldown = 0.4
          }
        }
      } else {
        const ammo = this.ammo[this.currentWeapon]
        if (ammo === undefined || ammo > 0) {
          this.shoot()
          this.fireCooldown = this.currentWeapon === 'machinegun' ? 0.06 : 0.18
          if (ammo !== undefined) {
            this.ammo[this.currentWeapon] = ammo - 1
            this._updateWeaponHUD()
            if (this.ammo[this.currentWeapon] === 0 && this.weapons[this.currentWeapon]) {
              this.weapons[this.currentWeapon].visible = false
              // Auto-promote to next weapon in the order pistol → MG → pencil → fight
              this._autoSwitchOnEmpty()
            }
          }
        }
      }
    }

    // Muzzle flash decay — both layers fade fast for sharp pop
    if (this.flashOuter) this.flashOuter.material.opacity *= 0.5
    if (this.flashCore) this.flashCore.material.opacity *= 0.35
    // Weapon recoil decay — pulled back along group +Z (character behind), springs forward
    if (this._recoilT > 0 && this.pistolMesh) {
      this._recoilT -= delta
      const t = Math.max(0, this._recoilT)
      const amt = (t / 0.12) * 0.06
      this.pistolMesh.position.z += amt
    }

    // Bullets
    const world = window.__GAME__?.world
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]
      b.life -= delta
      // Substep movement — bullets at 55m/s skip thin walls in one frame.
      // Sample path every ~25cm so wall AABB always catches the hit.
      const moveDist = b.speed * delta
      const steps = Math.max(1, Math.ceil(moveDist / 0.25))
      const stepLen = moveDist / steps
      let wallHit = false
      for (let s = 0; s < steps; s++) {
        b.mesh.position.x += b.dir.x * stepLen
        b.mesh.position.z += b.dir.z * stepLen
        if (world?.isInsideWall && world.isInsideWall(b.mesh.position.x, b.mesh.position.z)) {
          b.life = 0
          wallHit = true
          break
        }
      }
      if (wallHit && world?.spawnWallImpact) {
        world.spawnWallImpact(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.dir)
      }
      if (b.life <= 0) {
        this.scene.remove(b.mesh)
        this.bullets.splice(i, 1)
        continue
      }
      for (const e of enemies) {
        if (!e.alive) continue
        const dx = b.mesh.position.x - e.position.x
        const dz = b.mesh.position.z - e.position.z
        if (Math.hypot(dx, dz) < 1.1) {
          const dmg = this.currentWeapon === 'machinegun' ? 10
                    : this.currentWeapon === 'pencil' ? 80
                    : 25
          // Hit direction: enemy → shooter is opposite of bullet flight
          const hitDir = { x: -b.dir.x, z: -b.dir.z }
          onHitEnemy(e, dmg, enemies, hitDir)
          b.life = 0
          break
        }
      }
      if (b.life <= 0) {
        this.scene.remove(b.mesh)
        this.bullets.splice(i, 1)
      }
    }
  }

  // Fist punch — front cone of 2.5m + omni 1.2m grace circle for very close enemies
  _punchHit(enemies, onHitEnemy) {
    const PUNCH_RANGE = 2.5
    const OMNI_RANGE = 1.2
    const facing = this.group.rotation.y
    const fwdX = -Math.sin(facing)
    const fwdZ = -Math.cos(facing)
    let target = null, bestDist = PUNCH_RANGE
    for (const e of enemies) {
      if (!e.alive) continue
      const dx = e.position.x - this.position.x
      const dz = e.position.z - this.position.z
      const d = Math.hypot(dx, dz)
      if (d > PUNCH_RANGE) continue
      const dot = (dx * fwdX + dz * fwdZ) / (d || 1)
      // Front cone (~78°) OR very close (omni grace)
      if (dot < 0.2 && d > OMNI_RANGE) continue
      if (d < bestDist) { bestDist = d; target = e }
    }
    console.log('[Player] punch — target:', target ? `enemy at ${bestDist.toFixed(2)}m` : 'NONE', 'alive:', enemies.filter(e => e.alive).length)
    if (target) {
      const hitDir = { x: -fwdX, z: -fwdZ }
      onHitEnemy(target, 10, enemies, hitDir, 'melee')
    }
  }

  _stabMelee(enemies, onHitEnemy) {
    if (this._takedownActive) return
    const STAB_RANGE = 1.8   // arm-reach distance for pencil/knife stab
    let target = null, bestDist = STAB_RANGE
    for (const e of enemies) {
      if (!e.alive) continue
      const dx = e.position.x - this.position.x
      const dz = e.position.z - this.position.z
      const d = Math.hypot(dx, dz)
      if (d < bestDist) { bestDist = d; target = e }
    }
    console.log('Stab: target =', target ? `enemy at ${bestDist.toFixed(2)}m` : 'NONE (air stab)', 'enemies alive:', enemies.filter(e => e.alive).length)
    // Play outward-slash anim regardless of target — visual feedback for the stab
    if (this.actions?.stab) {
      this._punching = true   // reuse flag to block locomotion swap
      this._playOneShot('stab', 0.05)
      const dur = (this.actions.stab.getClip().duration || 0.6) * 1000
      clearTimeout(this._punchTimer)
      this._punchTimer = setTimeout(() => { this._punching = false }, dur)
    } else {
      this._stabTime = 0.35
    }
    const w = this.weapons?.pencil
    if (w) w.userData.stabTime = 0.35

    if (target) {
      // Damage delivered at end of stab clip — blade must connect first
      const dx = target.position.x - this.position.x
      const dz = target.position.z - this.position.z
      const d = Math.hypot(dx, dz) || 1
      const hitDir = { x: -dx / d, z: -dz / d }
      // Damage lands at the blade's mid-point of the slash (50% through the clip)
      const dur = (this.actions?.stab?.getClip().duration || 0.6) * 1000
      clearTimeout(this._stabHitTimer)
      this._stabHitTimer = setTimeout(() => {
        if (!target.alive) return
        // Re-check range so target running away dodges the hit
        const ndx = target.position.x - this.position.x
        const ndz = target.position.z - this.position.z
        if (Math.hypot(ndx, ndz) > STAB_RANGE + 0.5) return
        onHitEnemy(target, 80, enemies, hitDir, 'melee')
        // Pencil ammo: each successful stab consumes one charge — runs out → auto-switch
        if (this.ammo.pencil > 0) {
          this.ammo.pencil -= 1
          this._updateWeaponHUD()
          if (this.ammo.pencil === 0) {
            if (this.weapons.pencil) this.weapons.pencil.visible = false
            this._autoSwitchOnEmpty()
          }
        }
      }, dur * 0.5)
    }
  }

  _captureEnemyLegBones(t) {
    if (t._legBonesCaptured) return
    t._legBonesCaptured = true
    const find = (names) => {
      let f = null
      t.group.traverse(o => { if (!f) for (const n of names) if (o.name === n) { f = o; return } })
      return f
    }
    t._upLegL = find(['mixamorig:LeftUpLeg'])
    t._upLegR = find(['mixamorig:RightUpLeg'])
    t._legL = find(['mixamorig:LeftLeg'])
    t._legR = find(['mixamorig:RightLeg'])
    t._spine = find(['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2'])
    t._upLegL_rest = t._upLegL?.quaternion.clone()
    t._upLegR_rest = t._upLegR?.quaternion.clone()
    t._legL_rest   = t._legL?.quaternion.clone()
    t._legR_rest   = t._legR?.quaternion.clone()
    t._spine_rest  = t._spine?.quaternion.clone()
  }

  _startTakedown(target, enemies, onHitEnemy) {
    this._captureEnemyLegBones(target)
    this._takedownActive = true
    this._takedownTarget = target
    this._takedownAll = enemies
    this._takedownT = 0
    target._frozenForTakedown = true
    // Snap player to 0.7m from enemy + face enemy
    const dx = target.position.x - this.position.x
    const dz = target.position.z - this.position.z
    const d = Math.hypot(dx, dz) || 1
    const nx = dx / d, nz = dz / d
    this.position.x = target.position.x - nx * 0.7
    this.position.z = target.position.z - nz * 0.7
    if (this.physicsBody) {
      this.physicsBody.setNextKinematicTranslation({ x: this.position.x, y: this.position.y + 0.9, z: this.position.z })
    }
    this.aim.set(nx, 0, nz)
    this.group.rotation.y = Math.atan2(nx, nz) + Math.PI
    // Play Mixamo Stealth Assassination animation
    if (this.actions?.takedown) {
      this._playOneShot('takedown', 0.05)
    }
  }

  _updateTakedown(delta) {
    if (!this._takedownActive) return
    const t = this._takedownTarget
    if (!t) { this._endTakedown(); return }
    this._takedownT += delta

    // Kill flag + hide UI at 1.3s (mid-stab moment)
    if (this._takedownT > 1.3 && !t._killedInTakedown) {
      t._killedInTakedown = true
      if (t.hpBar) t.hpBar.visible = false
      if (t.visionMesh) t.visionMesh.visible = false
      if (t.alertIcon) t.alertIcon.visible = false
      t.alive = false
    }

    // Cinematic 3-phase fall with KNEE BENDING:
    const bendKnees = (kneeAmt, hipAmt, spineAmt) => {
      const ex = new THREE.Euler
      const q = new THREE.Quaternion
      // Knees bend BACKWARD (shin goes back behind thigh) — positive X rotation on shin bone
      if (t._legL && t._legL_rest) {
        ex.set(kneeAmt, 0, 0); q.setFromEuler(ex)
        t._legL.quaternion.multiplyQuaternions(t._legL_rest, q)
      }
      if (t._legR && t._legR_rest) {
        ex.set(kneeAmt, 0, 0); q.setFromEuler(ex)
        t._legR.quaternion.multiplyQuaternions(t._legR_rest, q)
      }
      // Hips rotate forward (UpLeg back to compensate)
      if (t._upLegL && t._upLegL_rest) {
        ex.set(-hipAmt, 0, 0); q.setFromEuler(ex)
        t._upLegL.quaternion.multiplyQuaternions(t._upLegL_rest, q)
      }
      if (t._upLegR && t._upLegR_rest) {
        ex.set(-hipAmt, 0, 0); q.setFromEuler(ex)
        t._upLegR.quaternion.multiplyQuaternions(t._upLegR_rest, q)
      }
      if (t._spine && t._spine_rest) {
        ex.set(spineAmt, 0, 0); q.setFromEuler(ex)
        t._spine.quaternion.multiplyQuaternions(t._spine_rest, q)
      }
    }

    if (this._takedownT > 1.3 && this._takedownT <= 1.7) {
      // KNEES BUCKLE — bones bend, character sinks to kneeling pose
      const p = (this._takedownT - 1.3) / 0.4
      const eased = p * p
      bendKnees(eased * 1.8, eased * 1.0, eased * 0.3)  // shin bend 100°, hip 57°, spine slight forward
      t.group.position.y = -eased * 0.4   // lower body slightly as legs fold
      t.group.rotation.x = 0
    } else if (this._takedownT > 1.7 && this._takedownT <= 2.0) {
      // Hold kneeling pose
      bendKnees(1.8, 1.0, 0.3)
      t.group.position.y = -0.4
      t.group.rotation.x = (this._takedownT - 1.7) / 0.3 * 0.25
    } else if (this._takedownT > 2.0) {
      // Forward face-plant
      const p = Math.min(1, (this._takedownT - 2.0) / 0.8)
      const eased = p * (2 - p)
      bendKnees(1.8, 1.0, 0.3 + eased * 0.6)
      t.group.rotation.x = 0.25 + eased * (Math.PI / 2 - 0.25)
      t.group.position.y = -0.4 + eased * 0.6
      t.group.rotation.z = Math.sin(p * Math.PI) * 0.1
    }

    // End at 2.8s — enemy body stays on floor (no removal)
    if (this._takedownT > 2.8) {
      this._endTakedown()
    }
  }

  _endTakedown() {
    this._takedownActive = false
    if (this._takedownTarget) this._takedownTarget._frozenForTakedown = false
    this._takedownTarget = null
  }

  shoot() {
    this.muzzle.getWorldPosition(this.muzzleWorld)
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat)
    mesh.position.copy(this.muzzleWorld)
    // Orient cylinder (default Y-axis) along flight direction so it looks like a tracer
    const dir = this.aim.clone().normalize()
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    this.scene.add(mesh)
    this.bullets.push({ mesh, dir, speed: 55, life: 0.9 })
    // Flash at actual gun muzzle (not stub) — both layers pop
    if (this.flash) {
      const flashLocal = this.muzzleWorld.clone()
      this.group.worldToLocal(flashLocal)
      this.flash.position.copy(flashLocal)
      if (this.flashOuter) this.flashOuter.material.opacity = 1.0
      if (this.flashCore) this.flashCore.material.opacity = 1.0
      // Random size jitter for variety
      const s = 0.85 + Math.random() * 0.4
      this.flash.scale.setScalar(s)
    }
    // Weapon recoil — gun kicks back along character forward axis (group +Z = back)
    this._recoilT = 0.12
    // Camera kick for impact feel
    const cam = window.__GAME__?.camera
    if (cam?.shake) cam.shake(0.07)
    if (this.armRig) {
      this.armRig.position.z = 0.08
      setTimeout(() => { if (this.armRig) this.armRig.position.z = 0 }, 60)
    }
    // Fire anim disabled — was causing T-pose snap due to skeleton mismatch
    // Bullets still fire; animation stays in walk/idle
  }

  _die() {
    if (this._dead) return
    this._dead = true
    const action = this.actions?.death
    let dur = 1500
    if (action) {
      this._playOneShot('death', 0.1)
      dur = (action.getClip().duration || 1.5) * 1000
    }
    // Procedural ground descent — Hips.position stripped, drop group y so body lays flat on floor
    this._deathT = 0
    this._deathDur = dur / 1000
    this._deathDropTarget = 0.9
    // Show Mission Failed banner after death clip finishes
    setTimeout(() => {
      if (window.__GAME__?.ui?.showGameOver) window.__GAME__.ui.showGameOver()
    }, dur)
  }

  takeDamage(n, type = 'ranged') {
    if (this._dead) return
    // Invincible while punching — combo absorbs incoming hits
    if (this._punching) return
    this.hp = Math.max(0, this.hp - n)
    // Visible hit indicator at chest height
    const world = window.__GAME__?.world
    if (world?.spawnHitImpact) {
      world.spawnHitImpact(this.position.x, this.position.y + 1.4, this.position.z, null)
    }
    if (this.hp <= 0) {
      this._die()
      return
    }
    if (this._takedownActive || this._dodging) return
    // Pick reaction clip — melee uses "Hit To Body", ranged uses "Stomach Hit"
    const clipName = (type === 'melee' && this.actions?.hitMelee) ? 'hitMelee' : 'hit'
    if (!this.actions?.[clipName]) return
    this._hitReacting = true
    this._playOneShot(clipName, 0.05)
    const dur = (this.actions[clipName].getClip().duration || 0.7) * 1000
    clearTimeout(this._hitTimer)
    this._hitTimer = setTimeout(() => { this._hitReacting = false }, dur)
  }
}
