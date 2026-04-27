'use client';

import { Button, ButtonGroup, Divider, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Link, Navbar, NavbarBrand, NavbarContent, NavbarItem, NavbarMenu, NavbarMenuItem, NavbarMenuToggle, Tooltip } from "@heroui/react"
import { useEffect, useState } from 'react';
import { useRouter } from "next/navigation";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { menuList } from "./menu";
import { authClient } from "@/lib/auth-client";
import { User } from "better-auth";
import ThemeSelector from '@/components/ThemeSelector'
import NavIcon from '@/components/design/NavIcon'

const ChevronDown = () => {
    return (
        <svg
            fill="none"
            height={16}
            viewBox="0 0 24 24"
            width={16}
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="m19.92 8.95-6.52 6.52c-.77.77-2.03.77-2.8 0L4.08 8.95"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeMiterlimit={10}
                strokeWidth={1.5}
            />
        </svg>
    );
};

export default function TopNav() {
    const [stateUser, setStateUser] = useState<User>();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

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

    return (
        <>
            <Navbar
                shouldHideOnScroll
                maxWidth='full'
                className='bg-linear-to-b from-sand-300 to-sand-200'
                classNames={{
                    item: [
                        'text-sm',
                        'sm:text-xl',
                        'text-gray-500',
                        'uppercase',
                        'data-[active=true]:font-bold'
                    ]
                }}
                isMenuOpen={isMenuOpen}
                onMenuOpenChange={setIsMenuOpen}
            >
                <NavbarContent className='grow-0 mr-1 sm:mr-4 data-[justify=start]:grow-0' justify="start">
                    <NavbarMenuToggle
                        aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                        className="lg:hidden"
                    />
                    <NavbarBrand className="hidden lg:flex">
                        <Tooltip content={<NavIcon size={280} />} classNames={{ content: 'bg-transparent p-0 shadow-none border-none' }}>
                            <Link href='/'>
                                <NavIcon size={40} />
                            </Link>
                        </Tooltip>
                    </NavbarBrand>
                    <ButtonGroup>
                        <Button isIconOnly variant="light"
                            onPress={() => {
                                router.back()
                                setIsMenuOpen(!isMenuOpen)
                            }}
                        >
                            <MdArrowBack size={24} />
                        </Button>
                        <Button isIconOnly variant="light"
                            onPress={() => {
                                router.forward()
                                setIsMenuOpen(!isMenuOpen)
                            }}
                        >
                            <MdArrowForward size={24} />
                        </Button>
                    </ButtonGroup>
                </NavbarContent>

                <NavbarContent className="hidden lg:flex gap-3" justify="start">
                    {menuList.map((group, index) => (
                        <Dropdown key={`group-${index}`} className="bg-sand-200">
                            <NavbarItem>
                                <DropdownTrigger>
                                    <Button
                                        disableRipple
                                        className="p-0 bg-transparent data-[hover=true]:bg-transparent gap-0 min-w-0"
                                        endContent={<ChevronDown />}
                                        radius="sm"
                                        variant="light"
                                    >
                                        {group.name}
                                    </Button>
                                </DropdownTrigger>
                            </NavbarItem>
                            <DropdownMenu>
                                {group.items.map((item) => (
                                    <DropdownItem
                                        className="bg-sand-300"
                                        href={item.href}
                                        key={item.key}
                                        description={item.description}
                                        onPress={() => router.push(item.href)}
                                    >
                                        {item.name}
                                    </DropdownItem>
                                ))}
                            </DropdownMenu>
                        </Dropdown>
                    ))}
                </NavbarContent>

                <NavbarContent justify='end' className="hidden lg:flex gap-3">
                    <ThemeSelector />
                    {!!stateUser ? (
                        <Dropdown placement="bottom-start">
                            <DropdownTrigger>
                                <Button size="sm" className="text-lg bg-sand-400">
                                    {stateUser.name}
                                </Button>
                            </DropdownTrigger>
                            <DropdownMenu aria-label="User Actions" variant="flat">
                                <DropdownItem key="profile" className="h-14 gap-2">
                                    <p className="font-bold">{stateUser.name}</p>
                                    <p className="font-bold">{stateUser.email}</p>
                                </DropdownItem>
                                <DropdownItem key="logout"
                                    className="text-danger"
                                    color="danger"
                                    onPress={async () => {
                                        await authClient.signOut({
                                            fetchOptions: {
                                                onSuccess: () => {
                                                    router.push("/");
                                                    setStateUser(undefined);
                                                },
                                            },
                                        });
                                        const formData = new FormData();
                                        formData.append("user_id", stateUser.email);
                                        await fetch(`${process.env.OAUTH2_LOGOUT}`, {
                                            method: "POST",
                                            body: formData,
                                        });
                                    }}
                                >
                                    Sign Out
                                </DropdownItem>
                            </DropdownMenu>
                        </Dropdown>
                    ) : (
                        <Button variant='bordered' className='text-gray-500'
                            onPress={async () => {
                                await authClient.signIn.social({
                                    provider: "wsva_oauth2",
                                    callbackURL: window.location.href,
                                });
                            }}
                        >
                            Login
                        </Button>
                    )}
                </NavbarContent>

                <NavbarMenu className="pt-4 pb-20 bg-sand-200">
                    <div className="flex justify-center">
                        <NavIcon size={280} />
                    </div>
                    <div className="flex flex-row items-center justify-center px-1 mb-3">
                        Select Theme:
                        <ThemeSelector />
                    </div>
                    <div className="bg-sand-300 rounded-sm p-2 mb-5">
                        {!!stateUser ? (
                            <div className="flex flex-col w-full">
                                <div className="flex flex-row items-center justify-start gap-2 w-full">
                                    <div className="flex-1">
                                        <Button size="sm" isDisabled className="text-lg bg-sand-400 disabled:opacity-100">
                                            {stateUser.name}
                                        </Button>
                                    </div>
                                    <Button color="danger" size="sm"
                                        onPress={async () => {
                                            await authClient.signOut({
                                                fetchOptions: {
                                                    onSuccess: () => {
                                                        router.push("/");
                                                        setStateUser(undefined);
                                                    },
                                                },
                                            });
                                            const formData = new FormData();
                                            formData.append("user_id", stateUser.email);
                                            await fetch(`${process.env.OAUTH2_LOGOUT}`, {
                                                method: "POST",
                                                body: formData,
                                            });
                                        }}
                                    >
                                        Sign Out
                                    </Button>
                                </div>
                                <div className="select-none">{stateUser.email}</div>
                            </div>
                        ) : (
                            <div className="flex flex-row items-center justify-center gap-2 w-full">
                                <Button color="primary" size="sm"
                                    onPress={async () => {
                                        await authClient.signIn.social({
                                            provider: "wsva_oauth2",
                                            callbackURL: window.location.href,
                                        });
                                    }}
                                >
                                    Login
                                </Button>
                            </div>
                        )}
                    </div>
                    <NavbarMenuItem className="my-1">
                        <Link className="w-full text-blue-600 underline font-bold" href={"/"}
                            onPress={() => setIsMenuOpen(!isMenuOpen)}
                        >
                            Home
                        </Link>
                    </NavbarMenuItem>
                    {menuList.map((group) => (
                        <div key={group.name}>
                            <div className="select-none font-bold">{group.name}</div>
                            <Divider />
                            {group.items.map((item) => (
                                <NavbarMenuItem key={item.key} className="my-1 pl-4">
                                    <Link className="w-full text-blue-600 underline" href={item.href}
                                        onPress={() => setIsMenuOpen(!isMenuOpen)}
                                    >
                                        {item.name}
                                    </Link>
                                </NavbarMenuItem>
                            ))}
                        </div>
                    ))}
                </NavbarMenu>
            </Navbar>
        </>
    )
}
