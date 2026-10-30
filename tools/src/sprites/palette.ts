/**
 * Tyranid hive-fleet palettes. Default: Behemoth (deep blue-purple carapace, bone-red flesh).
 * `npm run assets -- --fleet=leviathan` switches to the bone-white/purple scheme.
 */
export interface FleetPalette {
  id: string;
  carapace: string;
  carapaceLight: string;
  carapaceDark: string;
  flesh: string;
  fleshDark: string;
  bone: string;
  eye: string;
  ichor: string;
  /** Genestealers keep their own purple. */
  stealer: string;
  stealerCarapace: string;
  creep: string;
}

export const FLEETS: Record<string, FleetPalette> = {
  behemoth: {
    id: 'behemoth',
    carapace: '#33307a',
    carapaceLight: '#5d5bb8',
    carapaceDark: '#16143a',
    flesh: '#a8352c',
    fleshDark: '#5e1a16',
    bone: '#e3d4ae',
    eye: '#ffcf3a',
    ichor: '#5a1438',
    stealer: '#6c3a96',
    stealerCarapace: '#2c2f74',
    creep: '#4a1f4f',
  },
  leviathan: {
    id: 'leviathan',
    carapace: '#d9cfb4',
    carapaceLight: '#f3ecd8',
    carapaceDark: '#8a7f66',
    flesh: '#6e2a78',
    fleshDark: '#3a1240',
    bone: '#f1e7cf',
    eye: '#ff3b2f',
    ichor: '#4a1a5c',
    stealer: '#7a3f9e',
    stealerCarapace: '#d0c3a2',
    creep: '#3f1d4a',
  },
};

const arg = process.argv.find((a) => a.startsWith('--fleet='))?.slice(8) ?? process.env.FLEET;
export const FLEET: FleetPalette = FLEETS[arg ?? 'behemoth'] ?? FLEETS.behemoth!;
