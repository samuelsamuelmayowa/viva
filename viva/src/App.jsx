import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useApp } from "./lib/context";
import { modules } from "./lib/modules";
import { Skeleton, Empty } from "./components/ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Resources = lazy(() => import("./pages/Resources"));
const Approvals = lazy(() => import("./pages/Approvals"));
const SyncCenter = lazy(() => import("./pages/SyncCenter"));
const Reports = lazy(() => import("./pages/Reports"));
const Health = lazy(() => import("./pages/Health"));
const StockTools = lazy(() => import("./pages/StockTools"));
const Distribution = lazy(() => import("./pages/Distribution"));
function Guard({ permission, children }) {
    const { can } = useApp();
    return can(permission) ? (
        children
    ) : (
        <Empty
            title="Access restricted"
            description="Your role does not have permission to view this module."
        />
    );
}
export default function App() {
    const { user, loading } = useApp();
    if (loading)
        return (
            <div className="mx-auto max-w-6xl p-10">
                <Skeleton />
            </div>
        );
    if (!user) return <Login />;
    return (
        <Suspense
            fallback={
                <div className="p-8">
                    <Skeleton />
                </div>
            }
        >
            <Routes>
                <Route element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="stock-tools" element={<Guard permission="inventory.read"><StockTools /></Guard>} />
                    {Object.entries(modules).map(([module, config]) => (
                        <Route
                            key={module}
                            path={module}
                            element={
                                <Guard permission={config.permission}>
                                    <Resources key={module} module={module} />
                                </Guard>
                            }
                        />
                    ))}
                    <Route
                        path="approvals"
                        element={
                            <Guard permission="approvals.read">
                                <Approvals />
                            </Guard>
                        }
                    />
                    <Route path="sync" element={<SyncCenter />} />
                    <Route
                        path="reports"
                        element={
                            <Guard permission="reports.read">
                                <Reports />
                            </Guard>
                        }
                    />
                    <Route
                        path="system-health"
                        element={
                            <Guard permission="system.read">
                                <Health />
                            </Guard>
                        }
                    />
                    <Route
                        path="distribution"
                        element={
                            <Guard permission="distribution.read">
                                <Distribution />
                            </Guard>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </Suspense>
    );
}
