'use client';

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, ButtonGroup } from "@heroui/react";
import { MdMenu, MdArrowBackIosNew, MdArrowForwardIos } from "react-icons/md";
import { menuList } from "./menu";
import { getBreadcrumbs } from '@/lib/nav-crumbs';
import { useSession } from '@/components/SessionProvider';
import ThemeSelector from '@/components/ThemeSelector';
import PlanCountdown from './PlanCountdown'

export default function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
    const { user } = useSession();
    const pathname = usePathname();
    const router = useRouter();

    // Group names have no page of their own — skip them when the trail jumps levels.
    const trail = getBreadcrumbs(pathname);
    const crumbs = trail.filter((c, i) =>
        !(i < trail.length - 1 && !c.href && menuList.some(g => g.name === c.label)));

    return (
        <nav className="sticky top-0 z-40 w-full h-12 flex items-center gap-1 sm:gap-2 px-2 sm:px-4 bg-linear-to-b from-sand-300 to-sand-200 border-b border-sand-300">
            {/* Left: hamburger (mobile) + back/forward */}
            <button
                className="lg:hidden p-2 rounded-md text-gray-600 hover:bg-sand-300"
                aria-label="Open menu"
                onClick={onOpenDrawer}
            >
                <MdMenu size={22} />
            </button>
            <ButtonGroup>
                <Button isIconOnly variant="ghost"
                    aria-label="Back"
                    onPress={() => router.back()}
                >
                    <MdArrowBackIosNew size={18} />
                </Button>
                <Button isIconOnly variant="ghost"
                    aria-label="Forward"
                    onPress={() => router.forward()}
                >
                    <MdArrowForwardIos size={18} />
                </Button>
            </ButtonGroup>

            {/* Middle: breadcrumb */}
            <div className="flex items-center gap-2 text-sm min-w-0 flex-1 overflow-x-auto select-none">
                {crumbs.map((crumb, index) => {
                    const isLast = index === crumbs.length - 1;
                    return (
                        <span key={`${crumb.label}-${index}`} className="flex items-center gap-2 shrink-0">
                            {index > 0 && <span className="text-gray-400">&rsaquo;</span>}
                            {crumb.href && !isLast ? (
                                <NextLink href={crumb.href}
                                    className="text-blue-600 hover:underline whitespace-nowrap"
                                >
                                    {crumb.label}
                                </NextLink>
                            ) : (
                                <span className={`${isLast ? 'font-medium text-gray-900' : 'text-gray-500'} whitespace-nowrap max-w-[240px] truncate`}
                                    title={crumb.label}
                                >
                                    {crumb.label}
                                </span>
                            )}
                        </span>
                    );
                })}
            </div>

            {/* Right: plan timer + theme */}
            <PlanCountdown user_id={user?.email ?? ''} />
            <div className="shrink-0">
                <ThemeSelector />
            </div>
        </nav>
    )
}
