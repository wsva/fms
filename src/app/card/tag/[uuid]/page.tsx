import React from 'react'
import TagForm from './TagForm';
import { auth } from '@/auth';
import { getTag } from '@/app/actions/card';

type Props = {
  params: Promise<{ uuid: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function ExamplePage({ params }: Props) {
  const session = await auth();
  const email = session?.user?.email || '';

  const p = await params;
  const result = (typeof p.uuid === 'string' && p.uuid !== 'add')
    ? (await getTag(p.uuid)) : undefined

  return (
    <>
      {(result?.status === 'success') ? (
        <TagForm item={result.data} email={email} />
      ) : (
        <TagForm email={email} />
      )}
    </>
  )
}
