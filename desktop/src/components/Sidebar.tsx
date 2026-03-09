import {
  Activity,
  Layers,
  LayoutGrid,
  Settings,
  User,
} from "lucide-react";
import clsx from "clsx";

export type Section = "feed" | "channels" | "dashboard" | "settings" | "account";

interface SidebarProps {
  active: Section;
  onNavigate: (section: Section) => void;
}

const NAV_ITEMS: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: "feed", label: "Feed", icon: Activity },
  { id: "channels", label: "Channels", icon: Layers },
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "account", label: "Account", icon: User },
];

export default function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="flex flex-col w-[200px] shrink-0 border-r border-edge bg-surface-2 h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-edge shrink-0">
        <div className="w-2 h-2 rounded-full bg-accent" />
        <span className="font-mono text-sm font-semibold tracking-wide text-fg">
          scrollr
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              active === id
                ? "bg-accent/10 text-accent"
                : "text-fg-2 hover:text-fg hover:bg-surface-hover",
            )}
          >
            <Icon size={18} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      {/* Version */}
      <div className="px-4 py-3 border-t border-edge">
        <span className="text-[10px] font-mono text-fg-4">v0.1.0</span>
      </div>
    </aside>
  );
}
