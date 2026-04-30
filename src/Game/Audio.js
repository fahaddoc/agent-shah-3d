// Sample-based audio bus — plays real .mp3 files via Web Audio API.
// AudioBufferSourceNodes allow rapid overlapping playback (machine gun, multi-hits).
// Auto-unlocks AudioContext on first user gesture per browser autoplay policy.

const SAMPLES = {
  pistol:      '/assets/audio/pistol.mp3',
  mg:          '/assets/audio/mg.mp3',
  stab:        '/assets/audio/stab.mp3',
  enemyHit:    '/assets/audio/enemy-hit.mp3',
  enemyDeath:  '/assets/audio/enemy-death.mp3',
  pickup:      '/assets/audio/pickup.mp3',
  briefing:    '/assets/audio/briefing.mp3',
  footstep:    '/assets/audio/footstep.mp3',
  playerHit:   '/assets/audio/player-hit.mp3',
}

const MUSIC_URL = '/assets/audio/music-deadman.ogg'

class AudioBus {
  constructor() {
    this.ctx = null
    this.master = null
    this.sfxGain = null
    this.musicGain = null
    this.muted = false
    this.buffers = {}     // name → AudioBuffer (decoded once)
    this._musicEl = null
    this._musicNode = null
    this._unlocked = false

    const unlock = () => {
      if (this._unlocked) return
      this._unlocked = true
      this._init()
      this._loadAll()
      this.startAmbient()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: false })
    window.addEventListener('keydown', unlock, { once: false })
  }

  _init() {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.85
    this.master.connect(this.ctx.destination)
    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = 1.0
    this.sfxGain.connect(this.master)
    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = 0.32
    this.musicGain.connect(this.master)
  }

  async _loadAll() {
    if (!this.ctx) return
    await Promise.all(Object.entries(SAMPLES).map(async ([name, url]) => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
        const arr = await res.arrayBuffer()
        this.buffers[name] = await this.ctx.decodeAudioData(arr)
      } catch (err) {
        console.warn(`[Audio] failed to load ${name}:`, err)
      }
    }))
  }

  setMuted(m) {
    this.muted = !!m
    if (this.master) this.master.gain.value = m ? 0 : 0.85
  }

  // Separate music mute — toggles music gain only, SFX stays audible.
  setMusicMuted(m) {
    this.musicMuted = !!m
    if (this.musicGain) this.musicGain.gain.value = m ? 0 : 0.32
    if (this._musicEl) {
      if (m) this._musicEl.pause()
      else this._musicEl.play().catch(() => {})
    }
  }
  isMusicMuted() { return !!this.musicMuted }

  // Generic single-shot player. `volume` 0..1, `rateJitter` ±x for pitch variety on repeats.
  _play(name, volume = 1, rateJitter = 0) {
    if (!this.ctx || this.muted) return
    const buf = this.buffers[name]
    if (!buf) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    if (rateJitter > 0) {
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * rateJitter
    }
    const g = this.ctx.createGain()
    g.gain.value = volume
    src.connect(g).connect(this.sfxGain)
    src.start(0)
  }

  // ============ PUBLIC API ============

  gunshot(weapon = 'pistol') {
    if (weapon === 'machinegun') {
      // MG sample is a longer burst — re-trigger every shot, slight pitch jitter
      this._play('mg', 0.6, 0.04)
    } else {
      this._play('pistol', 0.85, 0.05)
    }
  }

  stab() {
    this._play('stab', 0.9)
  }

  hit(intensity = 1) {
    this._play('enemyHit', Math.min(1, 0.7 * intensity))
  }

  enemyDeath() {
    this._play('enemyDeath', 0.9)
  }

  playerHit() {
    this._play('playerHit', 0.9)
  }

  pickup() {
    this._play('pickup', 0.85)
  }

  briefing() {
    this._play('briefing', 0.8)
  }

  footstep() {
    this._play('footstep', 0.4, 0.08)
  }

  // Background music — Dead Man Circuit, looped, piped through master via MediaElementSource.
  // HTMLAudioElement preferred over AudioBuffer for long tracks: streams instead of full decode.
  startAmbient() {
    if (!this.ctx || this._musicEl) return
    const el = new Audio(MUSIC_URL)
    el.loop = true
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    this._musicEl = el
    try {
      this._musicNode = this.ctx.createMediaElementSource(el)
      this._musicNode.connect(this.musicGain)
    } catch (err) {
      // MediaElementSource construction can throw on some browsers if element
      // is already routed elsewhere — fall back to direct element output.
      console.warn('[Audio] MediaElementSource failed, using direct element output', err)
    }
    el.play().catch(err => console.warn('[Audio] music play blocked:', err))
  }

  stopAmbient() {
    if (this._musicEl) {
      this._musicEl.pause()
      this._musicEl.currentTime = 0
    }
  }
}

export const audio = new AudioBus()
