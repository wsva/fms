import Client from './client';
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function Page() {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';

    return <Client user_id={email} />
}
