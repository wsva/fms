import { auth } from '@/auth';
import React from 'react'
import { getBlogAll } from '../actions/blog';
import Blog from './Blog';

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function BlogIndexPage({ searchParams }: Props) {
  const sp = await searchParams;
  let email = sp.email;
  if (typeof email !== 'string') {
    const session = await auth();
    email = session?.user?.email || '';
  }

  const result = await getBlogAll(email)

  return (
    <>
      {(result.status === 'success') && (
        <Blog list={result.data} />
      )}
    </>
  )
}
