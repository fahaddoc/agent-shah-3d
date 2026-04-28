export class Inputs {
  constructor(canvas) {
    this.canvas = canvas
    this.keys = new Set()
    this.justPressed = new Set()
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, movedAt: 0, seen: false }

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase()
      if (!this.keys.has(k)) this.justPressed.add(k)
      this.keys.add(k)
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()))

    const updateMouse = (e) => {
      this.mouse.x = e.clientX
      this.mouse.y = e.clientY
      this.mouse.ndcX = (e.clientX / window.innerWidth) * 2 - 1
      this.mouse.ndcY = -(e.clientY / window.innerHeight) * 2 + 1
      this.mouse.seen = true
      this.mouse.movedAt = performance.now()
    }
    window.addEventListener('mousemove', updateMouse)
    window.addEventListener('mousedown', (e) => { updateMouse(e); this.mouse.down = true })
    window.addEventListener('mouseup', () => { this.mouse.down = false })
    window.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  isDown(k) { return this.keys.has(k.toLowerCase()) }

  consumePress(k) {
    const has = this.justPressed.has(k.toLowerCase())
    if (has) this.justPressed.delete(k.toLowerCase())
    return has
  }

  axisMove() {
    let x = 0, z = 0
    if (this.isDown('w') || this.isDown('arrowup')) z -= 1
    if (this.isDown('s') || this.isDown('arrowdown')) z += 1
    if (this.isDown('a') || this.isDown('arrowleft')) x -= 1
    if (this.isDown('d') || this.isDown('arrowright')) x += 1
    const len = Math.hypot(x, z)
    if (len > 1) { x /= len; z /= len }
    return { x, z }
  }
}
