import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const _draco = new DRACOLoader()
_draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

const _loader = new GLTFLoader()
_loader.setDRACOLoader(_draco)
_loader.setMeshoptDecoder(MeshoptDecoder)

const _cache = new Map()
let _started = 0
let _finished = 0

// Drop-in replacement for loadFbxCached — returns gltf.scene with .animations
// attached so existing call-sites that read result.animations and pass result
// as a Skeleton-bearing Object3D continue to work unchanged.
export function loadGlbCached(url) {
  let p = _cache.get(url)
  if (!p) {
    _started++
    p = new Promise((res, rej) => _loader.load(url, res, undefined, rej))
      .then(g => {
        const root = g.scene
        root.animations = g.animations || []
        _finished++
        return root
      })
      .catch(err => { _cache.delete(url); _finished++; throw err })
    _cache.set(url, p)
  }
  return p
}

export function glbProgress() {
  if (_started === 0) return 1
  return _finished / _started
}
