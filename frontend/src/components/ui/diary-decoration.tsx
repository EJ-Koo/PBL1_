import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import { DesignPaint } from '@/constants/ui-design';

function FrameCorners({ size, stroke, color }: { size: number; stroke: number; color: string }) {
  return (['top', 'bottom'] as const).flatMap(vertical => (['left', 'right'] as const).map(horizontal =>
    <View key={vertical + horizontal} style={{
      position: 'absolute', [vertical]: 0, [horizontal]: 0, width: size, height: size, borderColor: color,
      borderTopWidth: vertical === 'top' ? stroke : 0, borderBottomWidth: vertical === 'bottom' ? stroke : 0,
      borderLeftWidth: horizontal === 'left' ? stroke : 0, borderRightWidth: horizontal === 'right' ? stroke : 0,
    }} />,
  ));
}

type FrameProps = { scale: number; wide: boolean; highlighted?:boolean };

export function DiaryBackFrame({ scale, wide }: FrameProps) {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <FrameCorners size={9 * scale} stroke={wide ? 1 : 2 * scale} color={wide ? '#888' : DesignPaint.ink} />
    {!wide && <View style={{ position: 'absolute', left: 0, right: 0, top: 12 * scale, bottom: 12 * scale,
      borderColor: DesignPaint.ink, borderLeftWidth: 1, borderRightWidth: 1 }} />}
  </View>;
}

export function DiaryInputFrame({ scale, wide, highlighted=false }: FrameProps) {
  const gridId = 'diary-grid-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const cell = (wide ? 20 : 11) * scale;
  const inset = (wide ? 20 : 8) * scale;
  const gap = 28 * scale;
  const edge = { position: 'absolute', borderColor: highlighted?'#f6d879':wide ? '#555' : '#ccc' } as const;
  return <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <View style={{ position: 'absolute', left: inset, right: inset, top: inset, bottom: inset }}>
      <Svg width="100%" height="100%">
        <Defs><Pattern id={gridId} patternUnits="userSpaceOnUse" width={cell} height={cell}>
          <Path d={`M0 ${cell}V0H${cell}`} fill="none" stroke="#222" strokeWidth={1.25} />
        </Pattern></Defs>
        <Rect width="100%" height="100%" fill={`url(#${gridId})`} />
      </Svg>
    </View>
    <View style={[edge, { left: gap, right: gap, top: 0, bottom: 0, borderTopWidth: 1, borderBottomWidth: 1 }]} />
    <View style={[edge, { left: 0, right: 0, top: gap, bottom: gap, borderLeftWidth: 1, borderRightWidth: 1 }]} />
    <FrameCorners size={(wide ? 16 : 13) * scale} stroke={wide ? 1 : 3 * scale} color={highlighted?'#f6d879':wide ? '#999' : DesignPaint.ink} />
  </View>;
}

export function DiaryPhotoAddFrame({ wide, highlighted=false }: { wide: boolean; highlighted?:boolean }) {
  return <Svg width="100%" height="100%" viewBox="0 0 128 128" pointerEvents="none">
    {wide ? <Path d="M0.5 10V0.5H10 M15 0.5H113 M118 .5H127.5V10 M127.5 15V113 M127.5 118V127.5H118 M113 127.5H15 M10 127.5H.5V118 M.5 113V15"
      stroke={highlighted?'#f6d879':'#888'} strokeWidth={highlighted?1.5:0.65} fill="none" /> : <>
      <Rect x={0.75} y={0.75} width={126.5} height={126.5} fill="none" stroke={highlighted?'#f6d879':DesignPaint.ink} strokeWidth={1.5} />
      <Path d="M18.5 8.5H9.5V17.5 M110.5 8.5H119.5V17.5 M9.5 109.5V118.5H18.5 M110.5 118.5H119.5V109.5"
        fill="none" stroke={DesignPaint.ink} strokeWidth={1.4} />
    </>}
    <Path d="M50 33H42V41 M78 33H86V41 M42 67V75H50 M78 75H86V67 M64 45V61 M56 53H72"
      fill="none" stroke={DesignPaint.ink} strokeWidth={wide ? 0.85 : 1.4} />
  </Svg>;
}

export function DiaryPhotoEmptyFrame() {
  return <Svg width="100%" height="100%" viewBox="0 0 128 128" pointerEvents="none">
    <Rect x={0.75} y={0.75} width={126.5} height={126.5} fill="none" stroke={DesignPaint.ink} />
    <Rect x={5} y={5} width={118} height={118} fill="none" stroke={DesignPaint.ink} strokeWidth={0.7} />
  </Svg>;
}

export function DiaryLockIcon({ scale }: { scale: number }) {
  return (
    <Svg width={14 * scale} height={18 * scale} viewBox="0 0 14 18" pointerEvents="none">
      <Path d="M3 7V4.5A4 4 0 0 1 11 4.5V7" fill="none" stroke={DesignPaint.ink} strokeWidth={1.7} />
      <Rect x={0.5} y={6.5} width={13} height={11} rx={1.2} fill={DesignPaint.ink} />
    </Svg>
  );
}

export function DiarySubmitFrame({ wide, highlighted=false }: { wide: boolean; highlighted?:boolean }) {
  return <Svg width="100%" height="100%" viewBox="0 0 344 58" preserveAspectRatio="none" pointerEvents="none">
    <Path d="M2 24L21 4.5H324L342 24V37L324 55.5H21L2 37Z" fill={DesignPaint.diarySubmit}
      stroke={highlighted?'#f6d879':DesignPaint.ink} strokeWidth={highlighted?2:wide ? 1 : 2} />
    <Path d="M12 1.5H2V11.5 M332 1.5H342V11.5 M2 45.5V55.5H12 M332 55.5H342V45.5"
      fill="none" stroke={DesignPaint.ink} strokeWidth={2} />
  </Svg>;
}
