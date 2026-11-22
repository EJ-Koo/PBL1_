export type StarPopupAnchor = {
  id: string;
  x: number;
  y: number;
  radius: number;
  visible: boolean;
};

export function starPopupMinimumHeight(width: number, author: boolean, actions: boolean, fontScale = 1) {
  const avatar = Math.min(88, width * 0.22);
  const authorText = width < 340 ? (28 + 12) * fontScale + 6 : 32 * fontScale + 8;
  const header = author ? Math.max(avatar + 12, authorText) : Math.max(54, 30 * fontScale);
  return Math.ceil(header + (actions ? Math.max(40, 24 * fontScale + 12) : 0) + 26 + 48 * fontScale + 4);
}

export function starPopupWidth(width: number, variant: 'personal' | 'group' = 'personal') {
  return variant === 'group' ? Math.min(320, Math.max(212, width * 0.58), width - 64) : Math.min(440, width - 32);
}

/** Keep the diary readable inside the screen, with its tail pointing at the star. */
export function getStarPopupLayout(
  anchor: StarPopupAnchor,
  viewport: { width: number; height: number; topInset: number; bottomInset: number; minBodyHeight?: number },
  variant: 'personal' | 'group' = 'personal',
) {
  const { width, height, topInset, bottomInset } = viewport;
  const margin = 16;
  const popupWidth = starPopupWidth(width, variant);
  const avatarOverhang = variant === 'group' ? 32 : 0;
  const top = Math.max(margin, topInset);
  const bottom = height - Math.max(margin, bottomInset);
  const minimum = Math.max(120, viewport.minBodyHeight ?? 164);
  const gap = 16;
  const normalTail = variant === 'group' ? 20 : 36;
  // At extreme zoom the card may overlap the star's edge, but must remain readable.
  const aboveGap = Math.min(anchor.radius + gap, Math.max(gap, anchor.y - top - minimum - normalTail));
  const belowGap = Math.min(anchor.radius + gap, Math.max(gap, bottom - anchor.y - minimum - normalTail));
  const aboveTip = anchor.y - aboveGap;
  const belowTip = anchor.y + belowGap;
  const aboveBodyBottom = Math.min(bottom, aboveTip - normalTail);
  const belowBodyTop = Math.max(top, belowTip + normalTail);
  const aboveSpace = aboveBodyBottom - top;
  const belowSpace = bottom - belowBodyTop;
  // Prefer the reference's upward placement; flip only when there isn't room to read.
  const above = aboveSpace >= minimum || (belowSpace < minimum && aboveSpace >= belowSpace);
  const bodyHeight = Math.min(Math.max(240, minimum), Math.max(minimum, above ? aboveSpace : belowSpace), bottom - top - 12);
  const bodyTop = Math.max(top, Math.min(bottom - bodyHeight, above ? aboveBodyBottom - bodyHeight : belowBodyTop));
  const tailHeight = Math.max(12, above ? aboveTip - bodyTop - bodyHeight : bodyTop - belowTip);
  if (popupWidth < 180 || bodyHeight < 120) return null;

  const left = Math.max(margin + avatarOverhang, Math.min(width - popupWidth - margin, anchor.x - popupWidth / 2));
  const tailX = anchor.x - left;
  const tailBaseX = Math.max(40, Math.min(popupWidth - 40, tailX));
  return {
    left,
    top: above ? bodyTop : bodyTop - tailHeight,
    width: popupWidth,
    bodyHeight,
    tailHeight,
    tailX,
    tailBaseX,
    above,
  };
}
