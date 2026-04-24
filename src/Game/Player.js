import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

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

    this.group = new THREE.Group()
    this._buildWick()
    scene.add(this.group)
    this._tryLoadGLB()

    this.bulletGeo = new THREE.SphereGeometry(0.08, 8, 8)
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd44d })
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

    loader.load(
      '/assets/models/agent.glb',
      (gltf) => {
        // Hide procedural parts (keep ring on ground)
        for (const child of [...this.group.children]) {
          if (child !== this.muzzle && child !== this.flash) child.visible = false
        }
        const model = gltf.scene
        model.scale.setScalar(1.2)
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

        // Attach pistol to right hand bone
        const rightHand = this._findBone(model, ['mixamorig:RightHand', 'RightHand'])
        if (rightHand) {
          const pistolGroup = this._buildHandPistol()
          rightHand.add(pistolGroup)
          // override muzzle to use hand pistol muzzle
          this.muzzle = pistolGroup.userData.muzzle
        }

        if (gltf.animations && gltf.animations.length) {
          this.mixer = new THREE.AnimationMixer(model)
          this.actions = {}
          this.clipByName = {}
          for (const clip of gltf.animations) {
            this.clipByName[clip.name.toLowerCase()] = this.mixer.clipAction(clip)
          }
          // Fuzzy-map by substring
          const pick = (...keys) => {
            for (const k of keys) {
              for (const [name, action] of Object.entries(this.clipByName)) {
                if (name.includes(k)) return action
              }
            }
            return null
          }
          this.actions.idle  = pick('idle', 'stand', 'tpose')
          this.actions.walk  = pick('walk', 'strafe')
          this.actions.run   = pick('run', 'jog', 'sprint')
          this.actions.fire  = pick('fire', 'shoot', 'pistol')
          this.actions.dodge = pick('dodge', 'roll', 'dash')
          // Fallback: if no walk, use idle; if no run, use walk
          if (!this.actions.idle) this.actions.idle = Object.values(this.clipByName)[0]
          if (!this.actions.walk) this.actions.walk = this.actions.idle
          if (!this.actions.run)  this.actions.run  = this.actions.walk

          this._switchTo('idle')
        }
        console.log('Player GLB animations:', gltf.animations?.map(a => a.name))
      },
      undefined,
      () => { /* no GLB present — keep procedural, silent */ }
    )
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
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.7, roughness: 0.35 })
    )
    body.position.set(0, 2, -8)
    g.add(body)
    const slide = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 2.5, 14),
      new THREE.MeshStandardMaterial({ color: 0x6a6a6e, metalness: 0.8, roughness: 0.3 })
    )
    slide.position.set(0, 4, -8)
    g.add(slide)
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(3, 8, 4),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.6, roughness: 0.4 })
    )
    grip.position.set(0, -3, -3)
    g.add(grip)
    const muzzle = new THREE.Object3D()
    muzzle.position.set(0, 2, -15)
    g.add(muzzle)
    g.userData.muzzle = muzzle
    // Mixamo hand bones are very small — pistol needs to be small relative to hand local scale.
    // Skeleton bones often have very small local units; scale down aggressively.
    g.scale.setScalar(0.35)
    g.rotation.y = Math.PI / 2   // align barrel along hand forward
    return g
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
      const next = { x: t.x + corrected.x, y: t.y + corrected.y, z: t.z + corrected.z }
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
      } else if (!this._dodging) {
        if (wantFireNow && this.actions.fire) {
          this._switchTo('fire')
        } else if (speedNow > 5.5) {
          this._switchTo('run')
        } else if (moving) {
          this._switchTo('walk')
        } else {
          this._switchTo('idle')
        }
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

    // Auto-aim: snap only to ALERT enemies
    const AUTO_AIM_RANGE = 12
    let target = null
    let bestDist = AUTO_AIM_RANGE
    for (const en of enemies) {
      if (!en.alive) continue
      if (en.state !== 'ALERT') continue
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

    // Shoot
    this.fireCooldown -= delta
    if (wantFire && this.fireCooldown <= 0) {
      this.shoot()
      this.fireCooldown = 0.18
    }

    // Muzzle flash decay
    this.flash.material.opacity *= 0.55

    // Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]
      b.life -= delta
      b.mesh.position.addScaledVector(b.dir, b.speed * delta)
      for (const e of enemies) {
        if (!e.alive) continue
        const dx = b.mesh.position.x - e.position.x
        const dz = b.mesh.position.z - e.position.z
        if (Math.hypot(dx, dz) < 1.1) {
          onHitEnemy(e, 25, enemies)
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

  shoot() {
    this.muzzle.getWorldPosition(this.muzzleWorld)
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat)
    mesh.position.copy(this.muzzleWorld)
    this.scene.add(mesh)
    this.bullets.push({ mesh, dir: this.aim.clone().normalize(), speed: 38, life: 1.4 })
    this.flash.material.opacity = 1.0
    // small recoil kick on arm rig
    this.armRig.position.z = 0.08
    setTimeout(() => { this.armRig.position.z = 0 }, 60)
  }

  takeDamage(n) {
    this.hp = Math.max(0, this.hp - n)
  }
}
