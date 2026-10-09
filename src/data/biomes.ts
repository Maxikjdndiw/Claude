/**
 * Terrain types. Colors are the flat-shaded base colors used by the renderer.
 * Order matters: the world stores biome as an index into BIOME_IDS.
 */
export const BIOME_IDS = [
  'deep',
  'ocean',
  'lake',
  'river',
  'beach',
  'plains',
  'fertile',
  'forest',
  'hills',
  'mountain',
  'snow',
] as const;

export type BiomeId = (typeof BIOME_IDS)[number];

export interface BiomeDef {
  name: string;
  color: string;
  water: boolean;
  /** Can ordinary buildings be placed here? */
  buildable: boolean;
  /** Multiplier on construction cost (slopes and rock are expensive to build on). */
  buildCost: number;
  /** A* cost multiplier for roads/rails. */
  pathCost: number;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  deep: { name: 'Deep ocean', color: '#4f93ad', water: true, buildable: false, buildCost: 9, pathCost: Infinity },
  ocean: { name: 'Shallow sea', color: '#79c1c2', water: true, buildable: false, buildCost: 9, pathCost: Infinity },
  lake: { name: 'Lake', color: '#7cbfc4', water: true, buildable: false, buildCost: 9, pathCost: Infinity },
  river: { name: 'River', color: '#86c4c6', water: true, buildable: false, buildCost: 9, pathCost: 12 },
  beach: { name: 'Coast', color: '#ead7a2', water: false, buildable: true, buildCost: 1.1, pathCost: 1.2 },
  plains: { name: 'Plains', color: '#b9d77c', water: false, buildable: true, buildCost: 1, pathCost: 1 },
  fertile: { name: 'Farmland', color: '#a3cf68', water: false, buildable: true, buildCost: 1, pathCost: 1 },
  forest: { name: 'Forest', color: '#7db363', water: false, buildable: true, buildCost: 1.25, pathCost: 1.6 },
  hills: { name: 'Hills', color: '#bdbd83', water: false, buildable: true, buildCost: 1.4, pathCost: 2.2 },
  mountain: { name: 'Mountains', color: '#a99d8f', water: false, buildable: true, buildCost: 2.2, pathCost: 5 },
  snow: { name: 'Peaks', color: '#f2f1ec', water: false, buildable: false, buildCost: 4, pathCost: 9 },
};

export const biomeAt = (index: number): BiomeId => BIOME_IDS[index];
export const biomeIndex = (id: BiomeId): number => BIOME_IDS.indexOf(id);
