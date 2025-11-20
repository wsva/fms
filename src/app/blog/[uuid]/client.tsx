'use client'

import { getHTML, getProperty, getUUID } from '@/lib/utils';
import { Button, Input, Textarea, Link, addToast } from "@heroui/react";
import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form';
import { blog } from '@prisma/client';
import { saveBlog } from '@/app/actions/blog';
import '@/lib/Markdown.css';

type Props = {
    item?: blog,
    email: string,
    edit_view: boolean,
}

export default function BlogForm({ item, email, edit_view }: Props) {
    const searchParams = useSearchParams()
    const [stateUUID, setStateUUID] = useState<string>("");
    const [stateEdit, setStateEdit] = useState(edit_view);
    const { register, handleSubmit, formState, watch } = useForm<blog>({});

    // 空依赖数组意味着仅在组件挂载时执行一次
    useEffect(() => {
        setStateUUID((!!item?.uuid && item.user_id === email) ? item.uuid : getUUID())
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getDefault = (field: keyof blog): unknown => {
        if (item) {
            const value = getProperty(item, field)
            if (value) return value
        }
        const value = searchParams.get(field)
        if (value) return decodeURIComponent(value)
        return undefined
    }

    const onSubmit = async (formData: blog) => {
        const result = await saveBlog({
            ...formData,
            uuid: stateUUID,
            user_id: email,
            created_at: item?.created_at ? item.created_at : new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            window.location.href = "/blog"
        } else {
            console.log(result.error);
            addToast({
                title: "save data error",
                color: "danger",
            });
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className='w-full space-y-4 px-2 mb-10'>
                {item && item.user_id !== email && (
                    <div className='flex flex-row my-1 items-start justify-start gap-4'>
                        <Link className='text-blue-500 underline' target='_blank'
                            href={`/blog/all_of_another?user_id=${item.user_id}`}
                        >
                            {item.user_id}
                        </Link>
                    </div>
                )}
                {(!item?.user_id || item.user_id === email) && (
                    <div className='flex flex-row my-1 items-end justify-end gap-4'>
                        <Button color="primary" variant="solid" size='sm'
                            onPress={() => setStateEdit(!stateEdit)}
                        >
                            {stateEdit ? 'View' : 'Edit'}
                        </Button>
                        <Button color="primary" variant="solid" size='sm' type='submit'
                            isLoading={formState.isSubmitting}
                        >
                            Save
                        </Button>
                    </div>
                )}
                {stateEdit ? (
                    <>
                        <Input label='title'
                            classNames={{ input: 'text-2xl leading-tight font-roboto' }}
                            defaultValue={getDefault('title') as string | ''}
                            {...register('title')}
                        />
                        <Textarea label='description'
                            classNames={{ input: 'text-2xl leading-tight font-roboto' }}
                            defaultValue={getDefault('description') as string | ''}
                            {...register('description')}
                        />
                        <Textarea
                            label='content'
                            classNames={{ input: 'text-2xl leading-tight font-roboto' }}
                            defaultValue={getDefault('content') as string | ''}
                            minRows={10}
                            maxRows={999}
                            autoComplete='off'
                            autoCorrect='off'
                            spellCheck='false'
                            {...register('content')}
                        />
                    </>
                ) : (
                    <>
                        <div className='text-3xl leading-tight font-roboto font-bold'>
                            {watch('title', getDefault('title') as string | '')}
                        </div>
                        {/* <div className='text-md font-roboto mx-8'>
                            {watch('description', getDefault('description') as string | '')}
                        </div> */}
                        <div
                            className='MD px-2 my-1 text-xl leading-tight font-roboto indent-0 whitespace-pre-wrap break-words hyphens-auto'
                            dangerouslySetInnerHTML={{
                                __html: getHTML(watch('content', getDefault('content') as string) || '')
                            }}
                        />
                        <div>
                            TODO:
                            write commentar
                        </div>
                    </>
                )}
            </div>
        </form >
    )
}

