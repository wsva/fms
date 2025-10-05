'use client';

import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input, Navbar, NavbarBrand, NavbarContent, NavbarItem, NavbarMenu, NavbarMenuItem, NavbarMenuToggle, Tooltip } from "@heroui/react"
import Link from 'next/link'
import React, { useEffect, useRef } from 'react'
import UserMenu from './UserMenu'
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react"
import { Session } from "next-auth"
import { MdHelpOutline, MdMic, MdMicOff } from "react-icons/md";
import { menuList } from "./menu";
import { handleSTTResult } from "@/lib/voice_access";
import { toggleRecording } from "@/lib/recording";
import { ActionResult } from "@/lib/types";

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

type Props = {
    session: Session | null
}

export default function TopNav({ session }: Props) {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const [stateColor, setStateColor] = React.useState<"default" | "success" | "warning">("default");
    const [stateRecording, setStateRecording] = React.useState(false);
    const [stateProcessing, setStateProcessing] = React.useState(false);
    const [stateSTT, setStateSTT] = React.useState<string>("");

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const router = useRouter();

    const toggleRecordingLocal = () => {
        const handleLog = (log: string) => {
            setStateSTT(log);
        }
        const handleResult = (result: ActionResult<string>) => {
            if (result.status === 'success') {
                setStateSTT(result.data);
                handleSTTResult(result.data);
            } else {
                setStateSTT(result.error as string);
            }
        }

        toggleRecording(
            stateRecording,
            setStateRecording,
            sentenceChunks,
            recorderRef,
            true,
            setStateProcessing,
            handleLog,
            handleResult,
        );
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'F2') {
                e.preventDefault();
                const btn = document.getElementById("button-voice-access") as HTMLButtonElement | null;
                btn?.click();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        let blinkTimer: NodeJS.Timeout | null = null;
        if (stateRecording) {
            blinkTimer = setInterval(() => {
                setStateColor(prev => (prev === "success" ? "warning" : "success"));
            }, 200);
        } else {
            setStateColor("default");
        }

        return () => {
            if (blinkTimer) clearInterval(blinkTimer);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [stateRecording]);

    return (
        <>
            <Navbar
                shouldHideOnScroll
                maxWidth='full'
                //className='border-b-1'
                className='bg-gradient-to-b from-sand-300 to-sand-200'
                classNames={{
                    item: [
                        'text-sm',
                        'sm:text-xl',
                        'text-gray-500',
                        'uppercase',
                        'data-[active=true]:font-bold'
                    ]
                }}
                onMenuOpenChange={setIsMenuOpen}
            >
                <NavbarContent className='flex-grow-0 mr-1 sm:mr-4 data-[justify=start]:flex-grow-0' justify="start">
                    <NavbarMenuToggle
                        aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                        className="lg:hidden"
                    />
                    <NavbarBrand className="hidden lg:flex">
                        <Tooltip content='Fremdsprachen machen Spaß!'>
                            <Link
                                className='font-bold text-sm sm:text-2xl text-red-500'
                                href='/'
                            >
                                FmS
                            </Link>
                        </Tooltip>
                    </NavbarBrand>
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
                    {/* <NavLink href='/card/test' label='Test' /> */}
                </NavbarContent>


                <NavbarContent justify='center'>
                    <Input className="mx-0 w-[60vw] lg:w-[30vw]"
                        startContent={
                            <Tooltip content="F2" placement="right">
                                <Button isIconOnly size="sm" color={stateColor} id="button-voice-access"
                                    disabled={stateProcessing}
                                    onPress={toggleRecordingLocal}
                                >
                                    {stateRecording ? <MdMic size={24} /> : <MdMicOff size={24} />}
                                </Button>
                            </Tooltip>
                        }
                        endContent={
                            <div className="flex flex-row items-center gap-0">
                                <Button isIconOnly size="sm" variant="light" onPress={() => router.push("/voice_access")}>
                                    <MdHelpOutline size={24} />
                                </Button>
                            </div>
                        }
                        value={stateSTT || "Voice Access: F2 to activate"}
                    />
                </NavbarContent>


                <NavbarContent justify='end'>
                    {session?.user ? (
                        <UserMenu session={session} />
                    ) : (
                        <Button variant='bordered' className='text-gray-500'
                            onPress={() => signIn('wsva_oauth2')}
                        >
                            Login
                        </Button>
                    )}
                </NavbarContent>

                <NavbarMenu>
                    {menuList.map((group) => (
                        group.items.map((item) => (
                            <NavbarMenuItem key={item.key}>
                                <Link className="w-full" href={item.href}>
                                    {item.name}
                                </Link>
                            </NavbarMenuItem>
                        ))
                    ))}
                </NavbarMenu>
            </Navbar >
        </>
    )
}
