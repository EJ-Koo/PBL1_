import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlanetDecorator } from '@/components/planet-decorator';
import { StarDiaryPopup } from '@/components/ui/star-diary-popup';
import { UniverseCanvas } from '@/components/universe-scene';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { ApiGroupMember } from '@/lib/api';
import type { NewStarHighlight } from '@/lib/new-star-highlight';
import type { StarPopupAnchor } from '@/lib/star-popup-layout';
import { useDiary, type DiaryEntry } from '@/store/diary-context';

/** The selected diary stays in the universe, anchored to its moving 3D star. */
export function DiaryUniverse({ entries, sceneKey, members, newStar, onNewStarFound }: {
  entries: DiaryEntry[];
  sceneKey?: string;
  members?: ApiGroupMember[];
  newStar?: NewStarHighlight;
  onNewStarFound?: () => void;
}) {
  const { isEditableToday, profile } = useDiary();
  const { headerTop, scale, bottomSpace } = useResponsiveLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<StarPopupAnchor | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [decoratingId, setDecoratingId] = useState<string | null>(null);
  const entry = entries.find((item) => item.id === selectedId);
  const member = members?.find((item) => item.user_id === entry?.authorId);
  const ownProfile = profile?.user_id === entry?.authorId ? profile : null;
  const author = members ? {
    nickname: ownProfile?.nickname?.trim() || member?.nickname?.trim() || '익명',
    avatarUrl: ownProfile?.avatar_url ?? member?.avatar_url,
  } : undefined;
  const close = useCallback(() => setSelectedId(null), []);
  const select = useCallback((id: string) => {
    setSelectedId((current) => current === id ? null : id);
    if (id === newStar?.id) onNewStarFound?.();
  }, [newStar?.id, onNewStarFound]);

  return (
    <View style={styles.fill} onLayout={(event) => setSize(event.nativeEvent.layout)}>
      <UniverseCanvas entries={entries} sceneKey={sceneKey} onStarPress={select} newStar={newStar}
        selectedEntryId={entry?.id} onStarPositionChange={setAnchor} onBackgroundPress={close} />
      {entry && anchor?.id === entry.id && (
        <StarDiaryPopup key={entry.id} entry={entry} anchor={anchor} author={author}
          viewport={{ ...size, topInset: headerTop + 84 * scale, bottomInset: bottomSpace }}
          editable={isEditableToday(entry.id)} onClose={close}
          onEdit={() => { close(); router.push(`/write?id=${entry.id}`); }}
          onDecorate={() => setDecoratingId(entry.id)} />
      )}
      <PlanetDecorator visible={decoratingId !== null} diaryId={decoratingId} onClose={() => setDecoratingId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
