'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Link } from '@heroui/react';
import {
    MdExpandMore,
    MdExpandLess,
    MdChevronLeft,
    MdChevronRight,
    MdClose,
} from 'react-icons/md';
import { menuList } from './menu';
import { hrefPath } from '@/lib/nav-crumbs';
import NavIcon from '@/components/design/NavIcon';

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
    const isDrawer = !!onClose;
    const rail = collapsed && !isDrawer;
    // Rail mode has no room for the expand/collapse state, so it shows group initials.
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const isOpen = (name: string) => !rail && (expanded[name] ?? true);
    const toggle = (name: string) =>
        setExpanded(prev => ({ ...prev, [name]: !(prev[name] ?? true) }));

    const groupHasActive = (group: (typeof menuList)[number]) =>
        group.items.some(item => !/^seperator_/.test(item.key) && isActive(pathname, item.href));

    return (
        <aside className={
            `flex flex-col h-full border-r border-sand-300 bg-sand-200 select-none ` +
            (rail ? 'w-12 items-center px-1 py-2 gap-1' : 'w-44 px-2 py-2 gap-1')
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
            <div className="border-b border-sand-300 my-1 w-full" />

            {/* Nav */}
            <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 w-full">
                {menuList.map(group => {
                    if (rail) {
                        return (
                            <button
                                key={group.name}
                                title={group.name}
                                onClick={onToggleCollapsed}
                                className={
                                    'flex items-center justify-center h-9 w-9 mx-auto rounded-lg text-sm font-bold transition-colors ' +
                                    (groupHasActive(group)
                                        ? 'bg-sand-400 text-gray-800'
                                        : 'text-gray-600 hover:bg-sand-300')
                                }
                            >
                                {group.name.charAt(0)}
                            </button>
                        );
                    }

                    const open = isOpen(group.name);
                    return (
                        <div key={group.name} className="flex flex-col">
                            <button
                                onClick={() => toggle(group.name)}
                                className={
                                    'flex items-center justify-between w-full rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors ' +
                                    (groupHasActive(group) ? 'text-gray-800 hover:bg-sand-300' : 'text-gray-600 hover:bg-sand-300')
                                }
                            >
                                <span className="truncate">{group.name}</span>
                                {open ? <MdExpandLess size={18} /> : <MdExpandMore size={18} />}
                            </button>

                            {open && (
                                <div className="flex flex-col ml-1">
                                    {group.items.map(item => {
                                        if (/^seperator_/.test(item.key)) {
                                            return (
                                                <div key={item.key}
                                                    className="px-3 pt-2 pb-0.5 text-[11px] uppercase tracking-wide text-gray-400 font-bold select-none">
                                                    {item.name}
                                                </div>
                                            );
                                        }
                                        const active = isActive(pathname, item.href);
                                        return (
                                            <NextLink
                                                key={item.key}
                                                href={item.href}
                                                onClick={onClose}
                                                title={item.description}
                                                className={
                                                    'block rounded-lg px-3 py-1.5 text-sm truncate transition-colors ' +
                                                    (active
                                                        ? 'bg-sand-300 font-bold text-gray-900'
                                                        : 'text-gray-600 hover:bg-sand-300/60')
                                                }
                                            >
                                                {item.name}
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
