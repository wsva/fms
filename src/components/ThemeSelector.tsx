'use client'

import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react'
import { MdPalette } from 'react-icons/md'
import { themes, ThemeId } from '@/lib/themes'
import { useTheme } from '@/components/ThemeProvider'

export default function ThemeSelector() {
    const { theme, setTheme } = useTheme()

    return (
        <Dropdown placement="bottom-end">
            <DropdownTrigger>
                <Button isIconOnly variant="light" aria-label="Select theme">
                    <MdPalette size={20} />
                </Button>
            </DropdownTrigger>
            <DropdownMenu
                aria-label="Theme"
                selectionMode="single"
                selectedKeys={new Set([theme.id])}
                onAction={(key) => setTheme(key as ThemeId)}
            >
                {themes.map(t => (
                    <DropdownItem
                        key={t.id}
                        startContent={
                            <span
                                className="w-4 h-4 rounded-full inline-block shrink-0 border border-sand-300"
                                style={{ backgroundColor: t.swatch }}
                            />
                        }
                    >
                        {t.name}
                    </DropdownItem>
                ))}
            </DropdownMenu>
        </Dropdown>
    )
}
