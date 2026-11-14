// Keep the reset scoped to the two login inputs; other keyboard focus indicators remain.
const inputReset = `
input[data-testid="login-email"],
input[data-testid="login-password"] {
  outline: none !important;
  box-shadow: none !important;
  border: 0 !important;
}
`;

export function LoginFocusReset() {
  return <style>{inputReset}</style>;
}
