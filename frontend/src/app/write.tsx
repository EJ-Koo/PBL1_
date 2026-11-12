// [MODIFIED 2026-11-05] 일기 수정 화면 (/write?id=...). 행성 상세의 "수정"에서 열린다.
// 새 일기 작성은 홈 화면 왼쪽 탭에서 하고, 두 화면 모두 fffju 일기 작성 디자인(DiaryComposer)을 쓴다.
// 폭은 홈과 같은 기준 — 폰은 fffju 배율, 웹·PC는 최대 520px 가운데.
import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DiaryComposer } from '@/components/diary-composer';
import { DesignPaint } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { goBackSafe } from '@/lib/navigation';
import { useDiary } from '@/store/diary-context';

export default function WriteRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isLoggedIn, getEntry } = useDiary();
  const { scale } = useResponsiveLayout();

  // 웹에서 새로고침하면 로그인 정보가 사라지므로 로그인 화면으로 보낸다.
  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
  }, [isLoggedIn]);

  // 수정할 일기를 못 찾으면(잘못된 주소 등) 홈으로 돌려보낸다.
  const entry = id ? getEntry(id) : undefined;
  useEffect(() => {
    if (isLoggedIn && !entry) router.replace('/');
  }, [isLoggedIn, entry]);

  if (!isLoggedIn || !entry) return <View style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <DiaryComposer scale={scale} editId={entry.id} onBack={goBackSafe} onSaved={goBackSafe} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DesignPaint.background },
});
