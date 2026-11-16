import { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesignFonts } from '@/constants/ui-design';
import { groupArchive } from '@/lib/diary-archive';
import { goBackSafe } from '@/lib/navigation';
import { useDiary } from '@/store/diary-context';

const dateLabel = (time: number) => new Date(time).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
function CardArt({ index }: { index: number }) {
  const color = ['#8d9fff', '#c49bad', '#a6b8e5', '#cab58c'][index % 4];
  return <Svg width="100%" height="100%" viewBox="0 0 400 150" preserveAspectRatio="none" pointerEvents="none">
    <Defs><RadialGradient id={`planet-${index}`}><Stop offset="0" stopColor="#090a14" /><Stop offset="0.88" stopColor={color} stopOpacity="0.2" /><Stop offset="1" stopColor={color} stopOpacity="0.8" /></RadialGradient></Defs>
    <Path d="M12 1H388L399 12V138L388 149H12L1 138V12Z" fill="#0b0c14" stroke="#989ba6" />
    {Array.from({ length: 20 }, (_, i) => <Circle key={i} cx={180 + i * 67 % 210} cy={10 + i * 37 % 130} r={0.7} fill="#fff" opacity={0.3} />)}
    <Circle cx="310" cy="160" r="100" fill={`url(#planet-${index})`} />
    <Ellipse cx="300" cy="138" rx="94" ry="13" rotation="-18" origin="300, 138" fill="none" stroke={color} strokeOpacity="0.35" />
    <Rect x="12" y="110" width="376" height="38" fill="#080910" opacity="0.3" />
    <Path d="M20 6L25 1 M27 6L32 1 M34 6L39 1 M41 6L46 1" stroke="#fff" strokeWidth="2" />
  </Svg>;
}

export function DiaryHistory() {
  const { entries, dataLoading, loadError, retryLoad, isLoggedIn } = useDiary();
  const { period, entry: entryId } = useLocalSearchParams<{ period?: string; entry?: string }>();
  const insets = useSafeAreaInsets();
  const groups = useMemo(() => groupArchive(entries), [entries]);
  const group = groups.find(item => item.id === period);
  const selected = group?.entries.find(item => item.id === entryId);
  const back = () => {
    if (router.canGoBack()) router.back();
    else if (entryId) router.replace({ pathname: '/archive', params: { period } });
    else if (period) router.replace('/archive');
    else goBackSafe();
  };
  if (!isLoggedIn) return <View style={styles.screen} />;
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={styles.shell}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 화면으로" onPress={back} style={styles.button}><Text style={styles.text}>‹ 뒤로</Text></Pressable>
        <Text style={styles.telemetry}>STAR2DAY / PERSONAL LOG</Text>
      </View>
      <View style={styles.heading}>
        <View style={styles.headingRow}><Text accessibilityRole="header" style={styles.title}>OUR ARCHIVE</Text><Text style={styles.stripes}>▰▰▰</Text></View>
        <Text style={styles.eyebrow}>D I A R Y   A R C H I V E</Text>
      </View>
      <Text style={styles.subtitle}>{group ? `${group.year} · ${group.half === 1 ? 'JAN – JUN' : 'JUL – DEC'} / ${group.entries.length}개의 기록` : '지난 기록들을 6개월 단위로 모아볼 수 있어요.'}</Text>
      {dataLoading ? <ActivityIndicator color="#fff" accessibilityLabel="기록 불러오는 중" /> : loadError ? <View style={styles.message}>
        <Text style={styles.text}>{loadError}</Text><Pressable accessibilityRole="button" onPress={retryLoad} style={styles.button}><Text style={styles.text}>다시 시도</Text></Pressable>
      </View> : (period && !group) || (entryId && !selected) ? <Text style={styles.message}>기록을 찾을 수 없어요. 뒤로 가서 다시 선택해주세요.</Text> : selected ? (
        <ScrollView key={selected.id} contentContainerStyle={styles.content}>
          <Text style={styles.date}>{dateLabel(selected.createdAt)}</Text><Text selectable style={styles.body}>{selected.text}</Text>
          {selected.photos.map((photo, index) => <Image key={photo.id} source={{ uri: photo.uri }} accessibilityLabel={`일기 사진 ${index + 1}`} resizeMode="contain" style={styles.photo} />)}
        </ScrollView>
      ) : group ? (
        <FlatList key={group.id} data={group.entries} keyExtractor={item => item.id} contentContainerStyle={styles.content}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${dateLabel(item.createdAt)} 기록 보기`} onPress={() => router.push({ pathname: '/archive', params: { period, entry: item.id } })} style={styles.entry}>
            <Text style={styles.date}>{dateLabel(item.createdAt)}  ›</Text><Text style={styles.body} numberOfLines={3}>{item.text}</Text>
            {item.photos.length > 0 && <Text style={styles.subtitle}>사진 {item.photos.length}장</Text>}
          </Pressable>} />
      ) : (
        <FlatList key="periods" data={groups} keyExtractor={item => item.id} contentContainerStyle={styles.content}
          ListEmptyComponent={<Text style={styles.message}>아직 저장된 기록이 없어요.{'\n'}오늘의 이야기를 별로 남겨보세요.</Text>}
          renderItem={({ item, index }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.year}년 ${item.half === 1 ? '상반기' : '하반기'}, 기록 ${item.entries.length}개`} onPress={() => router.push({ pathname: '/archive', params: { period: item.id } })} style={styles.card}>
            <View style={StyleSheet.absoluteFill}><CardArt index={index} /></View>
            <Text style={styles.year}>{item.year}</Text><Text style={styles.period}>{item.half === 1 ? 'JAN – JUN' : 'JUL – DEC'}</Text>
            <View style={styles.cardFoot}><Text style={styles.range}>{item.half === 1 ? '01.01 – 06.30' : '07.01 – 12.31'}</Text><Text style={styles.count}>{item.entries.length} ENTRIES　 ›</Text></View>
          </Pressable>} />
      )}
      <View style={styles.footer}><Text style={styles.stripes}>▰▰</Text><Text style={styles.footerLabel}>기록 아카이브</Text><Text style={styles.stripes}>▰▰</Text></View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050507' },
  shell: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24 },
  text: { color: '#eee', fontFamily: DesignFonts.regular, fontSize: 16 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#55565e', paddingVertical: 8, gap: 12 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  telemetry: { color: '#999ba5', fontSize: 9, letterSpacing: 1, flexShrink: 1 },
  heading: { borderWidth: 1, borderColor: '#92949d', padding: 14, marginTop: 30 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { color: '#f1f1f3', fontFamily: DesignFonts.bold, fontSize: 23, letterSpacing: -0.8, flexShrink: 1 },
  stripes: { color: '#d3d4da', fontSize: 20 },
  eyebrow: { color: '#9b9ca8', fontSize: 9, marginTop: 8 },
  subtitle: { color: '#b5b5bf', fontSize: 12, lineHeight: 20, marginVertical: 18 },
  content: { paddingBottom: 24 },
  card: { minHeight: 150, padding: 24, justifyContent: 'center', marginBottom: 14, overflow: 'hidden' },
  year: { color: '#d7d8df', fontSize: 14, marginBottom: 4 },
  period: { color: '#fff', fontSize: 25, fontFamily: DesignFonts.bold, letterSpacing: 1 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  range: { color: '#b2b4c3', fontSize: 10, letterSpacing: 1 },
  count: { color: '#e1e1e9', fontSize: 9, letterSpacing: 1 },
  entry: { borderWidth: 1, borderColor: '#555762', backgroundColor: '#101118', padding: 20, marginBottom: 14 },
  date: { color: '#eee', fontSize: 16, fontWeight: '700', marginBottom: 18 },
  body: { color: '#dddde6', fontFamily: DesignFonts.regular, fontSize: 16, lineHeight: 28 },
  photo: { width: '100%', height: 260, marginTop: 18 },
  message: { color: '#ccc', paddingVertical: 32, lineHeight: 28, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: '#777', paddingVertical: 16, gap: 12 },
  footerLabel: { color: '#eee', backgroundColor: '#55565d', borderWidth: 1, borderColor: '#aaa', paddingHorizontal: 28, paddingVertical: 12, fontSize: 12 },
});
