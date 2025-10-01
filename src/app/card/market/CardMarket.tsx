'use client'

import React, { useEffect, useState } from 'react'
import { CircularProgress, Pagination } from "@heroui/react"
import { qsa_card } from '@prisma/client';
import CardList from '@/components/card/CardList';
import { getCardsOfOthers } from '@/app/actions/card';

type Props = {
  email: string
  user_id: string
};

export default function CardMarket({ email, user_id }: Props) {
  const [stateLoading, setStateLoading] = useState<boolean>(false)
  const [stateCards, setStateCards] = useState<qsa_card[]>([])
  const [stateCurrentPage, setStateCurrentPage] = useState<number>(1);
  const [stateTotalPages, setStateTotalPages] = useState<number>(0);

  useEffect(() => {
    const loadData = async () => {
      setStateLoading(true)
      const result = await getCardsOfOthers(email, user_id, stateCurrentPage, 20)
      if (result.status === 'success') {
        console.log(result.total_records)
        setStateCards(result.data)
        setStateTotalPages(result.total_pages || 0)
      } else {
        console.log(result.error)
      }
      setStateLoading(false)
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCurrentPage]);

  return (
    <div className='flex flex-col w-full gap-2 py-2 px-2'>
      <div>Cards</div>
      <div className='flex flex-row items-center justify-center gap-4'>
        <div>Page</div>
        <Pagination showControls loop variant='bordered'
          total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage}
        />
      </div>
      {stateLoading
        ? (
          <div className='flex flex-row w-full items-center justify-center gap-4'>
            <CircularProgress label="Loading..." />
          </div >
        )
        : (<CardList email={email} card_list={stateCards} edit_view={false} />)
      }
      <div className='flex flex-row items-center justify-center gap-4'>
        <div>Page</div>
        <Pagination showControls loop variant='bordered'
          total={stateTotalPages} page={stateCurrentPage} onChange={setStateCurrentPage}
        />
      </div>
    </div>
  )
}
