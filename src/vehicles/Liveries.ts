/** Team liveries — fan tribute names, not official licensing */

export interface Livery {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const LIVERIES: Livery[] = [
  { id: 'mercedes', name: 'Mercedes', primary: '#00d2be', secondary: '#1a1a1a', accent: '#ffffff' },
  { id: 'mclaren', name: 'McLaren', primary: '#ff8700', secondary: '#0a0a0a', accent: '#47c7fc' },
  { id: 'ferrari', name: 'Ferrari', primary: '#e10600', secondary: '#fff200', accent: '#ffffff' },
  { id: 'aston', name: 'Aston Martin', primary: '#006f62', secondary: '#cedc00', accent: '#ffffff' },
  { id: 'redbull', name: 'Red Bull', primary: '#1e41ff', secondary: '#ff1e00', accent: '#ffffff' },
  { id: 'williams', name: 'Williams', primary: '#005aff', secondary: '#ffffff', accent: '#00a0e0' },
  { id: 'alpine', name: 'Alpine', primary: '#ff87bc', secondary: '#0a1e6e', accent: '#ffffff' },
  { id: 'haas', name: 'Haas', primary: '#ffffff', secondary: '#e10600', accent: '#1a1a1a' },
  { id: 'racingbulls', name: 'Racing Bulls', primary: '#6692ff', secondary: '#ffffff', accent: '#1e1e2e' },
  { id: 'audi', name: 'Audi', primary: '#bb0a30', secondary: '#1a1a1a', accent: '#c0c0c0' },
  { id: 'cadillac', name: 'Cadillac', primary: '#000000', secondary: '#c4a962', accent: '#ffffff' },
  { id: 'custom', name: 'Свой', primary: '#888888', secondary: '#222222', accent: '#00ff88' },
];

export function getLivery(id: string): Livery {
  return LIVERIES.find((l) => l.id === id) ?? LIVERIES[0];
}
