import type { DiaryTopic } from './special-planet';

/** Missing API fields differ from saved diaries without a topic. Never guess either. */
export function groupTopicHealth(entries: readonly {topic?: DiaryTopic | null; topicAvailable?: boolean}[]) {
  const classified = entries.filter(entry => entry.topic != null).length;
  const missing = entries.filter(entry => entry.topicAvailable === false).length;
  return {
    classified, missing,
    emptyText: missing > 0 ? '공유된 별의 주제 정보를 불러오지 못했어요' : entries.length ? '이 주제로 분류된 공유 일기가 없어요' : '아직 공유된 별이 없어요',
    message: missing > 0
      ? `공유된 별 ${entries.length}개 중 ${missing}개의 주제 정보를 받지 못했어요. 잠시 후 다시 불러와주세요.`
      : `공유된 별 ${entries.length}개 · 주제 확인 ${classified}개.${classified < entries.length ? ` 주제가 없는 별 ${entries.length - classified}개는 집계에서 제외돼요.` : ''}`,
  };
}
