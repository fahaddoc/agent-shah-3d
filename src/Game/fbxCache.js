import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

// Shared FBX loader + per-URL parse cache.
// Multiple enemies + player request the same file → fetch + parse once, all await the same Promise.
const _loader = new FBXLoader()
const _cache = new Map()
let _started = 0
let _finished = 0

export function loadFbxCached(url) {
  let p = _cache.get(url)
  if (!p) {
    _started++
    p = new Promise((res, rej) => _loader.load(url, res, undefined, rej))
      .then(r => { _finished++; return r })
      .catch(err => { _cache.delete(url); _finished++; throw err })
    _cache.set(url, p)
  }
  return p
}

export function fbxProgress() {
  if (_started === 0) return 1
  return _finished / _started
}
