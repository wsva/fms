import { listServices } from '@/app/actions/services'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import Wrapper from './wrapper'

export default async function Page() {
    const session = await auth.api.getSession({ headers: await headers() })
    const email = session?.user?.email ?? ''
    const result = await listServices()
    const services = result.status === 'success' ? result.data : []
    return <Wrapper email={email} initialServices={services} />
}
