import { FC, useSyncExternalStore } from "react";
import clsx from "clsx";

import { SunFilledIcon, MoonFilledIcon } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";

export interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch: FC<ThemeSwitchProps> = ({ className }) => {
  // Hydration-safe mount check without setState-in-effect (react-hooks v6):
  // server snapshot false, client snapshot true, no-op subscribe.
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { theme, setTheme } = useTheme();

  const isLight = theme === "light";

  const handleToggle = () => {
    setTheme(isLight ? "dark" : "light");
  };
  if (!isMounted) return <div aria-hidden className="w-6 h-6" />;

  return (
    <button
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      className={clsx(
        "px-px transition-opacity hover:opacity-80 cursor-pointer",
        "inline-flex items-center justify-center",
        "w-auto h-auto bg-transparent rounded-lg text-muted",
        className,
      )}
      onClick={handleToggle}
    >
      {isLight ? <SunFilledIcon size={22} /> : <MoonFilledIcon size={22} />}
    </button>
  );
};
