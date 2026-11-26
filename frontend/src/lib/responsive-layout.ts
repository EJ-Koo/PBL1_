type Insets = { top: number; bottom: number; left: number; right: number };

// Keep the 393dp artwork readable without enlarging it to tablet/desktop size.
export function getResponsiveLayout(width: number, height: number, insets: Insets, bottomNavScale = 1) {
  const availableWidth = Math.max(0, width - insets.left - insets.right);
  const scale = Math.min(availableWidth / 393, 1.15);
  const hudScale = scale * 0.85 * 0.85;
  const hudHeight = 75 * hudScale;
  const contentWidth = 393 * scale;
  const contentLeft = insets.left + (availableWidth - contentWidth) / 2;
  const wide = availableWidth >= 700;
  // Screen chrome spans the viewport; reading/form content keeps its own width.
  const chromeInset = wide ? 24 * scale : 0;
  const chromeLeft = insets.left + chromeInset;
  const chromeWidth = Math.max(0, availableWidth - 2 * chromeInset);
  const compact = height < 600;
  const headerTop = Math.max((compact ? 12 : 27) * scale, insets.top + 12);
  const navBottom = insets.bottom;
  const navLeft = insets.left;
  const navWidth = availableWidth;
  const navLayout = getBottomNavLayout(navWidth, bottomNavScale);
  const navHeight = navLayout.height;
  const bottomSpace = navBottom + navHeight + 16 * scale;
  const gridWidth = Math.min(availableWidth, 1120);
  const gridLeft = insets.left + (availableWidth - gridWidth) / 2;
  const page = getPageLayout(availableWidth, scale);
  return { scale, hudScale, hudHeight, contentWidth, contentLeft, chromeLeft, chromeWidth, wide, headerTop, navLeft, navWidth, navBottom, navHeight, navLayout, bottomSpace,
    gridWidth, gridLeft, height, compact, ...page,
    pageLeft: insets.left + (availableWidth - page.pageWidth) / 2 };
}

export function getPageLayout(availableWidth: number, scale: number) {
  const pageWidth = Math.min(availableWidth, 1280);
  const pagePadding = (availableWidth >= 700 ? 24 : 16) * scale;
  const innerWidth = Math.max(0, pageWidth - pagePadding * 2);
  const pageGap = 24 * scale;
  const groupColumns = Math.max(1, Math.min(3, Math.floor((innerWidth + pageGap) / (300 + pageGap))));
  const groupCardWidth = Math.min(440, (innerWidth - pageGap * (groupColumns - 1)) / groupColumns);
  return { pageWidth, pagePadding, innerWidth, pageGap, groupColumns, groupCardWidth };
}

const navPanels = [
  { id: 'diary', label: '일기 작성', x: 181, width: 95 },
  { id: 'home', label: '나의 우주', x: 290, width: 196 },
  { id: 'group', label: '그룹 우주', x: 500, width: 95 },
] as const;

export function getBottomNavLayout(width: number, sizeMultiplier = 1) {
  const scale = Math.min(Math.max(0, width) / 774, 1.15) * 0.7 * 0.85 * sizeMultiplier;
  const viewWidth = scale > 0 ? width / scale : 774;
  const offset = (viewWidth - 774) / 2;
  const viewHeight = 120;
  const height = Math.max(44, viewHeight * scale);
  // Match the bottom-aligned artwork when the minimum touch height adds space.
  const artworkTop = height - viewHeight * scale;
  const hitHeight = Math.max(44, 42 * scale);
  const hitTop = Math.min(height - hitHeight, Math.max(0, artworkTop + 66.5 * scale - hitHeight / 2));
  const items = navPanels.map(panel => {
    const x = offset + panel.x;
    const panelWidth = panel.width * scale;
    const hitWidth = Math.max(Math.min(56, Math.max(44, 216 * scale), width / 3), panelWidth);
    // Extend small outside buttons toward the stripes, away from the middle button.
    const hitLeft = panel.id === 'diary' ? (x + panel.width) * scale - hitWidth
      : panel.id === 'home' ? (x + panel.width / 2) * scale - hitWidth / 2 : x * scale;
    return { ...panel, x, hitLeft: Math.max(0, Math.min(width - hitWidth, hitLeft)), hitWidth };
  });
  return { viewWidth, viewHeight, scale, offset, height, artworkTop, hitHeight, hitTop, items };
}
