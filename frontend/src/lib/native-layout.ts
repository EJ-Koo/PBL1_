// App presentation policy. Shared server/data code must not depend on these sizes.
export function getNativeUi(width: number, height: number, top = 0, bottom = 0) {
  const usableHeight = Math.max(0, height - top - bottom);
  return {
    menuScale: Math.min(width / 393, 1),
    menuHeight: Math.min(560, usableHeight * 0.74),
    sheetWidth: Math.min(640, Math.max(0, width - 24)),
    sheetHeight: Math.min(740, usableHeight * 0.86),
    previewHeight: Math.min(148, usableHeight * 0.23),
    questHeight: Math.min(370, usableHeight * 0.52),
    contentWidth: Math.min(680, Math.max(0, width - 32)),
    inputHeight: Math.min(260, Math.max(160, usableHeight * 0.30)),
    photoSize: Math.min(104, Math.max(72, (width - 56) / 3)),
  };
}
