import { GroupExperience } from '@/components/group-experience';
import { TutorialHost } from '@/components/tutorial-host';
import { DiaryUniverse } from '@/components/diary-universe';
import { MeteorQuestField } from '@/components/meteor-quest-field';
import { useMeteorQuest } from '@/hooks/use-meteor-quest';
import { JoinGroupDialog } from '@/components/ui/join-group-dialog';
import { NEW_STAR_HIGHLIGHT_MS, type NewStarHighlight } from '@/lib/new-star-highlight';
import { authSession } from '@/lib/auth-session';
import { useGroupPreviews } from '@/hooks/use-group-previews';
import { useGroupUniverse } from '@/hooks/use-group-universe';
import { useQuest } from '@/store/quest-context';
import { QuestRewardAnimation } from '@/components/quest-reward-animation';
import { Text } from '@/components/app-text';
// [MODIFIED 2026-11-05] fffju 브랜치 index.jsx의 화면 구성·디자인으로 교체하고, 데이터는 서버(로그인)로 연결.
//  - 화면: 가운데=나의 우주 / 왼쪽=일기 작성 / 오른쪽=그룹 우주 / 상점 (fffju 하단 네비·HUD·퀘스트 그대로)
//  - 별·일기·그룹: 서버(useDiary). fffju의 기기 저장(useJournal)은 사용하지 않는다.
//  - 별을 누르면 행성 상세(/planet/[id]), 메뉴의 검색·달력은 검색 화면(/search)으로 간다.
//  - 서버 기능이 아직 없는 테마·소리·알림은 화면만 보여주고 반응하지 않는다(나중에 하나씩 연결).
//  - [MODIFIED 2026-11-07] 코인·상점은 서버 연결(useShop). HUD 코인을 누르면 상점, 장착한 배경·혜성이 나의 우주에 보인다.
//  - 폰은 fffju 배율 그대로, 웹·PC는 폭 최대 520px 가운데 정렬(useDesignFrame).
//  - 별자리 보기: 하단바 위 [나의 우주 | 별자리 보기] 전환, 그 위에 별자리 정보 패널.
//    별자리는 화면 표시만 바꾼다(행성 원래 좌표·DB는 그대로). 규칙: lib/constellation.ts
//  - [ADDED 2026-11-15] Level 4 나만의 별자리: 같은 주제 일기 30개 이상이면 동의 후 서버(LLM)가 만든다.
//    만든 결과는 서버에 저장되고, 볼 때는 저장된 좌표만 불러와 기존 별자리 애니메이션으로 그린다.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppState, Modal, Platform, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { CreateGroupDialog } from '@/components/ui/create-group-dialog';
import { getMemberStars, groupDayKey } from '@/lib/group-attendance';
import { DiaryComposer } from '@/components/diary-composer';
import { SearchScreen } from '@/components/search-screen';
import { PopupWindow } from '@/components/ui/popup-window';
import { BackgroundTint, CometLayer } from '@/components/item-effects';
import { ShopSheet } from '@/components/shop-screen';
import { GroupSpaceScreen } from '@/components/ui/group-space-screen';
import { HomeHud } from '@/components/ui/home-hud';
import { ConstellationModeToggle, ConstellationPanel } from '@/components/ui/constellation-panel';
import { QuestPanel } from '@/components/ui/quest-panel';
import { UniverseBottomNav } from '@/components/ui/universe-bottom-nav';
import type { ConstellationRequest } from '@/components/universe-scene';
import { DesignPaint } from '@/constants/ui-design';
import { useDesignFrame } from '@/hooks/use-design-frame';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { showMessage } from '@/lib/feedback';
import {
  CONSTELLATION_TOPICS,
  TOPIC_CONCEPTS,
  allTopicStatus,
  personalStatus,
  personalTemplateId,
  selectMembers,
  selectPersonalMembers,
  topicCounts,
  type ConstellationTemplate,
  type PersonalStatus,
} from '@/lib/constellation';
import {
  apiCreatePersonalConstellation,
  apiListPersonalConstellations,
  type ApiPersonalConstellation,
} from '@/lib/api';
import { reduceHomeOverlay } from '@/lib/home-overlay';
import { homeTabFromParams, homeTabHref } from '@/lib/home-route';
import { localDateKey } from '@/lib/journal';
import type { DiaryTopic } from '@/lib/special-planet';
import { getRotateSensitivity, loadSettings, setRotateSensitivity } from '@/lib/settings';
import { useDiary } from '@/store/diary-context';
import { useShop } from '@/store/shop-context';

type Screen = 'home' | 'diary' | 'group';
// Web tab replacement can remount this screen before the new planet is rendered.
let pendingHomeHighlight: { id: string; revision: number } | null = null;

export default function HomeScreen() {
  const [tutorialRequest,setTutorialRequest] = useState(0);
  const { isLoggedIn, isRestoring, dataLoading, loadError, retryLoad, accessToken, entries, groups, createGroup, joinGroup, leaveGroup, logout, refreshGroups } = useDiary();
  const { coins, activeEffects, refresh: refreshShop } = useShop();
  const { frameWidth } = useDesignFrame();
  const { quest: diaryQuest, refresh: refreshQuest, rewardEvent, clearReward } = useQuest();
  const { quest: meteorQuest, busy: meteorBusy, error: meteorError, request: requestMeteors } = useMeteorQuest(accessToken);
  const [confirmedQuests, setConfirmedQuests] = useState<Partial<Record<'diary' | 'meteor', string>>>({});
  // fffju 반응형 레이아웃: 전체 뷰포트로 그리는 화면(홈 HUD·하단바·그룹)은 이 scale을 쓴다.
  // 상점은 별도의 최대 프레임 폭을 사용한다.
  const responsive = useResponsiveLayout();
  const { scale: rScale, headerTop } = responsive;
  const constellationToggleHeight = 32 * rScale;
  const constellationToggleBottom = responsive.navBottom + responsive.navHeight + 12 * rScale;
  const constellationPanelBottom = constellationToggleBottom + constellationToggleHeight + 10 * rScale;

  const { tab: routeTab, groupId: routeGroupId, diaryId: routeDiaryId, chat: routeChat, groupListEntry } = useLocalSearchParams<{
    tab?: string; groupId?: string; diaryId?: string; chat?: string; groupListEntry?: string;
  }>();
  const [screen, setScreen] = useState<Screen>(homeTabFromParams({tab:routeTab,groupId:routeGroupId}));
  const groupPreviews = useGroupPreviews(groups, screen === 'group' && isLoggedIn);
  const [newStar, setNewStar] = useState<NewStarHighlight | null>(null);
  const [homeOverlay, dispatchHomeOverlay] = useReducer(reduceHomeOverlay, null);
  const questVisible = homeOverlay?.kind === 'quest';
  const questDay = diaryQuest?.day;
  const staleMeteors = !!questDay && !!meteorQuest && questDay > meteorQuest.day;
  useEffect(() => {
    if (screen === 'home' || questVisible) void requestMeteors();
  }, [screen, questVisible, requestMeteors]);
  useEffect(() => {
    if (screen === 'home' && staleMeteors && !meteorBusy && !meteorError) void requestMeteors();
  }, [screen, staleMeteors, meteorBusy, meteorError, requestMeteors]);
  const setQuestVisible = (visible:boolean) => dispatchHomeOverlay(visible?{type:'open',panel:'quest'}:{type:'close',panel:'quest'});
  // [MODIFIED 2026-11-10] 상점은 별도 화면이 아니라 아래에서 올라오는 팝업
  const shopVisible = homeOverlay?.kind === 'shop';
  const setShopVisible = (visible:boolean) => dispatchHomeOverlay(visible?{type:'open',panel:'shop'}:{type:'close',panel:'shop'});
  // [ADDED 2026-11-12] 검색 팝업: null=닫힘, keyword=키워드 검색, calendar=달력으로 열기.
  // 열 때마다 key 를 바꿔 새로 시작하고, 행성 상세에 갔다 와도 닫지 않아 검색어·결과가 남는다.
  const [searchPopup, setSearchPopupData] = useState<{ mode: 'keyword' | 'calendar'; key: number } | null>(null);
  const setSearchPopup = (value: {mode:'keyword'|'calendar';key:number}|null) => {
    setSearchPopupData(value);
    dispatchHomeOverlay(value?{type:'open',panel:'search'}:{type:'close',panel:'search'});
  };
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const createGroupLock = useRef(false);
  const [nativeGroupId, setActiveGroupId] = useState<string | null>(routeGroupId ?? null);
  const activeGroupId = Platform.OS === 'web' ? routeGroupId ?? null : nativeGroupId;
  // 그룹 공유 우주: 그룹을 열면 멤버 전체의 별을 서버에서 받아온다(본인 것만이 아님).
  const { entries: groupStars, loading: groupLoading, error: groupError, reload: reloadGroup } = useGroupUniverse(activeGroupId);
  // 그룹 우주에서 별을 눌러 행성 상세로 갈 때, 돌아오면 목록이 아니라 그 그룹 우주로 복귀하려고 기억해둔다.
  const [sharedDiaryId, setSharedDiaryId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const joinLock = useRef(false);
  const [sensitivity, setSensitivity] = useState(getRotateSensitivity());
  const [today, setToday] = useState(groupDayKey);

  // ---------------------------------------------------------------- 별자리 보기 [ADDED 2026-11-12]
  const constellationOn = homeOverlay?.kind === 'constellation';
  const setConstellationOn = useCallback((visible:boolean) => {
    dispatchHomeOverlay(visible?{type:'open',panel:'constellation'}:{type:'close',panel:'constellation'});
  }, []);
  const [constellationTopic, setConstellationTopic] = useState<DiaryTopic | null>(null);
  const [constellationTemplateId, setConstellationTemplateId] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const [frontViewRequest, setFrontViewRequest] = useState(0);
  // 해금은 저장하지 않고 지금 주제별 일기 수로 계산한다(주제 없는 일기는 세지 않음)
  const topicStatuses = useMemo(() => allTopicStatus(entries), [entries]);

  // [2026-11-15] Level 4 나만의 별자리: 서버에 저장된 결과(주제별 0~1개)
  const [personalList, setPersonalList] = useState<Partial<Record<DiaryTopic, ApiPersonalConstellation>>>({});
  const [personalBusy, setPersonalBusy] = useState(false);
  const [consentTopic, setConsentTopic] = useState<DiaryTopic | null>(null);
  const [personalDone, setPersonalDone] = useState<ApiPersonalConstellation | null>(null);
  // 이 화면에서 생성을 시작한 주제 → 완성되면 완료 창을 띄운다
  const watchingRef = useRef(new Set<DiaryTopic>());
  const personalStatuses = useMemo(() => {
    const counts = topicCounts(entries);
    return Object.fromEntries(
      CONSTELLATION_TOPICS.map((t) => [t, personalStatus(counts[t], personalList[t])])
    ) as Record<DiaryTopic, PersonalStatus>;
  }, [entries, personalList]);

  const activeTemplate: ConstellationTemplate | null = useMemo(() => {
    if (!constellationOn || !constellationTopic) return null;
    if (constellationTemplateId === personalTemplateId(constellationTopic)) {
      const p = personalStatuses[constellationTopic];
      return p.state === 'ready' ? p.template : null;
    }
    const status = topicStatuses.find((s) => s.topic === constellationTopic);
    return status?.levels.find((l) => l.unlocked && l.template.id === constellationTemplateId)?.template ?? null;
  }, [constellationOn, constellationTopic, constellationTemplateId, topicStatuses, personalStatuses]);
  const constellationMembers = useMemo(() => {
    if (!activeTemplate) return [];
    if (activeTemplate.level === 4) {
      // 서버가 저장한 행성 순서(생성 당시 오래된 순 30개)를 그대로 쓴다
      const ids = personalList[activeTemplate.topic]?.planet_ids ?? [];
      return selectPersonalMembers(entries, activeTemplate.topic, ids, activeTemplate.requiredPlanets);
    }
    return selectMembers(entries, activeTemplate.topic, activeTemplate.requiredPlanets);
  }, [entries, activeTemplate, personalList]);

  const applyPersonal = useCallback((list: ApiPersonalConstellation[]) => {
    const map: Partial<Record<DiaryTopic, ApiPersonalConstellation>> = {};
    for (const pc of list) map[pc.topic] = pc;
    setPersonalList(map);
    for (const t of [...watchingRef.current]) {
      const pc = map[t];
      if (pc?.status === 'pending') continue;
      watchingRef.current.delete(t);
      if (pc?.status === 'ready') setPersonalDone(pc);
      else if (pc?.status === 'failed') showMessage('나만의 별자리', pc.error_message ?? '나만의 별자리를 만들지 못했어요.');
    }
  }, []);
  // 서버가 예전 버전이거나 연결 오류면 조용히 넘어간다: Level 4 카드는 기본 상태, Level 1~3 은 그대로
  const refreshPersonal = useCallback(() => {
    if (!accessToken) return;
    apiListPersonalConstellations(accessToken).then(applyPersonal).catch(() => {});
  }, [accessToken, applyPersonal]);
  useEffect(() => {
    if (!constellationOn || !accessToken) return;
    let alive = true;
    apiListPersonalConstellations(accessToken)
      .then((list) => alive && applyPersonal(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [constellationOn, accessToken, applyPersonal]);
  // 만드는 중인 별자리가 있으면 서버의 실제 진행 단계를 2.5초마다 다시 읽는다(LLM 을 다시 부르지 않는 조회)
  const anyPending = Object.values(personalList).some((p) => p?.status === 'pending');
  useEffect(() => {
    if (!anyPending) return;
    const timer = setInterval(refreshPersonal, 2500);
    return () => clearInterval(timer);
  }, [anyPending, refreshPersonal]);

  const createPersonal = useCallback(async () => {
    const topic = consentTopic;
    if (!topic || !accessToken || personalBusy) return;
    setPersonalBusy(true);
    try {
      const pc = await apiCreatePersonalConstellation(accessToken, topic, true);
      setPersonalList((prev) => ({ ...prev, [topic]: pc }));
      if (pc.status === 'ready') setPersonalDone(pc);
      else if (pc.status === 'pending') watchingRef.current.add(topic);
      else if (pc.status === 'failed') showMessage('나만의 별자리', pc.error_message ?? '나만의 별자리를 만들지 못했어요.');
    } catch (e) {
      showMessage('나만의 별자리', e instanceof Error ? e.message : '나만의 별자리를 만들지 못했어요.');
      refreshPersonal();
    } finally {
      setConsentTopic(null);
      setPersonalBusy(false);
    }
  }, [consentTopic, accessToken, personalBusy, refreshPersonal]);
  // 패널 위치: 폰은 하단바 위(가로 전체), 넓은 화면은 왼쪽 아래에 붙여 별자리가 오른쪽 넓은 영역을 쓰게 한다
  const { width: windowWidth } = useWindowDimensions();
  const panelBox = responsive.wide
    ? { left: responsive.chromeLeft + 12, width: Math.min(400 * rScale, responsive.chromeWidth * 0.42) }
    : { left: responsive.contentLeft + 12, width: Math.min(responsive.contentWidth, 460 * rScale) - 24 };
  const constellationInsets = useMemo(() => {
    const h = Math.max(responsive.height, 1);
    const w = Math.max(windowWidth, 1);
    const top = responsive.headerTop + responsive.hudHeight + 12;
    const toggleTopInset = constellationToggleBottom + constellationToggleHeight + 12;
    if (responsive.wide) {
      const left = panelBox.left + panelBox.width + 16;
      return { top: Math.min(top / h, 0.45), bottom: Math.min(toggleTopInset / h, 0.4), left: Math.min(left / w, 0.5), right: 0.03 };
    }
    const bottom = constellationPanelBottom + panelHeight + 12;
    return { top: Math.min(top / h, 0.45), bottom: Math.min(bottom / h, 0.6), left: 0.04, right: 0.04 };
  }, [responsive.height, responsive.headerTop, responsive.hudHeight, responsive.wide, rScale, constellationToggleBottom,
    constellationToggleHeight, constellationPanelBottom, panelHeight, windowWidth, panelBox.left, panelBox.width]);
  const constellationRequest: ConstellationRequest | null = useMemo(
    () =>
      activeTemplate && constellationMembers.length === activeTemplate.requiredPlanets
        ? {
            template: activeTemplate,
            memberIds: constellationMembers.map((e) => e.id),
            color: TOPIC_CONCEPTS[activeTemplate.topic].color,
            insets: constellationInsets,
          }
        : null,
    [activeTemplate, constellationMembers, constellationInsets]
  );
  const selectConstellationTopic = useCallback(
    (topic: DiaryTopic) => {
      setConstellationTopic(topic);
      // Topic selection previews its stars; only a shape card draws connections.
      setConstellationTemplateId(null);
    },
    []
  );
  const viewPersonal = useCallback((pc: ApiPersonalConstellation) => {
    setPersonalDone(null);
    setConstellationTopic(pc.topic);
    setConstellationTemplateId(personalTemplateId(pc.topic));
    setConstellationOn(true);
  }, [setConstellationOn]);
  const setConstellationMode = useCallback(
    (on: boolean) => {
      if (on) setConstellationTemplateId(null);
      if (on && !constellationTopic) {
        // 처음 열 때: 가장 높은 단계가 열린 주제(같으면 일기가 많은 주제)
        const best = [...topicStatuses].sort(
          (a, b) => (b.highest?.level ?? 0) - (a.highest?.level ?? 0) || b.count - a.count
        )[0];
        if (best) selectConstellationTopic(best.topic);
      }
      setConstellationOn(on);
    },
    [constellationTopic, topicStatuses, selectConstellationTopic, setConstellationOn]
  );

  useEffect(() => {
    if (!isRestoring && !isLoggedIn) router.replace('/login');
  }, [isLoggedIn, isRestoring]);

  // 기기에 저장된 회전 민감도를 불러와 메뉴 슬라이더에 반영한다.
  useEffect(() => {
    let alive = true;
    loadSettings().then(() => {
      if (alive) setSensitivity(getRotateSensitivity());
    });
    return () => {
      alive = false;
    };
  }, []);

  // 자정이 지나면 퀘스트의 "오늘"을 갱신한다 (fffju 동작 유지).
  useEffect(() => {
    const timer = setInterval(() => setToday(groupDayKey()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (screen !== 'group' || !isLoggedIn) return;
    void refreshGroups();
    const timer = setInterval(() => { if (AppState.currentState !== 'background') void refreshGroups(); }, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refreshGroups(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [screen, isLoggedIn, refreshGroups]);

  // Keep this callback stable: setting the return target must not reopen the modal before navigation.
  useFocusEffect(useCallback(() => {
    const groupId = routeGroupId;
    if (groupId) {
      setScreen('group');
      if (Platform.OS !== 'web') setActiveGroupId(groupId);
      if (routeDiaryId) setSharedDiaryId(routeDiaryId);
    } else if (Platform.OS === 'web') {
      setScreen(homeTabFromParams({tab:routeTab}));
      setSharedDiaryId(null);
    }
  }, [routeGroupId,routeDiaryId,routeTab]));

  useEffect(() => {
    const pending = pendingHomeHighlight;
    if (screen !== 'home' || homeTabFromParams({ tab: routeTab, groupId: routeGroupId }) !== 'home' || !isLoggedIn || !pending) return;
    if (pending.revision !== authSession.getRevision()) {
      pendingHomeHighlight = null;
      return;
    }
    if (!entries.some(entry => entry.id === pending.id)) return;
    const timer = setTimeout(() => {
      if (pendingHomeHighlight !== pending || pending.revision !== authSession.getRevision()) return;
      pendingHomeHighlight = null;
      setNewStar({ id: pending.id, startedAt: Date.now() });
    }, 0);
    return () => clearTimeout(timer);
  }, [screen, routeTab, routeGroupId, isLoggedIn, entries]);

  useEffect(() => {
    if (!newStar) return;
    const timer = setTimeout(() => setNewStar(null), Math.max(0, newStar.startedAt + NEW_STAR_HIGHLIGHT_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [newStar]);

  if (isRestoring || !isLoggedIn) return <View style={styles.container} />;

  const checkCount = new Set(entries.map((e) => localDateKey(new Date(e.createdAt)))).size;
  const groupEntries = (diaryIds: string[]) => entries.filter((e) => diaryIds.includes(e.id));
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  const navigateTab = (next: Screen) => {
    setScreen(next);
    dispatchHomeOverlay({type:'reset'});
    setSharedDiaryId(null);
    setActiveGroupId(null);
    setQuestVisible(false);
    setShopVisible(false);
    setSearchPopup(null);
    if (Platform.OS === 'web') router.replace(homeTabHref(next));
  };

  const handleLogout = () => {
    pendingHomeHighlight = null;
    setNewStar(null);
    logout();
    router.replace('/login');
  };

  const handleCreateGroup = async () => {
    if (createGroupLock.current) return;
    if (Array.from(newGroupName.trim()).length > 8) {
      showMessage('그룹 이름', '그룹 이름은 8자 이내로 입력해주세요.');
      return;
    }
    createGroupLock.current = true;
    setCreatingGroup(true);
    const result = await createGroup(newGroupName.trim() || `그룹${groups.length + 1}`);
    createGroupLock.current = false;
    setCreatingGroup(false);
    if (!result.ok) {
      showMessage('그룹 생성 실패', result.error);
      return;
    }
    setNewGroupName('');
    setCreateGroupVisible(false);
  };

  const handleJoinGroup = async () => {
    if (joinLock.current) return;
    const code = joinCode.trim();
    if (!code) return;
    joinLock.current = true;
    setJoining(true);
    const result = await joinGroup(code);
    joinLock.current = false;
    setJoining(false);
    if (!result.ok) {
      showMessage('참여 실패', result.error);
      return;
    }
    setJoinCode('');
    setJoinVisible(false);
  };

  const closeGroup = () => {
    setSharedDiaryId(null);
    if (Platform.OS !== 'web') {
      setActiveGroupId(null);
    } else if (groupListEntry === '1' && router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: '/', params: { tab: 'group' } });
    }
  };

  const handleLeaveGroup = async () => {
    if (leaving || !activeGroup) return;
    setLeaving(true);
    const result = await leaveGroup(activeGroup.id);
    setLeaving(false);
    if (!result.ok) {
      showMessage('나가기 실패', result.error);
      return;
    }
    closeGroup();
  };

  return (
    <View style={styles.container}>
      {/* ===== 가운데: 나의 우주 ===== */}
      {screen === 'home' && (
        // [MODIFIED 2026-11-12] 배경 사진(night-sky.png) 제거 → 단색 배경 + 3D 우주의 배경 별만 사용
        <View style={[styles.fill, styles.spaceBackground]}>
          <BackgroundTint effects={activeEffects} />
          {/* Comets sit behind the transparent 3D canvas so planets occlude them. */}
          <CometLayer effects={activeEffects} />
          <DiaryUniverse
            sceneKey={`${authSession.getRevision()}:home`}
            floatStars={!constellationOn}
            selection={{id:homeOverlay?.kind==='diary'?homeOverlay.id:null,onChange:id=>dispatchHomeOverlay({type:'select-diary',id})}}
            entries={entries}
            newStar={newStar ?? undefined}
            onNewStarFound={() => setNewStar(null)}
            constellation={constellationRequest}
            topicFilter={constellationOn?constellationTopic:null}
            frontViewRequest={frontViewRequest}
            popupInsets={{ top: headerTop + responsive.hudHeight + 9 * rScale, bottom: constellationToggleBottom + constellationToggleHeight + 12 }}
          />
          {!homeOverlay && !staleMeteors && meteorQuest && meteorQuest.cleared.length < 3 && (
              <MeteorQuestField quest={meteorQuest} busy={meteorBusy} error={meteorError}
                top={headerTop + responsive.hudHeight + 12}
                bottom={constellationToggleBottom + constellationToggleHeight + 12}
                onHit={meteor => { void requestMeteors({ day: meteorQuest.day, cycle: meteorQuest.cycle, meteor }); }} />
            )}

          {entries.length === 0 && (
            <View style={styles.emptyState} pointerEvents="none">
              <Text style={styles.emptyText}>{dataLoading ? '기록을 불러오는 중…' : loadError ?? '아직 기록이 없어요. 아래 왼쪽 버튼으로 첫 별을 띄워보세요.'}</Text>
            </View>
          )}

          {loadError && <TouchableOpacity onPress={retryLoad} style={{ position: 'absolute', top: headerTop + 100, alignSelf: 'center', padding: 12 }}><Text style={styles.whiteText}>다시 불러오기</Text></TouchableOpacity>}

          {/* HUD는 fffju 반응형(전체 뷰포트). 520 프레임으로 감싸지 않는다. */}
          <HomeHud
            scale={rScale}
            menuVisible={homeOverlay?.kind==='menu'} onToggleMenu={()=>dispatchHomeOverlay({type:'toggle-menu'})}
            onCloseMenu={()=>dispatchHomeOverlay({type:'close',panel:'menu'})}
            starCount={entries.length}
            coinCount={coins ?? 0}
            checkCount={checkCount}
            onStats={() => {
              refreshShop();
              setShopVisible(true);
            }}
            onQuest={() => { void refreshQuest(); setQuestVisible(true); }}
            menuProps={{
              onSearch: () => setSearchPopup({ mode: 'keyword', key: Date.now() }),
              onCalendar: () => setSearchPopup({ mode: 'calendar', key: Date.now() }),
              onLogout: handleLogout,
              onTutorial: () => { dispatchHomeOverlay({type:'reset'}); setTutorialRequest(value => value + 1); },
              sensitivity,
              onSensitivity: (value) => setSensitivity(setRotateSensitivity(value)),
            }}
          />

          {/* 별자리 보기 전환 (하단바 바로 위 가운데) */}
          {entries.length > 0 && (
            <View
              pointerEvents="box-none"
              style={[styles.constellationToggleRow, { bottom: constellationToggleBottom }]}>
              <ConstellationModeToggle scale={rScale} active={constellationOn} onChange={setConstellationMode} />
            </View>
          )}

          {/* 별자리 정보 패널 (전환 탭 위) */}
          {constellationOn && (
            <View
              pointerEvents="box-none"
              style={[
                styles.constellationPanelWrap,
                {
                  bottom: constellationPanelBottom,
                  left: panelBox.left,
                  width: panelBox.width,
                },
              ]}>
              <ConstellationPanel
                scale={Math.min(rScale, 1.1)}
                statuses={topicStatuses}
                topic={constellationTopic}
                templateId={activeTemplate?.id ?? null}
                members={constellationMembers.map((e) => ({ id: e.id, createdAt: e.createdAt, color: e.color }))}
                collapsed={panelCollapsed}
                onToggleCollapsed={() => setPanelCollapsed((v) => !v)}
                onSelectTopic={selectConstellationTopic}
                onSelectTemplate={(t) => setConstellationTemplateId(t.id)}
                onOpenEntry={(id) => router.push(`/planet/${id}`)}
                onFrontView={() => setFrontViewRequest((n) => n + 1)}
                onLayout={(e) => setPanelHeight(Math.round(e.nativeEvent.layout.height))}
                personal={constellationTopic ? personalStatuses[constellationTopic] : null}
                personalBusy={personalBusy}
                onCreatePersonal={() => constellationTopic && setConsentTopic(constellationTopic)}
              />
            </View>
          )}
        </View>
      )}

      {/* ===== 왼쪽: 일기 작성 — 다른 탭에 갔다 와도 쓰던 내용이 남도록 화면을 숨기기만 한다 ===== */}
      <View style={[styles.fill, screen !== 'diary' && styles.hidden]}>
        <DiaryComposer onBack={() => navigateTab('home')} onSaved={id => {
          if (id) {
            if (Platform.OS === 'web') pendingHomeHighlight = { id, revision: authSession.getRevision() };
            else setNewStar({ id, startedAt: Date.now() });
          }
          navigateTab('home');
        }} />
      </View>

      {/* ===== 오른쪽: 그룹 우주 (반응형 그리드 — 전체 뷰포트, useResponsiveLayout 사용) ===== */}
      {screen === 'group' && (
        <View style={styles.fill}>
          <GroupSpaceScreen
            scale={rScale}
            groups={groups.map((g) => ({
              id: g.id,
              name: g.name,
              members: getMemberStars(g, entries, today),
              stars: groupPreviews[g.id] ?? groupEntries(g.diary_ids),
            }))}
            onSelectGroup={(g) => {
              setSharedDiaryId(null);
              if (Platform.OS === 'web') {
                router.push({ pathname: '/', params: { groupId: g.id, groupListEntry: '1' } });
              } else {
                setActiveGroupId(g.id);
              }
            }}
            onAddGroup={() => setCreateGroupVisible(true)}
            onJoinByCode={() => setJoinVisible(true)}
          />
        </View>
      )}

      {/* ===== 상점 팝업 (HUD 코인을 누르면 열림, ✕ 또는 바깥을 누르면 닫힘) ===== */}
      <ShopSheet visible={shopVisible} width={frameWidth} onClose={() => setShopVisible(false)} />

      {/* ===== 그룹 카드를 눌렀을 때: 그 그룹의 우주를 3D로 크게 보기 ===== */}
      <Modal transparent={false} visible={activeGroup !== null} animationType="slide" onRequestClose={() => sharedDiaryId ? setSharedDiaryId(null) : closeGroup()}>
        {activeGroup && <GroupExperience key={`${authSession.getRevision()}:${activeGroup.id}`} group={activeGroup} entries={groupStars}
          loading={groupLoading} error={groupError} onReload={reloadGroup} onBack={closeGroup}
          onLeave={handleLeaveGroup} leaving={leaving} selection={{id:sharedDiaryId,onChange:setSharedDiaryId}} initialChat={routeChat==='1'} />}
      </Modal>

      {/* ===== 그룹에 친구 초대 (방 ID 코드 공유 + 멤버 목록) ===== */}


      <JoinGroupDialog visible={joinVisible} code={joinCode} joining={joining} onChangeCode={setJoinCode}
        onClose={() => setJoinVisible(false)} onJoin={handleJoinGroup} />

      {/* ===== 퀘스트 (서버 진행률·보상 기록) ===== */}
      <Modal transparent visible={questVisible} animationType="fade" onRequestClose={() => setQuestVisible(false)}>
        <QuestPanel scale={rScale}
          confirmedQuests={confirmedQuests}
          onConfirmQuest={(kind, key) => setConfirmedQuests(current => ({ ...current, [kind]: key }))}
          meteorQuest={staleMeteors ? null : meteorQuest}
          meteorBusy={meteorBusy}
          meteorError={meteorError}
          onRetryMeteors={() => { void requestMeteors(); }}
          onWriteDiary={() => navigateTab('diary')}
          onClose={() => setQuestVisible(false)} />
      </Modal>

      {/* ===== 공통: 하단 네비게이션 (fffju 반응형 — 전체 뷰포트) ===== */}
      {rewardEvent && <QuestRewardAnimation key={rewardEvent.id} event={rewardEvent} onDone={clearReward} />}
      <TutorialHost key={authSession.getRevision()} userId={authSession.getSnapshot().session?.user_id ?? null} ready={!isRestoring && isLoggedIn}
        autoEligible={!dataLoading && screen === 'home' && !routeGroupId && !routeTab && !homeOverlay && !createGroupVisible && !joinVisible && !rewardEvent}
        request={tutorialRequest} />
      <UniverseBottomNav
        activeScreen={screen}
        onDiary={() => navigateTab('diary')}
        onHome={() => navigateTab('home')}
        onGroup={() => navigateTab('group')}
      />

      {/* ===== 새 그룹 만들기 팝업 (✕ · 바깥 · 취소로 닫힘) ===== */}
      <CreateGroupDialog visible={createGroupVisible} scale={rScale} name={newGroupName}
        defaultName={`그룹${groups.length + 1}`} saving={creatingGroup} onChangeName={setNewGroupName}
        onClose={() => { if (!creatingGroup) setCreateGroupVisible(false); }} onCreate={handleCreateGroup} />

      {/* ===== 일기 검색 팝업 (메뉴의 검색·달력에서 열림) ===== */}
      <PopupWindow
        visible={homeOverlay?.kind === 'search' && searchPopup !== null}
        onClose={() => setSearchPopup(null)}
        title="일기 검색"
        appearance="search"
        width={frameWidth}
        height="80%"
        testID="search-popup">
        {searchPopup && (
          <SearchScreen
            key={searchPopup.key}
            embedded
            onBack={() => setSearchPopup(null)}
            onOpenEntry={(id) => router.push(`/planet/${id}`)}
            initialCalendarOpen={searchPopup.mode === 'calendar'}
          />
        )}
      </PopupWindow>

      {/* ===== [2026-11-15] 나만의 별자리: 외부 AI 전송 안내·동의 (동의해야만 서버가 LLM 을 부른다) ===== */}
      <PopupWindow
        visible={consentTopic !== null}
        onClose={() => !personalBusy && setConsentTopic(null)}
        title="✨ 나만의 별자리 만들기"
        width={Math.min(frameWidth, 444)}
        testID="personal-consent-popup">
        <Text style={styles.inviteModalDesc}>
          {consentTopic ? TOPIC_CONCEPTS[consentTopic].label : ''} 주제 일기를 AI가 함께 읽고, 기록을 상징하는 별자리
          모양을 만들어요.
        </Text>
        <View style={styles.consentBox}>
          <Text style={styles.consentText}>
            • 이 주제 일기의 <Text style={styles.consentStrong}>작성 날짜와 본문</Text>이 외부 AI 서비스(OpenAI)로
            전송돼요.
          </Text>
          <Text style={styles.consentText}>
            • 이메일·계정 정보는 보내지 않고, 본문 속 이메일·전화번호·링크는 가린 뒤 보내요.
          </Text>
          <Text style={styles.consentText}>• 만든 별자리는 저장되어, 다시 볼 때는 AI를 다시 부르지 않아요.</Text>
          <Text style={styles.consentText}>• 한 번 만든 별자리는 일기가 늘어도 바뀌지 않아요.</Text>
        </View>
        <View style={styles.inviteModalButtonRow}>
          <TouchableOpacity
            style={styles.inviteCancelBtn}
            onPress={() => setConsentTopic(null)}
            disabled={personalBusy}
            testID="personal-consent-cancel">
            <Text style={styles.whiteText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inviteConfirmBtn, personalBusy && { opacity: 0.6 }]}
            onPress={createPersonal}
            disabled={personalBusy}
            testID="personal-consent-agree">
            <Text style={styles.inviteConfirmText}>{personalBusy ? '요청하는 중…' : '동의하고 만들기'}</Text>
          </TouchableOpacity>
        </View>
      </PopupWindow>

      {/* ===== 나만의 별자리 완성 ===== */}
      <PopupWindow
        visible={personalDone !== null}
        onClose={() => setPersonalDone(null)}
        title="✨ 나만의 별자리"
        width={Math.min(frameWidth, 444)}
        testID="personal-done-popup">
        {personalDone && (
          <>
            <Text style={styles.doneText}>나만의 별자리가 완성되었습니다.</Text>
            <Text style={styles.doneName}>{personalDone.name}</Text>
            {!!personalDone.description && <Text style={styles.doneText}>{personalDone.description}</Text>}
            <Text style={styles.doneText}>이 기억들을 모아 {personalDone.name}를 만들었습니다.</Text>
            {!!personalDone.reason && <Text style={styles.doneReason}>{personalDone.reason}</Text>}
            {personalDone.keywords.length > 0 && (
              <Text style={styles.doneKeywords}>{personalDone.keywords.map((k) => `#${k}`).join('  ')}</Text>
            )}
            <View style={styles.inviteModalButtonRow}>
              <TouchableOpacity
                style={styles.inviteConfirmBtn}
                onPress={() => viewPersonal(personalDone)}
                testID="personal-done-view">
                <Text style={styles.inviteConfirmText}>별자리 보기</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </PopupWindow>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DesignPaint.background },
  spaceBackground: { backgroundColor: '#000' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hidden: { display: 'none' },
  frameOuter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center' },
  frameInner: { flex: 1 },
  whiteText: { color: '#fff' },
  emptyState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: { color: '#A4B0BE', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  constellationToggleRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 9 },
  constellationPanelWrap: { position: 'absolute', zIndex: 15 },

  topBar: {
    position: 'absolute', left: 20, right: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10,
  },
  statsPill: { backgroundColor: '#7f8c8d', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12 },
  statsText: { fontWeight: 'bold', color: '#111', fontSize: 14 },
  questButton: { backgroundColor: '#7f8c8d', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  questText: { fontWeight: 'bold', color: '#111', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  inviteModalCard: {
    backgroundColor: '#1E1E24',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#333',
  },
  inviteModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  inviteModalDesc: { color: '#a4b0be', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  inviteInput: {
    backgroundColor: '#111115', color: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16,
  },
  inviteModalButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  inviteCancelBtn: { backgroundColor: '#444', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  inviteConfirmBtn: { backgroundColor: '#3498db', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  inviteConfirmText: { color: '#fff', fontWeight: 'bold' },
  inviteButton: { backgroundColor: '#3498db', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  inviteButtonText: { fontWeight: 'bold', color: '#fff', fontSize: 13 },
  codeBox: { backgroundColor: '#1e272e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  codeText: { color: '#fff', fontSize: 26, fontWeight: 'bold', letterSpacing: 4 },
  codeCopy: { color: '#7f8c8d', fontSize: 12, marginTop: 4 },
  membersTitle: { color: '#a4b0be', fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  memberRow: { color: '#dfe6e9', fontSize: 14, marginBottom: 2 },
  leaveLink: { alignSelf: 'flex-start', marginTop: 14, paddingVertical: 4 },
  leaveLinkText: { color: '#e74c3c', fontSize: 14, fontWeight: '600' },
  leaveBox: { marginTop: 14, backgroundColor: 'rgba(231,76,60,0.12)', borderRadius: 10, padding: 12 },
  leaveWarn: { color: '#ffb8b0', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  leaveConfirmBtn: { backgroundColor: '#e74c3c', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },

  consentBox: { backgroundColor: '#111115', borderRadius: 12, padding: 12, marginBottom: 16, gap: 6 },
  consentText: { color: '#dfe6e9', fontSize: 13, lineHeight: 19 },
  consentStrong: { color: '#fff', fontWeight: 'bold' },
  doneName: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginVertical: 10 },
  doneText: { color: '#dfe6e9', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 8 },
  doneReason: { color: '#a4b0be', fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginBottom: 8 },
  doneKeywords: { color: '#9fc3ff', fontSize: 12.5, textAlign: 'center', marginBottom: 16 },
});
