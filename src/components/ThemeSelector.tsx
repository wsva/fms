'use client'

import { Button, Dropdown, Label } from '@heroui/react'
import { MdPalette } from 'react-icons/md'
import { themes, ThemeId } from '@/lib/themes'
import { useTheme } from '@/components/ThemeProvider'

export default function ThemeSelector() {
    const { theme, setTheme } = useTheme()

    return (
        <Dropdown>
            <Button isIconOnly variant="ghost" aria-label="Select theme">
                <MdPalette size={20} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="Theme"
                    selectionMode="single"
                    selectedKeys={new Set([theme.id])}
                    onAction={(key) => setTheme(key as ThemeId)}
                >
                    {themes.map(t => (
                        <Dropdown.Item id={t.id} textValue={t.name} key={t.id}>
                            <span
                                className="w-4 h-4 rounded-full inline-block shrink-0 border border-sand-300"
                                style={{ backgroundColor: t.swatch }}
                            />
                            <Label>{t.name}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    )
}
