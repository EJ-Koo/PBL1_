import Svg, { Circle, Path } from 'react-native-svg';

import { DesignColors, DesignPaint } from '@/constants/ui-design';

export function GroupHeaderFrame({ scale }: { scale: number }) {
  return (
    <Svg width={363 * scale} height={63 * scale} viewBox="0 0 363 63" pointerEvents="none">
      <Path
        d="M15 1H1V10 M22 .5H340 M347 1H362V10 M1 50V60H16 M22 60.5H182L204 38H361V27"
        fill="none"
        stroke={DesignPaint.ink}
        strokeWidth={1.2}
      />
      <Path
        d="M210 31L231 9H245L224 31Z M232 31L253 9H267L246 31Z M254 31L275 9H289L268 31Z M276 31L297 9H360V31Z"
        fill={DesignPaint.groupHatching}
      />
    </Svg>
  );
}

export function GroupCardFrame({ scale, height = 249 }: { scale: number; height?: number }) {
  return (
    <Svg width={362 * scale} height={height * scale} viewBox={`0 0 362 ${height}`} pointerEvents="none">
      <Path
        d={`M8 .75H.75V7 M352 .75H360.25V7 M.75 ${height - 9}V${height - 1.5}H8 M352 ${height - 1.5}H360.25V${height - 9}`}
        fill="none"
        stroke={DesignColors.gray}
        strokeWidth={1.3}
      />
      <Path
        d="M0 19L4 28V79L0 88Z M0 166L5 157V207L0 226Z"
        fill={DesignPaint.groupBraceLeft}
      />
      <Path
        d="M360 21L355 38V89L360 82Z M355 163L360 172V220L355 208Z"
        fill={DesignPaint.groupBraceRight}
      />
    </Svg>
  );
}

export function GroupLabelFrame({ scale, first, height = 249 }: { scale: number; first: boolean; height?: number }) {
  const left = first ? 16 : 15;
  return (
    <Svg width={362 * scale} height={height * scale} viewBox={`0 0 362 ${height}`} pointerEvents="none">
      <Path
        d={`M${left} 203.2H195L228 ${height - 10}H341 M${first ? 20 : 19} ${height - 9.85}L215 ${height - 9}`}
        fill="none"
        stroke={DesignPaint.ink}
        strokeWidth={0.8}
      />
    </Svg>
  );
}

export function GroupAddIcon({ scale }: { scale: number }) {
  return (
    <Svg width={44 * scale} height={44 * scale} viewBox="0 0 44 44" pointerEvents="none">
      <Circle cx={22} cy={22} r={21.5} fill="none" stroke={DesignPaint.ink} strokeWidth={1} />
      <Circle cx={22} cy={22} r={15.5} fill="none" stroke={DesignPaint.ink} strokeWidth={0.8} />
      <Path d="M16 22H28 M22 16V28" stroke={DesignPaint.groupAddCross} strokeWidth={1} />
    </Svg>
  );
}
