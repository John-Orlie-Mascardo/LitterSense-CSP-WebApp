import { getPasswordRuleStatuses } from "@/lib/utils/passwordPolicy";

type PasswordChecklistProps = {
  password: string;
};

export function PasswordChecklist({ password }: PasswordChecklistProps) {
  const rules = getPasswordRuleStatuses(password);

  return (
    <ul
      aria-label="Password requirements"
      aria-live="polite"
      className="mt-2 grid gap-1 text-xs sm:grid-cols-2"
    >
      {rules.map((rule) => (
        <li
          key={rule.id}
          data-password-rule={rule.id}
          data-met={rule.met}
          className={`flex items-center gap-1.5 ${
            rule.met ? "text-green-600 dark:text-green-400" : "text-litter-muted"
          }`}
        >
          <span aria-hidden="true" className="font-bold">
            {rule.met ? "\u2713" : "\u25CB"}
          </span>
          <span>{rule.label}</span>
          <span className="sr-only">{rule.met ? " met" : " not met"}</span>
        </li>
      ))}
    </ul>
  );
}
