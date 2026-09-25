import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import {
    LayoutDashboard,
    Package,
    ArrowDownToLine,
    ArrowUpFromLine,
    ArrowLeftRight,
    Wallet,
    Truck,
    ClipboardCheck,
    MapPin,
    Warehouse,
    Users,
    FileBarChart,
    ScrollText,
    RefreshCw,
    Activity,
    PanelLeftClose,
    PanelLeftOpen,
    Menu,
    Bell,
    ChevronDown,
    LogOut,
    WifiOff,
    ShieldCheck,
    X,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { api, message } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";
const sections = [
    [
        "WORKSPACE",
        [
            ["Overview", "/", LayoutDashboard, "dashboard.read"],
            ["Inventory", "/inventory", Package, "inventory.read"],
            [
                "Counts & reservations",
                "/stock-tools",
                ClipboardCheck,
                "inventory.read",
            ],
            ["Products", "/products", Package, "products.read"],
            ["Incoming goods", "/incoming", ArrowDownToLine, "inventory.read"],
            ["Outgoing goods", "/outgoing", ArrowUpFromLine, "inventory.read"],
            ["Warehouse transfers", "/transfers", ArrowLeftRight, "inventory.read"],
        ],
    ],
    [
        "BUSINESS",
        [
            ["Money & profit", "/finance", Wallet, "finance.read"],
            ["Expenses", "/expenses", Wallet, "finance.read"],
            ["Distributors", "/distributors", Truck, "distributors.read"],
            ["My distribution", "/distribution", Truck, "distribution.read"],
            ["Approvals", "/approvals", ClipboardCheck, "approvals.read"],
            ["Reports", "/reports", FileBarChart, "reports.read"],
        ],
    ],
    [
        "MANAGEMENT",
        [
            ["Locations", "/locations", MapPin, "locations.read"],
            ["Warehouses", "/warehouses", Warehouse, "locations.read"],
            ["Team & access", "/users", Users, "users.manage"],
            ["Audit trail", "/audit", ScrollText, "audit.read"],
            ["Sync center", "/sync", RefreshCw, null],
            ["System health", "/system-health", Activity, "system.read"],
        ],
    ],
];
export default function Layout() {
    const { user, can, online, pending, logout, notify } = useApp(),
        location = useLocation(),
        client = useQueryClient();
    const [collapsed, setCollapsed] = useState(false),
        [mobile, setMobile] = useState(false),
        [notifications, setNotifications] = useState(false),
        [profile, setProfile] = useState(false),
        [update, setUpdate] = useState(false);
    const notices = useData("/notifications"),
        health = useData("/system-health", {}, can("system.read"));
    useEffect(() => {
        const cb = () => setUpdate(true);
        window.addEventListener("viva-update", cb);
        return () => window.removeEventListener("viva-update", cb);
    }, []);
    const title =
        sections
            .flatMap((s) => s[1])
            .find((n) => n[1] === location.pathname)?.[0] || "Workspace";
    const unread = notices.data?.data?.filter((n) => !n.readAt).length || 0;
    return (
        <div className="min-h-screen">
            {mobile && (
                <button
                    aria-label="Close navigation"
                    className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
                    onClick={() => setMobile(false)}
                />
            )}
            <aside
                className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white transition-all ${collapsed ? "lg:w-[80px]" : "lg:w-[238px]"} w-[238px] ${mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
            >
                <Link
                    to="/"
                    className="flex h-19.5 shrink-0 items-center gap-2.5 px-6"
                >
                    <img src="/viva.png" alt="" className="w-24 object-contain" />
                    {!collapsed && (
                        <>
                            <span className="ml-auto rounded border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                                BUSINESS
                            </span>
                        </>
                    )}
                </Link>
                {!collapsed && (
                    <div className="mx-4 mb-5 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                        <div className="rounded-md border border-slate-200 bg-white p-1.5">
                            <Warehouse size={17} className="text-brand-700" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold">Viva Operations</p>
                            <p className="mt-0.5 text-[10px] text-slate-500">
                                {user.organizationWide
                                    ? "All company locations"
                                    : `${user.locationIds.length} assigned locations`}
                            </p>
                        </div>
                    </div>
                )}
                <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-5">
                    {sections.map(([heading, items]) => (
                        <div key={heading}>
                            {!collapsed && <p className="eyebrow mb-2 px-3">{heading}</p>}
                            <div className="space-y-0.5">
                                {items
                                    .filter((i) => !i[3] || can(i[3]))
                                    .map(([label, path, Icon]) => (
                                        <NavLink
                                            key={path}
                                            to={path}
                                            end={path === "/"}
                                            title={collapsed ? label : undefined}
                                            onClick={() => setMobile(false)}
                                            className={({ isActive }) =>
                                                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"} ${collapsed ? "justify-center" : ""}`
                                            }
                                        >
                                            <Icon size={17} strokeWidth={1.7} />
                                            {!collapsed && (
                                                <>
                                                    <span>{label}</span>
                                                    {path === "/sync" && pending > 0 && (
                                                        <span className="ml-auto rounded bg-amber-100 px-1.5 text-amber-800">
                                                            {pending}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </NavLink>
                                    ))}
                            </div>
                        </div>
                    ))}
                </nav>
                <div className="border-t border-slate-100 p-4">
                    <Link
                        to="/sync"
                        className="flex items-center gap-2.5 px-2 text-[11px] text-slate-500"
                    >
                        <span
                            className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`}
                        />
                        {!collapsed &&
                            (online
                                ? pending
                                    ? `${pending} pending sync`
                                    : "Connected to workspace"
                                : "Offline mode")}
                    </Link>
                    <button
                        className="icon-btn mt-3 hidden lg:block"
                        aria-label="Toggle sidebar"
                        onClick={() => setCollapsed(!collapsed)}
                    >
                        {collapsed ? (
                            <PanelLeftOpen size={17} />
                        ) : (
                            <PanelLeftClose size={17} />
                        )}
                    </button>
                </div>
            </aside>
            <div
                className={`transition-all ${collapsed ? "lg:pl-[80px]" : "lg:pl-[238px]"}`}
            >
                <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8">
                    <div className="flex items-center gap-3">
                        <button
                            aria-label="Open navigation"
                            className="icon-btn lg:hidden"
                            onClick={() => setMobile(true)}
                        >
                            <Menu size={21} />
                        </button>
                        <div className="flex items-center gap-3 text-xs">
                            <span className="hidden text-slate-400 sm:block">Workspace</span>
                            <span className="hidden text-slate-300 sm:block">/</span>
                            <span className="font-medium text-slate-700">{title}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-5">
                        <Link
                            to="/sync"
                            className="hidden items-center gap-1.5 text-[11px] text-slate-500 md:flex"
                        >
                            <span
                                className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`}
                            />
                            {online ? "Online" : "Offline"}
                        </Link>
                        <div className="relative">
                            <button
                                className="icon-btn relative"
                                aria-label="Notifications"
                                onClick={() => {
                                    setNotifications(!notifications);
                                    setProfile(false);
                                }}
                            >
                                <Bell size={19} />
                                {unread > 0 && (
                                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-400 ring-2 ring-white" />
                                )}
                            </button>
                            {notifications && (
                                <div className="absolute -right-12 top-12 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                                    <div className="mb-3 flex items-center justify-between">
                                        <h3 className="font-semibold">Notifications</h3>
                                        <button
                                            className="icon-btn"
                                            aria-label="Close notifications"
                                            onClick={() => setNotifications(false)}
                                        >
                                            <X size={15} />
                                        </button>
                                    </div>
                                    <div className="max-h-80 overflow-auto">
                                        {notices.data?.data?.length ? (
                                            notices.data.data.map((n) => (
                                                <button
                                                    key={n.id}
                                                    className={`mb-2 w-full rounded-lg p-3 text-left ${n.readAt ? "bg-white" : "bg-brand-50"}`}
                                                    onClick={async () => {
                                                        try {
                                                            await api.post(`/notifications/${n.id}/read`);
                                                            client.invalidateQueries({
                                                                queryKey: [user.id, "/notifications"],
                                                            });
                                                        } catch (e) {
                                                            notify(message(e), "error");
                                                        }
                                                    }}
                                                >
                                                    <p className="text-xs font-semibold">{n.title}</p>
                                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                                        {n.message}
                                                    </p>
                                                </button>
                                            ))
                                        ) : (
                                            <p className="py-5 text-center text-xs text-slate-400">
                                                You’re all caught up.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <span className="h-7 w-px bg-slate-200" />
                        <div className="relative">
                            <button
                                className="flex items-center gap-2.5 text-left"
                                onClick={() => {
                                    setProfile(!profile);
                                    setNotifications(false);
                                }}
                                aria-label="User menu"
                            >
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0e9df] text-xs font-semibold text-[#8a6e49]">
                                    {user.name
                                        .split(" ")
                                        .slice(0, 2)
                                        .map((n) => n[0])
                                        .join("")}
                                </span>
                                <span className="hidden sm:block">
                                    <span className="block text-xs font-semibold">
                                        {user.name}
                                    </span>
                                    <span className="mt-0.5 block text-[10px] text-slate-400">
                                        {user.roles.join(", ")}
                                    </span>
                                </span>
                                <ChevronDown size={13} className="text-slate-400" />
                            </button>
                            {profile && (
                                <div className="absolute right-0 top-12 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                                    <p className="truncate text-xs text-slate-500">
                                        {user.email}
                                    </p>
                                    <button
                                        className="mt-4 flex items-center gap-2 text-xs font-medium text-red-600"
                                        onClick={() =>
                                            logout().catch((e) => notify(message(e), "error"))
                                        }
                                    >
                                        <LogOut size={15} />
                                        Sign out
                                    </button>
                                    {pending > 0 && (
                                        <p className="mt-3 text-xs text-amber-700">
                                            Pending operations remain on this device for your next
                                            sign-in.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </header>
                {!online && (
                    <div
                        role="status"
                        className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2.5 text-xs text-amber-900"
                    >
                        <WifiOff size={14} />
                        OFFLINE MODE · Supported stock operations will be queued on this
                        device.
                    </div>
                )}
                {update && (
                    <div className="bg-blue-50 px-8 py-3 text-xs text-blue-800">
                        An application update is available. Synchronize pending work, then
                        close all Viva tabs and reopen.
                    </div>
                )}
                <main className="mx-auto max-w-[1700px] p-5 sm:p-8">
                    <Outlet />
                </main>
                <footer className="mx-5 flex items-center justify-between border-t border-slate-200 py-5 text-[10px] text-slate-400 sm:mx-8">
                    <span>Viva Business Management · Nigeria</span>
                    <span className="flex items-center gap-1.5">
                        <ShieldCheck size={13} />
                        {health.data ? `System ${health.data.status}` : "Secure workspace"}
                    </span>
                </footer>
            </div>
        </div>
    );
}
