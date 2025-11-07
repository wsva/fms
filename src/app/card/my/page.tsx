import React from 'react'
import Client from './client';
import { auth } from '@/auth';
import { getTagAll } from '@/app/actions/card';

export default async function Page() {
  const session = await auth();
  const email = session?.user?.email || '';

  const result = await getTagAll(email)
  const tag_list = result.status === 'success' ? result.data : []

  return (
    <Client email={email} tag_list={tag_list} />
  )
}
