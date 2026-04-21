import * as THREE from 'three'

// Materials reused
const SUIT  = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.55, metalness: 0.05 })
const SHIRT = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 })
const TIE   = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.4 })
const SKIN  = new THREE.MeshStandardMaterial({ color: 0xe2b48a, roughness: 0.85 })
const HAIR  = new THREE.MeshStandardMaterial({ color: 0x0a0608, roughness: 0.9 })
const BEARD = new THREE.MeshStandardMaterial({ color: 0x150a08, roughness: 0.95 })
const GUN   = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.7, roughness: 0.35 })
const GUN_ACCENT = new THREE.MeshStandardMaterial({ color: 0x6a6a6e, metalness: 0.8, roughness: 0.3 })
const BLOOD = new THREE.MeshStandardMaterial({ color: 0x6e0a14, roughness: 0.9 })

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

    this.bulletGeo = new THREE.SphereGeometry(0.08, 8, 8)
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd44d })
  }

  _buildWick() {
    // Slightly less chibi — taller body for John Wick silhouette
    // Lapels (suit jacket open look)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.3, 0.55), SUIT)
    torso.position.y = 1.05
    torso.castShadow = true
    this.group.add(torso)

    // Lapel triangles (left + right) — Wick suit detail
    const lapelGeo = new THREE.BoxGeometry(0.18, 0.55, 0.06)
    const lapelL = new THREE.Mesh(lapelGeo, SUIT)
    lapelL.position.set(-0.22, 1.4, -0.31)
    lapelL.rotation.z = 0.2
    this.group.add(lapelL)
    const lapelR = new THREE.Mesh(lapelGeo, SUIT)
    lapelR.position.set(0.22, 1.4, -0.31)
    lapelR.rotation.z = -0.2
    this.group.add(lapelR)

    // V-collar white shirt
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.85, 0.06), SHIRT)
    shirt.position.set(0, 1.3, -0.29)
    this.group.add(shirt)

    // Slim black tie (Wick signature)
    const tieKnot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.05), TIE)
    tieKnot.position.set(0, 1.62, -0.32)
    this.group.add(tieKnot)
    const tieBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.85, 0.04), TIE)
    tieBody.position.set(0, 1.15, -0.32)
    this.group.add(tieBody)

    // Subtle blood splatter
    const blood = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), BLOOD)
    blood.position.set(0.10, 1.25, -0.33)
    blood.rotation.y = Math.PI
    this.group.add(blood)

    // Belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x050507 }))
    belt.position.y = 0.42
    this.group.add(belt)

    // Pants — slimmer, longer
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.0, 0.4), SUIT)
    legL.position.set(-0.22, -0.08, 0)
    legL.castShadow = true
    this.group.add(legL)
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.0, 0.4), SUIT)
    legR.position.set(0.22, -0.08, 0)
    legR.castShadow = true
    this.group.add(legR)
    this.legL = legL; this.legR = legR

    // Dress shoes — pointier
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.4, metalness: 0.1 })
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.7), shoeMat)
    shoeL.position.set(-0.22, -0.62, 0.06)
    this.group.add(shoeL)
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.7), shoeMat)
    shoeR.position.set(0.22, -0.62, 0.06)
    this.group.add(shoeR)
    this.shoeL = shoeL; this.shoeR = shoeR

    // HEAD GROUP — slightly smaller than chibi
    const head = new THREE.Group()
    head.position.y = 2.25
    this.group.add(head)
    this.head = head

    // Skull
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 22), SKIN)
    head.add(skull)

    // Hair — long swept-back Wick style
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.44, 22, 22, 0, Math.PI * 2, 0, Math.PI * 0.55), HAIR)
    hairTop.position.y = 0.04
    head.add(hairTop)
    // Front swept tuft (slicked back)
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.18), HAIR)
    tuft.position.set(0, 0.32, -0.18)
    tuft.rotation.x = 0.6
    head.add(tuft)
    // Sides
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.42), HAIR)
    sideL.position.set(-0.36, 0.05, 0)
    head.add(sideL)
    const sideR = sideL.clone()
    sideR.position.x = 0.36
    head.add(sideR)
    // Long back hair (Wick signature)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.16), HAIR)
    back.position.set(0, -0.05, 0.32)
    head.add(back)
    // Hair below shoulders
    const backLong = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.12), HAIR)
    backLong.position.set(0, -0.42, 0.34)
    head.add(backLong)

    // Beard — fuller cleaner Wick scruff
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.22), BEARD)
    beard.position.set(0, -0.24, -0.24)
    head.add(beard)
    const stache = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.08), BEARD)
    stache.position.set(0, -0.06, -0.4)
    head.add(stache)
    const beardL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.18), BEARD)
    beardL.position.set(-0.24, -0.14, -0.18)
    head.add(beardL)
    const beardR = beardL.clone()
    beardR.position.x = 0.24
    head.add(beardR)

    // Eyes (intense dark)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat)
    eyeL.position.set(-0.13, 0.02, -0.39)
    head.add(eyeL)
    const eyeR = eyeL.clone()
    eyeR.position.x = 0.13
    head.add(eyeR)

    // Brows
    const browMat = new THREE.MeshStandardMaterial({ color: 0x0a0608 })
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), browMat)
    browL.position.set(-0.13, 0.08, -0.4)
    browL.rotation.z = -0.15
    head.add(browL)
    const browR = browL.clone()
    browR.position.x = 0.13
    browR.rotation.z = 0.15
    head.add(browR)

    // Nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.12), SKIN)
    nose.position.set(0, -0.07, -0.41)
    head.add(nose)

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
    } else {
      raycaster.setFromCamera({ x: inputs.mouse.ndcX, y: inputs.mouse.ndcY }, window.__GAME__.camera.instance)
      const hit = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        aimX = hit.x - this.position.x
        aimZ = hit.z - this.position.z
      } else {
        aimX = this.aim.x; aimZ = this.aim.z
      }
    }
    const aimLen = Math.hypot(aimX, aimZ) || 1
    aimX /= aimLen; aimZ /= aimLen
    this.aim.set(aimX, 0, aimZ)

    // Determine fire intent first (affects facing)
    const wantFire = inputs.mouse.down || inputs.isDown(' ') || inputs.isDown('spacebar')

    // Face MOVEMENT direction when moving (use velocity, not raw input); AIM otherwise
    let desiredYaw
    if (moving && !target && !wantFire) {
      desiredYaw = Math.atan2(this.velocity.x, this.velocity.z) + Math.PI
    } else {
      desiredYaw = Math.atan2(aimX, aimZ) + Math.PI
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
