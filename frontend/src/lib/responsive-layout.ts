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
  const groupWidth = Math.min(420, frameWidth * 0.54);
  const offset = (frameWidth - groupWidth) / 2;
  const gap = groupWidth * 0.032;
  const sideWidth = (groupWidth - 2 * gap) / 4;
  const buttonHeight = groupWidth * 0.102;
  const lineY = buttonHeight * 0.36 + 0.5;
  const buttonY = lineY + 1;
  const cut = buttonHeight * 0.84;
  const stripeLeft = 11;
  const stripeWidth = Math.max(0, offset - groupWidth * 0.05 - stripeLeft);
  const items = ids.map((id, index) => ({
    id, label: labels[index],
    x: offset + [0, sideWidth + gap, sideWidth * 3 + gap * 2][index],
    y: buttonY,
    width: sideWidth * (index === 1 ? 2 : 1),
    height: buttonHeight,
  }));
  return { items, height: buttonY + buttonHeight + 2, lineY, cut,
    notchLeft: offset + cut * 0.56, notchRight: offset + groupWidth - cut * 0.56,
    groupLeft: offset, groupRight: offset + groupWidth,
    stripeLeft, stripeRight: frameWidth - stripeLeft - stripeWidth, stripeWidth,
    stripeY: buttonY + buttonHeight * 0.3, stripeHeight: buttonHeight * 0.71,
    stripePitch: buttonHeight * 0.69, stripeStroke: buttonHeight * 0.32 };
}
