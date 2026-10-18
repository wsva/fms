'use client';

import { useSyncExternalStore, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const RAIL_KEY = 'fms-sidebar-rail';

const railListeners = new Set<() => void>();

function subscribeRail(cb: () => void) {
    railListeners.add(cb);
    return () => { railListeners.delete(cb); };
}

function getRailSnapshot() {
    return localStorage.getItem(RAIL_KEY) === 'y';
}

function getRailServerSnapshot() {
    return false;
}

function setRailStored(rail: boolean) {
    localStorage.setItem(RAIL_KEY, rail ? 'y' : 'n');
    railListeners.forEach(cb => cb());
}

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const rail = useSyncExternalStore(subscribeRail, getRailSnapshot, getRailServerSnapshot);

    // The drawer records the route it was opened on, so navigating away closes it.
    const [drawerAt, setDrawerAt] = useState<string | null>(null);
    const drawerOpen = drawerAt === pathname;

    return (
        <div className="min-h-svh">
            {/* Desktop sidebar */}
            <div className="hidden lg:flex fixed left-0 top-0 h-svh z-30">
                <Sidebar collapsed={rail} onToggleCollapsed={() => setRailStored(!rail)} />
            </div>

            {/* Mobile drawer */}
            {drawerOpen && (
                <div className="lg:hidden fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40"
                        onClick={() => setDrawerAt(null)}
                    />
                    <div className="absolute inset-y-0 left-0 shadow-xl">
                        <Sidebar onClose={() => setDrawerAt(null)} />
                    </div>
                </div>
            )}

            <div className={`flex flex-col min-h-svh ${rail ? 'lg:ml-12' : 'lg:ml-44'}`}>
                <TopBar onOpenDrawer={() => setDrawerAt(pathname)} />
                <main className="container mx-auto flex-1 w-full px-2 sm:px-4 py-4 pb-20">
                    {children}
                </main>
            </div>
        </div>
    );
}
