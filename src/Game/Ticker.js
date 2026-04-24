export class Ticker {
  constructor() {
    this.callbacks = new Set()
    this.lastTime = performance.now()
    this.delta = 0
    this.elapsed = 0
    this.running = false
    this.targetFps = 30           // laptop-friendly FPS cap (was uncapped ~60-120)
    this.tabVisible = !document.hidden
    document.addEventListener('visibilitychange', () => {
      this.tabVisible = !document.hidden
      this.lastTime = performance.now()  // prevent delta spike on resume
    })
  }

  start() {
    this.running = true
    this.lastTime = performance.now()
    const minFrameMs = 1000 / this.targetFps
    let accumulated = 0
    const loop = (now) => {
      if (!this.running) return
      requestAnimationFrame(loop)
      if (!this.tabVisible) return   // skip rendering when tab hidden

      const raw = (now - this.lastTime)
      accumulated += raw
      this.lastTime = now
      if (accumulated < minFrameMs) return   // FPS cap

      this.delta = Math.min(accumulated / 1000, 0.05)
      accumulated = 0
      this.elapsed += this.delta
      this.callbacks.forEach((cb) => cb(this.delta, this.elapsed))
    }
    requestAnimationFrame(loop)
  }

  stop() { this.running = false }

  on(cb) { this.callbacks.add(cb); return () => this.callbacks.delete(cb) }
}
