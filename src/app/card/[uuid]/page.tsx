import React from 'react'
import CardForm from './CardForm';
import { auth } from '@/auth';
import { getCard } from '@/app/actions/card';

type Props = {
  params: Promise<{ uuid: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function ExamplePage({ params, searchParams }: Props) {
  const session = await auth();
  const email = session?.user?.email || '';

  const p = await params;
  const sp = await searchParams;

  const question = typeof sp.question === 'string' ? decodeURIComponent(sp.question) : ''
  const tags = typeof sp.tags === 'string' ? decodeURIComponent(sp.tags) : ''
  const suggestion = typeof sp.suggestion === 'string' ? decodeURIComponent(sp.suggestion) : ''
  const answer = typeof sp.answer === 'string' ? decodeURIComponent(sp.answer) : ''
  const note = typeof sp.note === 'string' ? decodeURIComponent(sp.note) : ''
  const simple = 'simple' in sp
  const card = { question, suggestion, answer, note, tag_list_suggestion: tags.split(",") }

  const result = (typeof p.uuid === 'string' && p.uuid !== 'add')
    ? (await getCard(p.uuid)) : undefined

  return (
    <>
      {(result?.status === 'success') ? (
        <CardForm card_ext={result.data} email={email} edit_view={!!sp.edit} simple={false} create_new={false} />
      ) : (
        <CardForm card_ext={card} email={email} edit_view={!!sp.edit} simple={simple} create_new={true} />
      )}
    </>
  )
}
