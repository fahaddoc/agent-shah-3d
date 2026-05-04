import { PROFILE, SKILLS, PROJECTS, EXPERIENCE } from '../data/portfolio.js'
import { audio } from './Audio.js'

const SECTION_LABELS = {
  intro:      'BRIEFING',
  about:      'DOSSIER',
  skills:     'ARSENAL',
  projects:   'ARCHIVE',
  experience: 'HISTORY',
  contact:    'EXTRACTION',
}

export class UI {
  constructor() {
    this.healthFill = document.getElementById('health-fill')
    this.briefing = document.getElementById('briefing')
    this.briefingBody = document.getElementById('briefing-body')
    this.hint = document.getElementById('hud-hint')
    this.sectorName = document.getElementById('sector-name')
    this.weaponName = document.getElementById('weapon-name')

    this.splash = document.getElementById('splash')
    this.musicToggle = document.getElementById('music-toggle')

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeBriefing()
      if (e.key.toLowerCase() === 'm') this._toggleMusic()
    })
    if (this.musicToggle) {
      this.musicToggle.addEventListener('click', () => this._toggleMusic())
    }
  }

  _toggleMusic() {
    const next = !audio.isMusicMuted()
    audio.setMusicMuted(next)
    if (this.musicToggle) {
      this.musicToggle.classList.toggle('muted', next)
      this.musicToggle.textContent = next ? '♪ MUSIC OFF' : '♪ MUSIC'
    }
  }

  setHealth(hp, max) {
    this.healthFill.style.width = `${Math.max(0, (hp / max) * 100)}%`
  }

  setHint(t) { this.hint.textContent = t }
  setSector(name) { this.sectorName.textContent = name }
  setWeapon(w) { this.weaponName.textContent = w }

  setLoaderProgress() {}
  finishLoader() {
    if (!this.splash) return
    this.splash.classList.add('gone')
    setTimeout(() => this.splash?.remove(), 700)
  }

  showBriefing(section) {
    audio.briefing()
    this.briefingBody.innerHTML = this._renderDossier({ section, failed: false })
    this.briefing.classList.remove('hidden')
    this._wireDossier(false)
  }

  closeBriefing() {
    if (this._gameOverShown) return
    this.briefing.classList.add('hidden')
    if (this.onBriefingClosed) this.onBriefingClosed()
  }

  showGameOver() {
    if (this._gameOverShown) return
    this._gameOverShown = true
    this.briefingBody.innerHTML = this._renderDossier({ section: 'about', failed: true })
    this.briefing.classList.remove('hidden')
    this._wireDossier(true)
  }

  isBriefingOpen() { return !this.briefing.classList.contains('hidden') }

  // ---------- DOSSIER RENDERING ----------

  _renderDossier({ section = 'about', failed = false }) {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const recTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    const recDate = `${pad(now.getMonth() + 1)}·${pad(now.getDate())}·${String(now.getFullYear()).slice(2)}`
    const caseId = `2026-04-SF`
    const sectionLabel = SECTION_LABELS[section] || 'DOSSIER'

    const tabLabel = failed
      ? `FILE — 04-A · SF · MISSION FAILED`
      : `FILE — 04-A · SF · ${sectionLabel}`

    const headerLeft = failed
      ? `BUREAU OF ENGINEERING AFFAIRS · CASE ${caseId} · STATUS: AGENT DOWN`
      : `BUREAU OF ENGINEERING AFFAIRS · CASE ${caseId}`

    const closeBtn = failed
      ? `<button class="dos-retry" id="dossier-retry">RETRY</button>`
      : `<button class="dossier-close" id="dossier-close">CLOSE [ESC]</button>`

    return `
      <div class="dossier-wrap">
        ${closeBtn}

        <div class="dossier-topbar">
          <span>${headerLeft}</span>
          <span><span class="rec-dot"></span>REC · ${recTime} · ${recDate}</span>
        </div>

        <div class="folder-tab">${tabLabel}</div>

        <div class="dossier-folder">
          <div class="dossier-page">
            ${failed ? `<div class="failed-stamp">MISSION FAILED<small>// AGENT DOWN · DOSSIER LEAKED</small></div>` : ''}

            <div class="dossier-grid">
              <div class="dossier-left">
                ${this._renderForm(section)}
                ${this._renderMemo(section)}
                ${this._renderIntel()}
              </div>

              <div class="dossier-right">
                <div class="dos-cluster">
                  <div class="polaroid">
                    <div class="photo">
                      <div class="crosshair"></div>
                      <div class="stamp-time">${recDate} · ${recTime}</div>
                    </div>
                    <div class="caption">subject — karachi, '26</div>
                  </div>
                  <div class="map-sticker">
                    <div class="coords">24°51'N · 67°00'E</div>
                    <div class="route"></div>
                    <div class="pin"></div>
                    <div class="city">KARACHI · PK</div>
                  </div>
                  <div class="classified-stamp">CLASSIFIED<small>EYES ONLY</small></div>
                </div>

                ${this._renderTimeline()}

                <div class="sticky-note">
                  <div class="head">NOTE TO SELF</div>
                  ${this._stickyText(section)}
                  <div class="sig">— m</div>
                </div>

                <div class="evidence-tag">
                  <div class="tg-head">EVIDENCE TAG</div>
                  <div class="tg-id">EXHIBIT — A</div>
                  <div class="tg-meta">REF: SF-04 / KHI</div>
                  <div class="tg-meta">DATE: ${recDate}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="dossier-footer ${failed ? 'failed' : ''}">
          <span class="left"><span class="dot"></span>TRANSMISSION · ${PROFILE.realName.toUpperCase()} · KHI · SF-04</span>
          <span>${failed ? 'TERMINATED ////' : 'END ////'}</span>
        </div>
      </div>
    `
  }

  _renderForm(section) {
    if (section === 'skills')   return this._formSkills()
    if (section === 'projects') return this._formProjects()
    if (section === 'experience') return this._formExperience()
    if (section === 'contact')  return this._formContact()
    return this._formPersonnel()
  }

  _formPersonnel() {
    return `
      <div class="dos-form">
        <div class="dos-form-header">
          <span>FORM SF-04 · PERSONNEL</span>
          <span>REV. 04/2026</span>
        </div>
        <div class="dos-subject-tag">// SUBJECT</div>
        <h1 class="dos-codename">${PROFILE.codename}</h1>
        <div class="dos-meta"><b>Codename:</b> SHAH FAHAD</div>
        <div class="dos-meta"><b>Role:</b> ${PROFILE.title}</div>
        <table class="dos-table">
          <tr><td class="k">Last Known</td><td>${PROFILE.location}</td></tr>
          <tr><td class="k">Field Experience</td><td>${PROFILE.experience} · active</td></tr>
          <tr><td class="k">Specialty</td><td>React · Next.js · Flutter</td></tr>
          <tr><td class="k">Secondary</td><td>Real-time comms / WebRTC</td></tr>
        </table>
        <div class="dos-stat-row">
          <div class="dos-stat"><span class="num">${PROFILE.stats.projects}+</span><span class="lbl">PROJECTS</span></div>
          <div class="dos-stat"><span class="num">${PROFILE.stats.companies}+</span><span class="lbl">AGENCIES</span></div>
          <div class="dos-stat"><span class="num">${PROFILE.stats.clients}+</span><span class="lbl">CLIENTS</span></div>
        </div>
      </div>
    `
  }

  _formSkills() {
    const groups = Object.entries(SKILLS).map(([k, arr]) => `
      <tr><td class="k">${k}</td><td>${arr.join(' · ')}</td></tr>
    `).join('')
    return `
      <div class="dos-form">
        <div class="dos-form-header">
          <span>FORM SF-04 · ARSENAL</span>
          <span>REV. 04/2026</span>
        </div>
        <div class="dos-subject-tag">// LOADOUT</div>
        <h1 class="dos-codename">ARSENAL</h1>
        <div class="dos-meta">Field-tested toolkit. Cross-trained across stack layers.</div>
        <table class="dos-table">${groups}</table>
      </div>
    `
  }

  _formProjects() {
    const items = PROJECTS.map(p => `
      <div class="item">
        <div class="name">// ${p.name}</div>
        <div class="meta">${p.type} · ${p.tech.join(' · ')}</div>
        <div class="desc">${p.desc}</div>
      </div>
    `).join('')
    return `
      <div class="dos-form">
        <div class="dos-form-header">
          <span>FORM SF-04 · MISSION ARCHIVES</span>
          <span>${PROJECTS.length} ENTRIES</span>
        </div>
        <div class="dos-subject-tag">// LOG</div>
        <h1 class="dos-codename">ARCHIVES</h1>
        <div class="dos-list">${items}</div>
      </div>
    `
  }

  _formExperience() {
    const items = EXPERIENCE.map(e => `
      <div class="item">
        <div class="name">// ${e.company} — ${e.period}</div>
        <div class="meta">${e.role}</div>
        <div class="desc">${e.notes}</div>
      </div>
    `).join('')
    return `
      <div class="dos-form">
        <div class="dos-form-header">
          <span>FORM SF-04 · FIELD HISTORY</span>
          <span>REV. 04/2026</span>
        </div>
        <div class="dos-subject-tag">// SERVICE RECORD</div>
        <h1 class="dos-codename">HISTORY</h1>
        <div class="dos-list">${items}</div>
      </div>
    `
  }

  _formContact() {
    const c = PROFILE.contact
    return `
      <div class="dos-form">
        <div class="dos-form-header">
          <span>FORM SF-04 · EXTRACTION</span>
          <span>SECURE</span>
        </div>
        <div class="dos-subject-tag">// CHANNELS</div>
        <h1 class="dos-codename">EXTRACTION</h1>
        <table class="dos-table">
          <tr><td class="k">Email</td><td>${c.email}</td></tr>
          <tr><td class="k">Phone</td><td>${c.phone}</td></tr>
          <tr><td class="k">LinkedIn</td><td>${c.linkedin}</td></tr>
          <tr><td class="k">GitHub</td><td>${c.github}</td></tr>
        </table>
      </div>
    `
  }

  _renderMemo(section) {
    const memos = {
      about: {
        head: '/ MEMO · INTERNAL',
        title: 'MISSION SUMMARY',
        body: `Field-tested engineer with <b>6+ years</b> crafting high-performance, real-time web and mobile experiences. Specializes in React, Next.js, Flutter, and real-time communication systems. Last seen operating out of <span class="dos-redact">Karachi HQ</span> with confirmed kills on <span class="dos-redact">legacy stacks</span>.`,
        sig: '— DESK CHIEF',
      },
      skills: {
        head: '/ MEMO · TECH',
        title: 'WEAPONS RATING',
        body: `Subject demonstrates <b>multi-platform fluency</b>. Primary kill chain: React + Next.js. Mobile sidearm: Flutter. Specialist clearance: WebRTC, SignalR, real-time pipelines. <span class="dos-redact">Backend ops</span> verified.`,
        sig: '— ARMORY',
      },
      projects: {
        head: '/ MEMO · CASEFILE',
        title: 'OPERATIONAL HISTORY',
        body: `Confirmed shipments include video conferencing platforms, fintech dashboards, healthcare records systems, and marketplace apps. Subject ships on time. <span class="dos-redact">Recommended for sensitive ops</span>.`,
        sig: '— OPS DIRECTOR',
      },
      experience: {
        head: '/ MEMO · SERVICE',
        title: 'CAREER TRAJECTORY',
        body: `Six years on active deployment. Path: junior dev → freelance ops → senior frontend → engineering lead. <b>No incidents reported.</b> Loyalty rating <span class="dos-redact">A+</span>.`,
        sig: '— PERSONNEL',
      },
      contact: {
        head: '/ MEMO · CHANNELS',
        title: 'EXTRACTION POINT',
        body: `Subject responds within <b>24 hours</b>. Preferred channels listed. Use email for formal contracts; LinkedIn for first contact; GitHub to verify <span class="dos-redact">technical credentials</span>.`,
        sig: '— LIAISON',
      },
    }
    const m = memos[section] || memos.about
    return `
      <div class="dos-memo">
        <div class="dos-memo-head">${m.head}</div>
        <h2>${m.title}</h2>
        <p>${m.body}</p>
        <div class="dos-memo-sig">${m.sig}</div>
      </div>
    `
  }

  _renderIntel() {
    const bars = [
      { name: 'React',     val: 95 },
      { name: 'Next.js',   val: 92 },
      { name: 'Flutter',   val: 82 },
      { name: 'WebRTC',    val: 76 },
      { name: 'Node.js',   val: 70 },
    ]
    const rows = bars.map(b => `
      <div class="dos-bar">
        <span class="lbl">${b.name}</span>
        <div class="track"><div class="fill" style="width:${b.val}%"></div></div>
        <span class="val">${b.val}</span>
      </div>
    `).join('')
    return `
      <div class="dos-intel">
        <div class="dos-intel-head">// INTEL · WEAPONS LOADOUT</div>
        ${rows}
      </div>
    `
  }

  _renderTimeline() {
    const items = EXPERIENCE.map((e, i) => {
      const isActive = i === 0
      return `
        <div class="dos-tl-item">
          <div class="dos-tl-period">${isActive ? `<span class="active">${e.period} · ACTIVE</span>` : e.period}</div>
          <div class="dos-tl-company">${e.company}</div>
          <div class="dos-tl-role">${e.role}</div>
          <div class="dos-tl-notes">${e.notes}</div>
        </div>
      `
    }).join('')
    return `
      <div class="dos-page2">
        <div class="dos-page2-head">
          <span>// FIELD HISTORY</span>
          <span>PG. 2 / 6</span>
        </div>
        <div class="dos-timeline">${items}</div>
        <div class="approved-stamp" style="right:14px;bottom:14px;">APPROVED<small>ACTIVE STATUS</small></div>
      </div>
    `
  }

  _stickyText(section) {
    const map = {
      about:      `tagline checks out — "scale" is real, see numbers ✓`,
      skills:     `arsenal verified. cross-stack, ships clean.`,
      projects:   `9 confirmed shipments. zero ghost ops.`,
      experience: `6yr trajectory. no gaps, no flags.`,
      contact:    `responds fast. green-lit for outreach.`,
    }
    return `<div>${map[section] || map.about}</div>`
  }

  _wireDossier(failed) {
    if (failed) {
      const btn = document.getElementById('dossier-retry')
      if (btn) btn.addEventListener('click', () => location.reload())
    } else {
      const btn = document.getElementById('dossier-close')
      if (btn) btn.addEventListener('click', () => this.closeBriefing())
    }
  }
}
