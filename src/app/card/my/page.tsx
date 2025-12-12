import Client from './client';
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getTagAll } from '@/app/actions/card';

export default async function Page() {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';

    const result = await getTagAll(email)
    const tag_list = result.status === 'success' ? result.data : []

    return (
        <Client user_id={email} tag_list={tag_list} />
    )
}
