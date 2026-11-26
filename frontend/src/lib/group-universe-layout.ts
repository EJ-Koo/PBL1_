import type { getResponsiveLayout } from './responsive-layout';

/** One geometry for the real group and the practice group. */
export function groupUniverseLayout(layout:ReturnType<typeof getResponsiveLayout>,fontScale:number,height:number,chatOpen=false) {
  const s=layout.scale;
  const titleFontSize=Math.max(14,18*s);
  const titleWidth=Math.min(layout.chromeWidth-32*s,260*s);
  const titleHeight=Math.max(24,28*s)*fontScale;
  const headerHeight=titleHeight+24*s;
  const controlsTop=layout.headerTop+headerHeight+9*s;
  const panelTop=controlsTop+Math.max(44,40*s)+4*s;
  const panelWidth=Math.min(236*s,layout.chromeWidth-24*s);
  const chatWidth=Math.min(460,layout.chromeWidth-68*s);
  const chatLeft=layout.chromeLeft+(layout.chromeWidth-chatWidth)/2;
  const chatBottom=layout.navBottom+24*s;
  const chatHistoryHeight=Math.max(72,Math.min(176*s,height*.24));
  const panelHeight=Math.max(120,Math.min(488*s,height-panelTop-chatBottom-72*s));
  const questPanelWidth=Math.min(312*s,layout.chromeWidth-68*s);
  const toggleBottom=chatBottom+56*s+38+(chatOpen?chatHistoryHeight:0);
  const infoBottom=toggleBottom+Math.max(44,32*s)+8;
  const infoWidth=layout.wide?Math.min(400*s,layout.chromeWidth*.42):layout.chromeWidth-24;
  const popupBottom=chatBottom+68*s+(chatOpen?chatHistoryHeight:20*s);
  return {titleFontSize,titleWidth,titleHeight,headerHeight,controlsTop,panelTop,panelWidth,
    chatWidth,chatLeft,chatBottom,chatHistoryHeight,panelHeight,questPanelWidth,toggleBottom,infoBottom,infoWidth,popupBottom,infoLeft:layout.chromeLeft+12};
}
