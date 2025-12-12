import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Client from './client';

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function Page({ searchParams }: Props) {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';

    const sp = await searchParams;
    const uuid = (typeof sp.uuid === 'string') ? sp.uuid : ""

    return (
        <Client user_id={email} uuid={uuid} />
    )
}
