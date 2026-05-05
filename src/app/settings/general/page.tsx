import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSetting } from "@/app/actions/settings_general";
import Client from './client';

export default async function Page() {
    const session = await auth.api.getSession({ headers: await headers() });
    const email = session?.user?.email || '';

    const localService = await getSetting(email, 'local_service');

    return (
        <Client
            user_id={email}
            initialLocalService={localService.status === 'success' ? localService.data : ''}
        />
    );
}
