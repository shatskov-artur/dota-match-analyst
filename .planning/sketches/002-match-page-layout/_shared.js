// Shared mockup partials for sketch 002 variants.
// Builds the consistent top of the match page (header, score, win-prob,
// and Row 1 with HeroPlayerGrid | ItemsBlock | CooldownsBlock). Each
// variant file overrides Row 2 (and Row 3 / lower sections).

function heroRow(team, name, kda) {
  return `<div class="row-item ${team}">
    <div class="hero"></div>
    <div class="name">${name}</div>
    <div class="kda">${kda}</div>
  </div>`;
}

function heroPlayerGridBlock() {
  const r = [
    ['Feyendorh', '7 / 10 / 28'],
    ['Tosiev', '12 / 6 / 10'],
    ['Princess Maryline', '20 / 8 / 16'],
    ['CanaYou', '6 / 9 / 25'],
    ['Esti', '9 / 3 / 32'],
  ];
  const d = [
    ['Embuscade', '1 / 15 / 22'],
    ['Mojo', '9 / 6 / 16'],
    ['Casterion', '4 / 14 / 15'],
    ['Ronflex', '9 / 10 / 9'],
    ['CheZa', '12 / 11 / 12'],
  ];
  return `<div class="block">
    <p class="block-label">Heroes & Players</p>
    <div class="team-label r">Radiant</div>
    ${r.map(([n, k]) => heroRow('radiant', n, k)).join('')}
    <div class="team-label d">Dire</div>
    ${d.map(([n, k]) => heroRow('dire', n, k)).join('')}
  </div>`;
}

function itemsBlock() {
  const rows = [
    [46.4, 'r'], [34.1, 'r'], [24.8, 'r'], [23.9, 'r'], [22.8, 'r'],
    [22.6, 'd'], [17.6, 'd'], [16.4, 'd'], [11.1, 'd'], [10.1, 'd'],
  ];
  return `<div class="block">
    <p class="block-label">Items</p>
    ${rows.map(([nw, t]) => {
      const filled = Math.floor(2 + Math.random() * 4);
      const slots = Array.from({ length: 6 }).map((_, i) =>
        i < filled ? `<div class="item-slot filled-${t}"></div>` : `<div class="item-slot"></div>`
      ).join('');
      return `<div class="items-row">
        <div class="nw">${nw}k</div>
        ${slots}
      </div>`;
    }).join('')}
  </div>`;
}

function cooldownsBlock() {
  const rows = [
    ['radiant', 'Tombstone', 'READY'],
    ['radiant', 'Sanity’s Eclipse', 'READY'],
    ['radiant', 'Omnislash', 'READY'],
    ['radiant', 'Chain Frost', 'READY'],
    ['radiant', 'Spell Steal', 'READY'],
    ['dire', 'Bedlam', 'READY'],
    ['dire', 'Rearm', 'READY'],
    ['dire', 'Finger of Death', 'READY'],
    ['dire', 'Pierce the Veil', 'READY'],
    ['dire', 'Duel', 'READY'],
  ];
  return `<div class="block">
    <p class="block-label">Cooldowns (Ultimates)</p>
    ${rows.map(([team, name, status]) => `<div class="cooldown-row ${team}">
      <div class="ult-icon"></div>
      <div class="ult-hero"></div>
      <div class="ult-name">${name}</div>
      ${status === 'READY' ? '<div class="ready">READY</div>' : `<div class="cd-time">${status}</div>`}
    </div>`).join('')}
  </div>`;
}

function mapBlock() {
  return `<div class="block" style="align-items: center;">
    <p class="block-label" style="align-self: flex-start;">Minimap</p>
    <div class="minimap"></div>
  </div>`;
}

function roshanBlock() {
  return `<div class="block">
    <p class="block-label">Roshan</p>
    <div class="roshan-pill">Roshan #2 · RESPAWN 4:28</div>
    <div class="roshan-loot">
      <div class="loot"></div>
      <div class="loot"></div>
      <div class="loot"></div>
      <div class="loot"></div>
    </div>
    <p class="block-label" style="margin-top: 16px;">Last Drop</p>
    <div class="roshan-loot">
      <div class="loot"></div>
      <div class="loot"></div>
    </div>
  </div>`;
}

function buildingsBlock() {
  const lanes = ['Top', 'Mid', 'Bot'];
  return `<div class="block">
    <p class="block-label">Buildings</p>
    <div class="buildings-grid">
      <div class="team-col">
        <div style="color: var(--radiant); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase;">Radiant</div>
        ${lanes.map(l => `<div class="lane-row">
          <span style="min-width: 32px; color: var(--fg-dim);">${l}</span>
          <span class="tower up"></span>
          <span class="tower up"></span>
          <span class="tower down"></span>
          <span class="tower up"></span><span class="tower up"></span>
        </div>`).join('')}
      </div>
      <div class="team-col">
        <div style="color: var(--dire); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase;">Dire</div>
        ${lanes.map(l => `<div class="lane-row">
          <span style="min-width: 32px; color: var(--fg-dim);">${l}</span>
          <span class="tower up"></span>
          <span class="tower down"></span>
          <span class="tower down"></span>
          <span class="tower up"></span><span class="tower up"></span>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

function historyBlock() {
  return `<div class="block">
    <p class="block-label">Историческая динамика</p>
    <div class="history-chart">
      <div class="chart-section">
        <span class="chart-headline">Gold lead · Radiant +3.4k</span>
        <span class="chart-line"></span>
      </div>
      <div class="chart-section">
        <span class="chart-headline" style="color: var(--dire);">XP lead · Dire +0.8k</span>
        <span class="chart-line xp"></span>
      </div>
    </div>
  </div>`;
}

function emptySlot(label) {
  return `<div class="block empty-slot" style="min-height: 240px;">${label}</div>`;
}

function pageTop() {
  return `<h1 class="h1">Talon Esports <span style="color: #3a3a3a;">vs</span> Tundra Esports</h1>
  <div class="scoreheader">35 <span style="color: var(--fg-muted); font-size: 14px; letter-spacing: 0.3em; margin: 0 14px;">LIVE · 38:42</span> 41</div>
  <div class="winprob">Win probability: Radiant 62% · Dire 38% · (stratz / gold / est. bars)</div>`;
}

function row1() {
  return `<div class="row">
    ${heroPlayerGridBlock()}
    ${itemsBlock()}
    ${cooldownsBlock()}
  </div>`;
}
