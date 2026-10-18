'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from "@/lib/auth-client";
import { deleteAuthTokens } from "@/app/actions/auth";
import type { User } from "better-auth";

type SessionValue = {
    user?: User;
    signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue>({ user: undefined, signOut: async () => {} });

export function useSession() {
    return useContext(SessionContext);
}

export default function SessionProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User>();
    const router = useRouter();

    useEffect(() => {
        const refresh = async () => {
            try {
                const session = await authClient.getSession();
                setUser(session.data?.user);
            } catch (e) {
                console.error("session refresh failed", e);
            }
        };

        refresh();
        const refreshTimer = setInterval(refresh, 60_000);
        return () => clearInterval(refreshTimer);
    }, []);

    const signOut = useCallback(async () => {
        if (!user) return;
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    router.push("/");
                    setUser(undefined);
                },
            },
        });
        await deleteAuthTokens();
        const formData = new FormData();
        formData.append("user_id", user.email);
        // here is client side code, so we cannot get the url through `${process.env.OAUTH2_LOGOUT}`
        // use "/api/oauth2/logout" directly if oauth2 is implemented in this project
        // create a server action instead to call `${process.env.OAUTH2_LOGOUT}` if use third-party oauth2 service
        await fetch("/api/oauth2/logout", {
            method: "POST",
            body: formData,
        });
    }, [user, router]);

    return (
        <SessionContext.Provider value={{ user, signOut }}>
            {children}
        </SessionContext.Provider>
    );
}
