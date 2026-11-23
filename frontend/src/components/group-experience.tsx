import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ScrollView } from '@/components/app-scroll-view';
import { Text } from '@/components/app-text';
import { DiaryUniverse } from '@/components/diary-universe';
import { GroupChatDock } from '@/components/group-chat-dock';
import { QuestFrame } from '@/components/ui/design-decoration';
import { Avatar } from '@/components/ui/group-profile-control';
import { GroupPanelFrame, GroupUniverseHeaderFrame, GroupUniverseIcon } from '@/components/ui/group-universe-decoration';
import { SpaceButton } from '@/components/ui/space-ui';
import { DesignFonts } from '@/constants/ui-design';
import { useGroupSocial } from '@/hooks/use-group-social';
import { useFontScale } from '@/hooks/use-font-scale';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { ApiGroup } from '@/lib/api';
import { authSession } from '@/lib/auth-session';
import { disableGroupPush, enableGroupPush, inspectGroupPush } from '@/lib/group-push';
import { markDiaryRead } from '@/lib/group-social-api';
import { useLanguage } from '@/lib/language';
import { confirmChoice, showNotice } from '@/lib/notice';
import { savedPush } from '@/lib/push-device';
import { useDiary, type DiaryEntry } from '@/store/diary-context';

type Props = {
  group: ApiGroup;
  entries: DiaryEntry[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onBack: () => void;
  onLeave: () => Promise<void>;
  leaving: boolean;
  selection: { id: string | null; onChange: (id: string | null) => void };
  initialChat?: boolean;
};

export function GroupExperience({ group, entries, loading, error, onReload, onBack, onLeave, leaving, selection, initialChat = false }: Props) {
  const { t } = useLanguage();
  const { accessToken, profile } = useDiary();
  const revision = authSession.getRevision();
  const { height } = useWindowDimensions();
  const layout = useResponsiveLayout();
  const s = layout.scale;
  const [chatExpanded, setChatExpanded] = useState(initialChat);
  const chatOpen=chatExpanded&&!selection.id;
  const [checkingPush,setCheckingPush]=useState(false);
  const [panel, setPanel] = useState<'members' | 'quest' | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const { data, error: socialError, refresh, forgetUnread } = useGroupSocial(group.id);
  const lastReload = useRef('');
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void savedPush().then(saved => { if (active) setPushEnabled(saved?.user_id === profile?.user_id); });
    return () => { active = false; };
  }, [profile?.user_id]);
  const currentIds = entries.map(item => item.id).sort().join(',');
  const serverIds = data?.diary_ids?.slice().sort().join(',');
  useEffect(() => {
    if (serverIds === undefined || serverIds === currentIds || loading || lastReload.current === serverIds) return;
    lastReload.current = serverIds;
    onReload();
  }, [serverIds, currentIds, loading, onReload]);
  useEffect(() => {
    if (!panel) return;
    if (Platform.OS === 'web') {
      const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(null); };
      window.addEventListener('keydown', close);
      return () => window.removeEventListener('keydown', close);
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setPanel(null); return true; });
    return () => subscription.remove();
  }, [panel]);

  const read = useCallback(async (id: string) => {
    if (!accessToken) return;
    try {
      await markDiaryRead(accessToken, group.id, id);
      if (alive.current && revision === authSession.getRevision()) { forgetUnread(id); setReadError(null); }
    } catch {
      if (alive.current && revision === authSession.getRevision()) setReadError(t('읽음 표시를 저장하지 못했어요. 별을 다시 열어주세요.'));
    }
  }, [accessToken, group.id, revision, forgetUnread, t]);

  const push = async (reconnect=false) => {
    if (pushBusy || !accessToken || !profile?.user_id) return;
    setPushBusy(true);
    try {
      if (pushEnabled&&!reconnect) await disableGroupPush(accessToken, profile.user_id);
      else await enableGroupPush(accessToken, profile.user_id);
      if (alive.current && revision === authSession.getRevision()) setPushEnabled(reconnect||!pushEnabled);
    } catch (reason) {
      if (alive.current && revision === authSession.getRevision()) showNotice(t('그룹 알림'), reason instanceof Error ? reason.message : t('알림을 연결하지 못했어요.'));
    } finally { if (alive.current) setPushBusy(false); }
  };

 const checkPush=async()=>{
  if(checkingPush||!accessToken||!profile?.user_id)return;setCheckingPush(true);
  try{
   const status=await inspectGroupPush(accessToken,profile.user_id);
   if(!alive.current||revision!==authSession.getRevision())return;
   const server=status.server;
   const lines=[t('브라우저/기기 권한: {value}',{value:status.permission}),t('이 기기의 구독: {value}',{value:t(status.subscription?'있음':'없음')}),
    t('서버 등록: {value}',{value:t(server?.registered?'있음':'없음')})];
   if(status.key_matches!==null)lines.push(t('푸시 키 일치: {value}',{value:t(status.key_matches?'일치':'불일치')}));
   if(server)lines.push(t('최근 알림 {count}개 · 대기 {pending} · 처리 중 {sending} · 전달 {sent} · 실패 {failed} · 최대 시도 {attempts}',
    {count:server.recent_notifications,pending:server.pending,sending:server.sending,sent:server.sent,failed:server.failed,attempts:server.max_attempts}));
   if(!status.subscription||!server?.registered||status.key_matches===false)lines.push(t('아래 알림 다시 연결을 누른 뒤 다른 계정으로 새 채팅을 보내주세요.'));
   else if(server.pending>0&&server.max_attempts===0)lines.push(t('worker가 이 기기의 대기열을 처리하지 않았어요. worker의 DB 연결과 실행 로그를 확인해주세요.'));
   else if(server.failed>0||server.pending>0&&server.max_attempts>0)lines.push(t('발송 재시도 또는 실패가 있어요. worker 실행 로그의 Group push failed 코드를 확인해주세요.'));
   else if(server.sent>0)lines.push(t('푸시 서비스에는 전달됐어요. 운영체제 알림 허용과 방해금지 설정을 확인해주세요.'));
   lines.push(t('본인이 보낸 채팅은 본인에게 알림이 오지 않아요. 같은 그룹의 다른 계정으로 새 채팅을 보내 테스트해주세요.'));
   showNotice(t('알림 상태'),lines.join('\n\n'));
  }catch(reason){if(alive.current&&revision===authSession.getRevision())showNotice(t('알림 상태'),reason instanceof Error?reason.message:t('알림 상태를 확인하지 못했어요.'));}
  finally{if(alive.current)setCheckingPush(false);}
 };

  const togglePanel = (next: 'members' | 'quest') => {
    if (panel !== next) selection.onChange(null);
    setPanel(old => old === next ? null : next);
  };
  const members = data?.members ?? group.members.map(item => ({ user_id: item.user_id, nickname: item.nickname ?? t('멤버'), bio: '', avatar_url: null }));
  const fontScale = useFontScale();
  const titleFontSize = Math.max(16, 21 * s);
  const titleWidth = Math.min(layout.chromeWidth - 32 * s, Math.max(200 * s, Array.from(group.name).length * titleFontSize * fontScale + 24 * s));
  const titleLines = Math.max(1, Math.ceil(Array.from(group.name).length * titleFontSize * fontScale / Math.max(1, titleWidth - 16 * s)));
  const titleHeight = titleLines * Math.max(26, 28 * s) * fontScale;
  const headerHeight = titleHeight + 24 * s;
  const controlsTop = layout.headerTop + headerHeight + 9 * s;
  const panelTop = controlsTop + 48 * s;
  const panelWidth = Math.min(236 * s, layout.chromeWidth - 24 * s);
  const chatWidth = Math.min(460, layout.chromeWidth - 68 * s);
  const chatLeft = layout.chromeLeft + (layout.chromeWidth - chatWidth) / 2;
  const chatBottom = layout.navBottom + 24 * s;
  const chatHistoryHeight = Math.max(72, Math.min(176 * s, height * 0.24));
  const panelHeight = Math.max(120, Math.min(488 * s, height - panelTop - chatBottom - 72 * s));

  return <View style={styles.screen} testID="group-experience">
    {/* [2026-11-19] 홈 우주처럼 배경 사진(night-sky.png)을 빼고 단색(#000)+3D 배경 별 한 겹만 보이게 함 */}
    <DiaryUniverse groupId={group.id} sceneKey={`${revision}:group-${group.id}`} entries={entries} backgroundStarScale={1}
      selection={selection} unreadIds={data?.unread_diary_ids ?? []} onDiaryRead={read}
      popupInsets={{ top: controlsTop + 52 * s, bottom: chatBottom + 68 * s + (chatOpen ? chatHistoryHeight : 20*s) }} />
    {(loading || error || entries.length === 0) && <View pointerEvents={error ? 'auto' : 'none'} style={styles.empty}>
      <Text style={styles.text}>{error ?? t(loading ? '그룹의 별을 불러오는 중…' : '아직 이 그룹에 공유된 별이 없어요.')}</Text>
      {error && <SpaceButton label={t('다시 불러오기')} onPress={onReload} />}
    </View>}

    <View pointerEvents="none" style={[styles.titleFrame, { top: layout.headerTop, left: layout.chromeLeft, width: layout.chromeWidth, height: headerHeight }]}>
      <GroupUniverseHeaderFrame width={layout.chromeWidth} scale={s} titleWidth={titleWidth} titleHeight={titleHeight} />
      <Text accessibilityRole="header"
        style={[styles.groupName, { left: (layout.chromeWidth - titleWidth) / 2 + 8 * s, width: titleWidth - 16 * s, top: 3 * s, fontSize: titleFontSize, lineHeight: Math.max(26, 28 * s) }]}>{group.name}</Text>
    </View>
    <View pointerEvents="box-none" style={[styles.controls, { top: controlsTop, left: layout.chromeLeft + 18 * s, width: layout.chromeWidth - 36 * s }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('그룹으로 돌아가기')} onPress={onBack} style={styles.icon}>
        <GroupUniverseIcon kind="back" size={40 * s} />
      </Pressable>
      {panel !== 'members' && <Pressable accessibilityRole="button" accessibilityLabel={t('그룹 퀘스트')}
        accessibilityState={{ expanded: panel === 'quest' }} onPress={() => togglePanel('quest')}
        style={[styles.quest, { left: (layout.chromeWidth - 36 * s) / 2 - 43 * s, width: 86 * s, height: Math.max(44, 38 * s) }]}>
        <QuestFrame scale={s * 1.12} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.questLabel]}>
          <Text style={[styles.questText, { fontSize: 16 * s }]}>Quest</Text>
        </View>
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={t('그룹 멤버 목록')}
        accessibilityState={{ expanded: panel === 'members' }} onPress={() => togglePanel('members')} style={styles.icon}>
        <GroupUniverseIcon kind="members" size={40 * s} />
      </Pressable>
    </View>

    {readError && <Text accessibilityRole="alert" style={[styles.readError, { top: panelTop }]}>{readError}</Text>}
    <GroupChatDock key={group.id} groupId={group.id} bottom={chatBottom} left={chatLeft} width={chatWidth} scale={s}
      unread={data?.chat_unread_count ?? 0} onRead={refresh} initialExpanded={initialChat} expanded={chatOpen} onExpandedChange={expanded=>{if(expanded)selection.onChange(null);setChatExpanded(expanded);}} />

    {panel && <>
      <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel={t('그룹 패널 닫기')} onPress={() => setPanel(null)} />
      <View accessibilityViewIsModal testID={`group-${panel}-panel`} style={[styles.panel, {
        left: panel === 'quest' ? layout.chromeLeft + (layout.chromeWidth - panelWidth) / 2 : layout.chromeLeft + layout.chromeWidth - panelWidth - 10 * s,
        top: panelTop, width: panelWidth, height: panelHeight,
      }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}><GroupPanelFrame /></View>
        <View style={[styles.panelContent, { paddingHorizontal: 20 * s, paddingTop: 18 * s, paddingBottom: 12 * s }]}>
          {panel === 'members' ? <>
            <View style={[styles.code, { paddingBottom: 13 * s }]}>
              <Text selectable accessibilityLabel={t('방 코드')} style={[styles.codeText, { fontSize: 15 * s }]}>{t('코드: {code}', { code: group.invite_code })}</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.memberList} contentContainerStyle={{ paddingBottom: 12 * s }}>
              {members.map((member, index) => <View key={member.user_id} style={[styles.member, index > 0 && styles.memberDivider, { minHeight: 88 * s, gap: 18 * s }]}>
                <Avatar uri={member.avatar_url} size={40 * s} />
                <View style={styles.memberDetails}>
                  <Text style={[styles.memberName, { fontSize: Math.max(16, 16 * s), lineHeight: Math.max(24, 24 * s) }]}>{member.nickname}</Text>
                  <Text style={[styles.bio, { fontSize: Math.max(13, 13 * s), lineHeight: Math.max(20, 20 * s) }]}>{member.bio || t('한줄소개')}</Text>
                </View>
              </View>)}
              {socialError && <Pressable accessibilityRole="button" onPress={refresh}><Text style={styles.warning}>{t('추가 정보를 불러오지 못했어요. 다시 시도')}</Text></Pressable>}
            </ScrollView>
            <View style={styles.panelActions}>
              <SpaceButton label={t(pushBusy ? '연결 중…' : pushEnabled ? '그룹 알림 끄기' : '그룹 알림 받기')}
                onPress={() => void push()} disabled={pushBusy||checkingPush} scale={s} style={styles.notification} />
              {pushEnabled&&<>
                <SpaceButton label={t(checkingPush?'확인 중…':'알림 상태 확인')} onPress={()=>void checkPush()} disabled={pushBusy||checkingPush} scale={s} style={styles.notification}/>
                <SpaceButton label={t('알림 다시 연결')} onPress={()=>void push(true)} disabled={pushBusy||checkingPush} scale={s} style={styles.notification}/>
              </>}
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: leaving }} disabled={leaving} style={styles.leave}
                onPress={() => confirmChoice(t('그룹 나가기'), t('이 그룹의 공유 우주와 채팅에서 나갈까요?'), t('나가기'), () => { void onLeave(); })}>
                <Text style={styles.leaveText}>{t(leaving ? '나가는 중…' : '그룹 나가기')}</Text>
              </Pressable>
            </View>
          </> : <>
            <Text accessibilityRole="header" style={styles.panelTitle}>{t('그룹 퀘스트')}</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.questContent}>
              {data ? <>
                <Text style={styles.text}>{t(data.quest.title)}</Text>
                <Text style={styles.bio}>{t('오늘 그룹 멤버가 각자 일기를 공유하면 완료돼요.')}</Text>
                <View style={styles.track}><View style={[styles.progress, { width: `${data.quest.total ? Math.min(100, data.quest.completed / data.quest.total * 100) : 0}%` }]} /></View>
                <Text style={styles.text}>{t('{completed}/{total}명', { completed: data.quest.completed, total: data.quest.total })}{data.quest.done ? ` · ${t('오늘의 미션 완료')}` : ''}</Text>
                <Text style={styles.muted}>{data.quest.day}</Text>
              </> : socialError
                ? <Pressable accessibilityRole="button" onPress={refresh}><Text style={styles.warning}>{t('퀘스트를 불러오지 못했어요. 다시 시도')}</Text></Pressable>
                : <ActivityIndicator color="#fff" />}
            </ScrollView>
          </>}
        </View>
      </View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  titleFrame: { position: 'absolute' },
  groupName: { position: 'absolute', color: '#fff', fontFamily: DesignFonts.bold, textAlign: 'center', includeFontPadding: false },
  controls: { position: 'absolute', zIndex: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  quest: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  questLabel: { alignItems: 'center', justifyContent: 'center' },
  questText: { color: '#fff', fontFamily: DesignFonts.bold },
  empty: { position: 'absolute', top: '38%', left: 28, right: 28, alignItems: 'center', gap: 12 },
  text: { color: '#f4f4fa', fontSize: 13, lineHeight: 20 },
  muted: { color: '#d1d1d8', fontSize: 11 },
  readError: { position: 'absolute', left: 24, right: 24, color: '#ffd3df', fontSize: 11 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  panel: { position: 'absolute', zIndex: 6 },
  panelContent: { flex: 1 },
  code: { alignItems: 'center', borderBottomWidth: 1, borderColor: '#ffffff60' },
  codeText: { color: '#fff', fontFamily: DesignFonts.regular, textAlign: 'center' },
  memberList: { flex: 1 },
  member: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  memberDivider: { borderTopWidth: 1, borderColor: '#ffffff60' },
  memberDetails: { flex: 1, minWidth: 0, gap: 7 },
  memberName: { color: '#fff' },
  bio: { color: '#f0f0f4', fontSize: 13, lineHeight: 20 },
  warning: { color: '#ffe2d5', fontSize: 11, lineHeight: 18, paddingVertical: 8 },
  panelActions: { paddingHorizontal: 4 },
  notification: { borderColor: '#ffffffa0', backgroundColor: '#ffffff0a' },
  leave: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  leaveText: { color: '#c5c5ce', fontSize: 10 },
  panelTitle: { color: '#fff', fontSize: 17, fontFamily: DesignFonts.bold, textAlign: 'center', paddingBottom: 18, borderBottomWidth: 1, borderColor: '#ffffff60' },
  questContent: { gap: 18, paddingTop: 24, paddingBottom: 12 },
  track: { height: 6, backgroundColor: '#ffffff30', borderRadius: 3, overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: '#e7efff' },
});
