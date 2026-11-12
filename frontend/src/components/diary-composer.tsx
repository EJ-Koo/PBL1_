// [NEW FILE 2026-11-05] 일기 작성·수정 화면.
// 외관은 fffju의 DiaryWriteScreen(사진 최대 5장, 비공개/그룹 선택)을 그대로 쓰고,
// 저장은 서버(useDiary의 addEntry/updateEntry)로 한다. 기기 저장(useJournal)은 쓰지 않는다.
//  - 새 일기: 홈 화면의 왼쪽(일기) 탭
//  - 수정: 행성 상세의 "수정" → /write?id=... (작성한 날에만)
import { useEffect, useRef, useState } from 'react';

import { DiaryWriteScreen } from '@/components/ui/diary-write-screen';
import { showMessage } from '@/lib/feedback';
import { MAX_PHOTOS } from '@/lib/journal';
import { pickPhotos, recoverPendingPhotos } from '@/lib/photos';
import { DIARY_TOPICS, SHOW_TOPIC_PICKER, type DiaryTopic } from '@/lib/special-planet';
import { useDiary, type DiaryPhoto, type Visibility } from '@/store/diary-context';

type Props = {
  scale: number;
  // 있으면 그 일기를 수정, 없으면 새 일기
  editId?: string;
  onBack: () => void;
  onSaved: () => void;
};

function dateLabelOf(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

export function DiaryComposer({ scale, editId, onBack, onSaved }: Props) {
  const { addEntry, updateEntry, getEntry, groups, userEmail } = useDiary();
  const editing = editId ? getEntry(editId) : undefined;

  const [text, setText] = useState(editing?.text ?? '');
  const [photos, setPhotos] = useState<DiaryPhoto[]>(editing?.photos ?? []);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  // 오늘의 주제는 선택 사항(안 골라도 저장). AI가 특수 행성을 고를 때 보조 정보로만 쓴다.
  const [topic, setTopic] = useState<DiaryTopic | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const busy = useRef(false);

  // 안드로이드는 사진 선택창이 열린 사이 앱이 다시 만들어질 수 있어서, 고르던 사진을 복구한다 (fffju 동작 유지).
  useEffect(() => {
    recoverPendingPhotos(MAX_PHOTOS)
      .then((recovered) => {
        if (recovered.length) setPhotos((prev) => [...prev, ...recovered].slice(0, MAX_PHOTOS));
      })
      .catch(() => {});
  }, []);

  const addPhotos = async () => {
    if (busy.current || photos.length >= MAX_PHOTOS) return;
    busy.current = true;
    setPhotoBusy(true);
    try {
      const picked = await pickPhotos(MAX_PHOTOS - photos.length);
      if (picked.length) setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
    } catch (cause) {
      showMessage('확인해주세요', cause instanceof Error ? cause.message : '다시 시도해주세요.');
    } finally {
      busy.current = false;
      setPhotoBusy(false);
    }
  };

  const submit = async () => {
    if (busy.current) return;
    const content = text.trim();
    if (!content) {
      showMessage('확인해주세요', '오늘의 이야기를 입력해주세요.');
      return;
    }
    busy.current = true;
    setSaving(true);
    // fffju 디자인에는 공개범위 3종 UI가 없고 "비공개 ↔ 그룹 공유"만 있다.
    // 그룹을 하나도 안 고르면 private, 하나라도 고르면 friends(공유)로 저장한다. 수정할 때는 기존 값 유지.
    const visibility: Visibility = editing
      ? editing.visibility
      : groupIds.length > 0 ? 'friends' : 'private';
    const result = editing
      ? await updateEntry(editing.id, content, photos, visibility)
      : await addEntry(content, photos, visibility, groupIds, topic);
    busy.current = false;
    setSaving(false);
    if (!result.ok) {
      showMessage('저장 실패', result.error);
      return;
    }
    if (!editing) {
      setText('');
      setPhotos([]);
      setGroupIds([]);
      setTopic(null);
    }
    onSaved();
  };

  return (
    <DiaryWriteScreen
      scale={scale}
      diaryText={text}
      onChangeText={setText}
      dateLabel={dateLabelOf(editing?.createdAt ?? openedAt)}
      authorLabel={userEmail ? userEmail.split('@')[0] : '나'}
      photoCountLabel={`${photos.length}/${MAX_PHOTOS}`}
      photos={photos}
      photoBusy={photoBusy}
      saving={saving}
      onAddPhotos={addPhotos}
      onRemovePhoto={(id) => setPhotos((prev) => prev.filter((p) => p.id !== id))}
      // 수정할 때는 공유 그룹을 바꿀 수 없어서(서버 미지원) 그룹 선택지를 숨긴다.
      groups={editing ? [] : groups.map((g) => ({ id: g.id, name: g.name }))}
      selectedGroupIds={groupIds}
      onSelectPrivate={() => setGroupIds([])}
      onToggleGroup={(id) =>
        setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]))
      }
      onBack={onBack}
      onSubmit={submit}
      // 수정할 때는 주제를 바꾸지 않는다(서버에 주제 수정 경로 없음).
      // [2026-11-12] 주제는 특수 효과 자동 선택에만 쓰였다 → 효과를 사용자가 고르게 되어 숨김(SHOW_TOPIC_PICKER)
      topics={editing || !SHOW_TOPIC_PICKER ? undefined : DIARY_TOPICS}
      selectedTopic={topic}
      onToggleTopic={(id) => setTopic((prev) => (prev === id ? null : (id as DiaryTopic)))}
    />
  );
}
