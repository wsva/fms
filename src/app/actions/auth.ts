'use server';

import { cookies } from "next/headers";

export async function deleteAuthTokens() {
    const jar = await cookies();
    jar.delete('access_token');
    jar.delete('refresh_token');
}
