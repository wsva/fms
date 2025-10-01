import { auth } from '@/auth';
import React from 'react'
import { getBlogAllOfOthers } from '@/app/actions/blog';
import Blog from '../Blog';

export default async function Page() {
  const session = await auth();
  const email = session?.user?.email || '';
  const result = await getBlogAllOfOthers(email)

  return (
    <>
      {(result.status === 'success') && (
        <Blog list={result.data} />
      )}
    </>
  )
}
