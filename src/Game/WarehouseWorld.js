import * as THREE from 'three'

// Procedural spy-warehouse stage — industrial concrete floor, shipping
// containers as cover, pallet stacks, oil drums, hanging shop lights,
// neon "WAREHOUSE 7" sign, and yellow caution stripes near door.
// Drop-in replacement for World.js (same public API).

export class WarehouseWorld {
  constructor(scene) {
    this.scene = scene
    this.halfSize = 24
    this.doorWidth = 4
    this.doorOpen = 0
    this._walls = []
    this._impacts = []
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

    // Atmosphere — dark navy spy-HQ vibe (matches HUD), pushed back so close-up stays bright
    scene.fog = new THREE.Fog(0x0a1220, 45, 110)
    scene.background = new THREE.Color(0x0a1220)

    this._buildLights()
    this._buildFloor()
    this._buildPerimeterWalls()
    this._buildDoor()
    this._buildSupportColumns()
    this._buildShippingContainers()
    this._buildPalletStacks()
    this._buildOilDrums()
    this._buildCatwalks()
    this._buildNeonSign()
    this._buildHangingLamps()
    this._buildCorridor()
  }

  _buildLights() {
    // Bright cool base + cyan/amber accents (matches HUD theme)
    this.scene.add(new THREE.AmbientLight(0xc0d0e8, 1.3))
    this.scene.add(new THREE.HemisphereLight(0xd0e0ff, 0x1a2435, 1.1))

    const key = new THREE.DirectionalLight(0xe0eeff, 2.4)
    key.position.set(8, 24, 6)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -30
    key.shadow.camera.right = 30
    key.shadow.camera.top = 30
    key.shadow.camera.bottom = -30
    key.shadow.bias = -0.0005
    this.scene.add(key)

    // Amber rim — warm pop opposing the cool key
    const fill = new THREE.DirectionalLight(0xffc880, 0.85)
    fill.position.set(-12, 14, -8)
    this.scene.add(fill)

    // Center spotlight over arena
    const center = new THREE.PointLight(0xffffff, 1.4, 32)
    center.position.set(0, 8, 0)
    this.scene.add(center)
  }

  _buildFloor() {
    // Mid navy concrete — bright enough to read, still on-theme
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2a3850, roughness: 0.85, metalness: 0.12
    })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    // Yellow safety stripes near door (caution zone)
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xffb800, roughness: 0.7, emissive: 0x2a1800, emissiveIntensity: 0.4
    })
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 4), stripeMat)
      stripe.rotation.x = -Math.PI / 2
      stripe.position.set(i * 1.0, 0.012, this.halfSize - 3)
      stripe.rotation.z = Math.PI / 4   // diagonal hash pattern
      this.scene.add(stripe)
    }

    // Cyan painted lane lines running through center (HUD accent)
    const laneMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff, emissive: 0x004055, emissiveIntensity: 0.6, roughness: 0.5
    })
    const lane1 = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 40), laneMat)
    lane1.rotation.x = -Math.PI / 2
    lane1.position.set(-6, 0.011, 0)
    this.scene.add(lane1)
    const lane2 = lane1.clone()
    lane2.position.x = 6
    this.scene.add(lane2)
  }

  _buildPerimeterWalls() {
    // Navy steel walls — lifted to read against floor
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e2a3a, roughness: 0.85, metalness: 0.4
    })
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x101a26, roughness: 0.65, metalness: 0.6
    })
    const wallH = 6
    const wallT = 0.6
    const halfSize = this.halfSize

    const mkWall = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat)
      m.position.set(x, wallH / 2, z)
      m.castShadow = true
      m.receiveShadow = true
      this.scene.add(m)
      this._walls.push({ mesh: m, w, h: wallH, d })
      // Horizontal I-beam reinforcement at mid-height
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.3, d + 0.05), beamMat)
      beam.position.set(x, wallH * 0.5, z)
      this.scene.add(beam)
      // Top trim
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.25, d + 0.1), beamMat)
      trim.position.set(x, wallH - 0.12, z)
      this.scene.add(trim)
      return m
    }

    mkWall(halfSize * 2 + wallT, wallT, 0, -halfSize)            // north
    mkWall(wallT, halfSize * 2 + wallT,  halfSize, 0)             // east
    mkWall(wallT, halfSize * 2 + wallT, -halfSize, 0)             // west
    // South wall split with door
    const segLen = (halfSize * 2 + wallT - this.doorWidth) / 2
    mkWall(segLen, wallT, -(this.doorWidth / 2 + segLen / 2), halfSize)
    mkWall(segLen, wallT,  (this.doorWidth / 2 + segLen / 2), halfSize)
  }

  _buildDoor() {
    // Roll-up garage door — navy metal with cyan glow
    const wallH = 6
    const segMat = new THREE.MeshStandardMaterial({
      color: 0x10181f, metalness: 0.7, roughness: 0.4,
      emissive: 0x002233, emissiveIntensity: 0.5
    })
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xff3355, emissive: 0x331100, emissiveIntensity: 0.9, roughness: 0.5
    })

    // Door frame header
    const header = new THREE.Mesh(
      new THREE.BoxGeometry(this.doorWidth + 0.6, 0.5, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x080c14, roughness: 0.6, metalness: 0.5 })
    )
    header.position.set(0, wallH - 0.25, this.halfSize)
    this.scene.add(header)
    this._walls.push({ mesh: header, w: this.doorWidth + 0.6, h: 0.5, d: 0.7 })

    // Sliding door pair
    this.door = new THREE.Group()
    const half = new THREE.Mesh(
      new THREE.BoxGeometry(this.doorWidth / 2 - 0.05, wallH - 0.5, 0.4),
      segMat
    )
    this.doorL = half.clone()
    this.doorL.position.set(-this.doorWidth / 4, (wallH - 0.5) / 2, this.halfSize)
    this.scene.add(this.doorL)
    this.doorR = half.clone()
    this.doorR.position.set( this.doorWidth / 4, (wallH - 0.5) / 2, this.halfSize)
    this.scene.add(this.doorR)
    this.doorClosedX = this.doorWidth / 4
    this.doorOpenX = this.doorWidth / 4 + (this.doorWidth / 2)

    // Red warning beacon above door (alarm tone)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), accentMat)
    beacon.position.set(0, wallH + 0.2, this.halfSize)
    this.scene.add(beacon)
    const beaconLight = new THREE.PointLight(0xff3355, 1.6, 8)
    beaconLight.position.set(0, wallH + 0.2, this.halfSize)
    this.scene.add(beaconLight)
    this._beacon = beacon
    this._beaconLight = beaconLight

    // Cyan door frame uprights (HUD accent — match badge border)
    const upMat = new THREE.MeshBasicMaterial({ color: 0x00ffff })
    const upL = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, wallH - 0.5, 0.12), upMat
    )
    upL.position.set(-this.doorWidth / 2, (wallH - 0.5) / 2, this.halfSize)
    this.scene.add(upL)
    const upR = upL.clone()
    upR.position.x = this.doorWidth / 2
    this.scene.add(upR)
  }

  _buildSupportColumns() {
    // Steel I-beam pillars — gunmetal navy with rivets + cyan top cap
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x1a2330, roughness: 0.6, metalness: 0.6
    })
    const rivetMat = new THREE.MeshStandardMaterial({
      color: 0x080c14, roughness: 0.5, metalness: 0.7
    })
    const capMat = new THREE.MeshBasicMaterial({ color: 0x00ffff })
    const pillarH = 6
    const positions = [[-12, -12], [12, -12], [-12, 12], [12, 12]]
    for (const [x, z] of positions) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, pillarH, 0.7), beamMat)
      p.position.set(x, pillarH / 2, z)
      p.castShadow = true
      p.receiveShadow = true
      this.scene.add(p)
      this._walls.push({ mesh: p, w: 0.9, h: pillarH, d: 0.9 })

      // Decorative rivets up the column
      for (let h = 0.5; h < pillarH; h += 0.8) {
        const r = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), rivetMat)
        r.position.set(x + 0.36, h, z)
        this.scene.add(r)
      }

      // Base plate
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 1.2), rivetMat)
      base.position.set(x, 0.075, z)
      this.scene.add(base)

      // Cyan cap on top of pillar (HUD accent)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.95), capMat)
      cap.position.set(x, pillarH - 0.04, z)
      this.scene.add(cap)
    }
  }

  _buildShippingContainers() {
    // Stacked shipping containers as cover obstacles
    const containerColors = [0xa83020, 0x2a4a78, 0x3a7a40, 0xa85a18]
    // Positions avoid enemy patrol zones (left ~[-12,-6]×[-4,4], right ~[6,12]×[-4,4],
    // center back ~[-4,4]×[-16]) so guards don't get stuck on containers
    const positions = [
      { x: -16, z: -10, rot: 0 },
      { x:  16, z:   8, rot: Math.PI / 2 },
      { x:  -2, z:  10, rot: 0 },
      { x:  14, z:  -14, rot: Math.PI / 2 }
    ]
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      this._mkContainer(p.x, p.z, p.rot, containerColors[i % containerColors.length])
    }
  }

  _mkContainer(x, z, rotY, color) {
    const W = 5.2, H = 2.4, D = 2.4
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = rotY

    const bodyMat = new THREE.MeshStandardMaterial({
      color, roughness: 0.7, metalness: 0.4
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x18140e, roughness: 0.5, metalness: 0.6
    })

    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), bodyMat)
    body.position.y = H / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Corner posts
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, H + 0.05, 0.18), trimMat)
      post.position.set(sx * (W / 2 - 0.04), H / 2, sz * (D / 2 - 0.04))
      group.add(post)
    }
    // Top + bottom rails
    for (const sy of [0, H]) {
      const railLR = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.12, 0.18), trimMat)
      railLR.position.set(0, sy, -D / 2 + 0.04)
      group.add(railLR)
      const railLR2 = railLR.clone()
      railLR2.position.z = D / 2 - 0.04
      group.add(railLR2)
    }
    // Door panels (front face) — vertical seams
    for (let i = -1; i <= 1; i += 2) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(W / 2 - 0.1, H - 0.2, 0.06),
        trimMat
      )
      door.position.set(i * W / 4, H / 2, D / 2 + 0.03)
      group.add(door)
    }
    // Corrugated ribs on side panels
    for (let r = -2; r <= 2; r++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.1, H - 0.4, 0.06), trimMat)
      rib.position.set(r * 0.9, H / 2, -D / 2 - 0.04)
      group.add(rib)
    }

    // Stencil-style label panel
    const labelMat = new THREE.MeshStandardMaterial({
      color: 0xfff0c0, emissive: 0x221808, emissiveIntensity: 0.3, roughness: 0.7
    })
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), labelMat)
    label.position.set(W / 2 - 1.3, H * 0.6, D / 2 + 0.04)
    group.add(label)

    this.scene.add(group)
    // Approximate AABB for collider — must account for rotation
    const sw = Math.abs(Math.cos(rotY)) * W + Math.abs(Math.sin(rotY)) * D
    const sd = Math.abs(Math.sin(rotY)) * W + Math.abs(Math.cos(rotY)) * D
    this._walls.push({ mesh: group, w: sw, h: H, d: sd })
  }

  _buildPalletStacks() {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x8a5530, roughness: 0.92
    })
    const woodDarkMat = new THREE.MeshStandardMaterial({
      color: 0x6a3f20, roughness: 0.92
    })
    const stacks = [
      { x: -4, z: 8, count: 3 },
      { x: 14, z: -4, count: 2 },
      { x: -16, z: -8, count: 2 }
    ]
    for (const s of stacks) {
      const stack = new THREE.Group()
      stack.position.set(s.x, 0, s.z)
      const palletH = 0.16
      for (let i = 0; i < s.count; i++) {
        const y = i * (palletH + 0.02)
        // Top deck (planks)
        for (let p = -2; p <= 2; p++) {
          const plank = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.06, 0.18),
            i % 2 === 0 ? woodMat : woodDarkMat
          )
          plank.position.set(0, y + palletH - 0.03, p * 0.28)
          plank.castShadow = true
          stack.add(plank)
        }
        // Bottom support blocks
        for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
          const block = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, palletH - 0.06, 0.18),
            woodDarkMat
          )
          block.position.set(sx * 0.5, y + (palletH - 0.06) / 2, sz * 0.45)
          stack.add(block)
        }
      }
      // Cargo box on top — stenciled crate
      const crateMat = new THREE.MeshStandardMaterial({ color: 0xa07840, roughness: 0.85 })
      const crateH = 0.8
      const totalPalletH = s.count * (palletH + 0.02)
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, crateH, 1.0), crateMat)
      crate.position.set(0, totalPalletH + crateH / 2, 0)
      crate.castShadow = true
      stack.add(crate)
      // Crate edge slats
      for (const sx of [-1, 1]) {
        const slat = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, crateH, 1.04),
          woodDarkMat
        )
        slat.position.set(sx * 0.5, totalPalletH + crateH / 2, 0)
        stack.add(slat)
      }

      this.scene.add(stack)
      const fullH = totalPalletH + crateH
      this._walls.push({ mesh: stack, w: 1.3, h: fullH, d: 1.1 })
    }
  }

  _buildOilDrums() {
    const drumMat = new THREE.MeshStandardMaterial({
      color: 0x5a3a18, roughness: 0.75, metalness: 0.4
    })
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x18120a, roughness: 0.5, metalness: 0.7
    })
    const labelMat = new THREE.MeshStandardMaterial({
      color: 0xffe080, emissive: 0x221800, emissiveIntensity: 0.4
    })
    // Drum clusters (3-pack, 2-pack, single)
    const clusters = [
      { x:  10, z:  10, layout: [[0, 0], [0.7, 0.3], [-0.4, 0.6]] },
      { x: -10, z:  -2, layout: [[0, 0], [0.7, 0]] },
      { x:   0, z:  14, layout: [[0, 0]] },
      { x: -16, z:  10, layout: [[0, 0], [-0.7, 0.3], [0.4, 0.5]] }
    ]
    for (const c of clusters) {
      for (const [dx, dz] of c.layout) {
        const drum = new THREE.Group()
        drum.position.set(c.x + dx, 0, c.z + dz)
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.95, 16), drumMat
        )
        body.position.y = 0.475
        body.castShadow = true
        body.receiveShadow = true
        drum.add(body)
        // Top + bottom ribs
        for (const ry of [0.12, 0.83]) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.36, 0.025, 6, 18), ringMat
          )
          ring.rotation.x = Math.PI / 2
          ring.position.y = ry
          drum.add(ring)
        }
        // Yellow hazard label
        const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.18), labelMat)
        lbl.position.set(0, 0.55, 0.37)
        drum.add(lbl)
        // Lid
        const lid = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), ringMat
        )
        lid.position.y = 0.965
        drum.add(lid)
        this.scene.add(drum)
        this._walls.push({ mesh: drum, w: 0.78, h: 0.95, d: 0.78 })
      }
    }
  }

  _buildCatwalks() {
    // Decorative overhead catwalk — silhouette at ceiling level (no collider)
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x383028, roughness: 0.65, metalness: 0.55
    })
    const Y = 5.5

    const beamA = new THREE.Mesh(new THREE.BoxGeometry(this.halfSize * 2, 0.15, 0.7), beamMat)
    beamA.position.set(0, Y, -16)
    this.scene.add(beamA)
    const beamB = beamA.clone()
    beamB.position.z = 16
    this.scene.add(beamB)
    // Cross-supports
    for (let z = -16; z <= 16; z += 4) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 32), beamMat)
      cross.position.set((z % 8 === 0 ? -10 : 10), Y - 0.12, 0)
      this.scene.add(cross)
    }
    // Railing — thin top bar above each catwalk
    for (const z of [-16, 16]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(this.halfSize * 2, 0.04, 0.04), beamMat)
      rail.position.set(0, Y + 0.5, z)
      this.scene.add(rail)
      // Vertical posts
      for (let x = -this.halfSize + 2; x < this.halfSize; x += 4) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), beamMat)
        post.position.set(x, Y + 0.25, z)
        this.scene.add(post)
      }
    }
  }

  _buildNeonSign() {
    // AGENT SHAH FAHAD badge on far wall — matches HUD badge style
    const c = document.createElement('canvas')
    c.width = 1024; c.height = 384
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#070b14'
    ctx.fillRect(0, 0, 1024, 384)

    // Cyan border frame (matches HUD badge)
    ctx.strokeStyle = '#00ffff'
    ctx.lineWidth = 4
    ctx.strokeRect(40, 40, 944, 304)
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.4
    ctx.strokeRect(50, 50, 924, 284)
    ctx.globalAlpha = 1

    // "AGENT" amber tracking
    ctx.font = 'bold 56px "Share Tech Mono", monospace'
    ctx.fillStyle = '#ffb800'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.letterSpacing = '12px'
    ctx.fillText('A G E N T', 512, 130)

    // "SHAH FAHAD" cyan glow
    ctx.font = 'bold 140px "Share Tech Mono", monospace'
    ctx.fillStyle = '#00ffff'
    ctx.shadowColor = '#00ffff'
    ctx.shadowBlur = 20
    ctx.fillText('SHAH  FAHAD', 512, 250)
    ctx.shadowBlur = 0

    const tex = new THREE.CanvasTexture(c)
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 3.75),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false })
    )
    sign.position.set(0, 4.2, -this.halfSize + 0.4)
    this.scene.add(sign)

    // Cyan glow light behind sign
    const signLight = new THREE.PointLight(0x00ffff, 1.4, 16)
    signLight.position.set(0, 4.2, -this.halfSize + 1.5)
    this.scene.add(signLight)
    // Amber rim from below
    const amberRim = new THREE.PointLight(0xffb800, 0.9, 10)
    amberRim.position.set(0, 2.8, -this.halfSize + 1.2)
    this.scene.add(amberRim)
  }

  _buildHangingLamps() {
    // Industrial dome shop-lights — alternating cyan + amber per spy theme
    const cordMat = new THREE.MeshStandardMaterial({ color: 0x080c14 })
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x10181f, roughness: 0.5, metalness: 0.6
    })
    const cyanBulb = new THREE.MeshBasicMaterial({ color: 0x00ffff })
    const amberBulb = new THREE.MeshBasicMaterial({ color: 0xffd060 })

    const positions = [
      { x: -10, z: -8, color: 'cyan' },
      { x:  10, z: -8, color: 'amber' },
      { x: -10, z:  8, color: 'amber' },
      { x:  10, z:  8, color: 'cyan' },
      { x:   0, z:  0, color: 'amber' }
    ]
    for (const p of positions) {
      const isCyan = p.color === 'cyan'
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6), cordMat)
      cord.position.set(p.x, 5.0, p.z)
      this.scene.add(cord)
      const dome = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 16, 1, true), domeMat)
      dome.position.set(p.x, 4.25, p.z)
      dome.rotation.x = Math.PI
      this.scene.add(dome)
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8),
        isCyan ? cyanBulb : amberBulb
      )
      bulb.position.set(p.x, 4.05, p.z)
      this.scene.add(bulb)
      const poolColor = isCyan ? 0x00ffff : 0xffb840
      const pool = new THREE.PointLight(poolColor, 1.3, 14)
      pool.position.set(p.x, 4.0, p.z)
      this.scene.add(pool)
    }
  }

  _buildCorridor() {
    // Entry corridor + asphalt pad outside door
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: 0x0a1018, roughness: 0.95, emissive: 0x020610, emissiveIntensity: 0.3
    })
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(8, 18), asphaltMat)
    pad.rotation.x = -Math.PI / 2
    pad.position.set(0, 0.015, this.halfSize + 9)
    this.scene.add(pad)

    // Cyan corridor edge strips (HUD accent — replaces yellow)
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff })
    for (let z = this.halfSize + 2; z < this.halfSize + 18; z += 3) {
      const sL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 1.5), stripeMat)
      sL.position.set(-3.5, 0.06, z)
      this.scene.add(sL)
      const sR = sL.clone()
      sR.position.x = 3.5
      this.scene.add(sR)
    }
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

  // Block the south door gap with an invisible collider once the player is in.
  // Door visual still slides open on proximity, but player can't pass through.
  sealDoor(physics) {
    if (this._doorSealed) return
    this._doorSealed = true
    const wallH = 6
    const wallT = 0.6
    physics.addStaticBox(
      { position: { x: 0, y: wallH / 2, z: this.halfSize }, uuid: 'door-seal' },
      this.doorWidth, wallH, wallT
    )
  }

  spawnHitImpact(x, y, z, hitDir = null) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff3020, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    )
    flash.position.set(x, y, z)
    this.scene.add(flash)
    this._impacts.push({ mesh: flash, life: 0.18, maxLife: 0.18, isFlash: true })
    const bx = hitDir ? -hitDir.x : 0
    const bz = hitDir ? -hitDir.z : 0
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 5, 4),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0xff2020 : 0xff8050,
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        })
      )
      m.position.set(x, y, z)
      this.scene.add(m)
      this._impacts.push({
        mesh: m, life: 0.5, maxLife: 0.5,
        vx: bx * 3 + (Math.random() - 0.5) * 4,
        vy: 1 + Math.random() * 3,
        vz: bz * 3 + (Math.random() - 0.5) * 4
      })
    }
  }

  spawnWallImpact(x, y, z, hitDir = null) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffe8a0, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    )
    flash.position.set(x, y, z)
    this.scene.add(flash)
    this._impacts.push({ mesh: flash, life: 0.12, maxLife: 0.12, isFlash: true })
    const bx = hitDir ? -hitDir.x : 0
    const bz = hitDir ? -hitDir.z : 0
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 5, 4),
        new THREE.MeshBasicMaterial({
          color: 0xffc060, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      )
      m.position.set(x, y, z)
      this.scene.add(m)
      this._impacts.push({
        mesh: m, life: 0.45, maxLife: 0.5,
        vx: bx * 4 + (Math.random() - 0.5) * 3.5,
        vy: 1.5 + Math.random() * 3.5,
        vz: bz * 4 + (Math.random() - 0.5) * 3.5
      })
    }
  }

  updateImpacts(delta) {
    // Pulse beacon above door
    if (this._beacon) {
      const t = (Date.now() % 1500) / 1500
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2)
      this._beacon.material.emissiveIntensity = 0.6 + pulse * 1.4
      this._beaconLight.intensity = 0.8 + pulse * 1.6
    }
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
