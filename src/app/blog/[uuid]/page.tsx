import Client from './client';
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getBlog } from '@/app/actions/blog';
import { blog } from '@/generated/prisma/client';

type Props = {
    params: Promise<{ uuid: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function ExamplePage({ params, searchParams }: Props) {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';

    const p = await params;
    const sp = await searchParams;

    const title = typeof sp.title === 'string' ? decodeURIComponent(sp.title) : ''
    const description = typeof sp.description === 'string' ? decodeURIComponent(sp.description) : ''
    const content = typeof sp.content === 'string' ? decodeURIComponent(sp.content) : ''
    const blog_init: Partial<blog> = { uuid: p.uuid !== 'add' ? p.uuid : undefined, title, description, content }

    const result = (typeof p.uuid === 'string' && p.uuid !== 'add')
        ? (await getBlog(p.uuid)) : undefined

    return (
        <>
            {(result?.status === 'success') ? (
                <Client blog_init={result.data} email={email} edit_view={false} create_new={false} />
            ) : (
                <Client blog_init={blog_init} email={email} edit_view={true} create_new={true} />
            )}
        </>
    )
}
