import { DiaryHeart } from '@/components/diary-heart';
import { useEffect, useState } from 'react';
import { BackHandler, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { DesignFonts } from '@/constants/ui-design';
import { Text } from '@/components/app-text';
import { getStarPopupLayout, type StarPopupAnchor } from '@/lib/star-popup-layout';
import type { DiaryEntry } from '@/store/diary-context';

type Props = {
  groupId?: string;
  entry: DiaryEntry;
  anchor: StarPopupAnchor;
  viewport: { width: number; height: number; topInset: number; bottomInset: number };
  editable: boolean;
  owned: boolean;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  author?: { nickname: string; avatarUrl?: string | null };
  onClose: () => void;
  onEdit: () => void;
  onDecorate: () => void;
};

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function AuthorAvatar({ author, size }: { author: NonNullable<Props['author']>; size: number }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityRole="image" accessibilityLabel={`${author.nickname} 프로필`} testID="star-diary-avatar">
      {author.avatarUrl && failedUri !== author.avatarUrl ? (
        <Image source={{ uri: author.avatarUrl }} style={styles.avatarPhoto}
          onError={() => setFailedUri(author.avatarUrl ?? null)} />
      ) : (
        <Svg width="100%" height="100%" viewBox="0 0 100 100" testID="star-diary-default-avatar">
          <Circle cx={50} cy={50} r={47} fill="none" stroke="#555" strokeWidth={1} />
          <Circle cx={50} cy={40} r={14} fill="#555" />
          <Path d="M 24 79 C 30 60 70 60 76 79 Q 50 98 24 79 Z" fill="#555" />
        </Svg>
      )}
    </View>
  );
}

export function StarDiaryPopup({ entry, anchor, viewport, editable, owned, loading, error, onRetry, author, onClose, onEdit, onDecorate, groupId }: Props) {
  useEffect(() => {
    if (Platform.OS === 'web') {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  const layout = getStarPopupLayout(anchor, viewport);
  if (!anchor.visible || !layout) return null;
  const { left, top, width, bodyHeight, tailHeight, tailX, tailBaseX, above } = layout;
  const height = bodyHeight + tailHeight;
  const bodyTop = above ? 1 : tailHeight;
  const bodyBottom = above ? bodyHeight : height - 1;
  const avatarSize = Math.min(88, width * 0.22);
  const compactAuthor = !!author && width < 340;
  const corner = author && above ? avatarSize * 0.7 : 0;
  const tail = above
    ? `L ${tailBaseX + 26} ${bodyBottom} L ${tailX} ${height - 1} L ${tailBaseX - 26} ${bodyBottom}`
    : '';
  const topTail = above
    ? ''
    : `L ${tailBaseX - 26} ${bodyTop} L ${tailX} 1 L ${tailBaseX + 26} ${bodyTop}`;
  const outline = `M 1 ${bodyTop + corner} L ${1 + corner} ${bodyTop} ${topTail} L ${width - 1} ${bodyTop} L ${width - 1} ${bodyBottom} ${tail} L 1 ${bodyBottom} Z`;
  const date = new Date(entry.createdAt);
  const dateLabel = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}.${WEEKDAYS[date.getDay()]}`;

  return (
    <View pointerEvents="box-none" style={[styles.popup, { left, top, width, height }]} testID="star-diary-popup"
      {...({ dataSet: { starX: anchor.x, starY: anchor.y, starRadius: anchor.radius, tailX, tailY: above ? height - 1 : 1 } } as object)}>
      <Svg width={width + Math.max(0, -tailX + 2) + Math.max(0, tailX - width + 2)} height={height}
        viewBox={`${-Math.max(0, -tailX + 2)} 0 ${width + Math.max(0, -tailX + 2) + Math.max(0, tailX - width + 2)} ${height}`}
        style={{ position: 'absolute', left: -Math.max(0, -tailX + 2), top: 0 }} pointerEvents="none">
        <Path d={outline} fill="#D9D9D9" fillOpacity={0.5} stroke="#D9D9D9" strokeWidth={2} />
      </Svg>
      {author && (
        <View pointerEvents="none" style={{ position: 'absolute', left: -10, top: (above ? 0 : tailHeight) + 12 }}>
          <AuthorAvatar key={entry.authorId} author={author} size={avatarSize} />
        </View>
      )}
      <View style={[styles.body, { top: above ? 0 : tailHeight, height: bodyHeight },
        ]}>
        <View style={[styles.header, author && styles.authorHeader, compactAuthor && styles.compactAuthorHeader, author && { paddingLeft: avatarSize - 12, minHeight: avatarSize + 12 }]}>
          {author && <Text style={[styles.nickname, compactAuthor && styles.compactNickname]} numberOfLines={1}
            accessibilityRole="header" testID="star-diary-author">{author.nickname}</Text>}
          <Text style={[author ? styles.authorDate : styles.date, compactAuthor && styles.compactAuthorDate]} numberOfLines={1} adjustsFontSizeToFit
            accessibilityRole={author ? undefined : 'header'}>{dateLabel}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="일기 팝업 닫기"
            style={[styles.close, author && styles.authorClose]}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} nestedScrollEnabled testID="star-diary-content">
          {loading ? <Text style={styles.text}>일기를 불러오는 중…</Text> : error ? <View style={{ gap: 8 }}><Text style={styles.text}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="일기 다시 불러오기" onPress={onRetry}><Text style={styles.actionText}>다시 불러오기</Text></Pressable></View> : <Text style={styles.text} selectable>{entry.text}</Text>}
          {!loading && !error && entry.photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.photos} nestedScrollEnabled>
              {entry.photos.map((photo, index) => (
                <Image key={photo.id} source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel={`일기 사진 ${index + 1}`} />
              ))}
            </ScrollView>
          )}
        </ScrollView>
        {(owned || groupId) && !loading && !error && <View style={styles.actions}>
          {groupId && <DiaryHeart key={`${groupId}:${entry.id}`} groupId={groupId} diaryId={entry.id} />}
          {owned && <Pressable onPress={onDecorate} accessibilityRole="button" style={styles.action}>
            <Text style={styles.actionText}>행성 꾸미기</Text>
          </Pressable>}
          {editable && (
            <Pressable onPress={onEdit} accessibilityRole="button" style={styles.action}>
              <Text style={styles.actionText}>수정</Text>
            </Pressable>
          )}
        </View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  popup: { position: 'absolute' },
  body: { position: 'absolute', left: 1, right: 1, paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#D9D9D9', minHeight: 54 },
  authorHeader: { minHeight: 66, alignItems: 'flex-end', gap: 8, paddingBottom: 8 },
  nickname: { flexGrow: 1, flexShrink: 1, flexBasis: 0, color: '#FFF', fontFamily: DesignFonts.bold, fontSize: 26, lineHeight: 32 },
  authorDate: { color: '#FFF', fontFamily: DesignFonts.regular, fontSize: 10, lineHeight: 16, maxWidth: '52%', marginBottom: 2 },
  compactAuthorHeader: { flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-end', gap: 0, paddingBottom: 6 },
  compactNickname: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height: 28, fontSize: 21, lineHeight: 28, paddingRight: 20 },
  compactAuthorDate: { alignSelf: 'flex-end', maxWidth: '100%', fontSize: 9, lineHeight: 12, marginBottom: 0 },
  authorClose: { position: 'absolute', top: 0, right: -8, width: 32, height: 32, alignItems: 'center' },
  avatar: { borderWidth: 2, borderColor: '#FFF', backgroundColor: '#000', overflow: 'hidden' },
  avatarPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  date: { color: '#FFF', fontFamily: DesignFonts.regular, fontSize: 21, flex: 1, letterSpacing: -0.8 },
  close: { width: 36, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  closeText: { color: '#EEE', fontSize: 26, lineHeight: 30 },
  scroll: { flex: 1 },
  content: { paddingTop: 14, paddingBottom: 12, gap: 14 },
  text: { color: '#FFF', fontSize: 16, lineHeight: 24 },
  photos: { gap: 10, paddingBottom: 6 },
  photo: { width: 160, height: 120, resizeMode: 'cover' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, minHeight: 40 },
  action: { minHeight: 40, justifyContent: 'center' },
  actionText: { color: '#F2F2F2', fontSize: 12 },
});
