'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Link } from '@heroui/react';
import {
    MdExpandMore,
    MdExpandLess,
    MdChevronLeft,
    MdChevronRight,
    MdClose,
    MdLogout,
    MdPerson,
} from 'react-icons/md';
import { menuList } from './menu';
import { hrefPath } from '@/lib/nav-crumbs';
import { useSession } from '@/components/SessionProvider';
import { authClient } from '@/lib/auth-client';
import NavIcon from '@/components/design/NavIcon';

const ACCENT = 'bg-[#0EA89A]/80 text-white';

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
    const redirectUrl = searchParams.get('redirect_url') ?? '/';
    const { user, signOut } = useSession();
    const isDrawer = !!onClose;
    const rail = collapsed && !isDrawer;
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const isOpen = (name: string) => !rail && (expanded[name] ?? true);
    const toggle = (name: string) =>
        setExpanded(prev => ({ ...prev, [name]: !(prev[name] ?? true) }));

    const groupHasActive = (group: (typeof menuList)[number]) =>
        group.items.some(item => !/^seperator_/.test(item.key) && isActive(pathname, item.href));

    const handleLogin = async () => {
        await authClient.signIn.social({ provider: "wsva_oauth2", callbackURL: redirectUrl });
    };

    return (
        <aside className={
            `flex flex-col h-full w-full border-r border-sand-300 bg-sand-200 select-none ` +
            (rail ? 'items-center px-1 py-2 gap-1' : 'px-2 py-2 gap-1')
        }>
            {/* Brand */}
            <div className={`flex items-center shrink-0 ${rail ? 'justify-center' : 'justify-between px-1'} py-1`}>
                <Link href="/" className="flex items-center gap-2" onPress={onClose}>
                    <NavIcon size={rail ? 28 : 34} />
                    {!rail && <span className="font-bold text-lg">FmS</span>}
                </Link>
                {isDrawer && (
                    <button
                        aria-label="Close menu"
                        className="p-1.5 rounded-md text-gray-600 hover:bg-sand-300"
                        onClick={onClose}
                    >
                        <MdClose size={20} />
                    </button>
                )}
            </div>

            {/* Auth row */}
            <div data-no-toggle className={`flex items-center w-full rounded-lg transition-colors shrink-0 ${
                rail ? 'justify-center px-0 py-1.5' : 'gap-2 px-2 py-1.5'
            } hover:bg-sand-300/60 ${user ? 'cursor-pointer' : ''}`}
                title={user ? (rail ? `${user.name} (click to logout)` : 'Click to logout') : 'Login'}
                onClick={() => (user ? signOut() : handleLogin())}
            >
                {user ? (
                    <>
                        <span className="w-6 h-6 rounded-full bg-[#0EA89A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {(user.name || user.email).charAt(0).toUpperCase()}
                        </span>
                        {!rail && <span className="text-xs font-medium truncate flex-1 text-left">{user.name}</span>}
                        {!rail && <MdLogout size={14} className="text-gray-400 shrink-0" />}
                    </>
                ) : (
                    <>
                        <MdPerson size={18} className="text-gray-500 shrink-0" />
                        {!rail && <span className="text-xs font-medium text-gray-500">Login</span>}
                    </>
                )}
            </div>
            <div className="border-b border-sand-300 my-1 w-full shrink-0" />

            {/* Nav */}
            <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 w-full">
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
                                    (groupHasActive(group) ? ACCENT : 'text-gray-600 hover:bg-sand-300')
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
                                    (gActive ? ACCENT : 'text-gray-600 hover:bg-sand-300')
                                }
                            >
                                <GroupIcon size={20} className="shrink-0" />
                                <span className="text-sm font-medium flex-1 truncate text-left">{group.name}</span>
                                {open ? <MdExpandLess size={18} /> : <MdExpandMore size={18} />}
                            </button>

                            {open && (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                    {group.items.map(item => {
                                        if (/^seperator_/.test(item.key)) {
                                            return (
                                                <div key={item.key}
                                                    className="pl-10 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-gray-400 font-bold select-none">
                                                    {item.name}
                                                </div>
                                            );
                                        }
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
                                                    (active ? ACCENT : 'text-gray-600 hover:bg-sand-300/60')
                                                }
                                            >
                                                {ItemIcon && <ItemIcon size={18} className="shrink-0" />}
                                                <span className="text-xs font-medium truncate">{item.name}</span>
                                            </NextLink>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* Desktop collapse toggle */}
            {!isDrawer && onToggleCollapsed && (
                <button
                    onClick={onToggleCollapsed}
                    aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="flex items-center justify-center h-9 w-9 mx-auto mt-1 rounded-lg text-gray-500 hover:bg-sand-300 shrink-0"
                >
                    {rail ? <MdChevronRight size={20} /> : <MdChevronLeft size={20} />}
                </button>
            )}
        </aside>
    );
}
