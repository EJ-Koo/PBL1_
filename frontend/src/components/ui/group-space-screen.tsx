import { Image } from 'expo-image';
import { useId } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { GroupAddIcon, GroupCardFrame, GroupHeaderFrame, GroupLabelFrame } from './group-decoration';

import { DesignColors, DesignFonts, DesignPaint, GroupStarGlowStops } from '@/constants/ui-design';

type PreviewStar = {
  color: string;
  size: number;
  previewX?: string;
  previewY?: string;
};

type GroupData = {
  id: string;
  name: string;
  stars: PreviewStar[];
};

type Props = {
  scale: number;
  groups: GroupData[];
  onSelectGroup: (group: GroupData) => void;
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
      {/* [MODIFIED 2026-11-05] 웹에서는 위치 지정된(absolute) 배경 이미지가 일반 배치된 Svg를 덮어서 별이 안 보였다.
          Svg도 absolute로 감싸서, 나중에 그린 별이 이미지 위에 오도록 한다. */}
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

export function GroupSpaceScreen({ scale, groups, onSelectGroup, onAddGroup }: Props) {
  const insets = useSafeAreaInsets();
  const headerTop = Math.max(55 * scale, insets.top - 19 * scale);
  const bottomSpace = Math.max(34 * scale, insets.bottom) + 30 * scale;

  return (
    <View style={styles.screen}>
      <View style={[styles.positioned, { left: insets.left + 16 * scale, top: headerTop, width: 363 * scale, height: 63 * scale }]}>
        <GroupHeaderFrame scale={scale} />
        <Text style={[styles.positioned, styles.text, {
          left: 18 * scale, top: 14 * scale, width: 176 * scale, height: 38 * scale,
          fontSize: 28 * scale, lineHeight: 36 * scale,
        }]}>OUR SPACE</Text>
        <Text style={[styles.positioned, styles.text, {
          left: 203.5 * scale, top: 39 * scale, width: 158 * scale, height: 15 * scale,
          fontSize: 9.5 * scale, lineHeight: 13 * scale,
        }]}>[GROUP_NETWORK_CONNECTED]</Text>
      </View>

      <ScrollView
        style={[styles.positioned, { left: insets.left, top: headerTop + 86 * scale, width: 393 * scale, bottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: 66 * scale }}>
        <View style={{ gap: 5 * scale }}>
          {groups.map((group, i) => {
            const first = i === 0;
            return (
              <TouchableOpacity
                key={group.id}
                activeOpacity={0.85}
                onPress={() => onSelectGroup(group)}
                style={{ marginLeft: (first ? 17 : 16) * scale, width: 362 * scale, height: 249 * scale }}>
                <View style={[styles.positioned, styles.card, {
                  left: 8 * scale, top: 5 * scale, width: 343 * scale, height: 243 * scale, borderRadius: 12 * scale,
                }]} />
                <GroupCardFrame scale={scale} />
                <View style={[styles.positioned, styles.preview, {
                  left: (first ? 16 : 15) * scale, top: 11 * scale, width: 329 * scale, height: 186 * scale, borderRadius: 11 * scale,
                }]}>
                  <GroupPreview stars={group.stars} scale={scale} />
                </View>
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <GroupLabelFrame scale={scale} first={first} />
                </View>
                <Text numberOfLines={1} style={[styles.positioned, styles.groupName, {
                  left: (first ? 20 : 19) * scale, top: 208 * scale, width: 171 * scale, height: 30 * scale,
                  fontSize: 20 * scale, lineHeight: 28 * scale,
                }]}>{group.name}</Text>
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
