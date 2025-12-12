import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Item from './client';

type Props = {
    params: Promise<{ uuid: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function ExamplePage({ params }: Props) {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';

    const p = await params;
    const uuid = (typeof p.uuid === 'string' && p.uuid !== 'add') ? p.uuid : ""

    return (
        <Item question_uuid={uuid} user_id={email} />
    )
}
