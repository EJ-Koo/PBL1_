type Insets = { top: number; bottom: number; left: number; right: number };

// Keep the 393dp artwork readable without enlarging it to tablet/desktop size.
export function getResponsiveLayout(width: number, height: number, insets: Insets) {
  const availableWidth = Math.max(0, width - insets.left - insets.right);
  const scale = Math.min(availableWidth / 393, 1.15);
  const contentWidth = 393 * scale;
  const contentLeft = insets.left + (availableWidth - contentWidth) / 2;
  const wide = availableWidth >= 700;
  // Screen chrome spans the viewport; reading/form content keeps its own width.
  const chromeInset = wide ? 24 * scale : 0;
  const chromeLeft = insets.left + chromeInset;
  const chromeWidth = Math.max(0, availableWidth - 2 * chromeInset);
  const compact = height < 600;
  const headerTop = Math.max((compact ? 12 : 27) * scale, insets.top + 12);
  const navBottom = Math.max((compact ? 12 : 34) * scale, insets.bottom);
  const navHeight = Math.max(44, (wide ? 58 : 30) * scale);
  const bottomSpace = navBottom + navHeight + 16 * scale;
  const gridWidth = Math.min(availableWidth, 1120);
  const gridLeft = insets.left + (availableWidth - gridWidth) / 2;
  return { scale, contentWidth, contentLeft, chromeLeft, chromeWidth, wide, headerTop, navBottom, navHeight, bottomSpace,
    gridWidth, gridLeft, height, compact };
}

// Coordinates shared by the SVG outlines and the actual navigation buttons.
export function getBottomNavItems(frameWidth: number, wide: boolean) {
  const labels = ['일기 작성', '나의 우주', '그룹 우주'];
  const ids = ['diary', 'home', 'group'];
  const groupWidth = wide ? 450 : 393;
  const offset = (frameWidth - groupWidth) / 2;
  return ids.map((id, index) => ({
    id, label: labels[index],
    x: offset + (wide ? index * 154 : [92.5, 147.5, 253.5][index]),
    y: wide ? 10 : 8.5,
    width: wide ? 142 : [48, 99, 48][index],
    height: wide ? 46 : 21,
  }));
}
