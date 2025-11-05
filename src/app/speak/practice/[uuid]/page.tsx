import React from 'react'
import Item from './item';
import { auth } from '@/auth';

type Props = {
  params: Promise<{ uuid: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function ExamplePage({ params }: Props) {
  const session = await auth();
  const email = session?.user?.email || '';

  const p = await params;
  const uuid = (typeof p.uuid === 'string' && p.uuid !== 'add') ? p.uuid : ""

  return (
    <Item uuid={uuid} email={email} />
  )
}
