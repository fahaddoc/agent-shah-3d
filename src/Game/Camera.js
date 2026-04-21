import * as THREE from 'three'

export class Camera {
  constructor() {
    this.instance = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200)

    // Orbit state (mouse-driven yaw)
    this.yaw = 0                // horizontal rotation around player
    this.pitch = 0.95           // ~55° down (isometric-ish)
    this.distance = 14
    this.height = 9

    // Spring follow (paodao-style lag)
    this.lookTarget = new THREE.Vector3()
    this.smoothLook = new THREE.Vector3()
    this.smoothPos = new THREE.Vector3(0, this.height, this.distance)
    this.instance.position.copy(this.smoothPos)

    // Mouse drag to orbit
    this.dragging = false
    this.lastMouseX = 0
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.dragging = true; this.lastMouseX = e.clientX }
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.dragging = false
    })
    window.addEventListener('mousemove', (e) => {
      if (this.dragging) {
        const dx = e.clientX - this.lastMouseX
        this.lastMouseX = e.clientX
        this.yaw -= dx * 0.005
      }
    })

    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    this.instance.aspect = window.innerWidth / window.innerHeight
    this.instance.updateProjectionMatrix()
  }

  // Returns camera-relative forward/right vectors (XZ plane only)
  getBasis(out = {}) {
    out.forward = out.forward || new THREE.Vector3()
    out.right   = out.right   || new THREE.Vector3()
    out.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    out.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    return out
  }

  follow(targetPos, delta) {
    // Desired camera position: orbit around player
    const dx = Math.sin(this.yaw) * this.distance
    const dz = Math.cos(this.yaw) * this.distance
    const desired = new THREE.Vector3(targetPos.x + dx, targetPos.y + this.height, targetPos.z + dz)

    // Spring lerp (different speed for pos vs look = cinematic lag)
    const posLerp = Math.min(delta * 3.5, 1)
    const lookLerp = Math.min(delta * 6, 1)
    this.smoothPos.lerp(desired, posLerp)
    this.lookTarget.set(targetPos.x, targetPos.y + 1.4, targetPos.z)
    this.smoothLook.lerp(this.lookTarget, lookLerp)

    this.instance.position.copy(this.smoothPos)
    this.instance.lookAt(this.smoothLook)
  }

  setInstant(pos, look) {
    this.smoothPos.copy(pos)
    this.smoothLook.copy(look)
    this.lookTarget.copy(look)
    this.instance.position.copy(pos)
    this.instance.lookAt(look)
  }
}
