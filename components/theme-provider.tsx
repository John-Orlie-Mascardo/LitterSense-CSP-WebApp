"use client";

import * as React from "react";

type ThemeAttribute = "class" | `data-${string}`;
type ResolvedTheme = "light" | "dark";

interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: ThemeAttribute | ThemeAttribute[];
  defaultTheme?: string;
  enableColorScheme?: boolean;
  enableSystem?: boolean;
  forcedTheme?: string;
  storageKey?: string;
  themes?: string[];
  value?: Record<string, string>;
}

interface ThemeContextValue {
  forcedTheme?: string;
  resolvedTheme?: string;
  setTheme: React.Dispatch<React.SetStateAction<string>>;
  systemTheme?: ResolvedTheme;
  theme?: string;
  themes: string[];
}

const DEFAULT_THEMES = ["light", "dark"];
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

function resolveTheme(
  theme: string | undefined,
  enableSystem: boolean,
  systemTheme: ResolvedTheme
): ResolvedTheme {
  if (theme === "dark" || theme === "light") {
    return theme;
  }

  if (theme === "system" && enableSystem) {
    return systemTheme;
  }

  return "light";
}

function getStoredTheme(storageKey: string, fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    return window.localStorage.getItem(storageKey) ?? fallback;
  } catch {
    return fallback;
  }
}

function applyTheme({
  attribute,
  enableColorScheme,
  enableSystem,
  theme,
  themes,
  value,
  systemTheme,
}: {
  attribute: ThemeAttribute | ThemeAttribute[];
  enableColorScheme: boolean;
  enableSystem: boolean;
  systemTheme: ResolvedTheme;
  theme: string | undefined;
  themes: string[];
  value?: Record<string, string>;
}) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const resolvedTheme = resolveTheme(theme, enableSystem, systemTheme);
  const appliedTheme = value?.[resolvedTheme] ?? resolvedTheme;
  const attributes = Array.isArray(attribute) ? attribute : [attribute];

  for (const currentAttribute of attributes) {
    if (currentAttribute === "class") {
      const removableClasses = themes
        .flatMap((themeName) => [themeName, value?.[themeName]])
        .filter(Boolean) as string[];

      root.classList.remove(...new Set([...removableClasses, "light", "dark"]));
      root.classList.add(appliedTheme);
    } else {
      root.setAttribute(currentAttribute, appliedTheme);
    }
  }

  if (enableColorScheme) {
    root.style.colorScheme = resolvedTheme;
  }
}

export function ThemeProvider({
  attribute = "class",
  children,
  defaultTheme,
  enableColorScheme = true,
  enableSystem = true,
  forcedTheme,
  storageKey = "theme",
  themes = DEFAULT_THEMES,
  value,
}: ThemeProviderProps) {
  const fallbackTheme = defaultTheme ?? (enableSystem ? "system" : "light");
  const [theme, setThemeState] = React.useState(fallbackTheme);
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme>("light");

  React.useEffect(() => {
    setThemeState(getStoredTheme(storageKey, fallbackTheme));
    setSystemTheme(getSystemTheme());
  }, [fallbackTheme, storageKey]);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
    const handleChange = () => setSystemTheme(getSystemTheme());

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setThemeState(event.newValue ?? fallbackTheme);
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [fallbackTheme, storageKey]);

  const activeTheme = forcedTheme ?? theme;

  React.useEffect(() => {
    applyTheme({
      attribute,
      enableColorScheme,
      enableSystem,
      systemTheme,
      theme: activeTheme,
      themes,
      value,
    });
  }, [activeTheme, attribute, enableColorScheme, enableSystem, systemTheme, themes, value]);

  const setTheme = React.useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (nextTheme) => {
      setThemeState((currentTheme) => {
        const resolvedNextTheme =
          typeof nextTheme === "function" ? nextTheme(currentTheme) : nextTheme;

        try {
          window.localStorage.setItem(storageKey, resolvedNextTheme);
        } catch {
          // Ignore storage failures; the in-memory theme still updates.
        }

        return resolvedNextTheme;
      });
    },
    [storageKey]
  );

  const contextValue = React.useMemo<ThemeContextValue>(
    () => ({
      forcedTheme,
      resolvedTheme: resolveTheme(activeTheme, enableSystem, systemTheme),
      setTheme,
      systemTheme,
      theme,
      themes: enableSystem ? [...themes, "system"] : themes,
    }),
    [activeTheme, enableSystem, forcedTheme, setTheme, systemTheme, theme, themes]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext) ?? {
    setTheme: () => {},
    themes: [],
  };
}

