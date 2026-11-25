export type UfoPose = 'idle' | 'swim' | 'beam';

// Align the original PNGs without changing the artwork. The craft keeps the same
// size and position when the beam appears; transparent margins stay off canvas.
export const UFO_CANVAS = 1200;
export const UFO_FRAMES = {
  idle: { source: require('../../assets/images/cursors/ufo-mint-idle.png'), width: 1536, height: 1024, left: 169, top: 152 },
  swim: { source: require('../../assets/images/cursors/ufo-mint-swim.png'), width: 1808, height: 1525, left: 331, top: 381 },
  beam: { source: require('../../assets/images/cursors/ufo-mint-beam.png'), width: 1931, height: 1927, left: 366, top: 205 },
} as const;

export const UFO_ITEM_ID = 'cursor_ufo_mint';
export const UFO_NAME = 'UFO(민트)';
export const UFO_DESCRIPTION = '좌우로 움직이면 유영하고, 클릭하면 민트빛 빔을 쏘는 UFO 커서';
