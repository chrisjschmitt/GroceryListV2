import { User, Settings, Info, Bell, LogOut } from "lucide-react";

export default function ProfileTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 bg-surface p-5 rounded-lg border border-outline/10 shadow-xs">
        <div className="w-14 h-14 bg-secondary-container/30 text-secondary rounded-full flex items-center justify-center font-bold text-lg">
          JD
        </div>
        <div>
          <h2 className="text-base font-extrabold text-on-surface">John Doe</h2>
          <p className="text-xs text-on-surface-variant">john.doe@example.com</p>
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-outline/10 shadow-xs overflow-hidden divide-y divide-outline/5">
        {[
          { icon: Settings, label: "App Settings", desc: "Configure sync intervals & storage options" },
          { icon: Bell, label: "Notifications", desc: "Manage flyer price drop alerts" },
          { icon: Info, label: "About BasketWise", desc: "Version info, licenses, and terms" }
        ].map((item, idx) => (
          <button key={idx} className="w-full text-left p-4 hover:bg-surface-container-low transition-all flex items-start gap-4">
            <item.icon size={20} className="text-secondary shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-on-surface">{item.label}</h4>
              <p className="text-xs text-on-surface-variant mt-0.5">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <button className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200/50 transition-all flex items-center justify-center gap-2">
        <LogOut size={16} />
        Sign Out
      </button>
    </div>
  );
}
