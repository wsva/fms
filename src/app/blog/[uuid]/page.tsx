import Client from './client';
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getBlog } from '@/app/actions/blog';

type Props = {
    params: Promise<{ uuid: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function ExamplePage({ params }: Props) {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';

    const p = await params;

    const result = (typeof p.uuid === 'string' && p.uuid !== 'add')
        ? (await getBlog(p.uuid)) : undefined

    return (
        <>
            {(!!result && result.status === 'success') ? (
                <Client item={result.data} email={email} edit_view={false} />
            ) : (
                <Client email={email} edit_view={true} />
            )}
        </>
    )
}
