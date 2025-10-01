'use client'

import { getProperty } from '@/lib/utils';
import { Button, Link, Textarea } from "@heroui/react";
import React, { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { qsa_tag } from '@prisma/client';
import { saveTag } from '@/app/actions/card';

type Props = {
    item?: Partial<qsa_tag>,
    email: string,
}

export default function TagForm({ item, email }: Props) {
    const searchParams = useSearchParams()
    const [stateSucess, setStateSuccess] = useState<boolean>(false)
    const { register, handleSubmit, formState } = useForm<qsa_tag>({});

    const getDefault = (field: keyof qsa_tag): unknown => {
        if (item) {
            const value = getProperty(item, field)
            if (value) return value
        }
        const value = searchParams.get(field)
        if (value) return decodeURIComponent(value)
        return undefined
    }

    const onSubmit = async (formData: qsa_tag) => {
        const result = await saveTag({
            ...formData,
            // same user + same uuid => update
            uuid: (item?.user_id === email && item.uuid) ? item.uuid : '',
            user_id: email,
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
                {item && item.user_id !== email && (
                    <div className='flex flex-row my-1 items-start justify-start gap-4'>
                        <Link className='text-blue-500 underline' target='_blank'
                            href={`/card/all_of_another?user_id=${item.user_id}`}
                        >
                            {item.user_id}
                        </Link>
                    </div>
                )}
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
                    defaultValue={getDefault('tag') as string | ''}
                    {...register('tag')}
                />
                <Textarea label='description'
                    classNames={{ input: 'text-xl leading-tight font-roboto' }}
                    defaultValue={getDefault('description') as string | ''}
                    {...register('description')}
                />
            </div>
        </form >
    )
}

