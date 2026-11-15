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
}
`;

export function LoginFocusReset() {
  return <style>{inputReset}</style>;
}
