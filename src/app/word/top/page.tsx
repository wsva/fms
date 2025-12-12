import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Client from './client'
import Index from './index'

type Props = {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function Page({ searchParams }: Props) {
    const session = await auth.api.getSession({
        headers: await headers()
    });
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
                    <Client email={email} language={language} keyword={keyword} all={all} />
                )}
        </>

    )


}
