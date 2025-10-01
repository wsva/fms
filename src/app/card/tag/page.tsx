import React from 'react';
import { getTagAll } from '@/app/actions/card';
import { auth } from '@/auth';
import Tag from './Tag';

export default async function Page() {
  const session = await auth();
  const email = session?.user?.email || '';

  const result = await getTagAll(email);

  return (
    <>
      {result.status === 'success' && result.data.map((v) => {
        return <Tag key={v.uuid} item={v} />
      })}
    </>
  )
}
