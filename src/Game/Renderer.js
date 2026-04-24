import * as THREE from 'three'

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,           // turned off — saves big on GPU
      powerPreference: 'low-power', // laptop-friendly (was high-performance)
      stencil: false,
      depth: true
    })
    // Cap pixel ratio at 1 (Retina doubling burns GPU for little visual gain)
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.BasicShadowMap  // cheapest shadow type (was PCFSoftShadowMap)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.4
    this.renderer.setClearColor(0x0a1218, 1)

    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(1)
  }

  render(scene, camera) { this.renderer.render(scene, camera) }
}
