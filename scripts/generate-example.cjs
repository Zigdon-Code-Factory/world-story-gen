const fs = require('node:fs');
const path = require('node:path');
const { loadSimulation } = require('./simulation-runtime.cjs');

const seed = 20261111;
const { run } = loadSimulation(seed);
const data = run(`
  const lore = 'Ancient crystal dragons guard ocean trade routes between Ironpeak, Greenhollow, and Sunreach. Mountain clans honor storm spirits; coastal people favor peace and trade.';
  loreChat.loreContext.push({ role: 'user', content: lore });
  const sim = new Simulation(scalePreset(PRESETS[1], 800, 450), loreChat.getLoreSummary(), loreChat.getLoreKeywords());
  const populations = [];
  function sample() {
    populations.push({ turn: sim.turn, values: sim.civilizations.map(c => c.settlements.reduce((n, s) => n + s.population, 0)) });
  }
  sample();
  for (let i = 0; i < 300; i++) { sim.step(); if (sim.turn % 10 === 0) sample(); }
  ({
    preset: 'Three Continents', seed: ${seed}, turns: sim.turn, lore,
    totalPopulation: sim.totalPopulation, populations,
    civilizations: sim.civilizations.map(c => ({
      name: c.name, color: c.color, terrain: c.terrain, age: getAge(c.ageIndex).name,
      ageIndex: c.ageIndex, population: c.settlements.reduce((n,s) => n + s.population, 0),
      wealth: c.settlements.reduce((n,s) => n + s.wealthStore, 0),
      culture: c.settlements.reduce((n,s) => n + s.culture, 0),
      points: c.points,
      settlements: c.settlements.map(s => ({name:s.name,population:s.population,tier:s.tier.name,position:s.position,tradeRoutes:s.tradeRoutes.length})),
      notables: c.notableCharacters.slice(-3).map(p => ({ name:p.name,role:p.role,alive:p.alive,deeds:p.deeds })),
    })),
    tradeRoutes: sim.allSettlements.reduce((n,s) => n + s.tradeRoutes.length, 0) / 2,
    events: worldHistory.getAllEvents().map(({timestamp, ...event}) => event),
  });
`);

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => value.toLocaleString('en-US');
const eventsOf = (c, type) => data.events.filter(e => e.civName === c.name && e.type === type);
const leader = [...data.civilizations].sort((a,b) => b.population - a.population)[0];
const battles = data.events.filter(e => /and prevails!/.test(e.text));
const regressions = data.events.filter(e => e.type === 'regress');
const advances = data.events.filter(e => e.type === 'advance');
const disasters = data.events.filter(e => /Volcanic eruption|Plague sweeps|Great flood|Wildfire rages|Harsh winter/.test(e.text));
const themed = data.events.filter(e => /power awakens/.test(e.text));
const settlements = data.civilizations.reduce((n,c) => n + c.settlements.length, 0);
const maxPop = Math.max(...data.populations.flatMap(p => p.values));
const chart = `<svg viewBox="0 0 680 220" role="img" aria-label="Population by civilization over 300 turns"><title>Population by civilization over 300 turns</title>
  ${[0,0.5,1].map(f => `<line x1="54" y1="${180-f*155}" x2="660" y2="${180-f*155}" stroke="var(--border, #ccc)"/><text x="46" y="${184-f*155}" text-anchor="end">${num(Math.round(f*maxPop))}</text>`).join('')}
  ${data.civilizations.map((c,i) => `<polyline fill="none" stroke="var(--chart-${i+1}, ${c.color})" stroke-width="2.5" points="${data.populations.map(p => `${54+p.turn/300*606},${180-p.values[i]/maxPop*155}`).join(' ')}"/>`).join('')}
  ${[0,100,200,300].map(t => `<text x="${54+t/300*606}" y="206" text-anchor="middle">${t}</text>`).join('')}
  <text x="360" y="219" text-anchor="middle">Turn</text></svg>`;
const selectedEvents = [...new Set([
  ...advances.slice(0, 3), ...regressions,
  ...data.civilizations.map(c => eventsOf(c, 'advance').at(-1)),
  data.events.find(e => e.type === 'trade'), battles[0], battles.at(-1),
  disasters[0], disasters.at(-1), themed[0], themed.at(-1),
].filter(Boolean))].sort((a,b) => a.turn - b.turn);
const stories = data.civilizations.map((c,i) => {
  const first = eventsOf(c, 'advance')[0];
  const setbacks = eventsOf(c, 'regress');
  const capital = [...c.settlements].sort((a,b)=>b.population-a.population)[0];
  const hero = c.notables.at(-1);
  return `<article><h3><span class="dot" style="background:var(--chart-${i+1}, ${c.color})"></span>${esc(c.name)}</h3>
    <p>${esc(c.terrain)} origins; ${esc(c.age)} at turn 300. ${first ? `Its first technological advance came at turn ${first.turn}.` : 'It has yet to advance beyond the Stone Age.'} ${setbacks.length ? `${setbacks.length} recorded age collapse${setbacks.length===1?'':'s'} interrupted its development.` : 'No age regressions were recorded.'}</p>
    <p>${esc(capital.name)} is its largest settlement, a ${esc(capital.tier.toLowerCase())} of ${num(capital.population)} people. Its ${c.settlements.length} settlements hold ${num(c.wealth)} wealth and ${num(c.culture)} culture.</p>
    ${hero ? `<p>Remembered figure: <strong>${esc(hero.name)}</strong>, ${esc(hero.role.toLowerCase())}, who ${esc(hero.deeds.at(-1).text)} (turn ${hero.deeds.at(-1).turn}).</p>` : ''}</article>`;
}).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Three Continents — Example World Review</title><style>
  *{box-sizing:border-box}body{margin:0;font:15px/1.55 var(--font-sans,system-ui);color:var(--foreground,#202638)}main{max-width:900px;margin:auto}h1{font-size:30px;line-height:1.2;margin:12px 0}h2{font-size:20px;margin:24px 0 8px}h3{font-size:17px;margin:0 0 8px}p{margin:8px 0}.muted,small{color:var(--muted-foreground,#606675)}.kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-foreground,#606675)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.stat,article,.lore{padding:16px;border-radius:var(--radius,10px);background:var(--card,#f3f5f8);border:1px solid var(--border,#dce0e8)}.stat strong{display:block;font-size:24px}.stat span{font-size:12px}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px}svg{width:100%;height:220px}svg text{fill:var(--muted-foreground,#606675);font-size:11px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 6px;border-bottom:1px solid var(--border,#dce0e8)}.stories{display:grid;gap:12px}ol{padding-left:22px}li{padding:5px 0}.legend{display:flex;gap:20px;flex-wrap:wrap;font-size:13px}footer{margin:24px 0;font-size:12px;color:var(--muted-foreground,#606675)}@media(max-width:550px){.stats{grid-template-columns:repeat(2,1fr)}table{font-size:12px}th,td{padding:7px 3px}}
  </style></head><body><main>
  <div class="kicker">Generated simulation · Seed ${seed} · 300 turns</div><h1>Three Continents: a world review</h1>
  <p>Three small founding communities became a connected world of ${num(data.totalPopulation)} people. <strong>${esc(leader.name)}</strong> has the largest population at the review point. Trade, technological advances, and repeated conflict shaped the recorded history.</p>
  <div class="stats"><div class="stat"><strong>${num(data.totalPopulation)}</strong><span>population · began at 60</span></div><div class="stat"><strong>${settlements}</strong><span>settlements</span></div><div class="stat"><strong>${data.tradeRoutes}</strong><span>trade routes</span></div><div class="stat"><strong>${data.events.length}</strong><span>recorded events</span></div></div>
  <h2>Population through history</h2>${chart}<div class="legend">${data.civilizations.map((c,i)=>`<span><span class="dot" style="background:var(--chart-${i+1}, ${c.color})"></span>${esc(c.name)}</span>`).join('')}</div>
  <h2>The world at turn 300</h2><table><thead><tr><th>Civilization</th><th>Age</th><th>Population</th><th>Settlements</th></tr></thead><tbody>${data.civilizations.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.age)}</td><td>${num(c.population)}</td><td>${c.settlements.length}</td></tr>`).join('')}</tbody></table>
  <h2>Reading the history</h2><p>The chronicle records ${advances.length} age advances, ${regressions.length} age regression${regressions.length===1?'':'s'}, ${battles.length} civilization battles, and ${disasters.length} major environmental disasters. ${themed.length} magical awakening${themed.length===1?'':'s'} drew on the supplied lore. Battles currently reduce population and kill warriors; the engine does not transfer territory or conquer civilizations.</p>
  <p>All three remain in the Industrial Age: the next advancement requires 100,000 people per civilization, beyond each current total. Each has reached the engine's limit of 25 settlements. Greenhollow recovered from its turn-140 collapse into the Medieval Age and finished as the most populous civilization.</p>
  <div class="stories">${stories}</div>
  <h2>Selected milestones</h2><ol>${selectedEvents.map(e=>`<li><strong>Turn ${e.turn}:</strong> ${esc(e.text)}</li>`).join('')}</ol>
  <h2>Founding lore</h2><p class="lore">${esc(data.lore)}</p>
  <footer>This is an actual run of the local JavaScript simulation, not AI-generated history. Turns represent approximately one year. Lore supplies event keywords; AI lore replies require an OpenRouter key and were not used here. Population was sampled every 10 turns. Full event data: <a href="three-continents-review.json">JSON</a>. Reproduce with <code>node scripts/generate-example.cjs</code>.</footer>
  </main></body></html>`;
const output = path.join(__dirname, '..', 'examples');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'three-continents-review.json'), JSON.stringify(data, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'three-continents-review.html'), html);
console.log(JSON.stringify({seed,turns:data.turns,population:data.totalPopulation,settlements,tradeRoutes:data.tradeRoutes,events:data.events.length,battles:battles.length,regressions:regressions.length,themed:themed.length,civilizations:data.civilizations.map(({name,population,age})=>({name,population,age}))}, null, 2));
