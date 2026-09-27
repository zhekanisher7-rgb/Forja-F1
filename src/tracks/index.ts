import type { TrackData } from './Track';
import { createMonacoTrack } from './Monaco';
import { createSuzukaTrack } from './Suzuka';
import { createInterlagosTrack } from './Interlagos';

export type TrackId = 'monaco' | 'suzuka' | 'interlagos';

export interface TrackOption {
  id: TrackId;
  name: string;
  nameRu: string;
}

export const TRACK_OPTIONS: TrackOption[] = [
  { id: 'monaco', name: 'Circuit de Monaco', nameRu: 'Монако' },
  { id: 'suzuka', name: 'Suzuka Circuit', nameRu: 'Сузука' },
  { id: 'interlagos', name: 'Interlagos', nameRu: 'Интерлагос' },
];

const FACTORIES: Record<TrackId, () => TrackData> = {
  monaco: createMonacoTrack,
  suzuka: createSuzukaTrack,
  interlagos: createInterlagosTrack,
};

export function getTrackById(id: string): TrackData {
  const key = (id in FACTORIES ? id : 'monaco') as TrackId;
  return FACTORIES[key]();
}

export { createMonacoTrack, createSuzukaTrack, createInterlagosTrack };

export {
  PIT_LANE,
  inPitApproach,
  pitApronAllowance,
  mandatoryPitDeadlineLap,
  modeHasMandatoryPit,
  isPitCorridorS,
  isPitTecproGap,
  pitArcBulgeFactor,
  pitSpurCenterOffset,
  pitSpurInnerOffset,
} from './PitLane';
export type { PitLaneSpec } from './PitLane';
