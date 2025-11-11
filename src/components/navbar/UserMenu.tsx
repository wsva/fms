'use client';

import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Button } from "@heroui/react"
import { Session } from 'next-auth';
import React from 'react'
import { signOut } from "next-auth/react"

type Props = {
    session: Session
}

export default function UserMenu({ session }: Props) {
    return (
        <Dropdown placement="bottom-start">
            <DropdownTrigger>
                <Button size="sm" className="text-lg bg-sand-400">
                    {session.user?.name}
                </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="User Actions" variant="flat">
                <DropdownItem key="profile" className="h-14 gap-2">
                    <p className="font-bold">{session.user?.name}</p>
                    <p className="font-bold">{session.user?.email}</p>
                </DropdownItem>
                <DropdownItem key="logout"
                    className="text-danger"
                    color="danger"
                    onPress={() => { signOut({ redirectTo: "/" }) }}
                >
                    Sign Out
                </DropdownItem>
            </DropdownMenu>
        </Dropdown>
    )
}
