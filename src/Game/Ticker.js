export class Ticker {
  constructor() {
    this.callbacks = new Set()
    this.lastTime = performance.now()
    this.delta = 0
    this.elapsed = 0
    this.running = false
  }

  start() {
    this.running = true
    this.lastTime = performance.now()
    const loop = (now) => {
      if (!this.running) return
      this.delta = Math.min((now - this.lastTime) / 1000, 0.05)
      this.lastTime = now
      this.elapsed += this.delta
      this.callbacks.forEach((cb) => cb(this.delta, this.elapsed))
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  stop() { this.running = false }

  on(cb) { this.callbacks.add(cb); return () => this.callbacks.delete(cb) }
}
