// 일기 검색 화면의 날짜 검색용 월 달력. 일기를 쓴 날에는 점을 찍어 표시한다.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { toDateKey } from '@/lib/search';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  markedDays: Set<string>; // 일기를 쓴 날 'YYYY-MM-DD'
  selected: string | null;
  onSelect: (dateKey: string) => void;
};

export function SearchCalendar({ markedDays, selected, onSelect }: Props) {
  // 선택된 날짜가 있으면 그 달, 없으면 이번 달부터 보여준다.
  const [cursor, setCursor] = useState(() => {
    const base = selected ? new Date(`${selected}T00:00:00`) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const moveMonth = (delta: number) => {
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  // 오늘 날짜는 달력을 연 시점에 한 번만 계산한다 (렌더링마다 Date.now()를 부르지 않도록).
  const [todayKey] = useState(() => toDateKey(Date.now()));

  // 앞쪽 빈칸 + 날짜를 7칸씩 끊어 주 단위로 만든다.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => moveMonth(-1)} hitSlop={10} style={styles.arrow}>
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text style={styles.monthText}>
          {cursor.year}년 {cursor.month + 1}월
        </Text>
        <Pressable onPress={() => moveMonth(1)} hitSlop={10} style={styles.arrow}>
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekday, i === 0 && styles.sunday]}>
            {w}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.row}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={styles.cell} />;
            const key = toDateKey(new Date(cursor.year, cursor.month, day).getTime());
            const isSelected = key === selected;
            const hasDiary = markedDays.has(key);
            return (
              <Pressable key={di} style={styles.cell} onPress={() => onSelect(key)}>
                <View style={[styles.dayCircle, isSelected && styles.daySelected]}>
                  <Text
                    style={[
                      styles.dayText,
                      di === 0 && styles.sunday,
                      key === todayKey && styles.today,
                      isSelected && styles.daySelectedText,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                <View style={[styles.dot, !hasDiary && styles.dotHidden]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#15151F',
    borderWidth: 1,
    borderColor: '#33334A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  arrow: { paddingHorizontal: 10 },
  arrowText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  monthText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: '#9C9CC0',
    fontSize: 12,
    paddingVertical: 4,
  },
  sunday: { color: '#F08080' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: '#DCDDE1' },
  dayText: { color: '#FFFFFF', fontSize: 14 },
  daySelectedText: { color: '#111111', fontWeight: '700' },
  today: { fontWeight: '800', textDecorationLine: 'underline' },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#7FB3FF', marginTop: 2 },
  dotHidden: { backgroundColor: 'transparent' },
});
