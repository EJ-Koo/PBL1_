// 일기 검색 화면 경로(/search). 메뉴의 "일기 검색"에서 열린다.
// 독립 화면으로 두어서, 결과 → 행성 상세 → 뒤로 가기 하면 이 화면(검색어·결과 유지)으로 돌아온다.
import { useEffect } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { SearchScreen } from '@/components/search-screen';
import { goBackSafe } from '@/lib/navigation';
import { useDiary } from '@/store/diary-context';

export default function SearchRoute() {
  const { isLoggedIn } = useDiary();

  // 웹에서 /search를 새로고침하면 로그인 정보가 사라지므로 로그인 화면으로 보낸다(다른 화면과 동일).
  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return <View style={{ flex: 1, backgroundColor: '#05050A' }} />;
  }

  return (
    <SearchScreen onBack={goBackSafe} onOpenEntry={(id) => router.push(`/planet/${id}`)} />
  );
}
