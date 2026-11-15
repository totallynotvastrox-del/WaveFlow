import { useTranslation } from "react-i18next";
import { Heart, Home, Library, Menu } from "lucide-react";
import type { ViewId } from "../../types";

interface MobileTabBarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
}

/**
 * The phone layout's bottom navigation: the three places a listener goes
 * most, and the drawer that holds everything the desktop sidebar does.
 */
export function MobileTabBar({
  activeView,
  onNavigate,
  menuOpen,
  onToggleMenu,
}: MobileTabBarProps) {
  const { t } = useTranslation();
  const tabs: { id: ViewId; label: string; icon: typeof Home }[] = [
    { id: "home", label: t("sidebar.nav.home"), icon: Home },
    { id: "library", label: t("android.nav.library"), icon: Library },
    { id: "liked", label: t("android.nav.liked"), icon: Heart },
  ];
  const item =
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors";
  const on = "text-emerald-600 dark:text-emerald-400";
  const off = "text-zinc-500 dark:text-zinc-400";
  return (
    <nav
      aria-label={t("android.nav.label")}
      className="mobile-tab-bar z-50 flex shrink-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-surface-dark-elevated"
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const active = !menuOpen && activeView === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={active ? "page" : undefined}
            className={`${item} ${active ? on : off}`}
          >
            <Icon size={22} />
            <span className="max-w-full truncate px-1">{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onToggleMenu}
        aria-expanded={menuOpen}
        className={`${item} ${menuOpen ? on : off}`}
      >
        <Menu size={22} />
        <span className="max-w-full truncate px-1">
          {t("android.nav.menu")}
        </span>
      </button>
    </nav>
  );
}
