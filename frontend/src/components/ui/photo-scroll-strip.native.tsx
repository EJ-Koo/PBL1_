import type { ReactNode } from 'react';
import { ScrollView } from '@/components/app-scroll-view';
export function PhotoScrollStrip({ children, height, gap }: {
  children: ReactNode; height: number; gap: number; scale: number;
}) {
  return <ScrollView horizontal nestedScrollEnabled directionalLockEnabled indicatorStyle="white"
    showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled"
    accessibilityLabel="일기 첨부 사진 목록" testID="diary-photo-scroll"
    style={{ height: height + 10, flexGrow: 0 }} contentContainerStyle={{ gap, paddingBottom: 10 }}>
    {children}
  </ScrollView>;
}
