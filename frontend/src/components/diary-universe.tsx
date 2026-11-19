import { useFontScale } from '@/hooks/use-font-scale';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PlanetDecorator } from '@/components/planet-decorator';
import { StarDiaryPopup } from '@/components/ui/star-diary-popup';
import { UniverseCanvas, type ConstellationRequest } from '@/components/universe-scene';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { apiReadDiary, type ApiDiary } from '@/lib/api';
import { authSession } from '@/lib/auth-session';
import type { NewStarHighlight } from '@/lib/new-star-highlight';
import { getStarPopupLayout, starPopupMinimumHeight, type StarPopupAnchor } from '@/lib/star-popup-layout';
import { useDiary, toEntry, type DiaryEntry } from '@/store/diary-context';

/** fffju's anchored UI, test's exact-ID permission checks, and a shared camera per login. */
export function DiaryUniverse({ entries, sceneKey, groupId, selection, newStar, onNewStarFound, backgroundStarScale = 1, constellation, frontViewRequest, popupInsets, unreadIds, onDiaryRead }: {
  unreadIds?: readonly string[]; onDiaryRead?: (id:string)=>Promise<void>;
  entries: DiaryEntry[]; sceneKey: string; groupId?: string;
  selection?: { id: string | null; onChange: (id: string | null) => void };
  newStar?: NewStarHighlight; onNewStarFound?: () => void; backgroundStarScale?: number;
  /** [2026-11-15] 별자리 보기(홈 우주에서만). 없으면 예전과 같다. */
  constellation?: ConstellationRequest | null; frontViewRequest?: number;
  /** Insets inside this canvas when it sits below a separate page header. */
  popupInsets?: { top: number; bottom: number };
}) {
  const { isOwnEntry, isEditableToday, accessToken, profile } = useDiary();
  const fontScale = useFontScale();
  const revision = authSession.getRevision();
  const { headerTop, scale, bottomSpace } = useResponsiveLayout();
  const [localId, setLocalId] = useState<string | null>(null);
  const selectedId = selection ? selection.id : localId;
  const updateSelection = selection?.onChange ?? setLocalId;
  const [anchor, setAnchor] = useState<StarPopupAnchor | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [decoratingId, setDecoratingId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<{ id: string; revision: number; attempt: number; diary?: ApiDiary; error?: string } | null>(null);
  const entry = entries.find(item => item.id === selectedId);
  useEffect(() => {
    if (!groupId || !selectedId || !accessToken) return;
    let alive = true;
    const id = selectedId;
    apiReadDiary(accessToken, id).then(diary => {
      if (alive && authSession.getRevision() === revision) setRead({ id, revision, attempt, diary });
    }).catch(error => {
      if (alive && authSession.getRevision() === revision) setRead({ id, revision, attempt, error: error instanceof Error ? error.message : '일기를 불러오지 못했어요.' });
    });
    return () => { alive = false; };
  }, [groupId, selectedId, accessToken, revision, attempt]);
  const verified = read?.id === selectedId && read.revision === revision && read.attempt === attempt ? read : null;
  const close = useCallback(() => { setRead(null); updateSelection(null); }, [updateSelection]);
  const select = useCallback((id: string) => {
    setRead(null);
    updateSelection(selectedId === id ? null : id);
    if (id === newStar?.id) onNewStarFound?.();
  }, [selectedId, updateSelection, newStar?.id, onNewStarFound]);
  const resolved = entry && groupId
    ? verified?.diary ? { ...entry, ...toEntry(verified.diary, 0), planet: entry.planet, effect: entry.effect }
      : { ...entry, text: '', photos: [] }
    : entry;
  const readable = !!anchor && anchor.id === selectedId && anchor.visible && !!getStarPopupLayout(anchor, {
    ...size, minBodyHeight:starPopupMinimumHeight(Math.min(440,size.width-32),!!groupId,!!groupId||!!entry&&isOwnEntry(entry.id),fontScale), topInset: popupInsets?.top ?? headerTop + 84 * scale, bottomInset: popupInsets?.bottom ?? (groupId ? 20 : bottomSpace),
  });
  useEffect(() => {
    // A successful fetch alone is not a read: an off-screen/hidden popup must stay unread.
    if(groupId && readable && verified?.diary && selectedId && onDiaryRead) void onDiaryRead(selectedId);
  },[groupId,readable,verified,selectedId,onDiaryRead]);
  const author = groupId ? {
    nickname: verified?.diary?.author_profile?.nickname || (verified?.diary?.user_id === profile?.user_id ? profile?.nickname : null) || '익명',
    avatarUrl: verified?.diary?.author_profile?.avatar_url,
  } : undefined;
  const owned = !!entry && isOwnEntry(entry.id);
  return <View style={styles.fill} onLayout={event => setSize(event.nativeEvent.layout)}>
    <UniverseCanvas entries={entries} sceneKey={sceneKey} onStarPress={select} newStar={newStar}
      selectedEntryId={entry?.id} onStarPositionChange={setAnchor} onBackgroundPress={close} backgroundStarScale={backgroundStarScale} unreadIds={unreadIds}
      constellation={constellation} frontViewRequest={frontViewRequest} />
    {resolved && anchor?.id === resolved.id && <StarDiaryPopup key={resolved.id} entry={resolved} anchor={anchor}
      groupId={groupId} author={author} viewport={{ ...size, topInset: popupInsets?.top ?? headerTop + 84 * scale, bottomInset: popupInsets?.bottom ?? (groupId ? 20 : bottomSpace) }}
      owned={owned} editable={owned && isEditableToday(resolved.id)} loading={!!groupId && !verified} error={verified?.error}
      onRetry={() => setAttempt(value => value + 1)} onClose={close}
      onEdit={() => { close(); router.push(`/write?id=${resolved.id}`); }}
      onDecorate={() => { if (owned) setDecoratingId(resolved.id); }} />}
    <PlanetDecorator visible={decoratingId !== null} diaryId={decoratingId} onClose={() => setDecoratingId(null)} />
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
