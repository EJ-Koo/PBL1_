import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ScrollView } from '@/components/app-scroll-view';
import { Text } from '@/components/app-text';
import { DiaryUniverse } from '@/components/diary-universe';
import { GroupChatDock } from '@/components/group-chat-dock';
import { GroupQuestDrawer } from '@/components/group-quest-drawer';
import { GroupMembersPanel } from '@/components/ui/group-universe-panels';
import { GroupMemberRecordsPanel } from '@/components/ui/group-member-records-panel';
import { groupMemberEntries, memberUnreadIds } from '@/lib/group-member-records';
import { GroupUniverseHeader } from '@/components/ui/group-universe-header';
import { groupUniverseLayout } from '@/lib/group-universe-layout';
import { SpaceButton } from '@/components/ui/space-ui';
import { useGroupSocial } from '@/hooks/use-group-social';
import { useGroupConstellation } from '@/hooks/use-group-constellation';
import { groupTopicHealth } from '@/lib/group-topic-health';
import { ConstellationModeToggle, ConstellationPanel } from '@/components/ui/constellation-panel';
import { TOPIC_CONCEPTS } from '@/lib/constellation';
import type { ConstellationRequest } from '@/components/universe-scene';
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
  const { width, height } = useWindowDimensions();
  const layout = useResponsiveLayout();
  const s = layout.scale;
  const [memberFilter,setMemberFilter]=useState<{id:string;name:string}|null>(null);
  const [centeredDiaryId,setCenteredDiaryId]=useState<string|null>(null);
  const visibleEntries=useMemo(()=>groupMemberEntries(entries,memberFilter?.id??null),[entries,memberFilter]);
  const constellation = useGroupConstellation(visibleEntries,memberFilter?'member':'group');
  const topicHealth = groupTopicHealth(visibleEntries);
  const authorInfoMissing=entries.some(entry=>entry.authorAvailable===false);
  const [chatExpanded, setChatExpanded] = useState(initialChat);
  const chatOpen=chatExpanded&&!selection.id;
  const [checkingPush,setCheckingPush]=useState(false);
  const [panel, setPanel] = useState<'members' | 'quest' | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [clearingHighlights, setClearingHighlights] = useState(false);
  const clearHighlightsLock = useRef(false);
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

  const unreadIds = memberUnreadIds(visibleEntries,data?.unread_diary_ids??[]);
  const clearHighlights = async () => {
    if (!accessToken || clearHighlightsLock.current || unreadIds.length === 0) return;
    clearHighlightsLock.current = true;
    setClearingHighlights(true);
    setReadError(null);
    const isCurrent = () => alive.current && revision === authSession.getRevision();
    let failed = false;
    try {
      for (let offset = 0; offset < unreadIds.length && isCurrent(); offset += 5) {
        const results = await Promise.allSettled(unreadIds.slice(offset, offset + 5).map(async id => {
          await markDiaryRead(accessToken, group.id, id);
          if (isCurrent()) forgetUnread(id);
        }));
        if (results.some(result => result.status === 'rejected')) failed = true;
      }
      if (failed && isCurrent()) setReadError(t('일부 새 별 표시를 지우지 못했어요. 다시 눌러주세요.'));
    } finally {
      clearHighlightsLock.current = false;
      if (isCurrent()) setClearingHighlights(false);
    }
  };

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
    if (panel !== next) {selection.onChange(null);setChatExpanded(false);constellation.setEnabled(false);}
    setPanel(old => old === next ? null : next);
  };
  const members = data?.members ?? group.members.map(item => ({ user_id: item.user_id, nickname: item.nickname ?? t('멤버'), bio: '', avatar_url: null }));
  const fontScale = useFontScale();
  const geometry = groupUniverseLayout(layout,fontScale,height,chatOpen);
  const {panelTop,panelWidth,chatWidth,chatLeft,chatBottom,panelHeight,questPanelWidth,toggleBottom,infoBottom,infoWidth,infoLeft}=geometry;
  const recordsTop=panelTop+(memberFilter?64*s:0);
  const constellationInsets = {
    top: Math.min(.4, (recordsTop + 8) / height),
    bottom: Math.min(.6, (layout.wide ? toggleBottom + 44 : infoBottom + constellation.panelHeight + 12) / height),
    left: layout.wide ? Math.min(.5,(infoLeft + infoWidth + 16) / width) : .04,
    right: .04,
  };
  const constellationRequest: ConstellationRequest | null = constellation.enabled && constellation.template && constellation.members.length === constellation.template.points.length
    ? { template:constellation.template,memberIds:constellation.members.map(e=>e.id),color:TOPIC_CONCEPTS[constellation.topic].color,insets:constellationInsets } : null;
  const selectDiary = (id: string | null) => {
    setCenteredDiaryId(null);
    if (id) {setPanel(null);setChatExpanded(false);constellation.setEnabled(false);}
    selection.onChange(id);
  };
  const changeMember=(member:{user_id:string;nickname:string}|null)=>{
    selection.onChange(null);setCenteredDiaryId(null);setPanel(null);setChatExpanded(false);constellation.setEnabled(false);
    setMemberFilter(member?{id:member.user_id,name:member.nickname}:null);
  };
  const openRecord=(id:string)=>{
    selection.onChange(id);setCenteredDiaryId(id);setPanel(null);setChatExpanded(false);constellation.setEnabled(false);
  };
  const showConstellation=(enabled:boolean)=>{
    selection.onChange(null);setCenteredDiaryId(null);setPanel(null);setChatExpanded(false);constellation.setEnabled(enabled);
  };


  return <View style={styles.screen} testID="group-experience">
    {/* [2026-11-19] 홈 우주처럼 배경 사진(night-sky.png)을 빼고 단색(#000)+3D 배경 별 한 겹만 보이게 함 */}
    <DiaryUniverse groupId={group.id} sceneKey={`${revision}:group-${group.id}`} entries={entries} authorFilter={memberFilter?.id??null} backgroundStarScale={1}
      popupAnchorMode={centeredDiaryId===selection.id&&centeredDiaryId!==null?'center':'planet'}
      selection={{id:selection.id,onChange:selectDiary}} unreadIds={unreadIds} onDiaryRead={read}
      constellation={constellationRequest} frontViewRequest={constellation.frontViewRequest}
      topicFilter={constellation.enabled && topicHealth.classified > 0 ? constellation.topic : null}
      popupInsets={{ top: recordsTop + 4 * s, bottom: constellation.enabled ? infoBottom + constellation.panelHeight + 12 : geometry.popupBottom }} />
    {(loading || error || (!memberFilter&&entries.length === 0)) && <View pointerEvents={error ? 'auto' : 'none'} style={styles.empty}>
      <Text style={styles.text}>{error ?? t(loading ? '그룹의 별을 불러오는 중…' : '아직 이 그룹에 공유된 별이 없어요.')}</Text>
      {error && <SpaceButton label={t('다시 불러오기')} onPress={onReload} />}
    </View>}

    <GroupUniverseHeader name={group.name} layout={layout} geometry={geometry} onBack={memberFilter?()=>changeMember(null):onBack}
      onReadAll={()=>void clearHighlights()} onMembers={()=>togglePanel('members')}
      unread={unreadIds.length} busy={clearingHighlights} membersOpen={panel==='members'}/>

    {memberFilter&&!panel&&<View testID="group-member-filter" style={{position:'absolute',top:panelTop,left:layout.chromeLeft+18*s,width:layout.chromeWidth-36*s,minHeight:52*s,flexDirection:'row',alignItems:'center',gap:8*s}}>
      <Text numberOfLines={2} style={{flex:1,color:'#fff',fontSize:Math.max(13,14*s),lineHeight:21*s}}>{t('{name}님의 별 · {count}개',{name:memberFilter.name,count:visibleEntries.length})}</Text>
      <Pressable accessibilityRole="button" onPress={()=>changeMember(null)} style={{minHeight:44,justifyContent:'center',paddingHorizontal:10,borderWidth:1,borderColor:'#ffffff80',borderRadius:6,backgroundColor:'rgba(8,9,16,0.8)'}}>
        <Text style={{color:'#fff',fontSize:12*s,lineHeight:18*s}}>{t('그룹 전체 보기')}</Text>
      </Pressable>
    </View>}

    <View pointerEvents="box-none" style={{position:'absolute',bottom:toggleBottom,left:layout.chromeLeft,width:layout.chromeWidth,alignItems:'center'}}>
      <ConstellationModeToggle scale={s} active={constellation.enabled} universeLabel={memberFilter?t('멤버의 별'):t('그룹 우주')}
        onChange={showConstellation} />
    </View>
    {constellation.enabled && !panel && <ScrollView testID="group-constellation-info" showsVerticalScrollIndicator
      style={{position:'absolute',left:infoLeft,bottom:infoBottom,width:infoWidth,maxHeight:Math.max(80,Math.min(height*.43,360*s,height-recordsTop-infoBottom-12))}}
      onLayout={event=>constellation.setPanelHeight(event.nativeEvent.layout.height)}>
      <ConstellationPanel scale={s} statuses={constellation.statuses} topic={constellation.topic}
        countsAvailable={!(topicHealth.missing>0&&topicHealth.classified===0)}
        templateId={constellation.template?.id??null} members={constellation.members}
        emptyTopicText={topicHealth.emptyText}
        intro={`${memberFilter?t('{name}님이 이 그룹에 공유한 글만 모았어요.',{name:memberFilter.name}):''} 주제를 고르면 해당 주제의 별만 밝게 보여요. 별자리 모양 카드를 누르면 연결선이 나타나요. ${topicHealth.message}`}
        collapsed={constellation.collapsed} onToggleCollapsed={()=>constellation.setCollapsed(!constellation.collapsed)}
        onSelectTopic={topic=>{selection.onChange(null);constellation.selectTopic(topic);}}
        onSelectTemplate={template=>{selection.onChange(null);constellation.selectTemplate(template.id);}}
        onOpenEntry={selectDiary} onFrontView={constellation.front} />
      {visibleEntries.length > topicHealth.classified && <SpaceButton label={loading ? '불러오는 중…' : '주제 다시 불러오기'} onPress={onReload} disabled={loading} scale={s} />}
    </ScrollView>}
    {memberFilter&&!constellation.enabled&&!panel&&!selection.id&&!chatOpen&&!loading&&!error&&<GroupMemberRecordsPanel entries={visibleEntries} name={memberFilter.name}
      left={infoLeft} bottom={infoBottom} width={infoWidth} maxHeight={Math.max(80,Math.min(height*.43,360*s,height-recordsTop-infoBottom-12))} scale={s}
      onOpen={openRecord} onConstellation={()=>showConstellation(true)}/>}

    {readError && <Text accessibilityRole="alert" style={[styles.readError, { top: panelTop }]}>{readError}</Text>}
    <GroupChatDock key={group.id} groupId={group.id} bottom={chatBottom} left={chatLeft} width={chatWidth} scale={s}
      unread={data?.chat_unread_count ?? 0} onRead={refresh} initialExpanded={initialChat} expanded={chatOpen} onExpandedChange={expanded=>{if(expanded){selection.onChange(null);setPanel(null);constellation.setEnabled(false);}setChatExpanded(expanded);}} />

    {panel === 'members' && <>
      <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel={t('그룹 패널 닫기')} onPress={() => setPanel(null)} />
      <GroupMembersPanel left={layout.chromeLeft+layout.chromeWidth-panelWidth-10*s} top={panelTop}
        width={panelWidth} height={panelHeight} scale={s} code={group.invite_code} members={members} error={socialError} onRetry={()=>{refresh();onReload();}}
        onReadMember={changeMember} recordsUnavailable={authorInfoMissing}>
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
      </GroupMembersPanel>
    </>}
    {panel !== 'members' && <GroupQuestDrawer open={panel === 'quest'} scale={s} top={panelTop}
      right={Math.max(0, width - layout.navLeft - layout.navWidth)} width={questPanelWidth} height={panelHeight}
      quest={data?.quest ?? null} error={socialError} onRetry={refresh}
      onToggle={() => togglePanel('quest')} onClose={() => setPanel(null)} />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  empty: { position: 'absolute', top: '38%', left: 28, right: 28, alignItems: 'center', gap: 12 },
  text: { color: '#f4f4fa', fontSize: 13, lineHeight: 20 },
  readError: { position: 'absolute', left: 24, right: 24, color: '#ffd3df', fontSize: 11 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  panelActions: { paddingHorizontal: 4 },
  notification: { borderColor: '#ffffffa0', backgroundColor: '#ffffff0a' },
  leave: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  leaveText: { color: '#c5c5ce', fontSize: 10 },
});
