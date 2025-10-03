import React from 'react'
import Item from './item';
import { auth } from '@/auth';
import { getBook } from '@/app/actions/reading';

type Props = {
  params: Promise<{ uuid: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function ExamplePage({ params }: Props) {
  const session = await auth();
  const email = session?.user?.email || '';

  const p = await params;
  const result = (typeof p.uuid === 'string' && p.uuid !== 'add')
    ? (await getBook(p.uuid)) : undefined

  return (
    <>
      {(result?.status === 'success') ? (
        <Item item={result.data} email={email} />
      ) : (
        <Item email={email} />
      )}
    </>
  )
}
