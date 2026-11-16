import { View } from 'react-native';
import { PlanetPreview } from '@/components/universe-scene';
import { PLANET_BASE_RADIUS, planetScaleForText } from '@/lib/planet-visual';
import type { DiaryEntry } from '@/store/diary-context';

// Use the same seeded surface, conditional rings and equipped effects as the
// actual diary planet. A wide viewport does not distort the sphere itself.
export function SearchResultPlanet({ entry, active }: { entry: DiaryEntry; active: boolean }) {
  return <View pointerEvents="none" accessible={false}
    style={{ position: 'relative', zIndex: 1, width: 88, height: 68, flexShrink: 0, overflow: 'hidden' }}>
    {active && <PlanetPreview id={entry.id} visual={entry.planet} effect={entry.effect}
      radius={PLANET_BASE_RADIUS * planetScaleForText(entry.text)} quality="medium" />}
  </View>;
}
