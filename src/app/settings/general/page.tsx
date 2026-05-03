import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSetting } from "@/app/actions/settings_general";
import Client from './client';

export default async function Page() {
    const session = await auth.api.getSession({ headers: await headers() });
    const email = session?.user?.email || '';

    const [gemini, openai] = await Promise.all([
        getSetting(email, 'GEMINI_API_KEY'),
        getSetting(email, 'OPENAI_API_KEY'),
    ]);

    return (
        <Client
            user_id={email}
            initialGeminiKey={typeof gemini === 'string' ? gemini : ''}
            initialOpenaiKey={typeof openai === 'string' ? openai : ''}
        />
    );
}
