import React from 'react'
import { auth } from '@/auth'
import WordStore from './WordStore'
import Index from './index'

type Props = {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function Page({ searchParams }: Props) {
    const session = await auth();
    const email = session?.user?.email || '';

    const sp = await searchParams;

    const language = sp.lang === "en" || sp.lang === "de" ? sp.lang : ""
    const keyword = typeof sp.keyword === "string" ? decodeURIComponent(sp.keyword) : ""
    const all = sp.all !== undefined

    return (
        <>
            {(language === "" && keyword === "")
                ? (
                    <Index />
                )
                : (
                    <WordStore email={email} language={language} keyword={keyword} all={all} />
                )}
        </>

    )


}
