export const PASSWORD_POLICY_MESSAGE =
  "Password must have at least 8 characters, an uppercase letter, a lowercase letter, a number and a special character.";

export type PasswordRuleId =
  | "minimumLength"
  | "maximumLength"
  | "uppercase"
  | "lowercase"
  | "number"
  | "special";

export type PasswordRuleStatus = {
  id: PasswordRuleId;
  label: string;
  met: boolean;
};

export function getPasswordRuleStatuses(password: string): PasswordRuleStatus[] {
  return [
    {
      id: "minimumLength",
      label: "At least 8 characters",
      met: password.length >= 8,
    },
    {
      id: "maximumLength",
      label: "At most 128 characters",
      met: password.length <= 128,
    },
    {
      id: "uppercase",
      label: "One uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      id: "lowercase",
      label: "One lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      id: "number",
      label: "One number",
      met: /\d/.test(password),
    },
    {
      id: "special",
      label: "One special character",
      met: /[^A-Za-z0-9\s]/.test(password),
    },
  ];
}

export function getMissingPasswordRules(password: string): PasswordRuleId[] {
  return getPasswordRuleStatuses(password)
    .filter((rule) => !rule.met)
    .map((rule) => rule.id);
}

export function isPasswordPolicySatisfied(password: string): boolean {
  return getMissingPasswordRules(password).length === 0;
}
