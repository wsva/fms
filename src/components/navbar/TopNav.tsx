'use client';

import { Button, ButtonGroup, Divider, Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, Input, Link, Navbar, NavbarBrand, NavbarContent, NavbarItem, NavbarMenu, NavbarMenuItem, NavbarMenuToggle, Select, SelectItem, Tooltip } from "@heroui/react"
import React, { useEffect } from 'react'
import UserMenu from './UserMenu'
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react"
import { Session } from "next-auth"
import { MdHelpOutline, MdMic, MdMicOff, MdOutlineRedo, MdOutlineSettings, MdOutlineUndo } from "react-icons/md";
import { menuList } from "./menu";
import { handleSTTResult } from "@/lib/voice_access";
import { EngineList, toggleRecording } from "@/lib/recording";
import { ActionResult } from "@/lib/types";
import { initCmdHelpMap } from "@/app/actions/voice_access";
import { signOut } from "next-auth/react";

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
    const [stateEngine, setStateEngine] = React.useState<string>("local");
    const [stateRecorder, setStateRecorder] = React.useState<MediaRecorder[]>([]);
    const [stateRecording, setStateRecording] = React.useState(false);
    const [stateProcessing, setStateProcessing] = React.useState(false);
    const [stateSTT, setStateSTT] = React.useState<string>("");
    const [stateCmdOpen, setStateCmdOpen] = React.useState<boolean>(false);
    const [stateCmdMap, setStateCmdMap] = React.useState<Map<string, string[]>>(new Map());

    const router = useRouter();

    const toggleRecordingLocal = async () => {
        const handleLog = (log: string) => {
            setStateSTT(log);
        }
        const handleAudio = async (result: ActionResult<string>) => {
            if (result.status === 'success') {
                setStateSTT(result.data);
                handleSTTResult(result.data);
            } else {
                setStateSTT(result.error as string);
            }
        }

        await toggleRecording({
            mode: "audio",
            stateRecorder,
            setStateRecorder,
            stateRecording,
            setStateRecording,
            recognize: true,
            sttEngine: stateEngine,
            setStateProcessing,
            handleLog,
            handleAudio,
        });
    }

    useEffect(() => {
        const loadCmdMap = async () => {
            const cmdMap = await initCmdHelpMap();
            setStateCmdMap(cmdMap);
        }
        if (stateCmdOpen) {
            loadCmdMap();
        }

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
    }, [stateCmdOpen, stateRecording]);

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
                isMenuOpen={isMenuOpen}
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
                    <ButtonGroup>
                        <Button isIconOnly size="sm" className="bg-sand-400 hover:bg-sand-500"
                            onPress={() => {
                                router.back()
                                setIsMenuOpen(!isMenuOpen)
                            }}
                        >
                            <MdOutlineUndo />
                        </Button>
                        <Button isIconOnly size="sm" className="bg-sand-400 hover:bg-sand-500"
                            onPress={() => {
                                router.forward()
                                setIsMenuOpen(!isMenuOpen)
                            }}
                        >
                            <MdOutlineRedo />
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
                    {/* <NavLink href='/card/test' label='Test' /> */}
                </NavbarContent>


                <NavbarContent justify='center'>
                    <Input className="mx-0 w-[60vw] lg:w-[30vw]"
                        classNames={{
                            "inputWrapper": "bg-sand-100 data-[hover=true]:bg-sand-100 group-data-[focus=true]:bg-sand-100",
                        }}
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
                                <Dropdown placement="bottom-end" className="bg-sand-200"
                                    onOpenChange={() => setStateCmdOpen(!stateCmdOpen)}
                                >
                                    <DropdownTrigger>
                                        <Button isIconOnly size="sm" variant="light">
                                            <MdHelpOutline size={24} />
                                        </Button>
                                    </DropdownTrigger>
                                    <DropdownMenu
                                        disallowEmptySelection
                                        className="max-w-[300px]"
                                    >
                                        {Array.from(stateCmdMap.entries()).map(([action, cmds]) => (
                                            <DropdownSection key={action} showDivider title={action}>
                                                {cmds.map((cmd) => (
                                                    <DropdownItem isReadOnly key={cmd}>{cmd}</DropdownItem>
                                                ))}
                                            </DropdownSection>
                                        ))}
                                    </DropdownMenu>
                                </Dropdown>
                                <Dropdown placement="bottom-end" className="bg-sand-200">
                                    <DropdownTrigger>
                                        <Button isIconOnly size="sm" variant="light">
                                            <MdOutlineSettings size={24} />
                                        </Button>
                                    </DropdownTrigger>
                                    <DropdownMenu
                                        disallowEmptySelection
                                        aria-label="Merge options"
                                        className="max-w-[300px]"
                                    >
                                        <DropdownSection showDivider title="Select AI engine">
                                            <DropdownItem
                                                key="theme"
                                                isReadOnly
                                                className="cursor-default"
                                                startContent={
                                                    <Select className="max-w-xs" variant="underlined"
                                                        selectedKeys={[stateEngine]}
                                                        selectionMode="single"
                                                        onSelectionChange={(keys) => setStateEngine(keys.currentKey || "local")}
                                                    >
                                                        {EngineList.map((v) => <SelectItem key={v.key}>{v.value}</SelectItem>)}
                                                    </Select>
                                                }
                                            >
                                            </DropdownItem>
                                        </DropdownSection>

                                        <DropdownSection title="Commands">
                                            <DropdownItem key="edit" onPress={() => router.push("/voice_access")}>
                                                Edit
                                            </DropdownItem>
                                        </DropdownSection>
                                    </DropdownMenu>
                                </Dropdown>
                            </div>
                        }
                        value={stateSTT || "Voice Access: F2 to activate"}
                    />
                </NavbarContent>


                <NavbarContent justify='end' className="hidden lg:flex">
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

                <NavbarMenu className="pt-4 pb-20">
                    <div className="bg-sand-300 rounded-sm p-2 mb-5">
                        {session?.user ? (
                            <div className="flex flex-col w-full">
                                <div className="flex flex-row items-center justify-start gap-2 w-full">
                                    <div className="flex-1">
                                        <Button size="sm" isDisabled className="text-lg bg-sand-400 disabled:opacity-100">
                                            {session.user?.name}
                                        </Button>
                                    </div>

                                    <Button color="danger" size="sm"
                                        onPress={() => { signOut({ redirectTo: "/" }) }}
                                    >
                                        Sign Out
                                    </Button>
                                </div>
                                <div className="select-none">{session.user?.email}</div>
                            </div>
                        ) : (
                            <div className="flex flex-row items-center justify-center gap-2 w-full">
                                <Button color="primary" size="sm"
                                    onPress={() => signIn('wsva_oauth2')}
                                >
                                    Login
                                </Button>
                            </div>
                        )}
                    </div>
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
            </Navbar >
        </>
    )
}
