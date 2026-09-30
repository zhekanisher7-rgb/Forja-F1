/** Headless: lap time of a single AI car per tier / duel rating on each track. */
import * as THREE from 'three';
import { getTrackById, TRACK_OPTIONS } from '../src/tracks';
import { sampleTrack } from '../src/tracks/Track';
import { createVehicleState } from '../src/physics/VehiclePhysics';
import { createWeather } from '../src/physics/Weather';
import { createAIPhysics, updateAICar, type AICar, type AIDriverConfig } from '../src/ai/AIDriver';
import { TIERS } from '../src/game/Career';
import { DUEL_DRIVERS, duelAIConfig } from '../src/game/Duel';

function simLap(trackId: string, cfg: AIDriverConfig): { lap1: number; lap2: number; walls: number } {
  const track = getTrackById(trackId);
  const weather = createWeather('dry');
  const s0 = sampleTrack(track.points, 36);
  const v = createVehicleState(s0.x, s0.z, s0.yaw, 'slick');
  v.y = s0.y; v.distanceAlong = 36;
  const ai: AICar = {
    id: 'ai0', config: cfg, vehicle: v, mesh: new THREE.Group(),
    physics: createAIPhysics(cfg, weather), lineBias: 0, lookAhead: 14 + cfg.skill * 10,
    gridIndex: 0, raceAgeSec: 0,
  };
  const dt = 1 / 30;
  let t = 0, lastS = v.distanceAlong, prog = 0, laps: number[] = [], lapStart = 0, walls = 0;
  const L = track.length;
  while (t < 600 && laps.length < 2) {
    ai.raceAgeSec = t;
    const prevSpeed = v.speed;
    updateAICar(ai, track, dt);
    if (v.speed < prevSpeed * 0.92 && prevSpeed > 10) walls++;
    let ds = v.distanceAlong - lastS;
    if (ds < -L / 2) ds += L; if (ds > L / 2) ds -= L;
    if (ds > 0) prog += ds;
    if (lastS > L * 0.9 && v.distanceAlong < L * 0.1 && prog > L * 0.8) {
      laps.push(t - lapStart); lapStart = t; prog = 0;
    }
    lastS = v.distanceAlong; t += dt;
  }
  return { lap1: laps[0] ?? NaN, lap2: laps[1] ?? NaN, walls };
}

const rows: string[] = [];
for (const tr of TRACK_OPTIONS) {
  for (const [name, tier] of Object.entries(TIERS)) {
    for (const skill of [tier.ai.skillMax, tier.ai.skillMin]) {
      const r = simLap(tr.id, { skill, aggression: 0.5 * tier.ai.aggressionMul, liveryId: 'x', paceMul: tier.ai.paceMul, powerMul: tier.ai.powerMul });
      rows.push(`${tr.id.padEnd(10)} ${name.padEnd(14)} skill ${skill.toFixed(2)}  lap2 ${r.lap2.toFixed(1)}s  walls ${r.walls}`);
    }
  }
  for (const d of DUEL_DRIVERS) {
    const r = simLap(tr.id, duelAIConfig(d));
    rows.push(`${tr.id.padEnd(10)} duel ${d.levelRu.padEnd(13)} r${d.rating}  lap2 ${r.lap2.toFixed(1)}s  walls ${r.walls}`);
  }
}
console.log(rows.join('\n'));
