import React from 'react'
import BlogForm from './BlogForm';
import { auth } from '@/auth';
import { getBlog } from '@/app/actions/blog';

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function ExamplePage({ params }: Props) {
  const session = await auth();
  const email = session?.user?.email || '';

  const p = await params;

  const result = (typeof p.slug === 'string' && p.slug !== 'add')
    ? (await getBlog(p.slug)) : undefined

  return (
    <>
      {(!!result && result.status === 'success') ? (
        <BlogForm item={result.data} email={email} edit_view={false} />
      ) : (
        <BlogForm email={email} edit_view={true} />
      )}
    </>
  )
}
