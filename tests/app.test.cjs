const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSimulation } = require('../scripts/simulation-runtime.cjs');

// Small DOM surface for controller integration tests; no browser or packages required.
function loadApp() {
  const nodes = new Map();
  const canvasContext = new Proxy({}, { get: (_, key) => key === 'createRadialGradient'
    ? () => ({ addColorStop() {} }) : () => {} });
  function element(id, classes = '') {
    const set = new Set(classes.split(' ').filter(Boolean));
    return {
      id, style: {}, children: [], value: '', disabled: false,
      classList: { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c),
        toggle(c, enabled) { if (enabled) set.add(c); else set.delete(c); } },
      listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
      appendChild(child) { this.children.push(child); },
      insertBefore(child) { this.children.unshift(child); },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
      replaceChildren() { this.children = []; },
      getBoundingClientRect: () => ({width:800,height:450,left:0,top:0}),
      getContext: () => canvasContext,
    };
  }
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const node = element(match[1], /class="([^"]*)"/.exec(match[0])?.[1]);
    node.value = /value="([^"]*)"/.exec(match[0])?.[1] || '';
    nodes.set(node.id, node);
  }
  nodes.get('sim-canvas').parentElement = element('canvas-parent');
  const document = {
    getElementById: id => nodes.get(id), createElement: () => element(''),
    querySelectorAll: () => [...nodes.values()].filter(n => n.classList.contains('screen')),
  };
  const { run } = loadSimulation(20261111, { document, window:{addEventListener(){}}, setTimeout:()=>0 });
  run(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8'));
  run(`mapEditor = { canvas:{width:800,height:450}, getRegions:()=>scalePreset(PRESETS[1],800,450) };`);
  const click = id => nodes.get(id).listeners.click();
  return { run, nodes, click };
}

test('play, history, resume, and restart keep controls and world state consistent', () => {
  const { run, nodes, click } = loadApp();
  click('btn-start-sim');
  assert.equal(nodes.get('total-pop').textContent, '60');
  assert.ok(nodes.get('btn-pause').classList.contains('hidden'));
  click('btn-play');
  assert.ok(run('simulation.playing'));
  assert.ok(nodes.get('btn-step').disabled);
  click('btn-history');
  assert.ok(!run('simulation.playing'));
  assert.ok(nodes.get('btn-pause').classList.contains('hidden'));
  assert.ok(!nodes.get('btn-step').disabled);
  click('btn-back-sim');
  click('btn-play');
  click('btn-back-create');
  assert.ok(!run('simulation.playing'));
  run(`updateSimUI([{type:'discovery',text:'Old world event'}]); selectedSettlement=simulation.allSettlements[0];`);
  click('btn-start-sim');
  assert.equal(nodes.get('event-log-list').children.length, 0);
  assert.equal(run('selectedSettlement'), null);
  assert.equal(run('simulation.turn'), 0);
  assert.ok(nodes.get('settlement-detail').classList.contains('hidden'));
});

test('finishing automatic playback restores manual stepping', () => {
  const { run, nodes, click } = loadApp();
  click('btn-start-sim');
  click('btn-play');
  run('simulation.totalPopulation=1000000; handlePlaybackStep([]);');
  assert.ok(!run('simulation.playing'));
  assert.ok(!nodes.get('btn-step').disabled);
  assert.ok(nodes.get('btn-pause').classList.contains('hidden'));
});

test('a second manual step cannot race an unfinished dice animation', async () => {
  const { run, nodes, click } = loadApp();
  click('btn-start-sim');
  run(`simulation.turn=4; let finishDice; showDiceRolls=()=>new Promise(resolve=>{finishDice=resolve;});`);
  const pending = run('doStep()');
  assert.equal(run('simulation.turn'), 5);
  assert.ok(nodes.get('btn-step').disabled);
  await run('doStep()');
  assert.equal(run('simulation.turn'), 5);
  run('finishDice()');
  await pending;
  assert.ok(!nodes.get('btn-step').disabled);
  assert.equal(nodes.get('turn-counter').textContent, 5);
});
