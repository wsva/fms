'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, ButtonGroup, Dropdown, Label, Header } from "@heroui/react";
import { MdMenu, MdArrowBackIosNew, MdArrowForwardIos } from "react-icons/md";
import { menuList } from "./menu";
import { getBreadcrumbs } from '@/lib/nav-crumbs';
import { authClient } from "@/lib/auth-client";
import { deleteAuthTokens } from "@/app/actions/auth";
import type { User } from "better-auth";
import PlanCountdown from './PlanCountdown'
import { useTheme } from '@/components/ThemeProvider'
import { themes } from '@/lib/themes'
import type { ThemeId } from '@/lib/themes'

export default function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
    const [stateUser, setStateUser] = useState<User>();
    const { theme, setTheme } = useTheme();

    const pathname = usePathname();
    const searchParams = useSearchParams();
    const redirectUrl = searchParams.get('redirect_url') ?? '/';

    const router = useRouter();

    useEffect(() => {
        const refresh = async () => {
            try {
                const session = await authClient.getSession();
                setStateUser(session.data?.user);
            } catch (e) {
                console.error("session refresh failed", e);
            }
        };

        refresh();
        const refreshTimer = setInterval(refresh, 60_000);
        return () => clearInterval(refreshTimer);
    }, []);

    const handleSignOut = async () => {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    router.push("/");
                    setStateUser(undefined);
                },
            },
        });
        await deleteAuthTokens();
        const formData = new FormData();
        formData.append("user_id", stateUser!.email);
        // here is client side code, so we cannot get the url through `${process.env.OAUTH2_LOGOUT}`
        // use "/api/oauth2/logout" directly if oauth2 is implemented in this project
        // create a server action instead to call `${process.env.OAUTH2_LOGOUT}` if use third-party oauth2 service
        await fetch("/api/oauth2/logout", {
            method: "POST",
            body: formData,
        });
    };

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

            <PlanCountdown user_id={stateUser?.email ?? ''} />

            {/* Right: user */}
            <div className="flex items-center gap-3 shrink-0">
                {!!stateUser ? (
                    <Dropdown>
                        <Button size="sm" className="text-lg bg-sand-400">
                            {stateUser.name}
                        </Button>
                        <Dropdown.Popover placement="bottom right" className="min-w-[320px] bg-sand-200">
                            <Dropdown.Menu aria-label="User Actions">
                                <Dropdown.Section>
                                    <Header className="font-bold text-sm">Profile</Header>
                                    <Header className="font-bold ml-2 text-sm">{stateUser.name}</Header>
                                    <Header className="font-bold ml-2 text-sm">{stateUser.email}</Header>
                                </Dropdown.Section>
                                <Dropdown.Section>
                                    <Header className="font-bold text-sm">Theme</Header>
                                    {themes.map(t => (
                                        <Dropdown.Item key={t.id} id={`theme-${t.id}`} textValue={t.name}
                                            className={`ml-2 rounded-sm ${theme.id === t.id ? 'bg-sand-300' : ''}`}
                                            onPress={() => setTheme(t.id as ThemeId)}
                                        >
                                            <span className="w-3 h-3 rounded-full inline-block shrink-0 border border-sand-400"
                                                style={{ backgroundColor: t.swatch }}
                                            />
                                            <Label>{t.name}</Label>
                                        </Dropdown.Item>
                                    ))}
                                </Dropdown.Section>
                                <Dropdown.Item id="logout" textValue="Sign Out" variant="danger" onPress={handleSignOut}>
                                    <Label>Sign Out</Label>
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                ) : (
                    <Button variant="outline" className='text-gray-500'
                        onPress={async () => {
                            await authClient.signIn.social({
                                provider: "wsva_oauth2",
                                callbackURL: redirectUrl,
                            });
                        }}
                    >
                        Login
                    </Button>
                )}
            </div>
        </nav>
    )
}
