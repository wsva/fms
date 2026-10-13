import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import Client from './client';

type Props = { searchParams: Promise<{ tag?: string | string[]; type?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
    const session = await auth.api.getSession({ headers: await headers() });
    const sp = await searchParams;
    const single = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
    return <Client email={session?.user?.email ?? ''} initialTag={single(sp.tag)} initialType={single(sp.type)} />;
}
