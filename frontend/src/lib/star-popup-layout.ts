export type StarPopupAnchor = {
  id: string;
  x: number;
  y: number;
  radius: number;
  visible: boolean;
};

/** Keep the diary readable inside the screen, with its tail pointing at the star. */
export function getStarPopupLayout(
  anchor: StarPopupAnchor,
  viewport: { width: number; height: number; topInset: number; bottomInset: number },
  variant: 'personal' | 'group' = 'personal',
) {
  const { width, height, topInset, bottomInset } = viewport;
  const group = variant === 'group';
  // Leave room for the large profile overlapping the group's compact card.
  const avatarOverhang = group ? 32 : 0;
  const margin = 16;
  const popupWidth = group ? Math.min(320, Math.max(212, width * 0.58), width - margin * 2 - avatarOverhang) : Math.min(440, width - margin * 2);
  const top = Math.max(margin, topInset);
  const bottom = height - Math.max(margin, bottomInset);
  const gap = 16;
  const normalTail = group ? 20 : 36;
  const minBody = group ? 128 : 164;
  // At extreme zoom the card may overlap the star's edge, but must remain readable.
  const aboveGap = Math.min(anchor.radius + gap, Math.max(gap, anchor.y - top - minBody - normalTail));
  const belowGap = Math.min(anchor.radius + gap, Math.max(gap, bottom - anchor.y - minBody - normalTail));
  const aboveTip = anchor.y - aboveGap;
  const belowTip = anchor.y + belowGap;
  const aboveBodyBottom = Math.min(bottom, aboveTip - normalTail);
  const belowBodyTop = Math.max(top, belowTip + normalTail);
  const aboveSpace = aboveBodyBottom - top;
  const belowSpace = bottom - belowBodyTop;
  // Prefer the reference's upward placement; flip only when there isn't room to read.
  const above = aboveSpace >= 144 || aboveSpace >= belowSpace;
  const bodyHeight = Math.min(group ? 150 : 240, above ? aboveSpace : belowSpace);
  if (popupWidth < 180 || bodyHeight < 120) return null;

  const left = Math.max(margin + avatarOverhang, Math.min(width - popupWidth - margin, anchor.x - popupWidth / 2));
  const tailX = anchor.x - left;
  const tailBaseX = Math.max(40, Math.min(popupWidth - 40, tailX));
  return {
    left,
    top: above ? aboveBodyBottom - bodyHeight : belowTip,
    width: popupWidth,
    bodyHeight,
    tailHeight: above ? aboveTip - aboveBodyBottom : belowBodyTop - belowTip,
    tailX,
    tailBaseX,
    above,
  };
}
