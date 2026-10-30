'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight, ChevronsLeft, ChevronsRight, User, X } from 'lucide-react';
import { menuList, rootMenuItems, bottomMenuItems, type MenuItem } from './menu';
import AccountMenu from './AccountMenu';
import { hrefPath } from '@/lib/nav-crumbs';
import { useSession } from '@/components/SessionProvider';
import { authClient } from '@/lib/auth-client';

const ACCENT = 'bg-accent/80 text-white';

type Props = {
    /** Desktop rail mode: icons only. Ignored in the drawer. */
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    /** Drawer mode: renders a close button and always shows the full nav. */
    onClose?: () => void;
};

function isActive(pathname: string, href: string): boolean {
    const path = hrefPath(href);
    if (path === '/' || !path) return pathname === path;
    return pathname === path || pathname.startsWith(path + '/');
}

export default function Sidebar({ collapsed = false, onToggleCollapsed, onClose }: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const redirectUrl = searchParams.get('redirect_url') ?? '/home';
    const { user, signOut } = useSession();
    const isDrawer = !!onClose;
    const rail = collapsed && !isDrawer;
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const isOpen = (name: string) => !rail && (expanded[name] ?? true);
    const toggle = (name: string) =>
        setExpanded(prev => ({ ...prev, [name]: !(prev[name] ?? true) }));

    const groupHasActive = (group: (typeof menuList)[number]) =>
        group.items.some(item => isActive(pathname, item.href));

    const handleLogin = async () => {
        await authClient.signIn.social({ provider: "wsva_oauth2", callbackURL: redirectUrl });
    };

    /**
     * One top-level entry: the icon rail and the full column differ in shape but
     * not in behaviour, so both root items and the pinned Settings entry render
     * through here.
     */
    const renderTopItem = (item: MenuItem) => {
        const ItemIcon = item.icon;
        const active = isActive(pathname, item.href);
        if (rail) {
            return (
                <NextLink
                    key={item.key}
                    href={item.href}
                    title={item.name}
                    className={
                        'flex items-center justify-center h-9 w-9 mx-auto rounded-lg transition-colors ' +
                        (active ? ACCENT : 'text-gray-600 hover:bg-bg-hover')
                    }
                >
                    <ItemIcon size={20} />
                </NextLink>
            );
        }
        return (
            <NextLink
                key={item.key}
                href={item.href}
                onClick={onClose}
                title={item.description}
                className={
                    'flex items-center gap-2 w-full rounded-lg p-2 transition-colors ' +
                    (active ? ACCENT : 'text-gray-600 hover:bg-bg-hover')
                }
            >
                <ItemIcon size={20} className="shrink-0" />
                <span className="text-sm font-medium flex-1 truncate text-left">{item.name}</span>
            </NextLink>
        );
    };

    return (
        <aside className={
            `flex flex-col h-full w-full border-r border-border-default bg-bg-body select-none ` +
            (rail ? 'items-center px-1 py-2 gap-1' : 'px-2 py-2 gap-1')
        }>
            {isDrawer && (
                <div className="flex items-center justify-end shrink-0 px-1 py-1">
                    <button
                        aria-label="Close menu"
                        className="p-1.5 rounded-md text-gray-600 hover:bg-bg-hover"
                        onClick={onClose}
                    >
                        <X size={20} />
                    </button>
                </div>
            )}

            {/* Nav */}
            <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 w-full">
                {/* Root entries: one click, no group to expand */}
                {rootMenuItems.map(renderTopItem)}

                {menuList.map(group => {
                    const GroupIcon = group.icon;
                    if (rail) {
                        return (
                            <button
                                key={group.name}
                                title={group.name}
                                onClick={onToggleCollapsed}
                                className={
                                    'flex items-center justify-center h-9 w-9 mx-auto rounded-lg transition-colors ' +
                                    (groupHasActive(group) ? ACCENT : 'text-gray-600 hover:bg-bg-hover')
                                }
                            >
                                <GroupIcon size={20} />
                            </button>
                        );
                    }

                    const open = isOpen(group.name);
                    const gActive = groupHasActive(group);
                    return (
                        <div key={group.name} className="flex flex-col w-full">
                            <button
                                onClick={() => toggle(group.name)}
                                className={
                                    'flex items-center gap-2 w-full rounded-lg p-2 transition-colors ' +
                                    (gActive ? ACCENT : 'text-gray-600 hover:bg-bg-hover')
                                }
                            >
                                <GroupIcon size={20} className="shrink-0" />
                                <span className="text-sm font-medium flex-1 truncate text-left">{group.name}</span>
                                <ChevronRight size={18} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                            </button>

                            {open && (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                    {group.items.map(item => {
                                        const active = isActive(pathname, item.href);
                                        const ItemIcon = item.icon;
                                        return (
                                            <NextLink
                                                key={item.key}
                                                href={item.href}
                                                onClick={onClose}
                                                title={item.description}
                                                className={
                                                    'flex items-center gap-2 w-full rounded-lg py-1.5 pl-10 pr-2 transition-colors ' +
                                                    (active ? ACCENT : 'text-gray-600 hover:bg-bg-hover')
                                                }
                                            >
                                                <ItemIcon size={18} className="shrink-0" />
                                                <span className="text-xs font-medium truncate">{item.name}</span>
                                            </NextLink>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Pinned below the groups, as in the app: Settings is one click
                    away without sitting in the daily path. */}
                {bottomMenuItems.map(renderTopItem)}
            </nav>

            {/* Desktop collapse toggle */}
            {!isDrawer && onToggleCollapsed && (
                <button
                    onClick={onToggleCollapsed}
                    aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="flex items-center justify-center h-9 w-9 mx-auto mt-1 rounded-lg text-gray-500 hover:bg-bg-hover shrink-0"
                >
                    {rail ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
                </button>
            )}

            {/* Account footer — pinned, never scrolled away with the nav. The
                identity row only opens the panel; logging out happens inside it. */}
            <div className="border-t border-border-default pt-2 pb-1 w-full shrink-0">
                {user ? (
                    <AccountMenu
                        collapsed={rail}
                        name={user.name || user.email}
                        email={user.email}
                        onLogout={signOut}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={handleLogin}
                        title="Login"
                        className={`flex items-center w-full rounded-lg px-2 py-1.5 hover:bg-bg-hover transition-colors cursor-pointer ${
                            rail ? 'justify-center' : 'gap-2'
                        }`}
                    >
                        <User size={18} className="text-gray-500 shrink-0" />
                        {!rail && <span className="text-xs font-medium text-gray-500">Login</span>}
                    </button>
                )}
            </div>
        </aside>
    );
}
