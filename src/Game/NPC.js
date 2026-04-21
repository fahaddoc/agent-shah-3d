import * as THREE from 'three'

export class NPC {
  constructor(scene, position, label = 'BRIEFING') {
    this.scene = scene
    this.position = position.clone()
    this.interactRange = 3.5
    this.inRange = false

    this.group = new THREE.Group()
    this.group.position.copy(this.position)

    // Body — gold/amber suit to differentiate
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, 1.1, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x3a2a08, roughness: 0.6, emissive: 0x140a00 })
    )
    body.position.y = 1.0
    body.castShadow = true
    this.group.add(body)

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xd9b48a })
    )
    head.position.y = 2.0
    this.group.add(head)

    // Glow ring on ground
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(this.interactRange - 0.2, this.interactRange, 48),
      new THREE.MeshBasicMaterial({ color: 0xffb800, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.03
    this.group.add(this.ring)

    // Floating diamond marker
    this.marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3),
      new THREE.MeshStandardMaterial({ color: 0xffb800, emissive: 0xffb800, emissiveIntensity: 1.2 })
    )
    this.marker.position.y = 3.0
    this.group.add(this.marker)

    // Label sprite
    this.label = this._makeLabel(label)
    this.label.position.y = 3.7
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
    this.marker.position.y = 3.0 + Math.sin(elapsed * 2.5) * 0.15

    const d = playerPos.distanceTo(this.position)
    this.inRange = d <= this.interactRange
    this.label.visible = this.inRange
    this.ring.material.opacity = this.inRange ? 0.7 : 0.3
  }
}
