import React from 'react';
import { auth } from '@/auth';
import Item from './item';
import { getBookAll } from '@/app/actions/reading';

export default async function Page() {
  const session = await auth();
  const email = session?.user?.email || '';

  const result = await getBookAll(email);

  return (
    <>
      {result.status === 'success' && result.data.map((v) => {
        return <Item key={v.uuid} item={v} />
      })}
    </>
  )
}
