import React from 'react'
import { auth } from '@/auth'
import ClientMy from './my'
import ClientAnother from './another'

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function Page({ searchParams }: Props) {
    const session = await auth();
    const email = session?.user?.email || '';

    const sp = await searchParams;
    const user_id = typeof sp.user_id === 'string' ? decodeURIComponent(sp.user_id) : email;

    return (
        <div>
            {user_id === email ? (
                <ClientMy user_id_my={email} />
            ) : (
                <ClientAnother user_id_my={email} user_id_another={user_id} />
            )}
        </div>
    )
}
