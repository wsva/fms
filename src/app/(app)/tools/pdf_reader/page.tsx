import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import Wrapper from './wrapper'

export default async function Page() {
    const session = await auth.api.getSession({ headers: await headers() })
    const email = session?.user?.email || ''
    return <Wrapper email={email} />
}
