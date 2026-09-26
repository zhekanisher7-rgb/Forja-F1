export type WeatherType = 'dry' | 'wet';

export interface WeatherState {
  type: WeatherType;
  gripMultiplier: number;
  visibility: number;
}

export function createWeather(type: WeatherType): WeatherState {
  if (type === 'wet') {
    return { type: 'wet', gripMultiplier: 0.62, visibility: 0.7 };
  }
  return { type: 'dry', gripMultiplier: 1.0, visibility: 1.0 };
}
