'use client';

import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input, Navbar, NavbarBrand, NavbarContent, NavbarItem, NavbarMenu, NavbarMenuItem, NavbarMenuToggle, Tooltip } from "@heroui/react"
import Link from 'next/link'
import React, { useEffect, useRef } from 'react'
import UserMenu from './UserMenu'
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react"
import { Session } from "next-auth"
import { MdMic, MdMicOff, MdRefresh } from "react-icons/md";
import { menuList } from "./menu";
import { handleSTTResult } from "@/lib/voice_access";
import { startRecording, stopRecording, toggleRecording } from "@/lib/recording";
import { ActionResult } from "@/lib/types";
import { checkSTTServiceStatus } from "@/app/actions/audio";

type Props = {
    session: Session | null
}

export default function TopNav({ session }: Props) {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const [stateColor, setStateColor] = React.useState<"default" | "success" | "warning">("default");
    const [stateRecording, setStateRecording] = React.useState(false);
    const [stateProcessing, setStateProcessing] = React.useState(false);
    const [stateSTT, setStateSTT] = React.useState<string>("");
    const [stateSTTAvailable, setStateSTTAvailable] = React.useState<boolean>(false);

    const sentenceChunks = useRef<BlobPart[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const router = useRouter();

    const toggleRecordingLocal = (action: "start" | "stop" | "toggle") => {
        if (!stateSTTAvailable) {
            return
        }

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

        switch (action) {
            case "start":
                startRecording(
                    stateRecording,
                    setStateRecording,
                    sentenceChunks,
                    recorderRef,
                    true,
                    setStateProcessing,
                    handleLog,
                    handleResult,
                );
                break
            case "stop":
                stopRecording(
                    stateRecording,
                    recorderRef,
                );
                break
            case "toggle":
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
                break
        }
    }

    const checkSTT = async () => {
        const available = await checkSTTServiceStatus();
        setStateSTTAvailable(available)
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'F2') {
                e.preventDefault();
                toggleRecordingLocal("toggle");
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

        checkSTT()
        const sttTimer = setInterval(checkSTT, 30000);

        return () => {
            if (blinkTimer) clearInterval(blinkTimer);
            clearInterval(sttTimer);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [stateRecording, stateProcessing, stateSTTAvailable]);

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

                <NavbarContent className="hidden lg:flex gap-4" justify="start">
                    {menuList.map((group, index) => (
                        <Dropdown key={`group-${index}`}>
                            <NavbarItem>
                                <DropdownTrigger>{group.name}</DropdownTrigger>
                            </NavbarItem>
                            <DropdownMenu>
                                {group.items.map((item) => (
                                    <DropdownItem
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
                        disabled={!stateSTTAvailable}
                        startContent={
                            <Tooltip content="Shortcuts: F2 to activate">
                                <Button isIconOnly size="sm" color={stateColor}
                                    disabled={!stateSTTAvailable}
                                    onPress={() => toggleRecordingLocal("toggle")}
                                >
                                    {stateRecording ? <MdMic size={24} /> : <MdMicOff size={24} />}
                                </Button>
                            </Tooltip>
                        }
                        endContent={
                            <Button isIconOnly size="sm" variant="light" onPress={checkSTT}>
                                <MdRefresh size={24} />
                            </Button>
                        }
                        value={stateSTTAvailable ? stateSTT || "Voice Access: F2 to activate" : "service not available"}
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
