import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

export class AssetLoader {
  constructor() {
    this.gltf = new GLTFLoader()
    this.draco = new DRACOLoader()
    this.draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
    this.gltf.setDRACOLoader(this.draco)
    this.cache = new Map()
  }

  load(url) {
    if (this.cache.has(url)) return Promise.resolve(this.cache.get(url))
    return new Promise((resolve, reject) => {
      this.gltf.load(
        url,
        (gltf) => {
          this.cache.set(url, gltf)
          resolve(gltf)
        },
        undefined,
        reject
      )
    })
  }

  async loadAll(urls) {
    return Promise.all(urls.map((u) => this.load(u)))
  }
}
