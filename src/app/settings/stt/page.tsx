import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Client from './client';
import { getSttSettings } from "@/app/actions/settings_general";

export default async function Page() {
    const session = await auth.api.getSession({ headers: await headers() });
    const email = session?.user?.email || '';
    const sttSettings = await getSttSettings(email);
    return <Client user_id={email} initialSettings={sttSettings} />;
}
