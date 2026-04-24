import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

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
    loader.load(
      '/assets/models/enemy.glb',
      (gltf) => {
        const keep = new Set([this.hpBar, this.visionMesh, this.alertIcon])
        for (const child of [...this.group.children]) {
          if (!keep.has(child)) child.visible = false
        }
        const model = gltf.scene
        model.scale.setScalar(1.1)
        model.rotation.y = Math.PI  // align to -Z forward
        model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
        this.group.add(model)

        // Attach pistol to right hand bone
        let rightHand = null
        model.traverse(o => {
          if (rightHand || !o.isBone) return
          const n = o.name.toLowerCase()
          if (n.includes('righthand') || n === 'hand_r' || n === 'right_hand') rightHand = o
        })
        if (rightHand) {
          const pistol = new THREE.Group()
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(4, 6, 14),
            new THREE.MeshStandardMaterial({ color: 0x222, metalness: 0.6 })
          )
          body.position.set(0, 2, -8)
          pistol.add(body)
          const muzzle = new THREE.Object3D()
          muzzle.position.set(0, 2, -15)
          pistol.add(muzzle)
          pistol.scale.setScalar(0.35)
          pistol.rotation.y = Math.PI / 2
          rightHand.add(pistol)
          this.muzzle = muzzle
        }
        if (gltf.animations && gltf.animations.length) {
          this.mixer = new THREE.AnimationMixer(model)
          this.actions = {}
          const byName = {}
          for (const clip of gltf.animations) byName[clip.name.toLowerCase()] = this.mixer.clipAction(clip)
          const pick = (...keys) => {
            for (const k of keys) for (const [n, a] of Object.entries(byName)) if (n.includes(k)) return a
            return null
          }
          this.actions.idle = pick('idle', 'stand', 'tpose')
          this.actions.walk = pick('walk')
          this.actions.run  = pick('run', 'jog')
          this.actions.fire = pick('fire', 'shoot')
          this.actions.die  = pick('die', 'death')
          if (!this.actions.idle) this.actions.idle = Object.values(byName)[0]
          if (!this.actions.walk) this.actions.walk = this.actions.idle
          if (!this.actions.run)  this.actions.run  = this.actions.walk
          this._switchAnim('idle')
        }
        console.log('Enemy GLB animations:', gltf.animations?.map(a => a.name))
      },
      undefined,
      () => {}
    )
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

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.0, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x551122, roughness: 0.7, emissive: 0x220008 })
    )
    body.position.y = 0.95
    body.castShadow = true
    this.group.add(body)

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0x882233, emissive: 0x331111 })
    )
    head.position.y = 1.9
    this.group.add(head)

    // Gun
    this.armPivot = new THREE.Group()
    this.armPivot.position.set(0.28, 1.35, 0)
    this.group.add(this.armPivot)
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.2, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6 })
    )
    gun.position.z = -0.5
    this.armPivot.add(gun)
    this.muzzle = new THREE.Object3D()
    this.muzzle.position.set(0, 0, -0.9)
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
