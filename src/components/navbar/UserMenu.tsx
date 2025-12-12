'use client';

import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Button } from "@heroui/react"
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Session, User } from "better-auth";

type Props = {
    session: { session: Session, user: User } | null
}

export default function UserMenu({ session }: Props) {
    const router = useRouter();
    
    return (
        <Dropdown placement="bottom-start">
            <DropdownTrigger>
                <Button size="sm" className="text-lg bg-sand-400">
                    {session?.user?.name}
                </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="User Actions" variant="flat">
                <DropdownItem key="profile" className="h-14 gap-2">
                    <p className="font-bold">{session?.user?.name}</p>
                    <p className="font-bold">{session?.user?.email}</p>
                </DropdownItem>
                <DropdownItem key="logout"
                    className="text-danger"
                    color="danger"
                    onPress={async () => {
                        await authClient.signOut({
                            fetchOptions: {
                                onSuccess: () => {
                                    router.push("/");
                                },
                            },
                        });
                    }}
                >
                    Sign Out
                </DropdownItem>
            </DropdownMenu>
        </Dropdown>
    )
}
