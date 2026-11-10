import Svg, { G, Path, Rect } from 'react-native-svg';

import { DesignPaint } from '@/constants/ui-design';

export function DiaryBackFrame({ scale }: { scale: number }) {
  return (
    <Svg width={360 * scale} height={40 * scale} viewBox="0 0 360 40" pointerEvents="none">
      <Path
        d="M9 1H1V9 M1 12V27 M1 30V38H9 M351 1H359V9 M359 12V27 M359 30V38H351"
        fill="none"
        stroke={DesignPaint.ink}
        strokeWidth={1.5}
      />
      <Path d="M26 15L21 20.5L26 26" fill="none" stroke={DesignPaint.ink} strokeWidth={1.4} />
    </Svg>
  );
}

export function DiaryInputFrame({ scale }: { scale: number }) {
  return (
    <Svg width={344 * scale} height={233 * scale} viewBox="0 0 344 233" pointerEvents="none">
      <G stroke={DesignPaint.diaryGrid} strokeWidth={1}>
        {Array.from({ length: 29 }, (_, i) => (
          <Path key={`v-${i}`} d={`M${13 + i * 11.25} 6V227`} />
        ))}
        {Array.from({ length: 21 }, (_, i) => (
          <Path key={`h-${i}`} d={`M9 ${11.5 + i * 10.5}H335`} />
        ))}
      </G>
      <Path
        d="M28 2.5H319 M1.5 27V207 M343.5 27V207 M28 231.5H317"
        fill="none"
        stroke={DesignPaint.ink}
        strokeWidth={0.7}
      />
      <Path
        d="M13.5 2H2V13.5 M330.5 2H342V13.5 M2 218.5V230H13.5 M330.5 230H342V218.5"
        fill="none"
        stroke={DesignPaint.ink}
        strokeWidth={3}
      />
    </Svg>
  );
}

export function DiaryPhotoAddFrame({ scale }: { scale: number }) {
  return (
    <Svg width={128 * scale} height={129 * scale} viewBox="0 0 128 129" pointerEvents="none">
      <Rect x={0.75} y={0.75} width={126.5} height={127} fill="none" stroke={DesignPaint.ink} strokeWidth={1.5} />
      <Path
        d="M18.5 8.5H9.5V17.5 M110.5 8.5H119.5V17.5 M9.5 109.5V118.5H18.5 M110.5 118.5H119.5V109.5 M50 33H42V41 M78 33H86V41 M42 67V75H50 M78 75H86V67"
        fill="none"
        stroke={DesignPaint.ink}
        strokeWidth={1.4}
      />
      <Path d="M64 43V63 M54 53H74" stroke={DesignPaint.ink} strokeWidth={1.3} />
    </Svg>
  );
}

export function DiaryPhotoEmptyFrame({ scale }: { scale: number }) {
  return (
    <Svg width={131 * scale} height={129 * scale} viewBox="0 0 131 129" pointerEvents="none">
      {/* The outer right edge in the reference slants outward by about 2dp. */}
      <Path d="M.75 .75H127.25L129.25 127.25H.75Z" fill="none" stroke={DesignPaint.ink} strokeWidth={1.5} />
      <Rect x={7} y={7} width={115} height={114.5} fill="none" stroke={DesignPaint.ink} strokeWidth={1.5} />
    </Svg>
  );
}

export function DiaryLockIcon({ scale }: { scale: number }) {
  return (
    <Svg width={14 * scale} height={18 * scale} viewBox="0 0 14 18" pointerEvents="none">
      <Path d="M3 7V4.5A4 4 0 0 1 11 4.5V7" fill="none" stroke={DesignPaint.ink} strokeWidth={1.7} />
      <Rect x={0.5} y={6.5} width={13} height={11} rx={1.2} fill={DesignPaint.ink} />
    </Svg>
  );
}

export function DiarySubmitFrame({ scale }: { scale: number }) {
  return (
    <Svg width={344 * scale} height={58 * scale} viewBox="0 0 344 58" pointerEvents="none">
      <Path
        d="M2 24L21 4.5H324L342 24V37L324 55.5H21L2 37Z"
        fill={DesignPaint.diarySubmit}
        stroke={DesignPaint.ink}
        strokeWidth={2}
      />
      <Path
        d="M12 1.5H2V11.5 M332 1.5H342V11.5 M2 45.5V55.5H12 M332 55.5H342V45.5"
        fill="none"
        stroke={DesignPaint.ink}
        strokeWidth={2}
      />
    </Svg>
  );
}
