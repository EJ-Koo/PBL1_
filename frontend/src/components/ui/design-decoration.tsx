import { CoinIcon } from '@/components/coin-icon';
import { useId } from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import { DesignColors, DesignPaint } from '@/constants/ui-design';
import { getBottomNavLayout } from '@/lib/responsive-layout';

export function HomeHudFrame({ scale, width = 393 * scale, wide = false }: { scale: number; width?: number; wide?: boolean }) {
  const frameWidth = scale > 0 ? width / scale : 393;
  const center = frameWidth / 2;
  const notchLeft = center - (wide ? 154 : 73);
  const notchRight = center + (wide ? 154 : 73);
  const stripes = Math.max(0, Math.floor((notchLeft + 5) / 7));
  return (
    <Svg width={width} height={75 * scale} viewBox={`0 0 ${frameWidth} 75`} pointerEvents="none">
      <Path
        d={`M2 .5H${notchLeft - 10}L${notchLeft} 8H${notchRight}L${notchRight + 11} .5H${frameWidth}
          M2 58H${notchLeft - 10}L${notchLeft} 50H${notchRight}L${notchRight + 10} 58H${frameWidth}
          ${wide ? '' : `M${notchLeft} .5H${notchRight} M${notchLeft} 58H${notchRight}`}`}
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
        {Array.from({ length: stripes }, (_, i) => (
          <Path key={i} d={`M${2 + i * 7} 73L${10 + i * 7} 65 M${frameWidth - 2 - i * 7} 73L${frameWidth - 10 - i * 7} 65`} />
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
  if (kind === 'coin') return <CoinIcon size={24 * scale} />;
  return (
    <Svg width={22 * scale} height={24 * scale} viewBox="0 0 22 24" pointerEvents="none">
      {kind === 'star' && (
        <Path d="M11 1L14.2 8.1L21.8 8.8L16 14L17.8 21.5L11 17.4L4.2 21.5L6 14L.2 8.8L7.8 8.1Z" fill={DesignPaint.ink} />
      )}
      {kind === 'check' && (
        <Path d="M3 13L8 18L18 6" fill="none" stroke={DesignPaint.ink} strokeWidth={1.7} />
      )}
    </Svg>
  );
}

export function BottomNavFrame({ scale, width = 393 * scale }: { scale: number; width?: number }) {
  const id = useId().replace(/:/g, '');
  const clipId = `bottom-stripes-${id}`;
  const frameWidth = scale > 0 ? width / scale : 393;
  const layout = getBottomNavLayout(frameWidth);
  const { items, lineY, stripeLeft, stripeRight, stripeWidth, stripeY, stripeHeight, stripePitch, stripeStroke } = layout;
  return (
    <Svg width={width} height={layout.height * scale} viewBox={`0 0 ${frameWidth} ${layout.height}`} pointerEvents="none">
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={stripeLeft} y={stripeY} width={stripeWidth} height={stripeHeight} />
          <Rect x={stripeRight} y={stripeY} width={stripeWidth} height={stripeHeight} />
        </ClipPath>
      </Defs>
      <Path d={`M0 ${lineY}H${frameWidth}`}
        fill="none" stroke={DesignPaint.ink} strokeWidth={0.8} />
      <G clipPath={`url(#${clipId})`}>
        {Array.from({ length: Math.ceil(stripeWidth / stripePitch) + 3 }, (_, i) => (
          <Path key={i}
            d={[stripeLeft, stripeRight].map((left) =>
              `M${left + i * stripePitch - stripeHeight} ${stripeY + stripeHeight + 2}L${left + i * stripePitch + 2} ${stripeY - 2}`).join(' ')}
            stroke={DesignColors.gray} strokeWidth={stripeStroke} />
        ))}
      </G>
      {items.map(({ id, x, y, width, height }) => (
        <Rect key={id} x={x} y={y} width={width} height={height}
          fill={DesignPaint.bottomBar} stroke={DesignPaint.ink} strokeWidth={1} />
      ))}
    </Svg>
  );
}
