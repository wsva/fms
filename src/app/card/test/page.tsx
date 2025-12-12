import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Client from './client';
import Index from './index';

type Props = {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function CardTestPage({ searchParams }: Props) {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';

    const sp = await searchParams;
    const tag_uuid = typeof sp.tag === 'string' ? sp.tag : '';
    const card_uuid = typeof sp.uuid === 'string' ? sp.uuid : '';

    return (
        <>
            {(!!card_uuid || !!tag_uuid) ? (
                <Client user_id={email} tag_uuid={tag_uuid} card_uuid={card_uuid} />
            ) : (
                <Index user_id={email} />
            )}
        </>
    )
}
