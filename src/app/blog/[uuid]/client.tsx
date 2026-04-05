'use client'

import { getProperty, getUUID } from '@/lib/utils';
import { Button, Input, Textarea, Link, addToast } from "@heroui/react";
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form';
import { blog } from "@/generated/prisma/client";
import { saveBlog } from '@/app/actions/blog';
import Markdown2Html from '@/components/markdown/markdown';

type Props = {
    blog_init: Partial<blog>,
    email: string,
    edit_view: boolean,
    create_new: boolean,
}

export default function BlogForm({ blog_init, email, edit_view, create_new }: Props) {
    const searchParams = useSearchParams()
    const [stateUUID, setStateUUID] = useState<string>("");
    const [stateEdit, setStateEdit] = useState(edit_view);
    const { register, handleSubmit, formState, watch } = useForm<blog>({});

    useEffect(() => {
        const blog_uuid = (!!blog_init.uuid && (create_new || blog_init.user_id === email))
            ? blog_init.uuid
            : getUUID()
        setStateUUID(blog_uuid)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getDefault = (field: keyof blog): unknown => {
        if (blog_init) {
            const value = getProperty(blog_init, field)
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
            created_at: blog_init?.created_at ? blog_init.created_at : new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            if (create_new) {
                window.location.href = `/blog/${stateUUID}`
            } else {
                addToast({ title: "saved", color: "success" })
            }
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
                {blog_init.user_id && blog_init.user_id !== email && (
                    <div className='flex flex-row my-1 items-start justify-start gap-4'>
                        <Link className='text-blue-500 underline' target='_blank'
                            href={`/blog/all_of_another?user_id=${blog_init.user_id}`}
                        >
                            {blog_init.user_id}
                        </Link>
                    </div>
                )}
                {(!blog_init.user_id || blog_init.user_id === email) && (
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
                        <div className='text-xl font-roboto'>
                            {watch('description', getDefault('description') as string | '')}
                        </div>
                        <div className='text-xl bg-sand-300 rounded-md p-2'>
                            <Markdown2Html content={watch('content', getDefault('content') as string)} withTOC />
                        </div>
                    </>
                )}
            </div>
        </form>
    )
}
