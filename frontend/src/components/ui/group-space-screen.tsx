import { Image } from 'expo-image';
import { useId } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { GroupMemberStars } from './group-member-stars';
import type { MemberStar } from '@/lib/group-attendance';

import { GroupAddIcon, GroupCardFrame, GroupHeaderFrame, GroupLabelFrame } from './group-decoration';

import { DesignColors, DesignFonts, DesignPaint, GroupStarGlowStops } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type PreviewStar = {
  color: string;
  size: number;
  previewX?: string;
  previewY?: string;
};

// 서버 데이터(ApiGroup)를 index.tsx에서 이 뷰모델로 매핑해서 넘긴다.
type GroupData = {
  id: string;
  name: string;
  stars: PreviewStar[];
  members: MemberStar[];
};

type Props = {
  scale: number;
  groups: GroupData[];
  onSelectGroup: (group: GroupData) => void;
  onAddGroup: () => void;
  onJoinByCode: () => void;
};

// 카드 고정 높이(fffju는 멤버 출석 수에 따라 가변이었으나, 서버에 교차 출석 데이터가 없어 고정).
const CARD_HEIGHT = 249;

function GroupPreview({ stars, scale }: { stars: PreviewStar[]; scale: number }) {
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <>
      <Image
        source={require('../../../assets/images/night-sky.png')}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={329 * scale} height={186 * scale} viewBox="0 0 329 186" pointerEvents="none">
          <Defs>
            {stars.map((star, i) => (
              <RadialGradient key={i} id={`${gradientId}-${i}`} cx="50%" cy="50%" r="50%">
                {GroupStarGlowStops.map((stop) => (
                  <Stop key={stop.offset} offset={stop.offset} stopColor={star.color} stopOpacity={stop.opacity} />
                ))}
              </RadialGradient>
            ))}
          </Defs>
          {stars.map((star, i) => (
            <Circle
              key={i}
              cx={star.previewX || `${25 + ((i * 30) % 55)}%`}
              cy={star.previewY || `${30 + ((i * 25) % 50)}%`}
              r={(star.size / 0.36) * 23}
              fill={`url(#${gradientId}-${i})`}
            />
          ))}
        </Svg>
      </View>
    </>
  );
}

export function GroupSpaceScreen({ scale, groups, onSelectGroup, onAddGroup, onJoinByCode }: Props) {
  const { headerTop, bottomSpace, contentLeft, gridLeft, gridWidth } = useResponsiveLayout();
  const gap = 16 * scale;
  const innerWidth = gridWidth - 32 * scale;
  const columns = Math.max(1, Math.min(3, Math.floor((innerWidth + gap) / (320 + gap))));
  const cardWidth = Math.min(362 * scale, (innerWidth - gap * (columns - 1)) / columns);
  const cardScale = cardWidth / 362;

  return (
    <View style={styles.screen}>
      <View style={[styles.positioned, { left: contentLeft + 16 * scale, top: headerTop, width: 363 * scale, height: 63 * scale }]}>
        <GroupHeaderFrame scale={scale} />
        <Text style={[styles.positioned, styles.text, {
          left: 18 * scale, top: 14 * scale, width: 176 * scale, height: 38 * scale,
          fontSize: 28 * scale, lineHeight: 36 * scale,
        }]}>OUR SPACE</Text>
        <Text style={[styles.positioned, styles.text, {
          left: 203.5 * scale, top: 39 * scale, width: 158 * scale, height: 15 * scale,
          fontSize: 9.5 * scale, lineHeight: 13 * scale,
        }]}>별일을 함께 나누는 우리의 우주</Text>
      </View>

      <ScrollView
        style={[styles.positioned, { left: gridLeft, top: headerTop + 86 * scale, width: gridWidth, bottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingHorizontal: 16 * scale, paddingBottom: 24 * scale }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', gap }}>
          {groups.map((group, i) => {
            const s = cardScale;
            const first = i === 0;
            const cardHeight = Math.max(CARD_HEIGHT, 207 + Math.ceil(group.members.length / 6) * 22 + 24);
            return (
              <TouchableOpacity
                key={group.id}
                activeOpacity={0.85}
                accessibilityLabel={group.name}
                onPress={() => onSelectGroup(group)}
                style={{ width: cardWidth, height: cardHeight * s }}>
                <View style={[styles.positioned, styles.card, {
                  left: 8 * s, top: 5 * s, width: 343 * s, height: (cardHeight - 6) * s, borderRadius: 12 * s,
                }]} />
                <GroupCardFrame scale={s} height={cardHeight} />
                <View style={[styles.positioned, styles.preview, {
                  left: (first ? 16 : 15) * s, top: 11 * s, width: 329 * s, height: 186 * s, borderRadius: 11 * s,
                }]}>
                  <GroupPreview stars={group.stars} scale={s} />
                </View>
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <GroupLabelFrame scale={s} first={first} height={cardHeight} />
                </View>
                <Text numberOfLines={1} style={[styles.positioned, styles.groupName, {
                  left: (first ? 20 : 19) * s, top: 208 * s, width: 171 * s, height: 30 * s,
                  fontSize: 20 * s, lineHeight: 28 * s,
                }]}>{group.name}</Text>
                <View pointerEvents="none" style={{ position: 'absolute', left: 222 * s, top: 205 * s }}>
                  <GroupMemberStars members={group.members} scale={s} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          accessibilityLabel="그룹 추가"
          onPress={onAddGroup}
          style={{ alignSelf: 'center', marginTop: 33 * scale, width: 44 * scale, height: 44 * scale }}>
          <GroupAddIcon scale={scale} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="코드로 참여"
          onPress={onJoinByCode}
          style={{ alignSelf: 'center', marginTop: 14 * scale, paddingHorizontal: 18 * scale, paddingVertical: 8 * scale }}>
          <Text style={[styles.joinByCode, { fontSize: 14 * scale }]}>코드로 참여</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DesignPaint.background },
  positioned: { position: 'absolute' },
  text: { color: DesignPaint.ink, fontFamily: DesignFonts.regular, includeFontPadding: false },
  card: { backgroundColor: DesignPaint.groupCard },
  preview: { overflow: 'hidden', backgroundColor: DesignPaint.background },
  groupName: { color: DesignColors.black, fontFamily: DesignFonts.bold, fontWeight: '700', includeFontPadding: false },
  joinByCode: { color: DesignPaint.ink, fontFamily: DesignFonts.bold, fontWeight: '700', textDecorationLine: 'underline', opacity: 0.7 },
});
