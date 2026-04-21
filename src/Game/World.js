import * as THREE from 'three'

export class World {
  constructor(scene) {
    this.scene = scene

    // Fog (pushed back so close-up is clear)
    scene.fog = new THREE.Fog(0x0a1018, 35, 90)

    // Ground (marble-tile look)
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2a3340, roughness: 0.8, metalness: 0.08
    })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80, 1, 1), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Grid overlay (cyan)
    const grid = new THREE.GridHelper(80, 40, 0x00ffff, 0x002233)
    grid.position.y = 0.01
    grid.material.opacity = 0.18
    grid.material.transparent = true
    scene.add(grid)

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d1218, roughness: 0.95 })
    const wallH = 4
    const wallT = 0.6
    const halfSize = 24
    this._walls = []
    const mkWall = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat)
      m.position.set(x, wallH / 2, z)
      m.castShadow = true; m.receiveShadow = true
      scene.add(m)
      const wall = { mesh: m, w, h: wallH, d }
      this._walls.push(wall)
      return wall
    }
    // North + side walls solid
    mkWall(halfSize * 2 + wallT, wallT, 0, -halfSize)
    mkWall(wallT, halfSize * 2 + wallT,  halfSize, 0)
    mkWall(wallT, halfSize * 2 + wallT, -halfSize, 0)

    // South wall split with door opening (door width = 4)
    const doorWidth = 4
    const segLen = (halfSize * 2 + wallT - doorWidth) / 2
    mkWall(segLen, wallT, -(doorWidth / 2 + segLen / 2),  halfSize)
    mkWall(segLen, wallT,  (doorWidth / 2 + segLen / 2),  halfSize)

    // Door frame (top header)
    const headerMat = new THREE.MeshStandardMaterial({ color: 0x1a232c, roughness: 0.6 })
    const header = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.4, 0.6, wallT + 0.1), headerMat)
    header.position.set(0, wallH - 0.3, halfSize)
    scene.add(header)
    this._walls.push({ mesh: header, w: doorWidth + 0.4, h: 0.6, d: wallT + 0.1 })

    // Door frame uprights (cyan accent)
    const accentMat = new THREE.MeshBasicMaterial({ color: 0x00ffff })
    const upL = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH - 0.6, 0.12), accentMat)
    upL.position.set(-doorWidth / 2, (wallH - 0.6) / 2, halfSize)
    scene.add(upL)
    const upR = upL.clone()
    upR.position.x = doorWidth / 2
    scene.add(upR)

    // Sliding door (animated): two halves
    this.door = new THREE.Group()
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x10181f, metalness: 0.5, roughness: 0.4, emissive: 0x002233, emissiveIntensity: 0.6 })
    const halfDoor = new THREE.Mesh(new THREE.BoxGeometry(doorWidth / 2 - 0.05, wallH - 0.6, wallT * 0.7), doorMat)
    this.doorL = halfDoor.clone()
    this.doorL.position.set(-doorWidth / 4, (wallH - 0.6) / 2, halfSize)
    scene.add(this.doorL)
    this.doorR = halfDoor.clone()
    this.doorR.position.set( doorWidth / 4, (wallH - 0.6) / 2, halfSize)
    scene.add(this.doorR)
    this.doorOpen = 0   // 0..1
    this.doorClosedX = doorWidth / 4
    this.doorOpenX = doorWidth / 4 + (doorWidth / 2)

    // Door light beam (inside)
    const beam = new THREE.PointLight(0x00ffff, 2.0, 14)
    beam.position.set(0, 1.6, halfSize - 1.2)
    scene.add(beam)

    // Outside path leading to door (entry corridor visual)
    const corridor = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 18),
      new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.9, emissive: 0x001a22, emissiveIntensity: 0.3 })
    )
    corridor.rotation.x = -Math.PI / 2
    corridor.position.set(0, 0.02, halfSize + 9)
    scene.add(corridor)

    // Corridor edge lights (cyan strips)
    for (let z = halfSize + 1; z < halfSize + 18; z += 3) {
      const stripMat = new THREE.MeshBasicMaterial({ color: 0x00ffff })
      const sL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 1.5), stripMat)
      sL.position.set(-3, 0.06, z)
      scene.add(sL)
      const sR = sL.clone()
      sR.position.x = 3
      scene.add(sR)
    }
    this.halfSize = halfSize
    this.doorWidth = doorWidth

    // Pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a232c, roughness: 0.7 })
    const pillarPositions = [[-10,-10],[10,-10],[-10,10],[10,10]]
    for (const [x, z] of pillarPositions) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, wallH, 16), pillarMat)
      p.position.set(x, wallH / 2, z)
      p.castShadow = true; p.receiveShadow = true
      scene.add(p)

      // cyan light strip on pillar top
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.95, 0.08, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ffff })
      )
      cap.position.set(x, wallH - 0.04, z)
      scene.add(cap)

      // collider approximation for pillar (box)
      this._walls.push({ mesh: p, w: 1.4, h: wallH, d: 1.4 })
    }

    // Lights — brighter base for visibility
    const ambient = new THREE.AmbientLight(0xb8c8e0, 1.1)
    scene.add(ambient)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9)
    scene.add(hemi)

    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(10, 22, 8)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -30
    key.shadow.camera.right = 30
    key.shadow.camera.top = 30
    key.shadow.camera.bottom = -30
    key.shadow.bias = -0.0005
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.6)
    fill.position.set(-12, 14, -8)
    scene.add(fill)

    const cyanRim = new THREE.PointLight(0x00ffff, 2.0, 36)
    cyanRim.position.set(-12, 6, -12)
    scene.add(cyanRim)

    const amberRim = new THREE.PointLight(0xffb800, 1.6, 32)
    amberRim.position.set(12, 6, 12)
    scene.add(amberRim)

    // Center spotlight over arena
    const center = new THREE.PointLight(0xffffff, 1.2, 30)
    center.position.set(0, 8, 0)
    scene.add(center)

    // Sector marker text on floor (decorative)
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  }

  registerColliders(physics) {
    // Floor collider — wide flat slab below ground level so capsule rests on top
    const floorProxy = { position: { x: 0, y: -0.5, z: 0 }, uuid: 'floor' }
    physics.addStaticBox(floorProxy, 200, 1, 200)
    for (const w of this._walls) {
      physics.addStaticBox(w.mesh, w.w, w.h, w.d)
    }
  }

  setDoorOpen(t) {
    // t: 0 closed → 1 fully open
    this.doorOpen = THREE.MathUtils.clamp(t, 0, 1)
    const offset = (this.doorOpenX - this.doorClosedX) * this.doorOpen
    this.doorL.position.x = -this.doorClosedX - offset
    this.doorR.position.x =  this.doorClosedX + offset
  }
}
