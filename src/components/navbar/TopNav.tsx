'use client';

import { Button, ButtonGroup, Separator, Dropdown, Label, Description, Link, Tooltip, Header } from "@heroui/react"
import { useEffect, useState } from 'react';
import { useRouter } from "next/navigation";
import NextLink from 'next/link';
import { MdMenu, MdClose } from "react-icons/md";
import { menuList } from "./menu";
import { authClient } from "@/lib/auth-client";
import { deleteAuthTokens } from "@/app/actions/auth";
import type { User } from "better-auth";
import NavIcon from '@/components/design/NavIcon'
import { useSearchParams } from 'next/navigation'
import { ArrowUturnCcwLeft, ArrowUturnCwRight, ChevronDown } from "@gravity-ui/icons";
import PlanCountdown from './PlanCountdown'
import { useTheme } from '@/components/ThemeProvider'
import { themes } from '@/lib/themes'
import type { ThemeId } from '@/lib/themes'

export default function TopNav() {
    const [stateUser, setStateUser] = useState<User>();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { theme, setTheme } = useTheme();

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

    return (
        <>
            <nav className="sticky top-0 z-40 w-full bg-linear-to-b from-sand-300 to-sand-200 border-b border-sand-300">
                <header className="flex items-center h-16 px-2 sm:px-4 w-full">
                    {/* Left: hamburger + brand */}
                    <div className="flex items-center shrink-0 mr-1 sm:mr-4 gap-1">
                        <button
                            className="lg:hidden p-2 rounded-md text-gray-600 hover:bg-sand-300"
                            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                        >
                            {isMenuOpen ? <MdClose size={22} /> : <MdMenu size={22} />}
                        </button>
                        <div className="hidden lg:flex">
                            <Tooltip delay={0} closeDelay={0}>
                                <Tooltip.Trigger>
                                    <Link href='/'>
                                        <NavIcon size={40} />
                                    </Link>
                                </Tooltip.Trigger>
                                <Tooltip.Content className="bg-transparent p-0 shadow-none border-none">
                                    <NavIcon size={280} />
                                </Tooltip.Content>
                            </Tooltip>
                        </div>
                        <ButtonGroup>
                            <Button isIconOnly variant="ghost"
                                onPress={() => {
                                    router.back()
                                    setIsMenuOpen(false)
                                }}
                            >
                                <ArrowUturnCcwLeft />
                            </Button>
                            <Button isIconOnly variant="ghost"
                                onPress={() => {
                                    router.forward()
                                    setIsMenuOpen(false)
                                }}
                            >
                                <ArrowUturnCwRight />
                            </Button>
                        </ButtonGroup>
                    </div>

                    {/* Desktop nav menu */}
                    <ul className="hidden lg:flex items-center gap-3 flex-1">
                        {menuList.map((group, index) => (
                            <li key={`group-${index}`}>
                                <Dropdown>
                                    <Button
                                        className="p-0 bg-transparent data-[hover=true]:bg-transparent gap-0 min-w-0 text-sm text-gray-500 rounded-sm"
                                        variant="ghost"
                                    >
                                        {group.name}
                                        <ChevronDown />
                                    </Button>
                                    <Dropdown.Popover className="bg-sand-200 rounded-sm">
                                        <Dropdown.Menu
                                            disabledKeys={group.items.filter(item => /^seperator_/.test(item.key)).map(item => item.key)}
                                        >
                                            {group.items.map((item) => {
                                                return /^seperator_/.test(item.key) ? (
                                                    <Dropdown.Item id={item.key} textValue={item.name} key={item.key}
                                                        className="flex flex-col items-start justify-center gap-0"
                                                    >
                                                        <Label className="font-bold select-none text-red">{item.name}</Label>
                                                        <Separator />
                                                    </Dropdown.Item>
                                                ) : (
                                                    <Dropdown.Item
                                                        id={item.key}
                                                        textValue={item.name}
                                                        key={item.key}
                                                        className="p-0 bg-sand-300 rounded-sm"
                                                    >
                                                        <NextLink href={item.href} className="flex flex-col items-start justify-center gap-1 w-full px-3 py-2">
                                                            <Label className="font-bold">{item.name}</Label>
                                                            <Description>{item.description}</Description>
                                                        </NextLink>
                                                    </Dropdown.Item>
                                                )
                                            })}
                                        </Dropdown.Menu>
                                    </Dropdown.Popover>
                                </Dropdown>
                            </li>
                        ))}
                    </ul>

                    <PlanCountdown user_id={stateUser?.email ?? ''} />

                    {/* Right: user */}
                    <div className="flex items-center gap-3 ml-auto">
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
                                        <Separator />
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
                                        <Separator />
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
                </header>
            </nav>

            {/* Mobile menu overlay */}
            {isMenuOpen && (
                <div className="lg:hidden fixed inset-x-0 top-16 bottom-0 z-30 bg-sand-200 overflow-y-auto pt-4 pb-20">
                    <div className="flex justify-center">
                        <Link href='/' onPress={() => setIsMenuOpen(false)}>
                            <NavIcon size={280} />
                        </Link>
                    </div>
                    {menuList.map((group) => (
                        <div key={group.name}>
                            <div className="select-none font-bold text-xl">{group.name}</div>
                            <Separator />
                            {group.items.map((item) => {
                                return /^seperator_/.test(item.key) ? (
                                    <div key={item.key} className="my-1 pl-4">
                                        <span className="font-bold select-none text-gray-500 text-lg">{item.name}</span>
                                        <Separator />
                                    </div>
                                ) : (
                                    <div key={item.key} className="my-1 pl-4">
                                        <Link className="w-full text-blue-600 underline text-lg" href={item.href}
                                            onPress={() => setIsMenuOpen(false)}
                                        >
                                            {item.name}
                                        </Link>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}
