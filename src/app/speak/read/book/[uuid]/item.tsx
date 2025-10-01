'use client'

import { getProperty, getUUID } from '@/lib/utils';
import { Button, Textarea } from "@heroui/react";
import React, { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { read_book } from '@prisma/client';
import { saveBook } from '@/app/actions/reading';

type Props = {
    item?: Partial<read_book>,
    email: string,
}

export default function Item({ item, email }: Props) {
    const searchParams = useSearchParams()
    const [stateSucess, setStateSuccess] = useState<boolean>(false)
    const { register, handleSubmit, formState } = useForm<read_book>({});

    const getDefault = (field: keyof read_book): unknown => {
        if (item) {
            const value = getProperty(item, field)
            if (value) return value
        }
        const value = searchParams.get(field)
        if (value) return decodeURIComponent(value)
        return undefined
    }

    const onSubmit = async (formData: read_book) => {
        const result = await saveBook({
            ...formData,
            uuid: item?.uuid ? item.uuid : getUUID(),
            user_id: email,
            created_by: email,
            created_at: item?.created_at ? item.created_at : new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            setStateSuccess(true)
            toast.success('save card success')
        } else {
            toast.error('save card failed')
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className='w-full space-y-4 mb-10'>
                <div className='flex flex-row my-1 items-end justify-end gap-4'>
                    <Button
                        isLoading={formState.isSubmitting}
                        color="primary"
                        type='submit'
                        variant="solid"
                        isDisabled={stateSucess}
                    >
                        Save
                    </Button>
                </div>
                <Textarea label='tag'
                    classNames={{ input: 'text-xl leading-tight font-roboto' }}
                    defaultValue={getDefault('name') as string | ''}
                    {...register('name')}
                />
            </div>
        </form >
    )
}

