import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const ENEMY_DRACO = new DRACOLoader()
ENEMY_DRACO.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

const ENEMY_BULLET_GEO = new THREE.SphereGeometry(0.12, 8, 8)
const ENEMY_BULLET_MAT = new THREE.MeshBasicMaterial({ color: 0xff3355 })

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
    this._tryLoadGLB()
  }

  _tryLoadGLB() {
    const loader = new GLTFLoader()
    loader.setDRACOLoader(ENEMY_DRACO)
    const loadGLB = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej))
    Promise.all([
      loadGLB('/assets/models/enemy.glb'),                    // Josh + Pistol Walk
      loadGLB('/assets/models/enemy-idle.glb').catch(() => null)  // Josh + Pistol Idle
    ]).then(([walkGltf, idleGltf]) => this._handleJoshLoaded(walkGltf, idleGltf))
      .catch(() => {})
  }

  _handleJoshLoaded(walkGltf, idleGltf) {
    const keep = new Set([this.hpBar, this.visionMesh, this.alertIcon])
    for (const child of [...this.group.children]) {
      if (!keep.has(child)) child.visible = false
    }
    const model = walkGltf.scene
    model.scale.setScalar(1.2)
    model.rotation.y = Math.PI  // Josh default front = +Z, rotate to -Z convention
    model.traverse(o => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      // Tint Josh to red/crimson (enemy gangster look — distinct from Joe's black suit)
      if (o.material) {
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

    // Attach pistol to right hand (cm-scale bone)
    let enemyHand = null
    model.traverse(o => { if (o.name === 'mixamorig:RightHand') enemyHand = o })
    if (enemyHand) {
      const pistol = new THREE.Group()
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(4, 6, 16),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0e, metalness: 0.8 })
      )
      body.position.set(0, 2, -10)
      pistol.add(body)
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(3, 8, 4),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0e, metalness: 0.6 })
      )
      grip.position.set(0, -4, -2)
      pistol.add(grip)
      const muzzle = new THREE.Object3D()
      muzzle.position.set(0, 2, -18)
      pistol.add(muzzle)
      pistol.rotation.y = Math.PI / 2
      pistol.position.set(-2, 0, 0)
      enemyHand.add(pistol)
      this.muzzle = muzzle
    }
    this.group.add(model)

    // Animation setup — walk + idle clips
    this.mixer = new THREE.AnimationMixer(model)
    this.actions = {}
    const stripRoot = (clip) => {
      if (!clip) return null
      clip.tracks = clip.tracks.filter(t => !/Hips\.position$/i.test(t.name))
      return clip
    }
    const makeAction = (clip, label, loop = true) => {
      if (!clip) return null
      stripRoot(clip)
      clip.name = label
      const a = this.mixer.clipAction(clip)
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      a.clampWhenFinished = !loop
      return a
    }
    this.actions.walk = makeAction(walkGltf.animations?.[0], 'walk', true)
    this.actions.run  = this.actions.walk
    this.actions.idle = makeAction(idleGltf?.animations?.[0], 'idle', true) || this.actions.walk
    this.actions.fire = this.actions.walk
    this.actions.die  = this.actions.walk

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

  // True if player is inside vision cone (uses XZ + facing)
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
    return angle < this.visionAngle
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
    if (this.mixer) this.mixer.update(delta)
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
      this._doCombat(delta, playerPos)
      this.suspicionTimer = 0   // keep ALERT alive while seeing
      this.visionMat.color.setHex(0xff3355)
      this.visionMat.opacity = 0.4
      this._setIcon('!')
    }

    this.group.position.copy(this.position)
    this.group.rotation.y = this.facing

    // Anim state based on state machine
    if (this.actions) {
      if (this.state === 'ALERT') {
        const dx = playerPos.x - this.position.x
        const dz = playerPos.z - this.position.z
        const dist = Math.hypot(dx, dz)
        if (dist < this.fireRange && this.fireCooldown < 0.2 && this.actions.fire) {
          this._switchAnim('fire')
        } else if (dist > this.preferredDist) {
          this._switchAnim('run')
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
    this.position.x += nx * this.patrolSpeed * delta
    this.position.z += nz * this.patrolSpeed * delta
    const desired = Math.atan2(nx, nz) + Math.PI
    this.facing = this._lerpAngle(this.facing, desired, delta * 4)
    this._patrolBaseFacing = desired
  }

  _doCombat(delta, playerPos) {
    const dx = playerPos.x - this.position.x
    const dz = playerPos.z - this.position.z
    const dist = Math.hypot(dx, dz) || 0.001
    const nx = dx / dist, nz = dz / dist

    if (dist > this.preferredDist) {
      this.position.x += nx * this.alertSpeed * delta
      this.position.z += nz * this.alertSpeed * delta
    } else if (dist < this.preferredDist - 1.5) {
      this.position.x -= nx * this.alertSpeed * 0.5 * delta
      this.position.z -= nz * this.alertSpeed * 0.5 * delta
    }
    const desired = Math.atan2(nx, nz) + Math.PI
    this.facing = this._lerpAngle(this.facing, desired, delta * 8)

    this.fireCooldown -= delta
    if (dist <= this.fireRange && this.fireCooldown <= 0) {
      this._shoot(nx, nz)
      this.fireCooldown = 1.1
    }
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
    this.scene.add(mesh)
    this.bullets.push({
      mesh,
      dir: new THREE.Vector3(nx, 0, nz),
      speed: 22,
      life: 1.6
    })
  }

  _updateBullets(delta, playerPos, onHitPlayer) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]
      b.life -= delta
      b.mesh.position.addScaledVector(b.dir, b.speed * delta)

      // Player hit
      const pdx = b.mesh.position.x - playerPos.x
      const pdz = b.mesh.position.z - playerPos.z
      if (Math.hypot(pdx, pdz) < 0.7) {
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
            e.silentKill()
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

  takeDamage(n, allEnemies) {
    if (!this.alive) return
    this.hp -= n
    // taking damage = instant alert + alert nearby
    if (this.alive) {
      this.state = STATE.ALERT
      this.suspicionTimer = 0
      if (allEnemies) this.alertNearby(allEnemies)
    }
    if (this.hp <= 0) this.die()
  }

  silentKill() {
    if (!this.alive) return
    this.hp = 0
    this.die()
    // intentional: no alert propagation
  }

  die() {
    this.alive = false
    this.hpBar.visible = false
    this.visionMesh.visible = false
    this.alertIcon.visible = false
    if (this.actions?.die) {
      this._switchAnim('die', 0.1)
    } else {
      this.group.rotation.x = Math.PI / 2
      this.group.position.y = 0.2
    }
    setTimeout(() => this.scene.remove(this.group), 1800)
  }
}
