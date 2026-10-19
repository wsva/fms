import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import SettingsClient from './client';

type Props = { searchParams: Promise<{ section?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
    const session = await auth.api.getSession({ headers: await headers() });
    const sp = await searchParams;
    const single = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
    const email = session?.user?.email || '';
    return <SettingsClient user_id={email} initial_section={single(sp.section)} />;
}
