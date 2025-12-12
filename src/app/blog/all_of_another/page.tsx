import { getBlogAllOfAnother } from '@/app/actions/blog';
import Blog from '../Blog';

type Props = {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function Page({ searchParams }: Props) {
    const sp = await searchParams;
    const result = await getBlogAllOfAnother(sp.user_id as string)

    return (
        <>
            {(result.status === 'success') && (
                <Blog list={result.data} />
            )}
        </>
    )
}
