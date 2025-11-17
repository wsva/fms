import React from 'react'
import Client from './client';
import { auth } from '@/auth';

type Props = {
  params: Promise<{ uuid: string }>
};

export default async function ExamplePage({ params }: Props) {
  const session = await auth();
  const email = session?.user?.email || '';

  const p = await params;
  const uuid = (typeof p.uuid === 'string') ? p.uuid : ""

  return (
    <Client user_id={email} uuid={uuid} />
  )
}
