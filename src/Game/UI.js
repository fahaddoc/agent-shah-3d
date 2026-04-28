import { PROFILE, SKILLS, PROJECTS, EXPERIENCE } from '../data/portfolio.js'

export class UI {
  constructor() {
    this.healthFill = document.getElementById('health-fill')
    this.briefing = document.getElementById('briefing')
    this.briefingBody = document.getElementById('briefing-body')
    this.hint = document.getElementById('hud-hint')
    this.sectorName = document.getElementById('sector-name')
    this.weaponName = document.getElementById('weapon-name')

    document.getElementById('briefing-close').addEventListener('click', () => this.closeBriefing())
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeBriefing()
    })
  }

  setHealth(hp, max) {
    this.healthFill.style.width = `${Math.max(0, (hp / max) * 100)}%`
  }

  setHint(t) { this.hint.textContent = t }
  setSector(name) { this.sectorName.textContent = name }
  setWeapon(w) { this.weaponName.textContent = w }

  setLoaderProgress() {}
  finishLoader() {}

  showBriefing(section) {
    this.briefingBody.innerHTML = this._renderSection(section)
    this.briefing.classList.remove('hidden')
  }

  closeBriefing() { this.briefing.classList.add('hidden') }

  showGameOver() {
    if (this._gameOverShown) return
    this._gameOverShown = true
    // Render full dossier so failed runs still surface the portfolio content
    const dossier = ['about', 'experience', 'skills', 'projects', 'contact']
      .map(s => `<div style="margin-bottom:24px">${this._renderSection(s)}</div>`)
      .join('')
    const overlay = document.createElement('div')
    overlay.id = 'game-over'
    overlay.innerHTML = `
      <div style="
        max-width:780px;width:90%;max-height:88vh;overflow-y:auto;
        background:rgba(5,12,20,0.96);border:2px solid #ff3355;
        padding:32px 40px;color:#9bd;
      ">
        <h1 style="color:#ff3355;letter-spacing:6px;font-size:42px;margin:0 0 6px;text-align:center">MISSION FAILED</h1>
        <p style="color:#ffb800;letter-spacing:3px;font-size:13px;text-align:center;margin:0 0 8px">
          // AGENT DOWN · DOSSIER LEAKED
        </p>
        <p style="color:#9bd;text-align:center;margin:0 0 28px;font-size:13px">
          Final intel recovered from the field — the dossier on Agent Shah Fahad:
        </p>
        ${dossier}
        <div style="text-align:center;margin-top:16px">
          <button id="continue-btn" style="
            background:#ff3355;color:#000;border:2px solid #ff3355;
            padding:14px 36px;font-family:'Share Tech Mono',monospace;
            font-size:18px;font-weight:bold;letter-spacing:4px;cursor:pointer;
          ">RETRY</button>
        </div>
      </div>
    `
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,5,15,0.92);
      display:flex;align-items:center;justify-content:center;z-index:9999;
      font-family:'Share Tech Mono',monospace;
    `
    document.body.appendChild(overlay)
    document.getElementById('continue-btn').addEventListener('click', () => location.reload())
  }

  isBriefingOpen() { return !this.briefing.classList.contains('hidden') }

  _renderSection(section) {
    if (section === 'intro' || section === 'about') {
      return `
        <h1>${PROFILE.codename}</h1>
        <p style="color:#ffb800;letter-spacing:2px">${PROFILE.realName} · ${PROFILE.title}</p>
        <p style="margin-top:6px;color:#9bd">📍 ${PROFILE.location} · ${PROFILE.experience} field experience</p>
        <h2>// MISSION SUMMARY</h2>
        <p>${PROFILE.bio}</p>
        <div class="stat-row">
          <div class="stat"><span class="num">${PROFILE.stats.projects}+</span><span class="lbl">PROJECTS SHIPPED</span></div>
          <div class="stat"><span class="num">${PROFILE.stats.companies}+</span><span class="lbl">AGENCIES</span></div>
          <div class="stat"><span class="num">${PROFILE.stats.clients}+</span><span class="lbl">CLIENTS</span></div>
        </div>
        <h2>// TAGLINE</h2>
        <p style="font-style:italic;color:#00ffff">"${PROFILE.tagline}"</p>
      `
    }
    if (section === 'skills') {
      return `<h1>ARSENAL</h1>${Object.entries(SKILLS).map(([k, arr]) =>
        `<h2>// ${k.toUpperCase()}</h2><p>${arr.join(' · ')}</p>`).join('')}`
    }
    if (section === 'projects') {
      return `<h1>MISSION ARCHIVES</h1>${PROJECTS.map(p =>
        `<h2>// ${p.name}</h2><p style="color:#ffb800">${p.type} · ${p.tech.join(', ')}</p><p>${p.desc}</p>`).join('')}`
    }
    if (section === 'experience') {
      return `<h1>FIELD HISTORY</h1>${EXPERIENCE.map(e =>
        `<h2>// ${e.company} — ${e.period}</h2><p style="color:#ffb800">${e.role}</p><p>${e.notes}</p>`).join('')}`
    }
    if (section === 'contact') {
      const c = PROFILE.contact
      return `
        <h1>EXTRACTION POINT</h1>
        <h2>// SECURE CHANNELS</h2>
        <ul>
          <li>📧 ${c.email}</li>
          <li>📞 ${c.phone}</li>
          <li>🔗 ${c.linkedin}</li>
          <li>💻 ${c.github}</li>
        </ul>
      `
    }
    return '<p>NO INTEL.</p>'
  }
}
