import { Image } from 'expo-image';
import { useId } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { GroupMemberStars } from './group-member-stars';
import { getGroupAttendance, type Diary, type Group } from '@/lib/journal';

import { GroupAddIcon, GroupCardFrame, GroupHeaderFrame, GroupLabelFrame } from './group-decoration';

import { DesignColors, DesignFonts, DesignPaint, GroupStarGlowStops } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type PreviewStar = {
  color: string;
  size: number;
  previewX?: string;
  previewY?: string;
};

type Props = {
  scale: number;
  groups: Group[];
  diaries: Diary[];
  today: string;
  onSelectGroup: (group: Group) => void;
  onAddGroup: () => void;
};

function GroupPreview({ stars, scale }: { stars: PreviewStar[]; scale: number }) {
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <>
      <Image
        source={require('../../../assets/images/night-sky.png')}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
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
    </>
  );
}

export function GroupSpaceScreen({ scale, groups, diaries, today, onSelectGroup, onAddGroup }: Props) {
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
            const scale = cardScale;
            const first = i === 0;
            const members = getGroupAttendance(group, diaries, today);
            const cardHeight = 201 + Math.max(48, Math.ceil(members.length / 6) * 18 + 24);
            return (
              <TouchableOpacity
                key={group.id}
                activeOpacity={0.85}
                accessibilityLabel={`${group.name}, 오늘 ${members.filter((member) => member.completed).length}/${members.length}명 작성`}
                onPress={() => onSelectGroup(group)}
                style={{ width: cardWidth, height: cardHeight * scale }}>
                <View style={[styles.positioned, styles.card, {
                  left: 8 * scale, top: 5 * scale, width: 343 * scale, height: (cardHeight - 6) * scale, borderRadius: 12 * scale,
                }]} />
                <GroupCardFrame scale={scale} height={cardHeight} />
                <View style={[styles.positioned, styles.preview, {
                  left: (first ? 16 : 15) * scale, top: 11 * scale, width: 329 * scale, height: 186 * scale, borderRadius: 11 * scale,
                }]}>
                  <GroupPreview stars={group.stars} scale={scale} />
                </View>
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <GroupLabelFrame scale={scale} first={first} height={cardHeight} />
                </View>
                <Text numberOfLines={1} style={[styles.positioned, styles.groupName, {
                  left: (first ? 20 : 19) * scale, top: 208 * scale, width: 171 * scale, height: 30 * scale,
                  fontSize: 20 * scale, lineHeight: 28 * scale,
                }]}>{group.name}</Text>
                <View pointerEvents="none" style={[styles.positioned, { left: 234 * scale, top: 207 * scale }]}>
                  <GroupMemberStars members={members} scale={scale} />
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
});
