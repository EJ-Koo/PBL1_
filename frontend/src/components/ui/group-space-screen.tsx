import { useLanguage } from '@/lib/language';
import type { ReactNode } from 'react';
import { ScrollView } from '@/components/app-scroll-view';
import { GroupProfileControl } from './group-profile-control';
import { Text } from '@/components/app-text';
import { Image } from 'expo-image';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { PlanetFieldPreview } from '@/components/universe-scene';
import type { DiaryEntry } from '@/store/diary-context';

import { GroupMemberStars } from './group-member-stars';
import type { MemberStar } from '@/lib/group-attendance';

import { GroupAddIcon, GroupCardFrame, GroupHeaderFrame, GroupLabelFrame } from './group-decoration';

import { DesignColors, DesignFonts, DesignPaint } from '@/constants/ui-design';
import { useFontScale } from '@/hooks/use-font-scale';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

// 서버 데이터(ApiGroup)를 index.tsx에서 이 뷰모델로 매핑해서 넘긴다.
type GroupData = {
  id: string;
  name: string;
  stars: DiaryEntry[];
  members: MemberStar[];
};

type Props = {
  scale: number;
  groups: GroupData[];
  onSelectGroup: (group: GroupData) => void;
  onAddGroup: () => void;
  onJoinByCode: () => void;
  profileControl?: ReactNode;
};

// 카드 고정 높이(fffju는 멤버 출석 수에 따라 가변이었으나, 서버에 교차 출석 데이터가 없어 고정).
const CARD_HEIGHT = 249;

function GroupPreview({ stars }: { stars: DiaryEntry[] }) {
  return (
    <>
      <Image
        source={require('../../../assets/images/night-sky.png')}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <PlanetFieldPreview entries={stars} />
      </View>
    </>
  );
}

export function GroupSpaceScreen({ scale, groups, onSelectGroup, onAddGroup, onJoinByCode, profileControl }: Props) {
  const { t } = useLanguage();
  const { headerTop, bottomSpace, pageLeft, pageWidth, pagePadding, pageGap, innerWidth, groupCardWidth } = useResponsiveLayout();
  const fontScale = useFontScale();
  const cardWidth = groupCardWidth;
  const cardScale = cardWidth / 362;

  return (
    <View style={styles.screen}>
      <ScrollView style={{ flex: 1, marginBottom: bottomSpace }}
        showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ width: pageWidth, marginLeft: pageLeft, paddingHorizontal: pagePadding,
          paddingTop: headerTop, paddingBottom: 24 * scale }}>
        <View style={{ width: innerWidth, marginBottom: 24 * scale }}>
          <View style={{ height: 63 * scale }}>
            <GroupHeaderFrame scale={scale} width={innerWidth} />{profileControl ?? <GroupProfileControl scale={scale} />}
            <Text numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header" style={[styles.positioned, styles.text, {
              left: 18 * scale, top: 14 * scale, maxWidth: innerWidth - 92 * scale, fontFamily: DesignFonts.bold, fontSize: 28 * scale, lineHeight: 36 * scale,
            }]}>OUR SPACE</Text>
          </View>
          <Text style={[styles.text, { fontSize: Math.max(12, 13 * scale), lineHeight: Math.max(20, 20 * scale), marginTop: 10 * scale, paddingHorizontal: 18 * scale, flexShrink: 1 }]}>
            {t("별일을 함께 나누는 우리의 우주")}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start',
          justifyContent: innerWidth < 640 ? 'center' : 'flex-start', gap: pageGap }}>
          {groups.map((group, i) => {
            const s = cardScale;
            const first = i === 0;
            const allKnown = group.members.length > 0 && group.members.every((member) => member.known);
            const footerTextHeight = Math.max(16, 13 * s) * (allKnown ? 2 : 3);
            const nameSize = Math.max(16, 20 * s);
            const nameLineHeight = Math.max(24, 28 * s);
            // Reserve enough footer space even for a 24-character name at enlarged text settings.
            const nameLines = Math.max(1, Math.ceil(Array.from(group.name).length * nameSize * fontScale / (171 * s)));
            const nameHeight = nameLines * nameLineHeight * fontScale + 4;
            const cardHeight = Math.max(CARD_HEIGHT, 207 + Math.ceil(group.members.length / 6) * 22 + footerTextHeight / s + 8, 208 + nameHeight / s + 8);
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
                  <GroupPreview stars={group.stars} />
                </View>
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <GroupLabelFrame scale={s} first={first} height={cardHeight} />
                </View>
                <Text style={[styles.positioned, styles.groupName, {
                  left: (first ? 20 : 19) * s, top: 208 * s, width: 171 * s, minHeight: nameHeight,
                  fontSize: nameSize, lineHeight: nameLineHeight,
                }]}>{group.name}</Text>
                <View pointerEvents="none" style={{ position: 'absolute', left: 222 * s, top: 205 * s }}>
                  <GroupMemberStars members={group.members} scale={s} readable />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          accessibilityLabel={t("그룹 추가")}
          onPress={onAddGroup}
          style={{ alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginTop: 33 * scale, width: Math.max(44, 44 * scale), height: Math.max(44, 44 * scale) }}>
          <GroupAddIcon scale={scale} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel={t("코드로 참여")}
          onPress={onJoinByCode}
          style={{ alignSelf: 'center', marginTop: 14 * scale, paddingHorizontal: 18 * scale, paddingVertical: 8 * scale }}>
          <Text style={[styles.joinByCode, { fontSize: 14 * scale }]}>{t("코드로 참여")}</Text>
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
