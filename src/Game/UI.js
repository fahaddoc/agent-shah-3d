import { PROFILE, SKILLS, PROJECTS, EXPERIENCE } from '../data/portfolio.js'

export class UI {
  constructor() {
    this.healthFill = document.getElementById('health-fill')
    this.briefing = document.getElementById('briefing')
    this.briefingBody = document.getElementById('briefing-body')
    this.hint = document.getElementById('hud-hint')
    this.sectorName = document.getElementById('sector-name')
    this.weaponName = document.getElementById('weapon-name')
    this.loader = document.getElementById('loader')
    this.loaderFill = document.getElementById('loader-fill')

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

  finishLoader() {
    this.loaderFill.style.width = '100%'
    setTimeout(() => this.loader.classList.add('gone'), 400)
    setTimeout(() => this.loader.remove(), 1200)
  }

  showBriefing(section) {
    this.briefingBody.innerHTML = this._renderSection(section)
    this.briefing.classList.remove('hidden')
  }

  closeBriefing() { this.briefing.classList.add('hidden') }

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
