import * as THREE from 'three'

export class NPC {
  constructor(scene, position, label = 'BRIEFING') {
    this.scene = scene
    this.position = position.clone()
    this.interactRange = 3.5
    this.inRange = false

    this.group = new THREE.Group()
    this.group.position.copy(this.position)

    // Podium — cylindrical pedestal (dark stone with gold trim)
    const podiumMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.7, metalness: 0.3 })
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.4, metalness: 0.85, emissive: 0x3a2400, emissiveIntensity: 0.4 })
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.0, 24), podiumMat)
    podium.position.y = 0.5
    podium.castShadow = true
    podium.receiveShadow = true
    this.group.add(podium)
    // Top trim ring
    const topTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 24), trimMat)
    topTrim.position.y = 1.04
    this.group.add(topTrim)
    // Base trim ring
    const baseTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.06, 24), trimMat)
    baseTrim.position.y = 0.03
    this.group.add(baseTrim)

    // Briefcase on podium
    const caseMat = new THREE.MeshStandardMaterial({ color: 0x2a1208, roughness: 0.55, metalness: 0.15 })
    const caseEdgeMat = new THREE.MeshStandardMaterial({ color: 0x150a04, roughness: 0.7 })
    const briefcase = new THREE.Group()
    briefcase.position.set(0, 1.18, 0)
    briefcase.rotation.y = Math.PI / 14   // slight angle for visual interest
    // Main body
    const caseBody = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.55), caseMat)
    caseBody.castShadow = true
    briefcase.add(caseBody)
    // Lid seam (thin dark line)
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.015, 0.56), caseEdgeMat)
    seam.position.y = 0
    briefcase.add(seam)
    // Handle
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.4, metalness: 0.6 })
    const handleArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.022, 6, 14, Math.PI),
      handleMat
    )
    handleArc.rotation.x = Math.PI / 2
    handleArc.rotation.z = Math.PI
    handleArc.position.set(0, 0.13, 0)
    briefcase.add(handleArc)
    // Latches (two small gold)
    const latchMat = new THREE.MeshStandardMaterial({ color: 0xc9a444, roughness: 0.3, metalness: 0.95, emissive: 0x3a2400, emissiveIntensity: 0.5 })
    const latchGeo = new THREE.BoxGeometry(0.07, 0.05, 0.05)
    const latchL = new THREE.Mesh(latchGeo, latchMat)
    latchL.position.set(-0.27, 0, 0.28)
    briefcase.add(latchL)
    const latchR = new THREE.Mesh(latchGeo, latchMat)
    latchR.position.set(0.27, 0, 0.28)
    briefcase.add(latchR)
    // Corner reinforcements (gold)
    const cornerGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05)
    const cornerOffsets = [[-0.4, -0.085, 0.25], [0.4, -0.085, 0.25], [-0.4, -0.085, -0.25], [0.4, -0.085, -0.25]]
    for (const [x, y, z] of cornerOffsets) {
      const c = new THREE.Mesh(cornerGeo, latchMat)
      c.position.set(x, y, z)
      briefcase.add(c)
    }
    this.group.add(briefcase)
    this.briefcase = briefcase

    // Glow ring on ground
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(this.interactRange - 0.2, this.interactRange, 48),
      new THREE.MeshBasicMaterial({ color: 0xffb800, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.03
    this.group.add(this.ring)

    // Floating diamond marker (above briefcase)
    this.marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshStandardMaterial({ color: 0xffb800, emissive: 0xffb800, emissiveIntensity: 1.4 })
    )
    this.marker.position.y = 2.0
    this.group.add(this.marker)

    // Label sprite
    this.label = this._makeLabel(label)
    this.label.position.y = 2.8
    this.group.add(this.label)

    scene.add(this.group)
  }

  _makeLabel(text) {
    const c = document.createElement('canvas')
    c.width = 512; c.height = 128
    const ctx = c.getContext('2d')
    ctx.fillStyle = 'rgba(0,20,30,0.85)'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#00ffff'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, c.width - 4, c.height - 4)
    ctx.font = 'bold 56px "Share Tech Mono", monospace'
    ctx.fillStyle = '#00ffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, c.width / 2, c.height / 2 - 10)
    ctx.font = 'bold 22px "Share Tech Mono", monospace'
    ctx.fillStyle = '#ffb800'
    ctx.fillText('PRESS [E] TO INTERACT', c.width / 2, c.height / 2 + 38)
    const tex = new THREE.CanvasTexture(c)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(4, 1, 1)
    return sprite
  }

  update(delta, elapsed, playerPos) {
    this.marker.rotation.y += delta * 1.6
    this.marker.position.y = 2.0 + Math.sin(elapsed * 2.5) * 0.12
    // Subtle briefcase idle wobble
    if (this.briefcase) this.briefcase.position.y = 1.18 + Math.sin(elapsed * 1.4) * 0.02

    const d = playerPos.distanceTo(this.position)
    this.inRange = d <= this.interactRange
    this.label.visible = this.inRange
    this.ring.material.opacity = this.inRange ? 0.7 : 0.3
  }
}
