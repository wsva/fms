import React from 'react'
import { getQuestionAll } from '@/app/actions/ask';
import Question from './question';

export default async function Page() {
  const result = await getQuestionAll()

  return (
    <>
      {result.status === 'success' ? (
        <Question list={result.data} />
      ) : (
        <Question list={[]} />
      )}
    </>
  )
}
