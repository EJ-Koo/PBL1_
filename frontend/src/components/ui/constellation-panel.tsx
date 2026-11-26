import { ScrollView } from '@/components/app-scroll-view';
// [NEW FILE 2026-11-12] 별자리 보기 UI: [나의 우주 | 별자리 보기] 전환 버튼 + 아래쪽 별자리 정보 패널.
// 홈 HUD와 같은 디자인 언어(얇은 흰 선, 모서리를 깎은 틀, 반투명 회색, 공통 글꼴)를 쓴다.
//  - 주제 칩: 주제별 일기 수
//  - 레벨 카드 3장: 모양 미리보기(잠긴 단계는 흐린 실루엣 + 자물쇠), 해금 여부, 필요한 일기 수
//  - 이 별자리의 기록: 별자리를 이룬 일기(날짜). 누르면 기존 일기 상세 화면
//  - 접기: 별자리를 크게 보고 싶을 때 한 줄로 접는다
//  - [2026-11-15] Level 4 나만의 별자리 카드(LLM 개인화 생성): 잠김 → 생성하기 → 만드는 중(서버 실제 단계) → 완성/실패
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/app-text';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { DesignFonts, DesignPaint, grayAlpha, whiteAlpha } from '@/constants/ui-design';
import {
  PERSONAL_STAGES,
  TOPIC_CONCEPTS,
  personalStageIndex,
  type ConstellationTemplate,
  type PersonalStatus,
  type TopicStatus,
} from '@/lib/constellation';
import type { DiaryTopic } from '@/lib/special-planet';

/** 모서리를 깎은 얇은 선 틀(퀘스트 버튼과 같은 모양). 크기는 그려진 뒤 잰다. */
function ChamferFrame({ cut = 10, fill = grayAlpha(0.14), stroke = whiteAlpha(0.55) }: { cut?: number; fill?: string; stroke?: string }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.w > 0 && (
        <Svg width={box.w} height={box.h}>
          <Path
            d={`M${cut + 0.5} .5H${box.w - 0.5}V${box.h - cut - 0.5}L${box.w - cut - 0.5} ${box.h - 0.5}H.5V${cut + 0.5}Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={1}
          />
        </Svg>
      )}
    </View>
  );
}

/** 하단바 위 전환 버튼: [나의 우주] [별자리 보기] */
export function ConstellationModeToggle({
  scale,
  active,
  onChange,
  universeLabel = '나의 우주',
}: {
  scale: number;
  active: boolean;
  onChange: (active: boolean) => void;
  universeLabel?: string;
}) {
  const items = [
    { on: false, label: universeLabel },
    { on: true, label: '별자리 보기' },
  ];
  return (
    <View style={[styles.toggle, { height: 32 * scale, borderRadius: 16 * scale }]} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = item.on === active;
        return (
          <TouchableOpacity
            key={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
            testID={item.on ? 'constellation-toggle-on' : 'constellation-toggle-off'}
            onPress={() => onChange(item.on)}
            style={[styles.toggleItem, { paddingHorizontal: 14 * scale, borderRadius: 14 * scale }, selected && styles.toggleItemOn]}>
            <Text
              style={[
                styles.toggleText,
                { fontSize: 13 * scale, lineHeight: 18 * scale },
                selected && { fontFamily: DesignFonts.bold, color: DesignPaint.menuText },
              ]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** 별자리 모양 미리보기(정규화 좌표를 작은 그림으로). 잠긴 단계는 흐린 실루엣. */
export function ConstellationPreview({
  template,
  size,
  locked,
  color,
}: {
  template: ConstellationTemplate;
  size: number;
  locked: boolean;
  color: string;
}) {
  const pad = size * 0.12;
  const half = (size - pad * 2) / 2;
  const x = (v: number) => size / 2 + v * half;
  const y = (v: number) => size / 2 - v * half;
  const dot = template.points.length > 10 ? 1.4 : 1.9;
  return (
    <Svg width={size} height={size}>
      {template.connections.map(([a, b], i) => (
        <Line
          key={`l${i}`}
          x1={x(template.points[a][0])}
          y1={y(template.points[a][1])}
          x2={x(template.points[b][0])}
          y2={y(template.points[b][1])}
          stroke={locked ? whiteAlpha(0.16) : color}
          strokeOpacity={locked ? 1 : 0.7}
          strokeWidth={0.9}
        />
      ))}
      {template.points.map((p, i) => (
        <Circle key={`p${i}`} cx={x(p[0])} cy={y(p[1])} r={dot} fill={locked ? whiteAlpha(0.22) : '#FFFFFF'} />
      ))}
    </Svg>
  );
}

function LockIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" fill="none" stroke={whiteAlpha(0.75)} strokeWidth={1.1} />
      <Path d="M2.5 5.5h7v5h-7z" fill={whiteAlpha(0.75)} />
    </Svg>
  );
}

/** Level 4 카드 그림: 아직 모양이 없을 때(잠김·만들기·만드는 중·실패) 쓰는 점선 원 + 가운데 기호 */
function PersonalBadge({ size, mark, dim }: { size: number; mark: '?' | '+' | '!'; dim: boolean }) {
  const c = size / 2;
  const stroke = whiteAlpha(dim ? 0.22 : 0.7);
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={size * 0.34} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray="2.5 3" />
      {mark === '+' ? (
        <Path d={`M${c - 7} ${c}H${c + 7}M${c} ${c - 7}V${c + 7}`} stroke={whiteAlpha(0.95)} strokeWidth={1.6} />
      ) : mark === '!' ? (
        <Path d={`M${c} ${c - 8}V${c + 2}M${c} ${c + 6}V${c + 8}`} stroke={whiteAlpha(0.85)} strokeWidth={1.8} />
      ) : (
        <Path
          d={`M${c - 4.5} ${c - 4}a4.5 4.5 0 1 1 6 4.2c-1.3 .6-1.5 1.3-1.5 2.6M${c} ${c + 6}v1.4`}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
        />
      )}
    </Svg>
  );
}

/** Level 4 안내·생성·진행·실패 상자 */
function PersonalBox({
  personal,
  busy,
  current,
  topicLabel,
  scale,
  onCreate,
}: {
  personal: PersonalStatus;
  busy: boolean;
  current: boolean;
  topicLabel: string;
  scale: number;
  onCreate: () => void;
}) {
  const f = (n: number) => n * scale;
  const { state, count, required, remaining, data } = personal;
  const text = [styles.boxText, { fontSize: f(12), lineHeight: f(18) }];
  const button = (label: string, testID: string) => (
    <TouchableOpacity
      onPress={onCreate}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      testID={testID}
      style={[styles.createButton, { height: f(34), borderRadius: f(17), marginTop: f(8), opacity: busy ? 0.6 : 1 }]}>
      {busy ? (
        <ActivityIndicator size="small" color={DesignPaint.menuText} />
      ) : (
        <Text style={[styles.createText, { fontSize: f(13), lineHeight: f(18) }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  let body: ReactNode = null;
  if (state === 'locked') {
    body = (
      <>
        <Text style={text}>
          현재 기록: {count}개 · 필요 기록: {required}개
        </Text>
        <Text style={text}>{remaining}개의 기억을 더 기록하면{'\n'}나만의 별자리를 만들 수 있습니다.</Text>
      </>
    );
  } else if (state === 'available') {
    body = (
      <>
        <Text style={text}>
          {topicLabel} 기록이 {count}개 모였어요. AI가 기록을 분석해 세상에 하나뿐인 별자리를 만들어요.
        </Text>
        {button('나만의 별자리 생성하기', 'personal-generate')}
      </>
    );
  } else if (state === 'pending') {
    const at = personalStageIndex(data?.stage);
    body = (
      <>
        {PERSONAL_STAGES.map((s, i) => {
          const done = i < at;
          const now = i === at;
          return (
            <View key={s.key} style={[styles.stageRow, { gap: f(8), marginTop: f(3) }]}>
              {now ? (
                <ActivityIndicator size="small" color={whiteAlpha(0.9)} style={{ width: f(14), height: f(14) }} />
              ) : (
                <Text style={[styles.stageMark, { width: f(14), fontSize: f(12) }, !done && { color: whiteAlpha(0.35) }]}>
                  {done ? '✓' : '·'}
                </Text>
              )}
              <Text style={[text, !done && !now && { color: whiteAlpha(0.45) }]}>{s.label}</Text>
            </View>
          );
        })}
        <Text style={[styles.boxNote, { fontSize: f(11), lineHeight: f(16), marginTop: f(6) }]}>
          {at < 0 ? '곧 시작해요. ' : ''}잠시 걸릴 수 있어요. 다른 화면에 다녀와도 계속 만들어져요.
        </Text>
      </>
    );
  } else if (state === 'failed' || state === 'exhausted') {
    body = (
      <>
        <Text style={text}>{data?.error_message ?? '나만의 별자리를 만들지 못했어요.'}</Text>
        {state === 'failed' ? (
          button(`다시 시도 (남은 ${data?.attempts_left ?? 0}회)`, 'personal-retry')
        ) : (
          <Text style={[styles.boxNote, { fontSize: f(11), lineHeight: f(16), marginTop: f(4) }]}>
            다시 시도할 수 있는 횟수를 모두 사용했어요. Level 1~3 별자리는 그대로 볼 수 있어요.
          </Text>
        )}
      </>
    );
  } else if (state === 'short') {
    body = (
      <Text style={text}>
        기록이 {required}개보다 적어져 지금은 볼 수 없어요(현재 {count}개). {remaining}개를 더 기록하면 같은 별자리를 다시 볼
        수 있어요.
      </Text>
    );
  } else if (state === 'ready' && current && data) {
    body = (
      <>
        {!!data.description && <Text style={text}>{data.description}</Text>}
        {data.shape_source === 'catalog' && (
          <Text style={[styles.boxNote, { fontSize: f(11), lineHeight: f(16), marginTop: f(4) }]}>
            AI가 그린 모양이 검사를 통과하지 못해, 콘셉트와 가장 가까운 기본 도안으로 만들었어요.
          </Text>
        )}
      </>
    );
  }
  if (!body) return null;
  return (
    <View style={[styles.box, { padding: f(10), marginTop: f(8), borderRadius: f(8) }]} testID={`personal-box-${state}`}>
      <Text style={[styles.boxTitle, { fontSize: f(12.5), lineHeight: f(17), marginBottom: f(3) }]}>나만의 별자리</Text>
      {body}
    </View>
  );
}

export type ConstellationMember = { id: string; createdAt: number; color: string };

type PanelProps = {
  intro?: string;
  emptyTopicText?: string;
  scale: number;
  statuses: TopicStatus[];
  topic: DiaryTopic | null;
  templateId: string | null;
  /** 지금 보이는 별자리를 이룬 일기(오래된 순) */
  members: ConstellationMember[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectTopic: (topic: DiaryTopic) => void;
  onSelectTemplate: (template: ConstellationTemplate) => void;
  onOpenEntry: (id: string) => void;
  /** [2026-11-13] 별자리를 정면·처음 거리로 다시 보기(별자리가 보일 때만 버튼이 나온다) */
  onFrontView?: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** [2026-11-15] 지금 주제의 Level 4(나만의 별자리) 상태. 없으면 카드를 그리지 않는다. */
  personal?: PersonalStatus | null;
  /** 생성 요청을 보내는 중(버튼 중복 클릭 막기) */
  personalBusy?: boolean;
  onCreatePersonal?: () => void;
};

function formatDate(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 아래쪽 별자리 정보 패널 */
export function ConstellationPanel({
  scale,
  statuses,
  topic,
  templateId,
  members,
  collapsed,
  onToggleCollapsed,
  onSelectTopic,
  onSelectTemplate,
  onOpenEntry,
  onFrontView,
  onLayout,
  intro,
  emptyTopicText = '아직 이 주제의 일기가 없어요',
  personal = null,
  personalBusy = false,
  onCreatePersonal,
}: PanelProps) {
  const status = statuses.find((s) => s.topic === topic) ?? null;
  const personalReady = personal?.state === 'ready' ? personal.template : null;
  const current =
    status?.levels.find((l) => l.template.id === templateId && l.unlocked)?.template ??
    (personalReady && personalReady.id === templateId ? personalReady : null);
  const color = topic ? TOPIC_CONCEPTS[topic].color : '#FFFFFF';
  const anyTopic = statuses.some((s) => s.count > 0);
  const f = (n: number) => n * scale;
  // Level 4 안내 상자: 카드를 눌러 열거나, 만드는 중이거나, 나만의 별자리를 보고 있을 때
  const [personalOpen, setPersonalOpen] = useState(false);
  const isPersonalCurrent = !!current && current.level === 4;
  const showPersonalBox =
    !!personal && (personalOpen || personal.state === 'pending' || (isPersonalCurrent && personal.state === 'ready'));
  const personalPreview = personal?.template ?? null;

  const subtitle = current
    ? `${current.name} · Level ${current.level}`
    : status
      ? status.count > 0
        ? `첫 별자리까지 ${status.next?.remaining ?? 0}개`
        : emptyTopicText
      : '';

  return (
    <View style={[styles.panel, { padding: f(14), paddingTop: f(12) }]} onLayout={onLayout} testID="constellation-panel">
      <ChamferFrame cut={f(12)} fill="rgba(8,9,16,0.78)" />

      {/* 제목 줄: 주제 콘셉트 · 별자리 이름 · 접기 */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { fontSize: f(17), lineHeight: f(23) }]} numberOfLines={1}>
            {status ? status.title : '별자리'}
          </Text>
          {!!subtitle && (
            <Text style={[styles.subtitle, { fontSize: f(12), lineHeight: f(17) }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {current && onFrontView && (
          <TouchableOpacity
            onPress={onFrontView}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="정면으로 보기"
            testID="constellation-front-view"
            style={[styles.frontButton, { height: f(26), paddingHorizontal: f(9), borderRadius: f(13), marginRight: f(6) }]}>
            <Text style={[styles.frontText, { fontSize: f(11.5), lineHeight: f(15) }]}>정면으로 보기</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onToggleCollapsed}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? '별자리 정보 펼치기' : '별자리 정보 접기'}
          testID="constellation-collapse"
          style={[styles.collapse, { width: f(30), height: f(26) }]}>
          <Svg width={f(14)} height={f(14)} viewBox="0 0 14 14">
            <Path d={collapsed ? 'M2 9L7 4L12 9' : 'M2 5L7 10L12 5'} fill="none" stroke={DesignPaint.ink} strokeWidth={1.5} />
          </Svg>
        </TouchableOpacity>
      </View>

      {!collapsed && (
        <>
          {(intro || !anyTopic) && (
            <Text style={[styles.hint, { fontSize: f(12), lineHeight: f(18), marginTop: f(8) }]}>
              {intro ?? `일기를 쓸 때 '오늘의 주제'를 고르면 같은 주제의 별이 모여 별자리가 돼요. 같은 주제 일기 ${statuses[0]?.levels[0]?.template.requiredPlanets ?? 5}개면 첫 별자리가 열려요.`}
            </Text>
          )}

          {/* 주제 칩 */}
          <ScrollView
            horizontal
            testID="constellation-topic-scroll"
            showsHorizontalScrollIndicator
            style={{ marginTop: f(10), flexGrow: 0 }}
            contentContainerStyle={{ gap: f(6) }}>
            {statuses.map((s) => {
              const selected = s.topic === topic;
              return (
                <TouchableOpacity
                  key={s.topic}
                  onPress={() => onSelectTopic(s.topic)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${s.label} 일기 ${s.count}개`}
                  testID={`constellation-topic-${s.topic}`}
                  style={[
                    styles.chip,
                    { paddingHorizontal: f(11), height: f(30), borderRadius: f(15) },
                    selected && { backgroundColor: whiteAlpha(0.92), borderColor: whiteAlpha(0.92) },
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      { fontSize: f(12.5), lineHeight: f(17) },
                      selected && { color: DesignPaint.menuText, fontFamily: DesignFonts.bold },
                      !selected && s.count === 0 && { color: whiteAlpha(0.45) },
                    ]}>
                    {s.label} {s.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 레벨 카드 */}
          {status && (
            <ScrollView horizontal showsHorizontalScrollIndicator testID="constellation-level-scroll" style={{marginTop:f(10),flexGrow:0}} contentContainerStyle={[styles.levelRow,{gap:f(8)}]}>
              {status.levels.map((l) => {
                const selected = l.unlocked && l.template.id === current?.id;
                return (
                  <TouchableOpacity
                    key={l.template.id}
                    disabled={!l.unlocked}
                    onPress={() => onSelectTemplate(l.template)}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: !l.unlocked }}
                    accessibilityLabel={`Level ${l.template.level} ${l.template.shape} ${l.unlocked ? '해금' : `잠김, ${l.remaining}개 더 필요`}`}
                    testID={`constellation-level-${l.template.level}`}
                    style={[styles.levelCard, { width: f(94), paddingVertical: f(6), paddingHorizontal: f(4) }]}>
                    <ChamferFrame
                      cut={f(8)}
                      fill={selected ? whiteAlpha(0.12) : grayAlpha(0.05)}
                      stroke={selected ? whiteAlpha(0.95) : whiteAlpha(l.unlocked ? 0.4 : 0.18)}
                    />
                    <View>
                      <ConstellationPreview template={l.template} size={f(52)} locked={!l.unlocked} color={color} />
                      {!l.unlocked && (
                        <View style={[styles.lockBadge, { right: -f(2), bottom: -f(2) }]}>
                          <LockIcon size={f(12)} />
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.levelText,
                        { fontSize: f(11.5), lineHeight: f(16) },
                        !l.unlocked && { color: whiteAlpha(0.45) },
                        selected && { fontFamily: DesignFonts.bold },
                      ]}
                      numberOfLines={1}>
                      Lv{l.template.level} {l.template.shape} {l.unlocked ? '✓' : ''}
                    </Text>
                    <Text style={[styles.levelSub, { fontSize: f(10), lineHeight: f(14) }]} numberOfLines={1}>
                      {l.unlocked ? `행성 ${l.template.requiredPlanets}개` : `${l.remaining}개 더`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {personal && (
                <TouchableOpacity
                  key="personal"
                  onPress={() => {
                    if (personal.state === 'ready' && personal.template) {
                      onSelectTemplate(personal.template);
                      setPersonalOpen(false);
                    } else {
                      setPersonalOpen((v) => !v);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isPersonalCurrent }}
                  accessibilityLabel={
                    personal.state === 'ready'
                      ? `Level 4 나만의 별자리 ${personal.template?.shape ?? ''}`
                      : `Level 4 나만의 별자리, ${personal.state === 'locked' ? `${personal.remaining}개 더 필요` : '자세히'}`
                  }
                  testID="constellation-level-4"
                  style={[styles.levelCard, { width: f(94), paddingVertical: f(6), paddingHorizontal: f(4) }]}>
                  <ChamferFrame
                    cut={f(8)}
                    fill={isPersonalCurrent || personalOpen ? whiteAlpha(0.12) : grayAlpha(0.05)}
                    stroke={
                      isPersonalCurrent
                        ? whiteAlpha(0.95)
                        : whiteAlpha(personal.state === 'locked' ? 0.18 : personal.state === 'available' ? 0.75 : 0.4)
                    }
                  />
                  <View>
                    {personalPreview ? (
                      <ConstellationPreview
                        template={personalPreview}
                        size={f(52)}
                        locked={personal.state !== 'ready'}
                        color={color}
                      />
                    ) : personal.state === 'pending' ? (
                      <View style={{ width: f(52), height: f(52), alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="small" color={whiteAlpha(0.85)} />
                      </View>
                    ) : (
                      <PersonalBadge
                        size={f(52)}
                        mark={personal.state === 'available' ? '+' : personal.state === 'locked' ? '?' : '!'}
                        dim={personal.state === 'locked'}
                      />
                    )}
                    {personal.state === 'locked' && (
                      <View style={[styles.lockBadge, { right: -f(2), bottom: -f(2) }]}>
                        <LockIcon size={f(12)} />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.levelText,
                      { fontSize: f(11.5), lineHeight: f(16) },
                      personal.state === 'locked' && { color: whiteAlpha(0.45) },
                      isPersonalCurrent && { fontFamily: DesignFonts.bold },
                    ]}
                    numberOfLines={1}>
                    Lv4 {personal.state === 'ready' || personal.state === 'short' ? personal.template?.shape : '나만의'}{' '}
                    {personal.state === 'ready' ? '✓' : ''}
                  </Text>
                  <Text style={[styles.levelSub, { fontSize: f(10), lineHeight: f(14) }]} numberOfLines={1}>
                    {personal.state === 'locked' || personal.state === 'short'
                      ? `${personal.remaining}개 더`
                      : personal.state === 'available'
                        ? '만들기'
                        : personal.state === 'pending'
                          ? '만드는 중'
                          : personal.state === 'ready'
                            ? `행성 ${personal.required}개`
                            : '실패'}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {personal && showPersonalBox && onCreatePersonal && (
            <PersonalBox
              personal={personal}
              busy={personalBusy}
              current={isPersonalCurrent}
              topicLabel={status?.label ?? ''}
              scale={scale}
              onCreate={onCreatePersonal}
            />
          )}

          {/* 진행 상황 + 이 별자리의 기록 */}
          {status && (
            <Text style={[styles.progress, { fontSize: f(12), lineHeight: f(17), marginTop: f(8) }]}>
              {status.label} 일기 {status.count}개
              {status.next
                ? ` · 다음 단계(${status.next.template.shape})까지 ${status.next.remaining}개`
                : personal && personal.remaining > 0
                  ? ` · 나만의 별자리까지 ${personal.remaining}개`
                  : ' · 모든 별자리를 열었어요'}
            </Text>
          )}
          {current && members.length > 0 && (
            <ScrollView
              horizontal
              testID="constellation-diary-scroll"
              showsHorizontalScrollIndicator
              style={{ marginTop: f(6), flexGrow: 0 }}
              contentContainerStyle={{ gap: f(5) }}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => onOpenEntry(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDate(m.createdAt)} 일기 보기`}
                  style={[styles.memberChip, { height: f(24), paddingHorizontal: f(8), borderRadius: f(12), gap: f(5) }]}>
                  <View style={{ width: f(7), height: f(7), borderRadius: f(4), backgroundColor: m.color }} />
                  <Text style={[styles.memberText, { fontSize: f(11), lineHeight: f(15) }]}>{formatDate(m.createdAt)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    backgroundColor: 'rgba(8,9,16,0.6)',
    borderWidth: 1,
    borderColor: whiteAlpha(0.45),
  },
  toggleItem: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  toggleItemOn: { backgroundColor: whiteAlpha(0.92) },
  toggleText: { color: DesignPaint.ink, fontFamily: DesignFonts.regular, includeFontPadding: false },
  panel: { position: 'relative' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { color: DesignPaint.ink, fontFamily: DesignFonts.bold, includeFontPadding: false },
  subtitle: { color: whiteAlpha(0.7), fontFamily: DesignFonts.regular, includeFontPadding: false },
  collapse: { alignItems: 'center', justifyContent: 'center' },
  frontButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: whiteAlpha(0.45) },
  frontText: { color: DesignPaint.ink, fontFamily: DesignFonts.regular, includeFontPadding: false },
  hint: { color: whiteAlpha(0.75), fontFamily: DesignFonts.regular },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: whiteAlpha(0.35),
    backgroundColor: grayAlpha(0.06),
  },
  chipText: { color: DesignPaint.ink, fontFamily: DesignFonts.regular, includeFontPadding: false },
  levelRow: { flexDirection: 'row' },
  levelCard: { flexShrink: 0, alignItems: 'center' },
  lockBadge: { position: 'absolute' },
  levelText: { color: DesignPaint.ink, fontFamily: DesignFonts.regular, marginTop: 2, includeFontPadding: false },
  levelSub: { color: whiteAlpha(0.55), fontFamily: DesignFonts.regular, includeFontPadding: false },
  progress: { color: whiteAlpha(0.8), fontFamily: DesignFonts.regular },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: whiteAlpha(0.25),
  },
  memberText: { color: whiteAlpha(0.85), fontFamily: DesignFonts.regular, includeFontPadding: false },
  box: { borderWidth: 1, borderColor: whiteAlpha(0.22), backgroundColor: grayAlpha(0.06) },
  boxTitle: { color: DesignPaint.ink, fontFamily: DesignFonts.bold, includeFontPadding: false },
  boxText: { color: whiteAlpha(0.85), fontFamily: DesignFonts.regular },
  boxNote: { color: whiteAlpha(0.6), fontFamily: DesignFonts.regular },
  stageRow: { flexDirection: 'row', alignItems: 'center' },
  stageMark: { color: whiteAlpha(0.9), fontFamily: DesignFonts.bold, textAlign: 'center' },
  createButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: whiteAlpha(0.92) },
  createText: { color: DesignPaint.menuText, fontFamily: DesignFonts.bold, includeFontPadding: false },
});
