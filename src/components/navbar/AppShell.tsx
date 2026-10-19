'use client';

import { useEffect, useRef, useSyncExternalStore, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const RAIL_KEY = 'fms-sidebar-rail';
const WIDTH_KEY = 'fms-sidebar-width';

// Routes rendered in the desktop app's fixed-window style: edge-to-edge flat
// bars and an internally scrolling content area instead of the centered,
// body-scrolling container every other page uses. Exact match or a subpath of
// one of these five prefixes only — no other route can opt in by accident.
const FULL_BLEED_PREFIXES = ['/listen/dictation', '/speak/read', '/speak/practice', '/cards', '/wiki'];

const RAIL_WIDTH = 48;
const MIN_WIDTH = 120;
const MAX_WIDTH = 320;
const DEFAULT_WIDTH = 176;

function clampWidth(w: number) {
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

function getRailSnapshot() {
    return localStorage.getItem(RAIL_KEY) === 'y';
}

function getWidthSnapshot() {
    const saved = Number.parseInt(localStorage.getItem(WIDTH_KEY) ?? '', 10);
    return Number.isNaN(saved) ? DEFAULT_WIDTH : clampWidth(saved);
}

function setRailStored(rail: boolean) {
    localStorage.setItem(RAIL_KEY, rail ? 'y' : 'n');
    listeners.forEach(cb => cb());
}

function setWidthStored(width: number) {
    localStorage.setItem(WIDTH_KEY, String(clampWidth(width)));
    listeners.forEach(cb => cb());
}

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const rail = useSyncExternalStore(subscribe, getRailSnapshot, () => false);
    const storedWidth = useSyncExternalStore(subscribe, getWidthSnapshot, () => DEFAULT_WIDTH);
    const fullBleed = FULL_BLEED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));

    // Live drag width, kept out of localStorage until the pointer is released.
    const [dragWidth, setDragWidth] = useState<number | null>(null);
    const dragOrigin = useRef({ x: 0, width: DEFAULT_WIDTH });
    const latestWidth = useRef(DEFAULT_WIDTH);
    const dragging = dragWidth !== null;

    // The drawer records the route it was opened on, so navigating away closes it.
    const [drawerAt, setDrawerAt] = useState<string | null>(null);
    const drawerOpen = drawerAt === pathname;

    const width = rail ? RAIL_WIDTH : (dragWidth ?? storedWidth);

    const startDrag = (e: React.MouseEvent) => {
        if (rail) return;
        e.preventDefault();
        dragOrigin.current = { x: e.clientX, width: storedWidth };
        latestWidth.current = storedWidth;
        setDragWidth(storedWidth);
    };

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => {
            const next = clampWidth(dragOrigin.current.width + (e.clientX - dragOrigin.current.x));
            latestWidth.current = next;
            setDragWidth(next);
        };
        const onUp = () => {
            setWidthStored(latestWidth.current);
            setDragWidth(null);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [dragging]);

    // Double-click on blank sidebar space toggles the rail; interactive targets opt out.
    const onDoubleClickBlank = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, input, select, textarea, [data-no-toggle]")) return;
        setRailStored(!rail);
    };

    return (
        <div
            className="min-h-svh"
            style={{ '--sidebar-w': `${width}px` } as React.CSSProperties}
        >
            {/* Desktop sidebar */}
            <div
                className="hidden lg:flex fixed left-0 top-0 h-svh z-30 w-[var(--sidebar-w)]"
                style={{ transition: dragging ? 'none' : 'width 200ms' }}
                onDoubleClick={onDoubleClickBlank}
            >
                <Sidebar collapsed={rail} onToggleCollapsed={() => setRailStored(!rail)} />
                {!rail && (
                    <div
                        aria-hidden
                        onMouseDown={startDrag}
                        title="Drag to resize"
                        className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-accent/50"
                    />
                )}
            </div>

            {/* Captures pointer events while resizing */}
            {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}

            {/* Mobile drawer */}
            {drawerOpen && (
                <div className="lg:hidden fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40"
                        onClick={() => setDrawerAt(null)}
                    />
                    <div className="absolute inset-y-0 left-0 w-44 shadow-xl">
                        <Sidebar onClose={() => setDrawerAt(null)} />
                    </div>
                </div>
            )}

            <div
                className="flex flex-col min-h-svh lg:ml-[var(--sidebar-w)]"
                style={{ transition: dragging ? 'none' : 'margin-left 200ms' }}
            >
                {/* Full-bleed pages carry their own Breadcrumb + Toolbar bars, so the
                    shell TopBar is redundant there — drop it on desktop and let the
                    page bars be the whole chrome. Below lg it stays: the sidebar is
                    hidden and its hamburger is the only drawer (and theme) access. */}
                {fullBleed ? (
                    <div className="lg:hidden">
                        <TopBar onOpenDrawer={() => setDrawerAt(pathname)} />
                    </div>
                ) : (
                    <TopBar onOpenDrawer={() => setDrawerAt(pathname)} />
                )}
                <main className={fullBleed
                    ? "flex-1 min-h-0 w-full h-[calc(100dvh-3rem)] lg:h-dvh overflow-hidden flex flex-col"
                    : "container mx-auto flex-1 w-full px-2 sm:px-4 py-4 pb-20"}>
                    {children}
                </main>
            </div>
        </div>
    );
}
