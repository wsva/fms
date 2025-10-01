import { auth } from '@/auth';
import React from 'react'
import TestForm from './form';
import Index from './index';

type Props = {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function CardTestPage({ searchParams }: Props) {
    const session = await auth();
    const email = session?.user?.email || '';

    const sp = await searchParams;
    const tag_uuid = typeof sp.tag === 'string' ? sp.tag : '';
    const card_uuid = typeof sp.uuid === 'string' ? sp.uuid : '';

    return (
        <>
            {(!!card_uuid || !!tag_uuid) ? (
                <TestForm user_id={email} tag_uuid={tag_uuid} card_uuid={card_uuid} />
            ) : (
                <Index user_id={email} />
            )}
        </>
    )
}
