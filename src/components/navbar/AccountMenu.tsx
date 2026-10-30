'use client';

import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';

/**
 * The sidebar's account footer: a read-only identity trigger that opens a panel
 * with the details and the one account action, shaped on the app's
 * `src/components/auth/AccountMenu.tsx`.
 *
 * Logout is the only destructive control and it lives inside the panel, not on
 * the trigger — the row this replaces made the identity itself the logout
 * button, so glancing at who you were signed in as could sign you out.
 *
 * The app's panel also shows the XP/level block; this session carries only
 * user and email, so there is nothing honest to draw there.
 */
export default function AccountMenu({
    collapsed,
    name,
    email,
    onLogout,
}: {
    /** Rail mode: initial only, and the panel opens sideways instead of up. */
    collapsed: boolean;
    name: string;
    email: string;
    onLogout: () => void;
}) {
    const [open, setOpen] = useState(false);

    // Escape closes, matching what a menu is expected to do. The tap-away
    // backdrop below covers the mouse/touch path.
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open]);

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                title={name}
                className={
                    'flex items-center w-full rounded-lg px-2 py-1.5 hover:bg-bg-hover transition-colors cursor-pointer ' +
                    (collapsed ? 'justify-center' : 'gap-2')
                }
            >
                <span className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {(name || email).charAt(0).toUpperCase()}
                </span>
                {!collapsed && (
                    <span className="text-xs font-medium truncate flex-1 text-text-primary text-left">{name}</span>
                )}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div
                        role="menu"
                        aria-label="Account"
                        className={
                            'absolute z-50 w-64 rounded-lg border border-border-default bg-bg-card shadow-xl py-1 ' +
                            // The sidebar is narrower than the panel, so it opens
                            // towards the content area: upwards from the footer,
                            // or rightwards out of the collapsed rail.
                            (collapsed ? 'left-full ml-1 bottom-0' : 'left-0 bottom-full mb-1')
                        }
                    >
                        <div className="px-3 py-2">
                            <p className="text-sm font-semibold text-text-primary truncate">{name}</p>
                            {email && (
                                <p className="text-[11px] text-text-tertiary truncate" title={email}>
                                    {email}
                                </p>
                            )}
                        </div>

                        <div className="border-t border-border-default my-1" />
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                onLogout();
                            }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 cursor-pointer"
                        >
                            <LogOut size={14} className="shrink-0" />
                            Log out
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
