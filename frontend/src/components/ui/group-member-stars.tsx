import { Text, View } from 'react-native';

import { SpaceIcon } from './space-ui';

import { DesignFonts } from '@/constants/ui-design';
import type { GroupMember } from '@/lib/journal';

export function GroupMemberStars({ members, scale, dark = false }: {
  members: (GroupMember & { completed: boolean })[]; scale: number; dark?: boolean;
}) {
  const completed = members.filter((member) => member.completed).length;
  return (
    <View accessibilityLabel={`오늘 ${members.length}명 중 ${completed}명 작성`} style={{ width: 110 * scale }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 * scale }}>
        {members.map((member) => (
          <View key={member.id} accessible accessibilityLabel={`${member.name}, ${member.completed ? '오늘 작성 완료' : '오늘 아직 작성하지 않음'}`}>
            <SpaceIcon kind="star" size={14 * scale} color={member.completed ? member.color : dark ? '#656e7a' : '#bfc4cc'} />
          </View>
        ))}
      </View>
      <Text style={{ fontFamily: DesignFonts.regular, color: dark ? '#bbc4d0' : '#252b35', fontSize: 9 * scale, lineHeight: 13 * scale, marginTop: 3 * scale }}>
        오늘 {completed}/{members.length}명
      </Text>
    </View>
  );
}
