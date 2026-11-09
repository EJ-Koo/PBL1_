import { useId } from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import { DesignColors, DesignPaint } from '@/constants/ui-design';

export function HomeHudFrame({ scale }: { scale: number }) {
  return (
    <Svg width={393 * scale} height={75 * scale} viewBox="0 0 393 75" pointerEvents="none">
      <Path
        d="M2 .5H114L124 8H270L281 .5H393 M124 .5H269 M2 58H114L124 50H270L280 58H393 M124 58H269"
        fill="none"
        stroke={DesignPaint.hudFrame}
        strokeWidth={1}
      />
      <Path
        d="M23 10H15V18 M15 22V38 M15 42V47H23 M58 10H66V18 M66 22V38 M66 42V47H58"
        fill="none"
        stroke={DesignPaint.ink}
        strokeWidth={1.5}
      />
      <Path d="M29 20H51 M29 28.5H51 M29 37H51" stroke={DesignPaint.ink} strokeWidth={1.3} />
      <G stroke={DesignPaint.hudHatching} strokeWidth={1}>
        {Array.from({ length: 18 }, (_, i) => (
          <Path key={i} d={`M${2 + i * 7} 73L${10 + i * 7} 65 M${267 + i * 7} 65L${275 + i * 7} 73`} />
        ))}
      </G>
    </Svg>
  );
}

export function QuestFrame({ scale }: { scale: number }) {
  return (
    <Svg width={77 * scale} height={38 * scale} viewBox="0 0 77 38" pointerEvents="none">
      <Path
        d="M11 1H76V27L66 37H1V12Z"
        fill={DesignPaint.quest}
        stroke={DesignPaint.ink}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

export function HudIcon({ kind, scale }: { kind: 'star' | 'coin' | 'check'; scale: number }) {
  return (
    <Svg width={22 * scale} height={24 * scale} viewBox="0 0 22 24" pointerEvents="none">
      {kind === 'star' && (
        <Path d="M11 1L14.2 8.1L21.8 8.8L16 14L17.8 21.5L11 17.4L4.2 21.5L6 14L.2 8.8L7.8 8.1Z" fill={DesignPaint.ink} />
      )}
      {kind === 'coin' && (
        <Path
          d="M21 12A10 10 0 1 1 1 12A10 10 0 1 1 21 12ZM11 5L7 12L11 19L15 12Z"
          fill={DesignPaint.ink}
          fillRule="evenodd"
        />
      )}
      {kind === 'check' && (
        <Path d="M3 13L8 18L18 6" fill="none" stroke={DesignPaint.ink} strokeWidth={1.7} />
      )}
    </Svg>
  );
}

export function BottomNavFrame({ scale }: { scale: number }) {
  const id = useId().replace(/:/g, '');
  const clipId = `bottom-stripes-${id}`;
  return (
    <Svg width={393 * scale} height={31 * scale} viewBox="0 0 393 31" pointerEvents="none">
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={11} y={15} width={71} height={15} />
          <Rect x={312} y={15} width={71} height={15} />
        </ClipPath>
      </Defs>
      <Path d="M0 8H93L103 .5H290L302 8H393" fill="none" stroke={DesignPaint.ink} strokeWidth={0.8} />
      <G clipPath={`url(#${clipId})`}>
        <Rect x={11} y={15} width={71} height={15} fill={DesignColors.black} />
        <Rect x={312} y={15} width={71} height={15} fill={DesignColors.black} />
        {Array.from({ length: 9 }, (_, i) => (
          <Path
            key={i}
            d={`M${i * 15 - 5} 32L${i * 15 + 14} 13 M${i * 15 + 296} 32L${i * 15 + 315} 13`}
            stroke={DesignColors.gray}
            strokeWidth={7}
          />
        ))}
      </G>
      <Path
        d="M92.5 29.5V20L107.5 8.5H140.5V29.5Z M147.5 8.5H246.5V29.5H147.5Z M253.5 8.5H284.5L301.5 21V29.5H253.5Z"
        fill={DesignPaint.bottomBar}
        stroke={DesignPaint.ink}
        strokeWidth={1}
      />
    </Svg>
  );
}
