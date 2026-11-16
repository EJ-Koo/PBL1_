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
  const navLeft = insets.left;
  const navWidth = availableWidth;
  const navLayout = getBottomNavLayout(scale > 0 ? navWidth / scale : 393);
  const navHeight = Math.max(44, navLayout.height * scale);
  const bottomSpace = navBottom + navHeight + 16 * scale;
  const gridWidth = Math.min(availableWidth, 1120);
  const gridLeft = insets.left + (availableWidth - gridWidth) / 2;
  const page = getPageLayout(availableWidth, scale);
  return { scale, contentWidth, contentLeft, chromeLeft, chromeWidth, wide, headerTop, navLeft, navWidth, navBottom, navHeight, bottomSpace,
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

// Coordinates shared by the SVG outlines and the actual navigation buttons.
export function getBottomNavLayout(frameWidth: number) {
  const labels = ['일기 작성', '나의 우주', '그룹 우주'];
  const ids = ['diary', 'home', 'group'];
  const groupWidth = Math.min(480, Math.max(0, frameWidth - 68));
  const offset = (frameWidth - groupWidth) / 2;
  const gap = 8;
  const buttonWidth = Math.max(0, (groupWidth - 2 * gap) / 3);
  const buttonHeight = 44;
  const buttonY = 12;
  const lineY = 0.5;
  const stripeLeft = 10;
  const stripeWidth = Math.max(0, offset - 8 - stripeLeft);
  const items = ids.map((id, index) => ({ id, label: labels[index],
    x: offset + index * (buttonWidth + gap), y: buttonY, width: buttonWidth, height: buttonHeight }));
  return { items, height: 58, lineY, groupLeft: offset, groupRight: offset + groupWidth,
    stripeLeft, stripeRight: frameWidth - stripeLeft - stripeWidth, stripeWidth,
    stripeY: buttonY, stripeHeight: 15, stripePitch: 11, stripeStroke: 5 };
}
