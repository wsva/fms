import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getBlogAllOfOthers } from '@/app/actions/blog';
import Blog from '../Blog';

export default async function Page() {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';
    const result = await getBlogAllOfOthers(email)

    return (
        <>
            {(result.status === 'success') && (
                <Blog list={result.data} />
            )}
        </>
    )
}
