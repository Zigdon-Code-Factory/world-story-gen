const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSimulation } = require('../scripts/simulation-runtime.cjs');

test('initial population matches the settlements before the first turn', () => {
  const { run } = loadSimulation();
  assert.equal(run(`const sim = new Simulation(scalePreset(PRESETS[1], 800, 450), '', []); sim.totalPopulation`), 60);
});

test('overcrowding reduces population instead of forcing positive growth', () => {
  const { run } = loadSimulation();
  const result = run(`
    const sim = new Simulation(scalePreset(PRESETS[0], 800, 450), '', []);
    const civ = sim.civilizations[0];
    const settlement = civ.settlements[0];
    settlement.population = calculateFoodCapacity(settlement.resources, 0) + 200;
    const before = settlement.population;
    sim._processSettlement(settlement, civ, getAge(0), []);
    ({before, after: settlement.population});
  `);
  assert.ok(result.after < result.before);
  assert.ok(result.after >= 5);
});

test('automatic playback keeps dice results limited to the latest turn', () => {
  const { run } = loadSimulation();
  assert.ok(run(`
    const sim = new Simulation(scalePreset(PRESETS[2], 800, 450), '', []);
    let maxPending = 0;
    for (let i = 0; i < 100; i++) {
      sim.step();
      maxPending = Math.max(maxPending, sim.pendingDiceRolls.length);
    }
    maxPending <= sim.civilizations.length;
  `));
  assert.equal(run(`sim.step(); sim.getDiceRolls().length`), 0);
});

test('play cannot leave duplicate intervals running', () => {
  const timers = new Set();
  let timerId = 0;
  const { run } = loadSimulation(1, {
    setInterval: () => { timers.add(++timerId); return timerId; },
    clearInterval: id => timers.delete(id),
  });
  run(`const sim = new Simulation(scalePreset(PRESETS[0], 800, 450), '', []); sim.play(() => {}); sim.play(() => {});`);
  assert.equal(timers.size, 1);
  run('sim.pause()');
  assert.equal(timers.size, 0);
});

test('offline lore is retained and supplies event themes', async () => {
  const { run } = loadSimulation();
  await run(`loreChat.sendMessage('Ancient crystal dragons guard the ocean trade routes.')`);
  assert.match(run('loreChat.getLoreSummary()'), /crystal dragons/);
  assert.ok(run(`loreChat.getLoreKeywords().includes('dragon')`));
  assert.ok(!run('loreChat.getLoreSummary()').includes('API key'));
});

test('all presets survive 300 turns with consistent populations and trade links', () => {
  for (let preset = 0; preset < 4; preset++) {
    const { run } = loadSimulation(20261111 + preset);
    assert.ok(run(`
      const sim = new Simulation(scalePreset(PRESETS[${preset}], 800, 450), '', []);
      let valid = true;
      for (let i = 0; i < 300; i++) {
        sim.step();
        valid &&= sim.totalPopulation === sim.population && Number.isFinite(sim.population);
        for (const s of sim.allSettlements) {
          valid &&= Number.isInteger(s.population) && s.population >= 0;
          for (const id of s.tradeRoutes) {
            valid &&= sim.allSettlements.some(p => p.id === id && p.tradeRoutes.includes(s.id));
          }
        }
      }
      valid && worldHistory.events.length > 0;
    `), `preset ${preset} must retain valid state`);
  }
});
