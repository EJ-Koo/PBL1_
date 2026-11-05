// All coordinates are measured in the 393 × 852 reference image.
export const DesignSize = { width: 393, height: 852 } as const;

export const DesignColors = {
  black: '#000000',
  gray: '#D9D9D9',
  white: '#FFFFFF',
  // Exception supplied by the later quest reference image.
  questProgress: '#9DFD02',
} as const;

export const DesignOpacity = {
  solid: 1,
  bottomBar: 0.30,
  diarySubmit: 0.30,
  quest: 0.30,
  groupCard: 0.50,
  // Estimated from the reference, rather than supplied design values.
  hudFrame: 0.60,
  hudHatching: 0.18,
  diaryPill: 0.30,
  diaryGrid: 0.06,
  groupBraceLeft: 0.70,
  groupAddCross: 0.50,
  menuPanel: 0.70,
  menuFrame: 0.73,
  menuSliderTrack: 0.30,
  questPanel: 0.50,
} as const;

export const grayAlpha = (alpha: number) => `rgba(217,217,217,${alpha})`;
export const whiteAlpha = (alpha: number) => `rgba(255,255,255,${alpha})`;

export const DesignPaint = {
  background: DesignColors.black,
  ink: whiteAlpha(DesignOpacity.solid),
  bottomBar: whiteAlpha(DesignOpacity.bottomBar),
  diarySubmit: whiteAlpha(DesignOpacity.diarySubmit),
  quest: grayAlpha(DesignOpacity.quest),
  groupCard: grayAlpha(DesignOpacity.groupCard),
  hudFrame: grayAlpha(DesignOpacity.hudFrame),
  hudHatching: grayAlpha(DesignOpacity.hudHatching),
  diaryPill: whiteAlpha(DesignOpacity.diaryPill),
  diaryGrid: grayAlpha(DesignOpacity.diaryGrid),
  groupBraceLeft: grayAlpha(DesignOpacity.groupBraceLeft),
  groupBraceRight: grayAlpha(DesignOpacity.solid),
  groupHatching: grayAlpha(DesignOpacity.solid),
  groupAddCross: grayAlpha(DesignOpacity.groupAddCross),
  menuPanel: grayAlpha(DesignOpacity.menuPanel),
  menuFrame: whiteAlpha(DesignOpacity.menuFrame),
  menuSliderTrack: whiteAlpha(DesignOpacity.menuSliderTrack),
  menuText: DesignColors.black,
  questPanel: grayAlpha(DesignOpacity.questPanel),
  questTrack: grayAlpha(DesignOpacity.solid),
  questProgress: DesignColors.questProgress,
  clear: whiteAlpha(0),
} as const;

export const DesignFonts = {
  regular: 'Inter_400Regular',
  bold: 'Inter_700Bold',
} as const;

// Opacity falloff for the existing, data-colored stars in group previews.
export const GroupStarGlowStops = [
  { offset: 0, opacity: 1 },
  { offset: 0.16, opacity: 0.98 },
  { offset: 0.38, opacity: 0.70 },
  { offset: 0.65, opacity: 0.15 },
  { offset: 0.90, opacity: 0.02 },
  { offset: 1, opacity: 0 },
] as const;

// Presentation values measured from the quest mockup; no live progress source
// exists in the current project. The middle bar occupies 58 of its 172dp track.
export const QuestReferenceProgress = {
  today: 0,
  meteor: 58 / 172,
  friend: 1,
} as const;
