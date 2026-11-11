// === Simulation Engine (Deep Mode) ===

class Simulation {
  constructor(regions, loreSummary, loreKeywords) {
    this.turn = 0;
    this.playing = false;
    this.speed = 3;
    this.playInterval = null;
    this.loreSummary = loreSummary;
    this.loreKeywords = loreKeywords;
    this.totalPopulation = 0;
    this.allSettlements = [];
    this.pendingDiceRolls = [];

    // Create civilizations from regions
    this.civilizations = regions.map(r => {
      const { terrain, resources } = generateRegionResources();
      
      // First settlement near center of region
      const settlement = createSettlement(r.name, { ...r.center }, resources, 0);
      settlement.founded = 0;
      this.allSettlements.push(settlement);

      return {
        name: r.name,
        color: r.color,
        points: r.points,
        center: r.center,
        ageIndex: 0,
        terrain,
        resources,
        settlements: [settlement],
        military: 10,
        culture: 5,
        alive: true,
        notableCharacters: [], // Cross-settlement hall of fame
      };
    });
    this.totalPopulation = this.population;
  }

  get population() {
    return this.civilizations.reduce((sum, c) => 
      sum + c.settlements.reduce((s, st) => s + st.population, 0), 0);
  }

  step() {
    // Dice results belong to this turn, including during automatic playback.
    this.pendingDiceRolls = [];
    this.turn++;
    const turnEvents = [];

    for (const civ of this.civilizations) {
      if (!civ.alive) continue;
      const age = getAge(civ.ageIndex);

      for (const settlement of civ.settlements) {
        this._processSettlement(settlement, civ, age, turnEvents);
      }

      // Age advancement (every 5 turns to allow more buildup)
      if (this.turn % 5 === 0) {
        const totalPop = civ.settlements.reduce((s, st) => s + st.population, 0);
        // Need minimum population and culture to attempt advancement
        const minPopForAdvance = [0, 50, 200, 1000, 5000, 20000, 100000, 500000, 1000000];
        const minCulture = civ.ageIndex * 20;
        const civCulture = civ.settlements.reduce((s, st) => s + st.culture, 0);

        if (totalPop >= (minPopForAdvance[civ.ageIndex] || 0) && civCulture >= minCulture) {
          const result = attemptAgeAdvance(civ.ageIndex);
          if (!result.maxed) {
            this.pendingDiceRolls.push({ civ, result });
            
            if (result.advanced) {
              civ.ageIndex = result.newAgeIndex;
              const newAge = getAge(civ.ageIndex);
              turnEvents.push({
                type: 'advance',
                text: `🎉 ${civ.name} advances to the ${newAge.emoji} ${newAge.name}! (rolled ${result.roll}%, pop: ${formatPop(totalPop)})`,
                civName: civ.name
              });
              // Unlock new roles in settlements
              this._onAgeAdvance(civ, turnEvents);
            } else if (result.regressed) {
              civ.ageIndex = result.newAgeIndex;
              const newAge = getAge(civ.ageIndex);
              turnEvents.push({
                type: 'regress',
                text: `💥 ${civ.name} suffers a catastrophic collapse! Falls back to ${newAge.emoji} ${newAge.name} (rolled ${result.roll}%)`,
                civName: civ.name
              });
              // Regression consequences
              for (const s of civ.settlements) {
                s.population = Math.floor(s.population * 0.7);
                s.culture = Math.floor(s.culture * 0.5);
              }
            }
          }
        }
      }

      // New settlement spawning
      this._trySpawnSettlement(civ, turnEvents);

      // Trade route formation
      this._tryFormTradeRoutes(civ, turnEvents);
    }

    // Cross-civ conflicts
    if (this.civilizations.filter(c => c.alive).length > 1) {
      this._resolveConflicts(turnEvents);
    }

    // Random events
    this._randomEvents(turnEvents);

    // Record events
    for (const event of turnEvents) {
      worldHistory.addEvent(this.turn, event.type, event.text, event.civName);
    }

    // Update total population
    this.totalPopulation = this.population;

    return turnEvents;
  }

  _processSettlement(settlement, civ, age, events) {
    const ageIndex = civ.ageIndex;
    settlement.ageIndex = ageIndex;

    // 1. Food production & population growth
    const foodCap = calculateFoodCapacity(settlement.resources, ageIndex);
    const tradeBonus = settlement.tradeRoutes.length * 20 * (1 + ageIndex * 0.3);
    const effectiveCap = foodCap + tradeBonus;
    
    const growthRate = settlement.population < effectiveCap 
      ? 0.02 + (ageIndex * 0.008) + (settlement.tradeRoutes.length * 0.005)
      : -0.005; // Slight decline when overcrowded
    
    const growth = growthRate > 0
      ? Math.max(1, Math.floor(settlement.population * growthRate))
      : Math.min(-1, Math.floor(settlement.population * growthRate));
    settlement.population = Math.max(5, settlement.population + growth);
    settlement.foodStore = Math.max(0, settlement.foodStore + Math.floor(foodCap * 0.1) - Math.floor(settlement.population * 0.05));

    // 2. Resource gathering
    for (const [key, res] of Object.entries(settlement.resources)) {
      const output = getResourceOutput(res, ageIndex);
      if (res.category === 'raw' || res.category === 'metal') {
        settlement.materialStore += Math.floor(output);
      } else if (res.category === 'luxury' || res.category === 'trade') {
        settlement.wealthStore += Math.floor(output);
      }
    }

    // 3. Process trade
    processTradeRoutes(settlement, this.allSettlements, ageIndex);

    // 4. People management — births, deaths, role changes
    this._managePeople(settlement, civ, ageIndex, events);

    // 5. Culture growth
    const scholars = settlement.people.filter(p => p.alive && (p.roleKey === 'scholar' || p.roleKey === 'priest' || p.roleKey === 'artisan')).length;
    settlement.culture += Math.floor(1 + scholars * 2 + settlement.wealthStore * 0.01);

    // 6. Defense
    const warriors = settlement.people.filter(p => p.alive && p.roleKey === 'warrior').length;
    settlement.defense = warriors * 5 * age.militaryMod + settlement.population * 0.01;

    // 7. Settlement tier upgrades
    updateSettlementTier(settlement, events, this.turn);
  }

  _managePeople(settlement, civ, ageIndex, events) {
    const tier = settlement.tier;
    const maxTracked = tier.maxPeople;

    // Prune dead people every turn to prevent memory leak — keep notables, drop the rest
    settlement.people = settlement.people.filter(p => p.alive || p.notable);

    const alive = settlement.people.filter(p => p.alive);

    // Aging & death
    for (const person of alive) {
      person.age += 1; // Each turn ≈ 1 year
      
      // Death chance increases with age
      const deathChance = person.age > 60 ? (person.age - 60) * 0.02 : 0.002;
      if (Math.random() < deathChance) {
        person.alive = false;
        if (person.notable) {
          events.push({
            type: 'disaster',
            text: `⚰️ ${person.roleEmoji} ${person.name}, renowned ${person.role} of ${settlement.name}, has passed away at age ${person.age}`,
            civName: civ.name
          });
        }
      }
    }

    // Ensure tracked people never exceed population
    let livingCount = settlement.people.filter(p => p.alive).length;
    while (livingCount > settlement.population) {
      // Kill off excess tracked people (non-notable first)
      const expendable = settlement.people.find(p => p.alive && !p.notable);
      if (expendable) {
        expendable.alive = false;
      } else {
        // Even notables must go if pop truly dropped
        const anyone = settlement.people.find(p => p.alive);
        if (anyone) anyone.alive = false;
        else break;
      }
      livingCount--;
    }

    // Birth / new arrivals
    const popRatio = settlement.population > 0 ? livingCount / settlement.population : 1;
    
    if (livingCount < maxTracked && popRatio < 0.5) {
      // Generate new people to fill tracked roster (but never exceed population)
      const toGenerate = Math.min(3, maxTracked - livingCount, settlement.population - livingCount);
      for (let i = 0; i < toGenerate; i++) {
        const person = generatePerson(ageIndex, settlement.name);
        person.bornTurn = this.turn;
        person.age = Math.random() < 0.3 ? Math.floor(Math.random() * 5) : 16 + Math.floor(Math.random() * 30);
        settlement.people.push(person);
      }
    }

    // Fill needed roles
    const needed = getNeededRoles(settlement, ageIndex);
    const unassigned = settlement.people.filter(p => p.alive && ['gatherer','hunter'].includes(p.roleKey) && ageIndex >= 1);
    
    for (const roleKey of needed) {
      if (unassigned.length === 0) break;
      const person = unassigned.shift();
      const oldRole = person.role;
      if (assignNeededRole(person, roleKey, ageIndex)) {
        if (Math.random() < 0.1) { // 10% chance to announce role change
          events.push({
            type: 'discovery',
            text: `${person.roleEmoji} ${person.name} of ${settlement.name} becomes a ${person.role}`,
            civName: civ.name
          });
        }
      }
    }

    // Notable deeds (rare)
    if (Math.random() < 0.03) {
      const candidates = settlement.people.filter(p => p.alive && p.skillLevel >= 2);
      if (candidates.length > 0) {
        const hero = candidates[Math.floor(Math.random() * candidates.length)];
        const deedTypes = ['discovery', 'heroic', 'cultural'];
        const type = deedTypes[Math.floor(Math.random() * deedTypes.length)];
        const deed = generateDeed(hero, this.turn, type);
        events.push({ type: type === 'heroic' ? 'war' : 'discovery', text: deed + ` (${settlement.name})`, civName: civ.name });
        
        // Add to civ's hall of fame
        if (!civ.notableCharacters.find(c => c.id === hero.id)) {
          civ.notableCharacters.push(hero);
          // Keep only last 20 notables
          if (civ.notableCharacters.length > 20) civ.notableCharacters.shift();
        }
      }
    }
  }

  _onAgeAdvance(civ, events) {
    for (const settlement of civ.settlements) {
      // New roles become available — generate specialists
      const newRoles = getRolesForAge(civ.ageIndex).filter(r => r.minAge === civ.ageIndex);
      for (const role of newRoles.slice(0, 2)) {
        const person = generatePerson(civ.ageIndex, settlement.name);
        assignNeededRole(person, role.key, civ.ageIndex);
        person.bornTurn = this.turn;
        settlement.people.push(person);
        events.push({
          type: 'discovery',
          text: `${role.emoji} ${person.name} emerges as ${settlement.name}'s first ${role.name}`,
          civName: civ.name
        });
      }
    }
  }

  _trySpawnSettlement(civ, events) {
    const totalPop = civ.settlements.reduce((s, st) => s + st.population, 0);
    const maxSettlements = 1 + Math.floor(totalPop / 200);
    
    if (civ.settlements.length >= maxSettlements) return;
    if (civ.settlements.length >= 25) return; // Hard cap for performance
    
    // Spawn if largest settlement is big enough
    const largest = civ.settlements.reduce((a, b) => a.population > b.population ? a : b);
    if (largest.population < 80) return;
    
    // New settlement gets a subset of parent resources + some new ones
    const { terrain, resources } = generateRegionResources();
    
    // Position near parent but offset
    const offset = { 
      x: civ.center.x + (Math.random() - 0.5) * 150, 
      y: civ.center.y + (Math.random() - 0.5) * 150 
    };
    
    const newSettlement = createSettlement(civ.name, offset, resources, civ.ageIndex);
    newSettlement.founded = this.turn;
    
    // Some people migrate from parent
    const migrants = Math.floor(largest.population * 0.1);
    largest.population -= migrants;
    newSettlement.population += migrants;
    
    civ.settlements.push(newSettlement);
    this.allSettlements.push(newSettlement);
    
    events.push({
      type: 'discovery',
      text: `🏕️ Settlers from ${largest.name} found ${newSettlement.name}! (${terrain}, pop: ${newSettlement.population})`,
      civName: civ.name
    });
  }

  _tryFormTradeRoutes(civ, events) {
    if (civ.ageIndex < 1) return; // Need at least Bronze Age
    if (Math.random() > 0.15) return; // 15% chance per turn
    
    for (const settlement of civ.settlements) {
      if (settlement.population < 50) continue;
      if (settlement.tradeRoutes.length >= civ.ageIndex + 1) continue; // Max routes scale with age
      
      const partners = findTradePartners(settlement, this.allSettlements);
      if (partners.length > 0) {
        const partner = partners[Math.floor(Math.random() * partners.length)];
        establishTradeRoute(settlement, partner, events, this.turn);
        break; // One route per turn per civ
      }
    }
  }

  _resolveConflicts(events) {
    const alive = this.civilizations.filter(c => c.alive);
    if (alive.length < 2 || Math.random() > 0.2) return;

    const i = Math.floor(Math.random() * alive.length);
    let j = Math.floor(Math.random() * (alive.length - 1));
    if (j >= i) j++;

    const a = alive[i];
    const b = alive[j];
    
    const aPower = a.settlements.reduce((s, st) => s + st.defense, 0) + Math.random() * 50;
    const bPower = b.settlements.reduce((s, st) => s + st.defense, 0) + Math.random() * 50;

    const winner = aPower > bPower ? a : b;
    const loser = aPower > bPower ? b : a;

    // Damage to both sides
    const winnerLoss = Math.floor(Math.random() * 5 + 1);
    const loserLoss = Math.floor(Math.random() * 15 + 5);
    
    for (const s of winner.settlements) {
      s.population = Math.max(5, Math.floor(s.population * (1 - winnerLoss/100)));
    }
    for (const s of loser.settlements) {
      s.population = Math.max(5, Math.floor(s.population * (1 - loserLoss/100)));
    }

    // Kill some warriors in the losing side
    const loserWarriors = loser.settlements.flatMap(s => s.people.filter(p => p.alive && p.roleKey === 'warrior'));
    const casualties = Math.min(loserWarriors.length, Math.floor(Math.random() * 3) + 1);
    for (let k = 0; k < casualties; k++) {
      const warrior = loserWarriors[k];
      warrior.alive = false;
      if (warrior.notable) {
        events.push({
          type: 'war',
          text: `☠️ ${warrior.name}, ${warrior.role} of ${warrior.settlement}, falls in battle against ${winner.name}`,
          civName: loser.name
        });
      }
    }

    const flavorVerbs = ['clashes with', 'raids', 'battles', 'wages war on', 'invades'];
    const verb = flavorVerbs[Math.floor(Math.random() * flavorVerbs.length)];

    events.push({
      type: 'war',
      text: `⚔️ ${winner.name} ${verb} ${loser.name} and prevails! (${casualties} warriors fallen)`,
      civName: winner.name
    });
  }

  _randomEvents(events) {
    if (Math.random() > 0.12) return;

    const alive = this.civilizations.filter(c => c.alive);
    if (alive.length === 0) return;
    const civ = alive[Math.floor(Math.random() * alive.length)];
    const settlement = civ.settlements[Math.floor(Math.random() * civ.settlements.length)];
    
    const keyword = this.loreKeywords.length > 0 
      ? this.loreKeywords[Math.floor(Math.random() * this.loreKeywords.length)] 
      : null;

    const disasters = [
      { text: `🌋 Volcanic eruption devastates ${settlement.name}`, effect: () => { settlement.population = Math.floor(settlement.population * 0.6); settlement.foodStore = 0; } },
      { text: `🦠 Plague sweeps through ${settlement.name}`, effect: () => { settlement.population = Math.floor(settlement.population * 0.5); /* kill some people */ const victims = settlement.people.filter(p => p.alive).slice(0, 3); victims.forEach(v => v.alive = false); } },
      { text: `🌊 Great flood hits ${settlement.name}`, effect: () => { settlement.materialStore = 0; settlement.population = Math.floor(settlement.population * 0.8); } },
      { text: `🔥 Wildfire rages near ${settlement.name}`, effect: () => { settlement.foodStore = Math.floor(settlement.foodStore * 0.3); } },
      { text: `🥶 Harsh winter starves ${settlement.name}`, effect: () => { settlement.population = Math.floor(settlement.population * 0.85); settlement.foodStore = 0; } },
    ];

    const blessings = [
      { text: `✨ Golden age dawns in ${settlement.name}`, effect: () => { settlement.culture += 20; settlement.population = Math.floor(settlement.population * 1.15); } },
      { text: `🌾 Bountiful harvest blesses ${settlement.name}`, effect: () => { settlement.foodStore += 200; settlement.population = Math.floor(settlement.population * 1.1); } },
      { text: `📚 Great library founded in ${settlement.name}`, effect: () => { settlement.culture += 40; } },
      { text: `🏗️ Monumental construction completed in ${settlement.name}`, effect: () => { settlement.culture += 30; settlement.defense += 20; } },
      { text: `💰 Rich vein discovered near ${settlement.name}`, effect: () => { settlement.wealthStore += 100; settlement.materialStore += 50; } },
    ];

    if (keyword) {
      blessings.push({ 
        text: `🔮 Ancient ${keyword} power awakens near ${settlement.name}`, 
        effect: () => { settlement.culture += 15; settlement.defense += 10; } 
      });
    }

    const isDisaster = Math.random() < 0.35;
    const pool = isDisaster ? disasters : blessings;
    const event = pool[Math.floor(Math.random() * pool.length)];
    
    event.effect();
    events.push({
      type: isDisaster ? 'disaster' : 'discovery',
      text: event.text,
      civName: civ.name
    });
  }

  getDiceRolls() {
    const rolls = [...this.pendingDiceRolls];
    this.pendingDiceRolls = [];
    return rolls;
  }

  play(stepCallback) {
    this.pause();
    this.playing = true;
    const interval = Math.max(100, 2000 - (this.speed * 190));
    this.playInterval = setInterval(() => {
      if (!this.playing) return;
      const events = this.step();
      stepCallback(events);
      
      // Auto-stop at 1M total pop
      if (this.totalPopulation >= 1000000) {
        this.pause();
        worldHistory.addEvent(this.turn, 'advance', `🎊 The world reaches 1,000,000 people! Simulation milestone achieved!`);
        stepCallback([{ type: 'advance', text: '🎊 World population reaches 1,000,000!' }]);
      }
    }, interval);
  }

  pause() {
    this.playing = false;
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
  }

  setSpeed(speed) {
    this.speed = speed;
    if (this.playing) {
      this.pause();
    }
  }

  isFinished() {
    return this.totalPopulation >= 1000000 ||
           this.civilizations.filter(c => c.alive).length === 0;
  }
}
