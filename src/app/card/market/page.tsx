import { auth } from '@/auth';
import React from 'react'
import CardMarket from './CardMarket';

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function Page({ searchParams }: Props) {
  const session = await auth();
  const email = session?.user?.email || '';
  const sp = await searchParams;
  const user_id = typeof sp.user_id === 'string' ? sp.user_id : '';

  return (
    <CardMarket email={email} user_id={user_id} />
  )
}
