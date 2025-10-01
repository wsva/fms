import React from 'react'
import Form from './form';
import { auth } from '@/auth';
import { getQuestion } from '@/app/actions/ask';

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function ExamplePage({ params }: Props) {
  const session = await auth();
  const email = session?.user?.email || '';

  const p = await params;

  const result = (typeof p.slug === 'string' && p.slug !== 'add')
    ? (await getQuestion(p.slug)) : undefined

  return (
    <>
      {(!!result && result.status === 'success') ? (
        <Form item={result.data} email={email} />
      ) : (
        <Form email={email} />
      )}
    </>
  )
}
