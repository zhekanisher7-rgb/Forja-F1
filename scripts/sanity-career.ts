/** Headless sanity check for career economy, upgrades and duel odds. Run: npx tsx scripts/sanity-career.ts */
import assert from 'node:assert/strict';
import {
  UPGRADE_COSTS, totalCategoryCost, totalMaxOutCost, computeModifiers, createEmptyLevels,
  upgradedSpec, nextUpgradeCost, bonusText, UPGRADE_IDS,
} from '../src/game/Upgrades';
import {
  computeRaceReward, TIERS, RACE_TIERS, parseCareer, createCareer, tryUpgrade, STARTING_COINS,
} from '../src/game/Career';
import { DUEL_DRIVERS, duelCoefficient, duelPayout, sanitizeBet, playerRating } from '../src/game/Duel';

const lv0 = createEmptyLevels();
const lvMax = createEmptyLevels();
for (const id of UPGRADE_IDS) lvMax[id] = 10;
const lv5 = createEmptyLevels();
for (const id of UPGRADE_IDS) lv5[id] = 5;

console.log('Cost per level:', UPGRADE_COSTS.join(', '));
console.log('Per category:', totalCategoryCost(), ' Max-out all 6:', totalMaxOutCost());
assert.equal(nextUpgradeCost(10), null);
assert.ok(UPGRADE_COSTS.every((c, i) => i === 0 || c > UPGRADE_COSTS[i - 1]));

const m = computeModifiers(lvMax);
console.log('Max modifiers:', m);
const sp = upgradedSpec(lvMax);
console.log(`Max spec: ${sp.maxPower.toFixed(0)} kW, ERS ${sp.ersBoostKw.toFixed(0)} kW, top ~${sp.topSpeedKmh.toFixed(0)} km/h, Cl ${sp.downforceCl.toFixed(2)}, Cd ${sp.dragCd.toFixed(3)}`);
for (const id of UPGRADE_IDS) console.log(`  L10 ${id}: ${bonusText(id, 10)}`);
const m0 = computeModifiers(lv0);
assert.ok(Object.values(m0).every((x) => Math.abs(x - 1) < 1e-9), 'level 0 must be stock');

console.log('\nRewards (3 laps, 8 opponents = 9 cars):');
for (const t of RACE_TIERS) {
  const row = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => computeRaceReward(p, 9, 3, t, false).total);
  console.log(`  ${TIERS[t].nameRu.padEnd(14)} ×${TIERS[t].coinMul}: ${row.join(' / ')}`);
}
assert.equal(computeRaceReward(1, 9, 3, 'international', true).total, 0);
assert.equal(computeRaceReward(1, 9, 3, 'city', false).total, 250);
assert.equal(computeRaceReward(1, 9, 3, 'regional', false).total, 375);
assert.equal(computeRaceReward(1, 9, 3, 'international', false).total, 750);
console.log('  P1 1-lap/4-opp city:', computeRaceReward(1, 5, 1, 'city', false).total,
  ' P1 8-lap/16-opp intl:', computeRaceReward(1, 17, 8, 'international', false).total,
  ' P17 city 3 laps:', computeRaceReward(17, 17, 3, 'city', false).total);

// Races to max-out with a typical progression (P3 of 9, 3 laps): 1/3 city, 1/3 regional, 1/3 intl
const avg = (computeRaceReward(3, 9, 3, 'city', false).total + computeRaceReward(3, 9, 3, 'regional', false).total
  + computeRaceReward(3, 9, 3, 'international', false).total) / 3;
const avgWin = (250 + 375 + 750) / 3;
console.log(`  Races to max-out: P3 mix ≈ ${Math.ceil((totalMaxOutCost() - STARTING_COINS) / avg)}, wins mix ≈ ${Math.ceil((totalMaxOutCost() - STARTING_COINS) / avgWin)}`);

console.log('\nDuel coefficients:');
for (const [name, lv] of [['stock', lv0], ['avg L5', lv5], ['max', lvMax]] as const) {
  console.log(`  car ${name} (rating ${playerRating(lv)}): ` + DUEL_DRIVERS.map((d) => `${d.levelRu} ×${duelCoefficient(d.rating, lv).toFixed(2)}`).join(', '));
}
for (const lv of [lv0, lv5, lvMax]) for (const d of DUEL_DRIVERS) {
  const c = duelCoefficient(d.rating, lv); assert.ok(c >= 1.1 && c <= 6.0);
}
assert.equal(duelPayout(100, 2.35), 235);
assert.equal(sanitizeBet('0', 100), null);
assert.equal(sanitizeBet('101', 100), null);
assert.equal(sanitizeBet('abc', 100), null);
assert.equal(sanitizeBet('50.7', 100), 50);

// Save parsing robustness
assert.equal(parseCareer(null).coins, STARTING_COINS);
assert.equal(parseCareer('garbage{').coins, STARTING_COINS);
const p = parseCareer(JSON.stringify({ v: 1, coins: -5, levels: { brakes: 99, tyres: 'x', engine: 3 } }));
assert.equal(p.coins, STARTING_COINS); assert.equal(p.levels.brakes, 10); assert.equal(p.levels.tyres, 0); assert.equal(p.levels.engine, 3);
const c = createCareer();
assert.ok(tryUpgrade(c, 'engine')); assert.ok(tryUpgrade(c, 'brakes')); assert.ok(tryUpgrade(c, 'engine'));
assert.equal(c.coins, STARTING_COINS - 60 - 60 - 90); assert.equal(c.levels.engine, 2);
assert.ok(!tryUpgrade(c, 'engine'), 'cannot afford 140');
console.log('\nAll sanity checks passed ✔');
