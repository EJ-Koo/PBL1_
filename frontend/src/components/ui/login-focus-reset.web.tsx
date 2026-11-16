// Reset only framed auth/code inputs; buttons retain their keyboard focus indicators.
const inputReset = `
input[data-testid="login-email"],
input[data-testid="login-password"],
input[data-testid="signup-email"],
input[data-testid="signup-password"],
input[data-testid="signup-confirm"],
input[data-testid="join-code"] {
  outline: none !important;
  box-shadow: none !important;
  border: 0 !important;
  background-color: transparent;
  color-scheme: dark;
}
/* Keep password-manager autofill, but match its paint to the surrounding frame. */
input[data-testid^="login-"]:-webkit-autofill,
input[data-testid^="signup-"]:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 1000px #171923 inset !important;
  -webkit-text-fill-color: #f1f1f7 !important;
  caret-color: #f1f1f7;
}
input[data-testid^="login-"]:autofill,
input[data-testid^="signup-"]:autofill {
  box-shadow: 0 0 0 1000px #171923 inset !important;
  color: #f1f1f7 !important;
}
`;

export function LoginFocusReset() {
  return <style>{inputReset}</style>;
}
