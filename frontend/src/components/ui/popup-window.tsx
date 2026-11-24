import { Text } from '@/components/app-text';
// [ADDED 2026-11-12] 화면 가운데 뜨는 팝업 창 (검색·그룹 만들기에서 사용, 상점과 같은 모양).
//  - 닫기: ✕ 버튼, 창 바깥(어두운 부분) 누르기, 안드로이드 뒤로가기
//  - RN Modal 이 아니라 지금 화면 안에 겹쳐 그린다 → 팝업에서 행성 상세로 갔다가 돌아와도
//    팝업과 그 안의 상태(검색어·결과)가 그대로 남는다. (Modal 은 웹에서 다음 화면 위까지 덮어버림)
//  - 그래서 이 컴포넌트는 화면의 맨 마지막 자식으로 두어야 다른 요소 위에 보인다.
import { useEffect, type ReactNode } from 'react';
import { SearchPopupFrame } from './search-popup-frame';
import { BackHandler, Pressable, StyleSheet, TouchableOpacity, View, type DimensionValue } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** 창 너비(디자인 프레임 너비). 좌우 12px 여백을 뺀다. */
  width: number;
  /** 창 높이. 없으면 내용 높이에 맞춘다. */
  height?: DimensionValue;
  children: ReactNode;
  testID?: string;
  appearance?: 'default' | 'search';
};

export function PopupWindow({ visible, onClose, title, width, height, children, testID, appearance = 'default' }: Props) {
  // 안드로이드 뒤로가기 → 팝업만 닫기
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <View style={styles.backdrop} testID={testID ? `${testID}-backdrop` : undefined}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={`${title} 닫기`} />
      <View style={[styles.card, appearance === 'search' && styles.searchCard, { width: width - 24 }, height !== undefined && { height }]} testID={testID}>
        {appearance === 'search' && <SearchPopupFrame />}
        <View style={styles.header}>
          <View style={styles.side} />
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={[styles.side, styles.sideRight]}>
            <TouchableOpacity onPress={onClose} accessibilityLabel="닫기" hitSlop={10} style={styles.close} testID={testID ? `${testID}-close` : undefined}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={height !== undefined ? styles.bodyFill : undefined}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    maxHeight: '88%',
    backgroundColor: '#000',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#3A3A4A',
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  searchCard: { backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  side: { width: 40 },
  sideRight: { alignItems: 'flex-end' },
  title: { flex: 1, color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  close: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  bodyFill: { flex: 1 },
});
