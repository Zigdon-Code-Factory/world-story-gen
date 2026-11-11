// === Main App Controller ===

let mapEditor = null;
let simulation = null;
let simCanvas = null;
let simCtx = null;
let selectedSettlement = null;
let stepInProgress = false;

function syncPlaybackControls() {
  const playing = !!simulation?.playing;
  document.getElementById('btn-play').classList.toggle('hidden', playing);
  document.getElementById('btn-pause').classList.toggle('hidden', !playing);
  document.getElementById('btn-step').disabled = playing || stepInProgress;
  for (const id of ['btn-play', 'btn-history', 'btn-back-create']) {
    document.getElementById(id).disabled = stepInProgress;
  }
}

// === Screen Management ===
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const screen = document.getElementById(id);
  screen.classList.remove('hidden');
  screen.classList.add('active');
  
  if (id === 'screen-create' && mapEditor) {
    setTimeout(() => mapEditor._resize(), 50);
  }
  if (id === 'screen-sim') {
    setTimeout(() => resizeSimCanvas(), 50);
  }
}

// === API Key Management ===
function checkApiKey() {
  if (!loreChat.hasApiKey()) {
    document.getElementById('api-key-modal').classList.remove('hidden');
  }
}

document.getElementById('api-key-save').addEventListener('click', () => {
  const key = document.getElementById('api-key-input').value.trim();
  if (key) {
    loreChat.setApiKey(key);
    document.getElementById('api-key-modal').classList.add('hidden');
  }
});

document.getElementById('api-key-skip').addEventListener('click', () => {
  document.getElementById('api-key-modal').classList.add('hidden');
});

document.getElementById('btn-settings').addEventListener('click', () => {
  document.getElementById('api-key-input').value = loreChat.getApiKey() || '';
  document.getElementById('api-key-modal').classList.remove('hidden');
});

// === Title Screen ===
document.getElementById('btn-new-world').addEventListener('click', () => {
  showScreen('screen-create');
  if (!mapEditor) {
    mapEditor = new MapEditor('map-canvas');
  }
  checkApiKey();
});

// === Map Drawing Controls ===
document.getElementById('btn-add-region').addEventListener('click', () => {
  if (mapEditor && mapEditor.currentPoints.length >= 3) {
    mapEditor._finishRegion();
  }
});

document.getElementById('btn-undo-point').addEventListener('click', () => {
  if (mapEditor) mapEditor.undoPoint();
});

document.getElementById('btn-clear-map').addEventListener('click', () => {
  if (mapEditor && confirm('Clear all regions?')) mapEditor.clear();
});

// === Lore Chat ===
async function sendLoreMessage() {
  const input = document.getElementById('lore-input');
  const text = input.value.trim();
  if (!text) return;
  
  input.value = '';
  const messagesEl = document.getElementById('lore-messages');
  
  const userMsg = document.createElement('div');
  userMsg.className = 'lore-msg user';
  userMsg.textContent = text;
  messagesEl.appendChild(userMsg);
  
  const loadingMsg = document.createElement('div');
  loadingMsg.className = 'lore-msg loading';
  loadingMsg.textContent = '🔮 Thinking...';
  messagesEl.appendChild(loadingMsg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  const reply = await loreChat.sendMessage(text);
  
  loadingMsg.className = 'lore-msg assistant';
  loadingMsg.textContent = reply;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

document.getElementById('btn-lore-send').addEventListener('click', sendLoreMessage);
document.getElementById('lore-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendLoreMessage();
  }
});

// === Start Simulation ===
document.getElementById('btn-start-sim').addEventListener('click', () => {
  const regions = mapEditor.getRegions();
  if (regions.length === 0) {
    alert('Draw at least one region first!');
    return;
  }
  
  const loreSummary = loreChat.getLoreSummary();
  const loreKeywords = loreChat.getLoreKeywords();
  
  if (simulation) simulation.pause();
  simulation = new Simulation(regions, loreSummary, loreKeywords);
  simulation.mapWidth = mapEditor.canvas.width;
  simulation.mapHeight = mapEditor.canvas.height;
  simulation.setSpeed(Number(document.getElementById('sim-speed').value));
  selectedSettlement = null;
  document.getElementById('settlement-detail').classList.add('hidden');
  document.getElementById('event-log-list').replaceChildren();
  worldHistory.events = [];
  
  showScreen('screen-sim');
  initSimView();
});

// === Simulation View ===
function resizeSimCanvas() {
  const canvas = document.getElementById('sim-canvas');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width - 24;
  canvas.height = rect.height - 24;
  simCanvas = canvas;
  simCtx = canvas.getContext('2d');
  renderSimMap();
}

function initSimView() {
  resizeSimCanvas();
  updateSimUI([]);
  
  // Click on canvas to select settlement
  simCanvas.onclick = (e) => {
    if (!simulation) return;
    const rect = simCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * simulation.mapWidth / rect.width;
    const y = (e.clientY - rect.top) * simulation.mapHeight / rect.height;
    
    // Find nearest settlement
    let nearest = null;
    let nearestDist = 30; // Click radius
    for (const s of simulation.allSettlements) {
      const dist = Math.hypot(s.position.x - x, s.position.y - y);
      if (dist < nearestDist) {
        nearest = s;
        nearestDist = dist;
      }
    }
    
    if (nearest) {
      selectedSettlement = nearest;
      showSettlementDetail(nearest);
    } else {
      selectedSettlement = null;
      document.getElementById('settlement-detail').classList.add('hidden');
    }
  };
}

function showSettlementDetail(s) {
  const detail = document.getElementById('settlement-detail');
  detail.classList.remove('hidden');
  
  document.getElementById('detail-title').textContent = `${s.tier.emoji} ${s.name} (${s.tier.name})`;
  
  // Resources
  const resHtml = Object.values(s.resources).map(r => 
    `<span class="res-tag">${r.emoji} ${r.name} ×${r.abundance}</span>`
  ).join(' ');
  document.getElementById('detail-resources').innerHTML = `
    <div class="detail-label">Resources</div>
    <div class="res-tags">${resHtml}</div>
    <div class="detail-stats">
      👥 ${formatPop(s.population)} · 🍞 ${s.foodStore} · 🪵 ${s.materialStore} · 💰 ${s.wealthStore} · 🏛️ ${s.culture}
    </div>
    <div class="detail-stats">
      🛡️ Defense: ${Math.floor(s.defense)} · 🤝 Trade routes: ${s.tradeRoutes.length}
    </div>
  `;
  
  // People (show first 20 alive)
  const alive = s.people.filter(p => p.alive).slice(0, 20);
  const peopleHtml = alive.map(p => {
    const notable = p.notable ? ' ⭐' : '';
    return `<div class="person-row${p.notable ? ' notable' : ''}">
      ${p.roleEmoji} <strong>${p.name}</strong>${notable} — ${p.role}, age ${p.age}
      ${p.deeds.length > 0 ? `<br><small class="deed">"${p.deeds[p.deeds.length-1].text}"</small>` : ''}
    </div>`;
  }).join('');
  
  const hidden = s.people.filter(p => p.alive).length - alive.length;
  document.getElementById('detail-people').innerHTML = `
    <div class="detail-label">Notable Citizens (${s.people.filter(p=>p.alive).length} tracked / ${formatPop(s.population)} total)</div>
    ${peopleHtml}
    ${hidden > 0 ? `<div class="person-row dim">...and ${hidden} more</div>` : ''}
  `;
}

document.getElementById('btn-close-detail').addEventListener('click', () => {
  selectedSettlement = null;
  document.getElementById('settlement-detail').classList.add('hidden');
});

function renderSimMap() {
  if (!simCtx || !simulation) return;
  const ctx = simCtx;
  const w = simCanvas.width;
  const h = simCanvas.height;
  
  // Background
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, w, h);
  
  // Grid
  ctx.strokeStyle = '#1a1a3a';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  
  // Draw civ territories
  ctx.save();
  ctx.scale(w / simulation.mapWidth, h / simulation.mapHeight);
  for (const civ of simulation.civilizations) {
    const alpha = civ.alive ? '44' : '15';
    
    ctx.fillStyle = civ.color + alpha;
    ctx.beginPath();
    ctx.moveTo(civ.points[0].x, civ.points[0].y);
    for (let i = 1; i < civ.points.length; i++) {
      ctx.lineTo(civ.points[i].x, civ.points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = civ.color + (civ.alive ? '88' : '33');
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  // Draw trade routes
  ctx.strokeStyle = '#ffffff22';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const drawnRoutes = new Set();
  for (const s of simulation.allSettlements) {
    for (const partnerId of s.tradeRoutes) {
      const key = [Math.min(s.id, partnerId), Math.max(s.id, partnerId)].join('-');
      if (drawnRoutes.has(key)) continue;
      drawnRoutes.add(key);
      const partner = simulation.allSettlements.find(x => x.id === partnerId);
      if (!partner) continue;
      ctx.beginPath();
      ctx.moveTo(s.position.x, s.position.y);
      ctx.lineTo(partner.position.x, partner.position.y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  
  // Draw settlements
  for (const civ of simulation.civilizations) {
    if (!civ.alive) continue;
    const age = getAge(civ.ageIndex);
    
    for (const s of civ.settlements) {
      const size = Math.max(4, Math.min(20, Math.log2(s.population + 1) * 2));
      const isSelected = selectedSettlement && selectedSettlement.id === s.id;
      
      // Glow
      const glowRadius = size * 2.5;
      const gradient = ctx.createRadialGradient(s.position.x, s.position.y, 0, s.position.x, s.position.y, glowRadius);
      gradient.addColorStop(0, civ.color + '44');
      gradient.addColorStop(1, civ.color + '00');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(s.position.x, s.position.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Settlement dot
      ctx.fillStyle = isSelected ? '#ffffff' : civ.color;
      ctx.beginPath();
      ctx.arc(s.position.x, s.position.y, size, 0, Math.PI * 2);
      ctx.fill();
      
      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Label
      ctx.fillStyle = '#fff';
      ctx.font = `${size > 8 ? 'bold ' : ''}11px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${s.tier.emoji} ${s.name}`, s.position.x, s.position.y + size + 3);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText(`${formatPop(s.population)}`, s.position.x, s.position.y + size + 16);
    }
    
    // Civ label at center
    ctx.fillStyle = civ.color;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${civ.name} — ${age.emoji} ${age.name}`, civ.center.x, civ.center.y - 30);
  }
  ctx.restore();
}

function updateSimUI(events) {
  if (!simulation) return;
  syncPlaybackControls();
  
  document.getElementById('turn-counter').textContent = simulation.turn;
  document.getElementById('total-pop').textContent = formatPop(simulation.totalPopulation);
  
  // Civ list
  const civList = document.getElementById('civ-list');
  civList.innerHTML = '';
  for (const civ of simulation.civilizations) {
    const age = getAge(civ.ageIndex);
    const totalPop = civ.settlements.reduce((s, st) => s + st.population, 0);
    const totalWealth = civ.settlements.reduce((s, st) => s + st.wealthStore, 0);
    const totalCulture = civ.settlements.reduce((s, st) => s + st.culture, 0);
    
    const card = document.createElement('div');
    card.className = 'civ-card';
    if (!civ.alive) card.style.opacity = '0.4';
    card.innerHTML = `
      <div class="civ-color" style="background:${civ.color}"></div>
      <div style="flex:1">
        <span class="civ-name">${civ.name}</span>
        <span class="civ-age">${age.emoji} ${age.name}</span>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
          👥 ${formatPop(totalPop)} · 🏘️ ${civ.settlements.length} · 💰 ${totalWealth} · 🏛️ ${totalCulture}
        </div>
      </div>
    `;
    civList.appendChild(card);
  }
  
  // Event log
  const logList = document.getElementById('event-log-list');
  for (const event of events) {
    const entry = document.createElement('div');
    entry.className = `event-entry ${event.type}`;
    entry.innerHTML = `<span class="turn-badge">T${simulation.turn}</span>${event.text}`;
    logList.insertBefore(entry, logList.firstChild);
    // Keep log manageable
    while (logList.children.length > 200) {
      logList.removeChild(logList.lastChild);
    }
  }
  
  // Update detail panel if open
  if (selectedSettlement) {
    const fresh = simulation.allSettlements.find(s => s.id === selectedSettlement.id);
    if (fresh) showSettlementDetail(fresh);
  }
  
  renderSimMap();
}

// === Dice Roll Animation ===
async function showDiceRolls(rolls) {
  const overlay = document.getElementById('dice-overlay');
  
  for (const { civ, result } of rolls) {
    overlay.classList.remove('hidden');
    const nameEl = document.getElementById('dice-civ-name');
    const rollEl = document.getElementById('dice-roll');
    const resultEl = document.getElementById('dice-result');
    
    nameEl.textContent = `${civ.name} attempts to advance...`;
    nameEl.style.color = civ.color;
    
    for (let i = 0; i < 10; i++) {
      rollEl.textContent = `${Math.floor(Math.random() * 100)}%`;
      rollEl.style.color = '#fff';
      await sleep(60);
    }
    
    rollEl.textContent = `${result.roll}%`;
    
    if (result.advanced) {
      rollEl.style.color = '#2ecc71';
      resultEl.className = 'dice-result success';
      resultEl.textContent = `✅ Advanced to ${getAge(result.newAgeIndex).name}!`;
    } else if (result.regressed) {
      rollEl.style.color = '#e74c3c';
      resultEl.className = 'dice-result fail';
      resultEl.textContent = `💥 Fell back to ${getAge(result.newAgeIndex).name}!`;
    } else {
      rollEl.style.color = '#f39c12';
      resultEl.className = 'dice-result';
      resultEl.textContent = `No change`;
    }
    
    await sleep(1200);
    overlay.classList.add('hidden');
    await sleep(200);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// === Sim Controls ===
async function doStep() {
  if (!simulation || simulation.playing || stepInProgress) return;
  stepInProgress = true;
  syncPlaybackControls();
  try {
    const events = simulation.step();
    const diceRolls = simulation.getDiceRolls();
    if (diceRolls.length > 0) await showDiceRolls(diceRolls);
    updateSimUI(events);
  } finally {
    stepInProgress = false;
    syncPlaybackControls();
  }
}

document.getElementById('btn-step').addEventListener('click', doStep);

document.getElementById('btn-play').addEventListener('click', () => {
  if (!simulation || stepInProgress) return;
  simulation.play(handlePlaybackStep);
  syncPlaybackControls();
});

function handlePlaybackStep(events) {
  if (simulation.isFinished()) simulation.pause();
  updateSimUI(events);
}

document.getElementById('btn-pause').addEventListener('click', () => {
  if (!simulation) return;
  simulation.pause();
  syncPlaybackControls();
});

document.getElementById('sim-speed').addEventListener('input', (e) => {
  if (!simulation) return;
  const wasPlaying = simulation.playing;
  simulation.setSpeed(parseInt(e.target.value));
  if (wasPlaying) {
    simulation.play(handlePlaybackStep);
  }
  syncPlaybackControls();
});

document.getElementById('btn-back-create').addEventListener('click', () => {
  if (simulation && simulation.playing) simulation.pause();
  syncPlaybackControls();
  showScreen('screen-create');
});

// === History Screen ===
document.getElementById('btn-history').addEventListener('click', () => {
  if (simulation && simulation.playing) simulation.pause();
  syncPlaybackControls();
  
  const timeline = document.getElementById('history-timeline');
  timeline.innerHTML = '';
  
  const events = worldHistory.getAllEvents();
  // Show last 200 events
  for (const event of events.slice(-200)) {
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.innerHTML = `<span class="history-turn">Turn ${event.turn}</span><span>${event.text}</span>`;
    timeline.appendChild(entry);
  }
  
  const summary = document.getElementById('history-summary');
  if (simulation) {
    let html = '<h3>🌍 World Summary</h3>';
    for (const civ of simulation.civilizations) {
      const age = getAge(civ.ageIndex);
      const totalPop = civ.settlements.reduce((s, st) => s + st.population, 0);
      html += `<div style="margin:12px 0; padding:12px; background:var(--bg); border-radius:8px; border-left:4px solid ${civ.color}">`;
      html += `<strong style="color:${civ.color}">${civ.name}</strong> — ${age.emoji} ${age.name}<br>`;
      html += `👥 ${formatPop(totalPop)} · 🏘️ ${civ.settlements.length} settlements<br>`;
      html += `<div style="margin-top:8px">`;
      for (const s of civ.settlements) {
        html += `<div style="margin:4px 0; font-size:13px">${s.tier.emoji} ${s.name} (${formatPop(s.population)})</div>`;
      }
      html += `</div>`;
      // Notable characters
      if (civ.notableCharacters.length > 0) {
        html += `<div style="margin-top:8px; font-size:12px; color:var(--text-dim)"><strong>⭐ Notable figures:</strong><br>`;
        for (const p of civ.notableCharacters.slice(-10)) {
          const lastDeed = p.deeds.length > 0 ? ` — "${p.deeds[p.deeds.length-1].text}"` : '';
          html += `${p.roleEmoji} ${p.name} (${p.role})${lastDeed}<br>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    summary.innerHTML = html;
  }
  
  showScreen('screen-history');
});

document.getElementById('btn-back-sim').addEventListener('click', () => {
  showScreen('screen-sim');
});

// === Window resize ===
window.addEventListener('resize', () => {
  if (document.getElementById('screen-sim').classList.contains('active')) {
    resizeSimCanvas();
  }
});

// === Preset Loading ===
function initPresetButtons() {
  const container = document.getElementById('preset-buttons');
  for (const preset of PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.innerHTML = `${preset.name}<span class="preset-desc">${preset.description}</span>`;
    btn.addEventListener('click', () => loadPreset(preset));
    container.appendChild(btn);
  }
}

function loadPreset(preset) {
  showScreen('screen-create');
  if (!mapEditor) {
    mapEditor = new MapEditor('map-canvas');
  }
  checkApiKey();
  
  // Wait for canvas to be sized, then load regions
  setTimeout(() => {
    mapEditor.clear();
    const scaled = scalePreset(preset, mapEditor.canvas.width, mapEditor.canvas.height);
    for (const region of scaled) {
      mapEditor.regions.push(region);
    }
    mapEditor.render();
    document.getElementById('map-status').textContent = `Loaded "${preset.name}" — ${scaled.length} regions. Edit or start the simulation.`;
  }, 100);
}

initPresetButtons();

// === Init ===
console.log('🌍 World Story Gen loaded — Deep Simulation Mode');
