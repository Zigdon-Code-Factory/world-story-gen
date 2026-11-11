const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSimulation(seed = 20261111, extra = {}) {
  let state = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const context = vm.createContext({ Math: math, console, setInterval, clearInterval,
    localStorage: { getItem: () => null }, ...extra });
  for (const name of ['presets', 'ages', 'resources', 'people', 'settlements', 'trade', 'history', 'lore', 'simulation']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', `${name}.js`), 'utf8'), context);
  }
  return { context, run: code => vm.runInContext(code, context) };
}

module.exports = { loadSimulation };
