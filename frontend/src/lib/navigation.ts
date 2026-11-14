import { router } from 'expo-router';

/**
 * router.back()은 이전 화면(히스토리)이 없을 때(예: 웹에서 /write를 새로고침한 경우)
 * "GO_BACK 액션을 처리할 네비게이터가 없다"는 에러를 던진다.
 * 돌아갈 곳이 없으면 홈으로 이동시켜서 항상 안전하게 뒤로가기가 동작하게 한다.
 */
export function goBackSafe() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}
