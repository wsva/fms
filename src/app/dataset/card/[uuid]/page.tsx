import Client from './client';

type Props = { params: Promise<{ uuid: string }> };

export default async function Page({ params }: Props) {
    const { uuid } = await params;
    return <Client uuid={uuid} />;
}
