import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import PracticeClient from './client'

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PracticePage({ searchParams }: Props) {
    const session = await auth.api.getSession({ headers: await headers() })
    const email = session?.user?.email || ''
    const sp = await searchParams
    const question_uuid = typeof sp.q === 'string' ? sp.q : ""
    const language = typeof sp.lang === 'string' ? sp.lang : ""

    return <PracticeClient user_id={email} question_uuid={question_uuid} language={language} />
}
