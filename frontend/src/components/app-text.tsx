import { Children, createContext, forwardRef, useContext, type ReactNode } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { Platform, Text as NativeText, TextInput as NativeTextInput, StyleSheet, type TextProps, type TextInputProps, type TextStyle } from 'react-native';
import { DesignFonts, KoreanFonts, WebFonts } from '@/constants/ui-design';
import { useFontScale } from '@/hooks/use-font-scale';

type Weight = keyof typeof DesignFonts;
const WeightContext = createContext<Weight | null>('regular');
const nativeCascade = Platform.OS !== 'web' && requireOptionalNativeModule<{ hasCascade: boolean }>('AppFonts')?.hasCascade;
const needsRuns = Platform.OS !== 'web' && !nativeCascade;
const androidFonts = { regular: 'AppMixedRegular', bold: 'AppMixedBold' };
const fontFamilies = Platform.OS === 'web' ? WebFonts : Platform.OS === 'android' && nativeCascade ? androidFonts : DesignFonts;
const hangul = /([\u1100-\u11ff\u302e-\u302f\u3130-\u318f\ua960-\ua97f\uac00-\ud7ff\uffa0-\uffdc]+)/u;

function fontRuns(children: ReactNode, weight: Weight): ReactNode {
  return Children.map(children, child => {
    if (typeof child !== 'string' || !hangul.test(child)) return child;
    return child.split(hangul).map((run, index) => index % 2
      ? <NativeText key={index} style={{ fontFamily: KoreanFonts[weight], fontWeight: 'normal' }}>{run}</NativeText>
      : run);
  });
}

function resolveWeight(style: TextStyle, inherited: Weight | null): Weight | null {
  let familyWeight = inherited;
  if (style.fontFamily === DesignFonts.bold) familyWeight = 'bold';
  else if (style.fontFamily === DesignFonts.regular) familyWeight = 'regular';
  else if (style.fontFamily) return null;
  if (!familyWeight || style.fontWeight == null) return familyWeight;
  return style.fontWeight === 'bold' || Number(style.fontWeight) >= 600 ? 'bold' : 'regular';
}

function useTextStyle(style: TextProps['style'], inherited: Weight | null) {
  const scale = useFontScale();
  const flat = StyleSheet.flatten(style) ?? {};
  const weight = resolveWeight(flat, inherited);
  const resolved: TextStyle = weight ? { fontFamily: fontFamilies[weight], fontWeight: 'normal' } : {};
  if (scale !== 1 && typeof flat.fontSize === 'number') resolved.fontSize = flat.fontSize * scale;
  if (scale !== 1 && typeof flat.lineHeight === 'number') resolved.lineHeight = flat.lineHeight * scale;
  return { weight, style: [style, resolved] };
}

export const Text = forwardRef<NativeText, TextProps>(function AppText({ style, children, ...props }, ref) {
  const font = useTextStyle(style, useContext(WeightContext));
  return <WeightContext.Provider value={font.weight}>
    <NativeText ref={ref} {...props} style={font.style}>
      {needsRuns && font.weight ? fontRuns(children, font.weight) : children}
    </NativeText>
  </WeightContext.Provider>;
});
export type TextInput = NativeTextInput;
// The value component and native ref type intentionally share the public name.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function AppTextInput({ style, value, children, ...props }, ref) {
  const font = useTextStyle(style, 'regular');
  if (needsRuns && font.weight) {
    const visible = value || props.defaultValue || props.placeholder || '';
    const hasHangul = hangul.test(visible);
    return <NativeTextInput ref={ref} {...props} value={value} style={[font.style, hasHangul && { fontFamily: KoreanFonts[font.weight] }]}>{children}</NativeTextInput>;
  }
  return <NativeTextInput ref={ref} {...props} value={value} style={font.style}>{children}</NativeTextInput>;
});
