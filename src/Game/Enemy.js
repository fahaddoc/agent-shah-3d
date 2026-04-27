import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { loadGlbCached as loadFbxCached } from './glbCache.js'

const ENEMY_DRACO = new DRACOLoader()
ENEMY_DRACO.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

// Tracer-style enemy bullet — red-orange additive (distinct from player's yellow)
const ENEMY_BULLET_GEO = new THREE.CylinderGeometry(0.035, 0.014, 0.45, 6)
const ENEMY_BULLET_MAT = new THREE.MeshBasicMaterial({
  color: 0xff5520,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false
})

const STATE = { PATROL: 'PATROL', SUSPICIOUS: 'SUSPICIOUS', ALERT: 'ALERT' }

export class Enemy {
  constructor(scene, position, patrolPath = null) {
    this.scene = scene
    this.hp = 50
    this.maxHp = 50
    this.alive = true

    // Spy-relevant params
    this.patrolSpeed = 1.6
    this.alertSpeed = 3.4
    this.visionRange = 11
    this.visionAngle = Math.PI / 2.2    // ~82° half-width → ~163° full cone (wide)
    this.scanAngle = 0                  // sweep offset while idle/paused
    this.preferredDist = 9
    this.fireRange = 14
    this.fireCooldown = 0.8 + Math.random() * 0.6
    this.pistolAmmo = 6
    this.suspicionTimer = 0              // builds up before going ALERT
    this.state = STATE.PATROL

    this.position = position.clone()
    this.facing = 0                      // radians (0 = +Z back, +PI = -Z forward)
    this._patrolBaseFacing = 0           // base for scan sweep
    this.bullets = []
    this.muzzleWorld = new THREE.Vector3()

    // Patrol waypoints (default: small loop around spawn)
    this.patrol = patrolPath || [
      new THREE.Vector3(position.x - 3, 0, position.z),
      new THREE.Vector3(position.x + 3, 0, position.z),
      new THREE.Vector3(position.x + 3, 0, position.z + 3),
      new THREE.Vector3(position.x - 3, 0, position.z + 3)
    ]
    this.patrolIdx = 0
    this.patrolPause = 0

    this._buildMesh()
    scene.add(this.group)
    this.ready = this._tryLoadGLB()
  }

  _tryLoadGLB() {
    const loader = new GLTFLoader()
    loader.setDRACOLoader(ENEMY_DRACO)
    const loadGLB = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej))
    const loadFBX = (url) => loadFbxCached(url)
    return Promise.all([
      loadFBX('/assets/models-glb/enemy-character.glb').catch(() => null),      // Mixamo Gas Mask soldier — T-pose model
      loadGLB('/assets/models/enemy.glb'),                                  // Josh + Pistol Walk (anim source)
      loadGLB('/assets/models/enemy-idle.glb').catch(() => null),           // Josh + Pistol Idle (anim source)
      loadFBX('/assets/models-glb/enemy-death-front.glb').catch(() => null),    // Mixamo Death From Front
      loadFBX('/assets/models-glb/enemy-death-back.glb').catch(() => null),     // Mixamo Death From Back
      loadFBX('/assets/models-glb/hit-stomach.glb').catch(() => null),          // Mixamo Stomach Hit (ranged hit)
      loadFBX('/assets/models-glb/enemy-outward-slash.glb').catch(() => null),  // Mixamo Stable Sword Outward Slash
      loadFBX('/assets/models-glb/enemy-ready-idle.glb').catch(() => null),     // Mixamo Ready Idle
      loadFBX('/assets/models-glb/hit-body.glb').catch(() => null),             // Mixamo Hit To Body (melee hit)
      loadFBX('/assets/models-glb/pistol-walk-backward.glb').catch(() => null), // Mixamo Pistol Walk Backward Arc
      loadFBX('/assets/models-glb/standard-run.glb').catch(() => null),         // Mixamo Standard Run — out-of-ammo charge
      loadFBX('/assets/models-glb/mma-kick.glb').catch(() => null),             // Mixamo MMA Kick — melee attack
      loadFBX('/assets/models-glb/punching.glb').catch(() => null)              // Mixamo Punching — melee attack
    ]).then(([charFbx, walkGltf, idleGltf, deathFrontFbx, deathBackFbx, hitFbx, slashFbx, readyIdleFbx, hitBodyFbx, walkBackFbx, oooRunFbx, mmaKickFbx, punchingFbx]) =>
        this._handleJoshLoaded(charFbx, walkGltf, idleGltf, deathFrontFbx, deathBackFbx, hitFbx, slashFbx, readyIdleFbx, hitBodyFbx, walkBackFbx, oooRunFbx, mmaKickFbx, punchingFbx))
      .catch(() => {})
  }

  _handleJoshLoaded(charFbx, walkGltf, idleGltf, deathFrontGltf, deathBackGltf, hitFbx, slashFbx, readyIdleFbx, hitBodyFbx, walkBackFbx, oooRunFbx, mmaKickFbx, punchingFbx) {
    const keep = new Set([this.hpBar, this.visionMesh, this.alertIcon])
    for (const child of [...this.group.children]) {
      if (!keep.has(child)) child.visible = false
    }
    // Use Gas Mask FBX as visible model when available; fall back to Josh GLB.
    // CRITICAL: fbxCache shares same FBX object across all enemies → must clone per-enemy
    // (Object3D can only have one parent — without cloning, last enemy steals the model).
    let model
    if (charFbx) {
      model = SkeletonUtils.clone(charFbx)
      // GLB (post-FBX2glTF) is already in meters — no cm→m conversion needed
      model.scale.setScalar(1.2)
      // Mixamo characters face +Z by default → flip to -Z forward convention
      model.rotation.y = Math.PI
    } else {
      model = walkGltf.scene
      model.scale.setScalar(1.2)
      model.rotation.y = Math.PI
    }
    const tintEnabled = !charFbx   // only tint Josh GLB; Gas Mask FBX keeps its own materials
    model.traverse(o => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      if (tintEnabled && o.material) {
        const mat = o.material.clone()
        const lname = (o.name || '').toLowerCase()
        if (lname.includes('body') || lname.includes('skin') || lname.includes('face') ||
            lname.includes('eye') || lname.includes('hair')) {
          // Preserve skin/face — don't tint
        } else {
          // Clothing / jacket / pants — tint red
          if (mat.color) mat.color.lerp(new THREE.Color(0xaa1122), 0.7)
          if (mat.emissive) mat.emissive.setHex(0x220000)
        }
        o.material = mat
      }
    })

    // Pistol parented to group, synced to right-hand world per frame.
    // Try multiple bone-name variants — Mixamo FBX→GLB conversion sometimes drops the colon.
    const findBone = (root, names) => {
      let found = null
      root.traverse(o => {
        if (found) return
        for (const n of names) if (o.name === n) { found = o; return }
      })
      if (!found) {
        root.traverse(o => {
          if (found) return
          const lower = (o.name || '').toLowerCase()
          for (const n of names) {
            const needle = n.replace('mixamorig:', '').toLowerCase()
            if (lower.includes(needle)) { found = o; return }
          }
        })
      }
      return found
    }
    const enemyHand = findBone(model, ['mixamorig:RightHand', 'mixamorigRightHand', 'RightHand'])
    this.rightHandBone = enemyHand
    if (!enemyHand) console.warn('[Enemy] RightHand bone not found — pistol will be missing')
    if (enemyHand) {
      const pistol = new THREE.Group()
      const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, metalness: 0.85, roughness: 0.35 })
      const slideMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.95, roughness: 0.25 })
      const gripMat  = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.8 })
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.33, 0.14), gripMat)
      grip.position.set(0, 0, 0)
      pistol.add(grip)
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.6), bodyMat)
      body.position.set(0, 0.2, 0.3)
      pistol.add(body)
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.6), slideMat)
      slide.position.set(0, 0.3, 0.3)
      pistol.add(slide)
      const muzzle = new THREE.Object3D()
      muzzle.position.set(0, 0.2, 0.63)
      pistol.add(muzzle)
      this.group.add(pistol)
      this.pistolMesh = pistol
      this.muzzle = muzzle

      // Layered muzzle flash — red-orange (visually distinct from player's yellow)
      const flashGroup = new THREE.Group()
      const flashOuter = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0xff7030,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      )
      const flashCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({
          color: 0xffe0a0,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      )
      flashGroup.add(flashOuter)
      flashGroup.add(flashCore)
      this.group.add(flashGroup)
      this.flash = flashGroup
      this.flashOuter = flashOuter
      this.flashCore = flashCore
    }
    this.group.add(model)

    // Animation setup — walk + idle clips
    this.mixer = new THREE.AnimationMixer(model)
    this.actions = {}
    // Build set of target bone names for retargeting clip tracks
    const targetBones = new Set()
    model.traverse(o => { if (o.isBone) targetBones.add(o.name) })
    const stripRoot = (clip) => {
      if (!clip) return null
      clip.tracks = clip.tracks.filter(t => !/Hips\.position$/i.test(t.name))
      return clip
    }
    // Aggressive bone-name normalizer for Mixamo FBX → GLB skeleton mismatch.
    // FBXLoader produces names like "mixamorig1Hips" / "mixamorigHips"; GLB uses "mixamorig:Hips".
    // Also handles bare names "Hips", and namespaced "Armature|mixamorig:Hips".
    const normalizeTrackNames = (clip) => {
      if (!clip) return null
      const targetArr = Array.from(targetBones)
      let bound = 0, total = 0
      for (const t of clip.tracks) {
        total++
        const dotIdx = t.name.lastIndexOf('.')
        const rawBone = dotIdx >= 0 ? t.name.slice(0, dotIdx) : t.name
        const propPart = dotIdx >= 0 ? t.name.slice(dotIdx) : ''
        if (targetBones.has(rawBone)) { bound++; continue }
        // Strip pipe namespace prefix (Armature|x)
        const afterPipe = rawBone.includes('|') ? rawBone.split('|').pop() : rawBone
        // Strip mixamorig prefix variants: mixamorig:, mixamorig1, mixamorig9, mixamorig
        const stripped = afterPipe.replace(/^mixamorig\d*[:_]?/, '')
        // Candidate forms in priority order
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
        // Last resort: substring match (suffix) against any target bone
        if (!matched && stripped.length > 2) {
          matched = targetArr.find(b => b.endsWith(stripped) || b.endsWith(`:${stripped}`)) || null
        }
        if (matched) {
          t.name = matched + propPart
          bound++
        }
      }
      console.log(`[Enemy] normalizeTrackNames: bound ${bound}/${total} tracks`)
      return clip
    }
    const makeAction = (clip, label, loop = true, normalize = false, keepRoot = false) => {
      if (!clip) return null
      if (normalize) normalizeTrackNames(clip)
      if (!keepRoot) stripRoot(clip)
      clip.name = label
      const a = this.mixer.clipAction(clip)
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      a.clampWhenFinished = !loop
      return a
    }
    // Death clips need Hips.position so the body descends to floor — keepRoot=true
    // Count tracks whose bone name actually exists in the target skeleton
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
    const retargetFbxClip = (fbxScene, label, keepRoot = false) => {
      if (!fbxScene) return null
      const animArr = fbxScene.animations || []
      // Some FBX exports stash the real clip in [1] when [0] is empty/static
      const srcClip = animArr.find(c => c && c.tracks && c.tracks.length > 0)
      if (!srcClip) {
        console.warn(`[Enemy] ${label}: FBX has no usable animation clips (${animArr.length})`)
        return null
      }
      console.log(`[Enemy] ${label}: src has ${srcClip.tracks.length} tracks, sample names:`, srcClip.tracks.slice(0, 3).map(t => t.name))
      // Try normalize path first (preserves quaternion data)
      const candB = srcClip.clone()
      normalizeTrackNames(candB)
      const boundB = countBound(candB)
      if (boundB >= 10) {
        console.log(`[Enemy] ${label}: ✓ normalize bound ${boundB} tracks`)
        return makeAction(candB, label, false, false, keepRoot)
      }
      // Fallback: SkeletonUtils.retargetClip
      let candA = null, boundA = 0
      try {
        candA = SkeletonUtils.retargetClip(model, fbxScene, srcClip, { useTargetMatrix: true })
        boundA = countBound(candA)
      } catch (e) {
        console.warn(`[Enemy] retarget ${label} threw:`, e.message)
      }
      console.log(`[Enemy] ${label}: normalize ${boundB}, retargetClip ${boundA} → using ${boundA > boundB ? 'retarget' : 'normalize'}`)
      const winner = boundA > boundB ? candA : candB
      return makeAction(winner || candB, label, false, false, keepRoot)
    }
    this.actions.walk = makeAction(walkGltf.animations?.[0], 'walk', true)
    this.actions.run  = this.actions.walk
    this.actions.idle = makeAction(idleGltf?.animations?.[0], 'idle', true) || this.actions.walk
    this.actions.fire = this.actions.walk
    this.actions.deathFront = retargetFbxClip(deathFrontGltf, 'deathFront', false)
    this.actions.deathBack  = retargetFbxClip(deathBackGltf,  'deathBack',  false)
    // Mixamo Stomach Hit — ranged (bullet) hit reaction
    this.actions.hit         = retargetFbxClip(hitFbx,        'hit',         false)
    // Mixamo Hit To Body — melee (punch) hit reaction
    this.actions.hitMelee    = retargetFbxClip(hitBodyFbx,    'hitMelee',    false)
    // Out-of-ammo reaction: outward slash (one-shot) → ready idle (loop)
    this.actions.slash       = retargetFbxClip(slashFbx,      'slash',       false)
    this.actions.readyIdle   = retargetFbxClip(readyIdleFbx,  'readyIdle',   false)
    // Backward pistol walk — used when enemy retreats inside preferredDist
    this.actions.walkBack    = retargetFbxClip(walkBackFbx,   'walkBack',    false)
    if (this.actions.walkBack) {
      this.actions.walkBack.setLoop(THREE.LoopRepeat, Infinity)
      this.actions.walkBack.clampWhenFinished = false
    }
    // Out-of-ammo charge run — looping
    this.actions.oooRun      = retargetFbxClip(oooRunFbx,     'oooRun',      false)
    if (this.actions.oooRun) {
      this.actions.oooRun.setLoop(THREE.LoopRepeat, Infinity)
      this.actions.oooRun.clampWhenFinished = false
    }
    // Melee attack clips — randomized between MMA kick and punching combo
    this.actions.mmaKick     = retargetFbxClip(mmaKickFbx,    'mmaKick',     false)
    this.actions.punching    = retargetFbxClip(punchingFbx,   'punching',    false)
    // ready idle should loop — patch action setup
    if (this.actions.readyIdle) {
      this.actions.readyIdle.setLoop(THREE.LoopRepeat, Infinity)
      this.actions.readyIdle.clampWhenFinished = false
    }
    // Debug log to identify mismatch — paste first lines of track + bones
    if (deathFrontGltf?.animations?.[0]) {
      const tr = deathFrontGltf.animations[0].tracks
      console.log('[Enemy] FBX clip first 3 track names:', tr.slice(0, 3).map(t => t.name))
      console.log('[Enemy] GLB target bones first 6:', Array.from(targetBones).slice(0, 6))
    }

    this._switchAnim('idle')
  }

  _switchAnim(name, fadeSec = 0.2) {
    if (!this.actions || !this.actions[name] || this._currentActionName === name) return
    const next = this.actions[name]
    next.reset().fadeIn(fadeSec).play()
    if (this._currentAction && this._currentAction !== next) this._currentAction.fadeOut(fadeSec)
    this._currentAction = next
    this._currentActionName = name
  }

  _buildMesh() {
    this.group = new THREE.Group()
    this.group.position.copy(this.position)

    // LOW-POLY gangster (dark crimson suit, red accents)
    const E_SUIT   = new THREE.MeshStandardMaterial({ color: 0x2a0a10, roughness: 0.6, flatShading: true })
    const E_SUIT_LT = new THREE.MeshStandardMaterial({ color: 0x3a1118, roughness: 0.6, flatShading: true })
    const E_SHIRT  = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.75, flatShading: true })
    const E_TIE    = new THREE.MeshStandardMaterial({ color: 0xaa1122, roughness: 0.4, flatShading: true })
    const E_SKIN   = new THREE.MeshStandardMaterial({ color: 0xc08866, roughness: 0.85, flatShading: true })
    const E_HAIR   = new THREE.MeshStandardMaterial({ color: 0x0a0608, roughness: 0.95, flatShading: true })
    const E_BEARD  = new THREE.MeshStandardMaterial({ color: 0x180a06, roughness: 0.96, flatShading: true })

    // Shoulders + torso
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.5), E_SUIT)
    shoulders.position.y = 1.72
    shoulders.castShadow = true
    this.group.add(shoulders)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.48), E_SUIT)
    torso.position.y = 1.1
    torso.castShadow = true
    this.group.add(torso)

    // Lapels
    const lapelL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.07), E_SUIT_LT)
    lapelL.position.set(-0.16, 1.4, -0.24)
    lapelL.rotation.z = 0.22
    this.group.add(lapelL)
    const lapelR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.07), E_SUIT_LT)
    lapelR.position.set(0.16, 1.4, -0.24)
    lapelR.rotation.z = -0.22
    this.group.add(lapelR)

    // Black shirt + red tie
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.72, 0.07), E_SHIRT)
    shirt.position.set(0, 1.28, -0.22)
    this.group.add(shirt)
    const tieKnot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), E_TIE)
    tieKnot.position.set(0, 1.6, -0.2)
    this.group.add(tieKnot)
    const tieBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.04), E_TIE)
    tieBody.position.set(0, 1.2, -0.2)
    this.group.add(tieBody)

    // Belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x050505, flatShading: true }))
    belt.position.y = 0.58
    this.group.add(belt)

    // Legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.0, 0.36), E_SUIT)
    legL.position.set(-0.18, 0.05, 0)
    legL.castShadow = true
    this.group.add(legL)
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.0, 0.36), E_SUIT)
    legR.position.set(0.18, 0.05, 0)
    legR.castShadow = true
    this.group.add(legR)

    // Shoes
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.4, flatShading: true })
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.66), shoeMat)
    shoeL.position.set(-0.18, -0.52, 0.08)
    this.group.add(shoeL)
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.66), shoeMat)
    shoeR.position.set(0.18, -0.52, 0.08)
    this.group.add(shoeR)

    // HEAD
    const headGroup = new THREE.Group()
    headGroup.position.y = 2.3
    this.group.add(headGroup)

    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.68, 0.66), E_SKIN)
    skull.castShadow = true
    headGroup.add(skull)

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.2, 0.58), E_SKIN)
    jaw.position.y = -0.38
    headGroup.add(jaw)

    // Hair — shorter cropped (gangster henchman)
    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.18, 0.62), E_HAIR)
    hairTop.position.y = 0.32
    headGroup.add(hairTop)

    // Short beard (stubble)
    const beardFront = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.14), E_BEARD)
    beardFront.position.set(0, -0.38, -0.28)
    headGroup.add(beardFront)

    // Eye sockets + pupils
    const socketMat = new THREE.MeshStandardMaterial({ color: 0x1a0808, flatShading: true })
    const socketL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.05), socketMat)
    socketL.position.set(-0.14, 0.02, -0.34)
    headGroup.add(socketL)
    const socketR = socketL.clone()
    socketR.position.x = 0.14
    headGroup.add(socketR)

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3322 })  // glowing menacing eyes
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.03), eyeMat)
    eyeL.position.set(-0.14, 0.02, -0.36)
    headGroup.add(eyeL)
    const eyeR = eyeL.clone()
    eyeR.position.x = 0.14
    headGroup.add(eyeR)

    // Angled angry brows
    const browMat = new THREE.MeshStandardMaterial({ color: 0x0a0404, flatShading: true })
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), browMat)
    browL.position.set(-0.13, 0.11, -0.35)
    browL.rotation.z = 0.25
    headGroup.add(browL)
    const browR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), browMat)
    browR.position.set(0.13, 0.11, -0.35)
    browR.rotation.z = -0.25
    headGroup.add(browR)

    // Nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), E_SKIN)
    nose.position.set(0, -0.05, -0.39)
    headGroup.add(nose)

    // Gun held forward
    this.armPivot = new THREE.Group()
    this.armPivot.position.set(0.26, 1.42, 0)
    this.group.add(this.armPivot)
    const gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.2, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x18181c, metalness: 0.75, flatShading: true })
    )
    gunBody.position.z = -0.4
    this.armPivot.add(gunBody)
    const gunSlide = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.08, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x52525a, metalness: 0.85, flatShading: true })
    )
    gunSlide.position.set(0, 0.08, -0.4)
    this.armPivot.add(gunSlide)
    // Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.8), E_SUIT)
    arm.position.set(0, 0, -0.08)
    this.armPivot.add(arm)
    this.muzzle = new THREE.Object3D()
    this.muzzle.position.set(0, 0, -0.72)
    this.armPivot.add(this.muzzle)

    // Vision cone — built directly in XZ plane, forward = -Z (matches logic)
    const coneGeo = this._buildConeGeometry(this.visionRange, this.visionAngle)
    this.visionMat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    this.visionMesh = new THREE.Mesh(coneGeo, this.visionMat)
    this.visionMesh.position.y = 0.05
    this.group.add(this.visionMesh)

    // State indicator above head (! or ?)
    this.alertIcon = this._makeStateIcon('')
    this.alertIcon.position.y = 2.7
    this.group.add(this.alertIcon)

    // HP bar
    this.hpBar = new THREE.Group()
    this.hpBar.position.y = 2.4
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x220008 })
    )
    this.hpBar.add(bg)
    this.hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xff3355 })
    )
    this.hpFill.position.z = 0.001
    this.hpBar.add(this.hpFill)
    this.group.add(this.hpBar)
  }

  // Per-frame: shrink each cone segment to its first wall hit so cone clips at obstacles
  _updateVisionCone() {
    const world = window.__GAME__?.world
    if (!world?.isInsideWall || !this.visionMesh) return
    const segments = 24                  // must match _buildConeGeometry
    const halfAngle = this.visionAngle
    const maxRange = this.visionRange
    const cosF = Math.cos(this.facing)
    const sinF = Math.sin(this.facing)
    const positions = this.visionMesh.geometry.attributes.position
    const sampleStep = 0.35
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const a = -halfAngle + (halfAngle * 2) * t
      const localX = Math.sin(a)
      const localZ = -Math.cos(a)
      // Rotate local dir into world by enemy facing
      const wx = cosF * localX + sinF * localZ
      const wz = -sinF * localX + cosF * localZ
      // Walk outward, stop just before first wall hit
      let dist = maxRange
      const samples = Math.max(2, Math.ceil(maxRange / sampleStep))
      for (let s = 1; s <= samples; s++) {
        const d = (s / samples) * maxRange
        const x = this.position.x + wx * d
        const z = this.position.z + wz * d
        if (world.isInsideWall(x, z)) {
          dist = Math.max(0.05, d - (maxRange / samples))
          break
        }
      }
      // Vertex 0 is apex; arc vertex idx = (i + 1)
      const idx = (i + 1) * 3
      positions.array[idx + 0] = localX * dist
      positions.array[idx + 1] = 0
      positions.array[idx + 2] = localZ * dist
    }
    positions.needsUpdate = true
  }

  _buildConeGeometry(range, halfAngle) {
    // Flat cone (triangle fan) on XZ plane, apex at origin, opens toward -Z
    const segments = 24
    const positions = [0, 0, 0]
    const indices = []
    const start = -halfAngle
    const end = halfAngle
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const a = start + (end - start) * t
      // Direction is -Z rotated around Y by 'a': x = -sin(a)*range (actually sin(a)*range on left),
      // z = -cos(a)*range. We want cone opens toward -Z so center ray (a=0) is (0, 0, -range).
      const x = Math.sin(a) * range
      const z = -Math.cos(a) * range
      positions.push(x, 0, z)
      if (i > 0) indices.push(0, i, i + 1)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }

  _makeStateIcon(text) {
    const c = document.createElement('canvas')
    c.width = 128; c.height = 128
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, 128, 128)
    if (text) {
      ctx.font = 'bold 110px "Share Tech Mono", monospace'
      ctx.fillStyle = text === '!' ? '#ff3355' : '#ffb800'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 64, 64)
    }
    const tex = new THREE.CanvasTexture(c)
    this.iconCanvas = c
    this.iconCtx = ctx
    this.iconTex = tex
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
    sprite.scale.set(1.0, 1.0, 1.0)
    return sprite
  }

  _setIcon(text) {
    const ctx = this.iconCtx
    ctx.clearRect(0, 0, 128, 128)
    if (text) {
      ctx.font = 'bold 110px "Share Tech Mono", monospace'
      ctx.fillStyle = text === '!' ? '#ff3355' : '#ffb800'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 64, 64)
    }
    this.iconTex.needsUpdate = true
  }

  // True if player is inside vision cone AND has line-of-sight (no wall in between)
  _seesPlayer(playerPos) {
    const dx = playerPos.x - this.position.x
    const dz = playerPos.z - this.position.z
    const dist = Math.hypot(dx, dz)
    if (dist > this.visionRange) return false
    // facing direction vector (forward = -Z rotated by facing)
    const fx = Math.sin(this.facing + Math.PI)
    const fz = Math.cos(this.facing + Math.PI)
    const dotN = (dx * fx + dz * fz) / (dist || 1)
    const angle = Math.acos(THREE.MathUtils.clamp(dotN, -1, 1))
    if (angle >= this.visionAngle) return false
    // Line-of-sight — sample segment between enemy and player, fail if any wall blocks
    const world = window.__GAME__?.world
    if (world?.isInsideWall) {
      const steps = Math.max(2, Math.ceil(dist / 0.4))
      for (let s = 1; s < steps; s++) {
        const t = s / steps
        const x = this.position.x + dx * t
        const z = this.position.z + dz * t
        if (world.isInsideWall(x, z)) return false
      }
    }
    return true
  }

  // True if player is behind (back-stab eligible)
  isBehind(playerPos, maxDist = 1.6) {
    const dx = playerPos.x - this.position.x
    const dz = playerPos.z - this.position.z
    const dist = Math.hypot(dx, dz)
    if (dist > maxDist) return false
    const fx = Math.sin(this.facing + Math.PI)
    const fz = Math.cos(this.facing + Math.PI)
    const dotN = (dx * fx + dz * fz) / (dist || 1)
    return dotN < -0.3   // player is on opposite side of facing
  }

  update(delta, playerPos, camera, onHitPlayer, allEnemies = null) {
    this._allEnemies = allEnemies
    this._onHitPlayer = onHitPlayer
    // Muzzle flash decay — runs every frame (even when dead) so stuck flashes dissipate
    if (this.flashOuter) this.flashOuter.material.opacity *= 0.5
    if (this.flashCore) this.flashCore.material.opacity *= 0.35
    // Takedown handles its own fall — skip everything
    if (this._frozenForTakedown) {
      return
    }
    // Dead — let death clip mixer run, or progress procedural fall
    if (!this.alive) {
      if (this._playingDeathClip && this.mixer) {
        this.mixer.update(delta)
        // Procedural ground descent — body horizontal pose lands flat on floor
        this._deathT = (this._deathT || 0) + delta
        const p = Math.min(1, this._deathT / (this._deathDur || 1.5))
        const eased = p * p   // ease-in: faster drop near end
        this.group.position.y = this.position.y - (this._deathDropTarget || 0.9) * eased
      }
      // Keep pistol synced to hand bone during death so it falls with body
      if (this.pistolMesh && this.rightHandBone) {
        const pos = new THREE.Vector3()
        this.rightHandBone.getWorldPosition(pos)
        this.group.worldToLocal(pos)
        this.pistolMesh.position.copy(pos)
        this.pistolMesh.rotation.set(0, Math.PI, 0)
        this.pistolMesh.scale.setScalar(0.33)
      }
      if (this._dying) this._updateDying(delta)
      this._updateBullets(delta, playerPos, onHitPlayer)
      return
    }
    if (this.mixer) this.mixer.update(delta)

    if (this.pistolMesh && this.rightHandBone) {
      const pos = new THREE.Vector3()
      this.rightHandBone.getWorldPosition(pos)
      this.group.worldToLocal(pos)
      this.pistolMesh.position.copy(pos)
      this.pistolMesh.rotation.set(0, Math.PI, 0)
      this.pistolMesh.scale.setScalar(0.33)
      // Recoil — gun pulled back along character forward (group +Z = back)
      if (this._recoilT > 0) {
        this._recoilT -= delta
        const t = Math.max(0, this._recoilT)
        this.pistolMesh.position.z += (t / 0.1) * 0.05
      }
    }
    if (!this.alive) {
      this._updateBullets(delta, playerPos, onHitPlayer)
      return
    }

    const sees = this._seesPlayer(playerPos)

    // State machine
    if (sees) {
      if (this.state === STATE.PATROL) {
        this.state = STATE.SUSPICIOUS
        this.suspicionTimer = 0
      }
      if (this.state === STATE.SUSPICIOUS) {
        this.suspicionTimer += delta
        if (this.suspicionTimer > 0.4) this.state = STATE.ALERT
      }
    } else {
      if (this.state === STATE.ALERT) {
        // stay alert briefly, then drop
        this.suspicionTimer -= delta
        if (this.suspicionTimer < -3) this.state = STATE.PATROL
      } else if (this.state === STATE.SUSPICIOUS) {
        this.suspicionTimer -= delta * 0.5
        if (this.suspicionTimer < 0) this.state = STATE.PATROL
      }
    }

    // Behavior per state
    if (this.state === STATE.PATROL) {
      this._doPatrol(delta)
      this.visionMat.color.setHex(0xffff00)
      this.visionMat.opacity = 0.16
      this._setIcon('')
    } else if (this.state === STATE.SUSPICIOUS) {
      this._faceTarget(playerPos, delta * 4)
      this.visionMat.color.setHex(0xffb800)
      this.visionMat.opacity = 0.32
      this._setIcon('?')
    } else { // ALERT
      if (this._outOfAmmo) this._doMeleeApproach(delta, playerPos)
      else this._doCombat(delta, playerPos)
      this.suspicionTimer = 0   // keep ALERT alive while seeing
      this.visionMat.color.setHex(0xff3355)
      this.visionMat.opacity = 0.4
      this._setIcon('!')
    }

    this.group.position.copy(this.position)
    this.group.rotation.y = this.facing

    // Clip vision cone visual against walls — vertices shrink to first wall hit per slice
    this._updateVisionCone()

    // Anim state — skipped during hit reaction so clip plays through;
    // out-of-ammo: slash → run-charge while far → ready idle when in melee range
    if (this.actions && !this._hitReacting) {
      if (this._outOfAmmo) {
        if (!this._slashPlaying) {
          const odx = playerPos.x - this.position.x
          const odz = playerPos.z - this.position.z
          const odist = Math.hypot(odx, odz)
          if (odist > 1.9 && this.actions.oooRun) {
            this._switchAnim('oooRun')
          } else {
            this._switchAnim('readyIdle')
          }
        }
      } else if (this.state === 'ALERT') {
        const dx = playerPos.x - this.position.x
        const dz = playerPos.z - this.position.z
        const dist = Math.hypot(dx, dz)
        if (dist < this.fireRange && this.fireCooldown < 0.2 && this.actions.fire) {
          this._switchAnim('fire')
        } else if (dist > this.preferredDist) {
          this._switchAnim('run')
        } else if (dist < this.preferredDist - 1.5 && this.actions.walkBack) {
          this._switchAnim('walkBack')
        } else {
          this._switchAnim('idle')
        }
      } else if (this.state === 'SUSPICIOUS') {
        this._switchAnim('walk')
      } else {
        // PATROL: walk if moving (not paused), idle if paused
        if (this.patrolPause > 0) this._switchAnim('idle')
        else this._switchAnim('walk')
      }
    }

    // HP bar billboard
    this.hpBar.lookAt(camera.position)
    this.hpFill.scale.x = Math.max(0, this.hp / this.maxHp)
    this.hpFill.position.x = -(1 - this.hpFill.scale.x) * 0.5

    this._updateBullets(delta, playerPos, onHitPlayer)
  }

  _doPatrol(delta) {
    if (this.patrolPause > 0) {
      this.patrolPause -= delta
      this.scanAngle += delta * 1.4
      const sweep = Math.sin(this.scanAngle) * 0.9
      const base = (typeof this._patrolBaseFacing === 'number' && !Number.isNaN(this._patrolBaseFacing))
        ? this._patrolBaseFacing
        : this.facing
      this.facing = this._lerpAngle(this.facing, base + sweep, delta * 5)
      return
    }
    const target = this.patrol[this.patrolIdx]
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    const d = Math.hypot(dx, dz)
    if (d < 0.4) {
      this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length
      this.patrolPause = 1.4 + Math.random() * 0.8
      this._patrolBaseFacing = this.facing
      this.scanAngle = 0
      return
    }
    const nx = dx / d, nz = dz / d
    this._tryMove(nx * this.patrolSpeed * delta, nz * this.patrolSpeed * delta)
    const desired = Math.atan2(nx, nz) + Math.PI
    this.facing = this._lerpAngle(this.facing, desired, delta * 4)
    this._patrolBaseFacing = desired
  }

  // Move with wall collision — blocks if next XZ would be inside any wall AABB (with pad)
  _tryMove(stepX, stepZ) {
    const world = window.__GAME__?.world
    const newX = this.position.x + stepX
    const newZ = this.position.z + stepZ
    if (world?.isInsideWall && world.isInsideWall(newX, newZ, 0.6)) return
    this.position.x = newX
    this.position.z = newZ
  }

  _doCombat(delta, playerPos) {
    const dx = playerPos.x - this.position.x
    const dz = playerPos.z - this.position.z
    const dist = Math.hypot(dx, dz) || 0.001
    const nx = dx / dist, nz = dz / dist

    if (dist > this.preferredDist) {
      this._tryMove(nx * this.alertSpeed * delta, nz * this.alertSpeed * delta)
    } else if (dist < this.preferredDist - 1.5) {
      this._tryMove(-nx * this.alertSpeed * 0.5 * delta, -nz * this.alertSpeed * 0.5 * delta)
    }
    const desired = Math.atan2(nx, nz) + Math.PI
    this.facing = this._lerpAngle(this.facing, desired, delta * 8)

    this.fireCooldown -= delta
    if (this._hitReacting) return
    if (dist <= this.fireRange && this.fireCooldown <= 0 && this.pistolAmmo > 0) {
      this._shoot(nx, nz)
      this.pistolAmmo--
      this.fireCooldown = 1.1
      // Empty mag — hide pistol mesh + trigger out-of-ammo reaction (slash → ready idle)
      if (this.pistolAmmo === 0) {
        if (this.pistolMesh) this.pistolMesh.visible = false
        this._triggerOutOfAmmo()
      }
    }
  }

  _triggerOutOfAmmo() {
    if (this._outOfAmmo) return
    this._outOfAmmo = true
    this.fireCooldown = 0.5   // brief beat before charging player
    this._playSlash()
  }

  _playSlash() {
    const action = this.actions?.slash
    if (!action || !this.mixer) {
      this._slashPlaying = false
      return
    }
    this._slashPlaying = true
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.fadeIn(0.05).play()
    if (this._currentAction && this._currentAction !== action) this._currentAction.fadeOut(0.05)
    this._currentAction = action
    this._currentActionName = 'slash'
    const dur = (action.getClip().duration || 1.0) * 1000
    clearTimeout(this._slashTimer)
    this._slashTimer = setTimeout(() => { this._slashPlaying = false }, dur)
  }

  // Out-of-ammo melee: charge player, swing slash on contact, deal damage.
  _doMeleeApproach(delta, playerPos) {
    const dx = playerPos.x - this.position.x
    const dz = playerPos.z - this.position.z
    const dist = Math.hypot(dx, dz) || 0.001
    const nx = dx / dist, nz = dz / dist
    const meleeRange = 1.7
    // Always charge forward — never back away (wall-collision via _tryMove)
    if (dist > meleeRange) {
      this._tryMove(nx * this.alertSpeed * delta, nz * this.alertSpeed * delta)
    }
    // Face player
    const desired = Math.atan2(nx, nz) + Math.PI
    this.facing = this._lerpAngle(this.facing, desired, delta * 8)

    this.fireCooldown -= delta
    // While reacting to a hit, keep moving but don't attack — player's combo absorbs us
    if (this._hitReacting) return
    if (dist <= meleeRange + 0.3 && this.fireCooldown <= 0 && !this._slashPlaying) {
      // Pick random attack clip — kick or punch
      const pool = []
      if (this.actions?.mmaKick) pool.push('mmaKick')
      if (this.actions?.punching) pool.push('punching')
      if (pool.length === 0 && this.actions?.slash) pool.push('slash')
      const clipName = pool[Math.floor(Math.random() * pool.length)] || 'slash'
      this._playAttack(clipName)
      this.fireCooldown = 1.4
      // Damage delivered at MID-CLIP — strike connects at the half-frame
      const action = this.actions?.[clipName]
      const dur = (action?.getClip().duration || 1.0) * 1000
      clearTimeout(this._slashHitTimer)
      this._slashHitTimer = setTimeout(() => {
        if (!this.alive || !this._onHitPlayer) return
        if (this._hitReacting) return
        const player = window.__GAME__?.player
        if (!player) return
        const dx2 = player.position.x - this.position.x
        const dz2 = player.position.z - this.position.z
        if (Math.hypot(dx2, dz2) <= meleeRange + 0.5) {
          this._onHitPlayer(this, 12, 'melee')
        }
      }, dur * 0.5)
    }
  }

  _playAttack(name) {
    const action = this.actions?.[name]
    if (!action || !this.mixer) {
      this._slashPlaying = false
      return
    }
    this._slashPlaying = true
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.fadeIn(0.05).play()
    if (this._currentAction && this._currentAction !== action) this._currentAction.fadeOut(0.05)
    this._currentAction = action
    this._currentActionName = name
    const dur = (action.getClip().duration || 1.0) * 1000
    clearTimeout(this._slashTimer)
    this._slashTimer = setTimeout(() => { this._slashPlaying = false }, dur)
  }

  _faceTarget(playerPos, lerp) {
    const dx = playerPos.x - this.position.x
    const dz = playerPos.z - this.position.z
    const desired = Math.atan2(dx, dz) + Math.PI
    this.facing = this._lerpAngle(this.facing, desired, lerp)
  }

  _lerpAngle(a, b, t) {
    const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a))
    return a + diff * Math.min(t, 1)
  }

  _shoot(nx, nz) {
    this.muzzle.getWorldPosition(this.muzzleWorld)
    const mesh = new THREE.Mesh(ENEMY_BULLET_GEO, ENEMY_BULLET_MAT)
    mesh.position.copy(this.muzzleWorld)
    const dir = new THREE.Vector3(nx, 0, nz).normalize()
    // Orient cylinder along flight direction (tracer feel)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    this.scene.add(mesh)
    this.bullets.push({ mesh, dir, speed: 32, life: 1.2 })
    // Muzzle flash + recoil
    if (this.flash) {
      const flashLocal = this.muzzleWorld.clone()
      this.group.worldToLocal(flashLocal)
      this.flash.position.copy(flashLocal)
      if (this.flashOuter) this.flashOuter.material.opacity = 1.0
      if (this.flashCore) this.flashCore.material.opacity = 1.0
      this.flash.scale.setScalar(0.85 + Math.random() * 0.4)
    }
    this._recoilT = 0.1
  }

  _updateBullets(delta, playerPos, onHitPlayer) {
    const world = window.__GAME__?.world
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]
      b.life -= delta
      // Substep so fast bullets don't skip thin walls between frames
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

      // Player hit
      const pdx = b.mesh.position.x - playerPos.x
      const pdz = b.mesh.position.z - playerPos.z
      if (b.life > 0 && Math.hypot(pdx, pdz) < 0.7) {
        onHitPlayer(this, 8)
        b.life = 0
      }

      // Friendly-fire: any OTHER alive enemy hit = instant kill
      if (b.life > 0 && this._allEnemies) {
        for (const e of this._allEnemies) {
          if (e === this || !e.alive) continue
          const dx = b.mesh.position.x - e.position.x
          const dz = b.mesh.position.z - e.position.z
          if (Math.hypot(dx, dz) < 1.0) {
            const hitDir = { x: -b.dir.x, z: -b.dir.z }
            e.silentKill(hitDir)
            b.life = 0
            break
          }
        }
      }

      if (b.life <= 0) {
        this.scene.remove(b.mesh)
        this.bullets.splice(i, 1)
      }
    }
  }

  alertNearby(allEnemies, radius = 12) {
    for (const e of allEnemies) {
      if (e === this || !e.alive) continue
      if (e.position.distanceTo(this.position) < radius) {
        e.state = STATE.ALERT
        e.suspicionTimer = 0
      }
    }
  }

  takeDamage(n, allEnemies, hitDir = null, type = 'ranged') {
    if (!this.alive) return
    this.hp -= n
    // Visible hit indicator — red spark burst at chest height
    const world = window.__GAME__?.world
    if (world?.spawnHitImpact) {
      world.spawnHitImpact(this.position.x, this.position.y + 1.4, this.position.z, hitDir)
    }
    // taking damage = instant alert + alert nearby
    if (this.alive) {
      this.state = STATE.ALERT
      this.suspicionTimer = 0
      if (allEnemies) this.alertNearby(allEnemies)
      // Cancel any pending slash damage — strike interrupted by this hit
      clearTimeout(this._slashHitTimer)
      // Reaction clip — melee uses Hit To Body, ranged uses Stomach Hit
      const wantMelee = type === 'melee'
      const clipName = wantMelee
        ? (this.actions?.hitMelee ? 'hitMelee' : 'hit')
        : 'hit'
      console.log('[Enemy] takeDamage type=', type, 'clipName=', clipName, 'hitMelee?=', !!this.actions?.hitMelee)
      const action = this.actions?.[clipName]
      if (action && this.mixer) {
        this._hitReacting = true
        action.reset()
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
        action.fadeIn(0.05).play()
        if (this._currentAction && this._currentAction !== action) this._currentAction.fadeOut(0.05)
        this._currentAction = action
        this._currentActionName = clipName
        const dur = (action.getClip().duration || 0.7) * 1000
        clearTimeout(this._hitTimer)
        this._hitTimer = setTimeout(() => { this._hitReacting = false }, dur)
      }
    }
    if (this.hp <= 0) this.die(hitDir)
  }

  silentKill(hitDir = null) {
    if (!this.alive) return
    this.hp = 0
    this.die(hitDir)
    // intentional: no alert propagation
  }

  die(hitDir = null) {
    this.alive = false
    this.hpBar.visible = false
    this.visionMesh.visible = false
    this.alertIcon.visible = false
    // Cancel any in-flight slash damage timer — dead enemy shouldn't punch
    clearTimeout(this._slashHitTimer)
    // Snap-hide muzzle flash so it doesn't stick visible on the corpse
    if (this.flashOuter) this.flashOuter.material.opacity = 0
    if (this.flashCore) this.flashCore.material.opacity = 0
    // Takedown drives its own bone-level fall — don't double-animate
    if (this._frozenForTakedown) return

    // Pick directional Mixamo death clip if available
    let clipName = null
    if (hitDir && (this.actions?.deathFront || this.actions?.deathBack)) {
      // Enemy forward vector — model rotated 180° at load → forward = -Z rotated by facing
      const fx = Math.sin(this.facing + Math.PI)
      const fz = Math.cos(this.facing + Math.PI)
      // hitDir points FROM enemy TOWARD attacker. Dot > 0 = attacker in front
      const dot = hitDir.x * fx + hitDir.z * fz
      clipName = dot > 0 ? 'deathFront' : 'deathBack'
      // Fallback to whichever exists
      if (!this.actions[clipName]) clipName = this.actions.deathFront ? 'deathFront' : 'deathBack'
    } else if (this.actions?.deathFront) {
      clipName = 'deathFront'
    } else if (this.actions?.deathBack) {
      clipName = 'deathBack'
    }

    if (clipName && this.actions[clipName]) {
      // Mixamo clip drives the fall via mixer
      this._playingDeathClip = true
      const action = this.actions[clipName]
      action.reset()
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.fadeIn(0.05).play()
      if (this._currentAction && this._currentAction !== action) this._currentAction.fadeOut(0.05)
      this._currentAction = action
      this._currentActionName = clipName
      // Procedural descent — Hips.position stripped, so drop group y from 0 to -hipRest over clip duration.
      // Mixamo character scaled 1.2 → hip rest height ≈ 0.9m. Body lying flat lands at floor.
      this._deathT = 0
      this._deathDur = action.getClip().duration || 1.5
      this._deathDropTarget = 0.9
      return
    }

    // Fallback: procedural fall (face-plant) when no clip available
    this._dying = true
    this._dyingT = 0
    if (this._currentAction) {
      this._currentAction.fadeOut(0.15)
      this._currentAction = null
      this._currentActionName = null
    }
  }

  _updateDying(delta) {
    this._dyingT += delta
    const dur = 0.7
    const p = Math.min(1, this._dyingT / dur)
    if (p < 0.25) {
      // Brief stagger backward — recoil from hit
      const k = p / 0.25
      this.group.rotation.x = -k * 0.18
      this.group.position.y = this.position.y
    } else {
      // Forward face-plant — knees buckle, body tips over
      const k = (p - 0.25) / 0.75
      const eased = k * (2 - k)   // ease-out quad
      this.group.rotation.x = -0.18 * (1 - eased) + (Math.PI / 2) * eased
      this.group.rotation.z = Math.sin(p * Math.PI) * 0.12   // slight twist
      this.group.position.y = this.position.y + eased * 0.1
    }
    if (p >= 1) {
      this._dying = false
      this.group.rotation.x = Math.PI / 2
      this.group.rotation.z = 0
      this.group.position.y = this.position.y + 0.1
    }
  }
}
