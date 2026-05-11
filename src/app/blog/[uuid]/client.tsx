'use client'

import { getProperty, getUUID } from '@/lib/utils';
import { Button, Input, TextArea, Link, toast } from "@heroui/react";
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form';
import { blog } from "@/generated/prisma/client";
import { saveBlog } from '@/app/actions/blog';
import Markdown2Html from '@/components/markdown/markdown';
import MdEditor from '@/components/MdEditor';
import AppModal from '@/components/AppModal';

type Props = {
    blog_init: Partial<blog>,
    email: string,
    edit_view: boolean,
    create_new: boolean,
}

export default function BlogForm({ blog_init, email, edit_view, create_new }: Props) {
    const searchParams = useSearchParams()
    // Blog-specific key prevents cross-blog backup contamination
    const BACKUP_KEY = `backup-blog-${create_new ? 'new' : (blog_init.uuid || 'new')}`
    const [stateUUID, setStateUUID] = useState<string>("");
    const [stateBackupData, setStateBackupData] = useState<Record<string, unknown> | null>(null);
    const [stateEdit, setStateEdit] = useState(edit_view);

    const getDefault = (field: keyof blog): string => {
        const fromInit = getProperty(blog_init, field)
        if (fromInit) return fromInit as string
        const fromUrl = searchParams.get(field)
        if (fromUrl) return decodeURIComponent(fromUrl)
        return ''
    }

    const { register, handleSubmit, formState, watch, reset } = useForm<blog>({
        defaultValues: {
            title: getDefault('title'),
            description: getDefault('description'),
            content: getDefault('content'),
        }
    });
    const { ref: refContent, ...restContent } = register('content');

    const handleBackupLoad = () => {
        if (!stateBackupData) return;
        reset({
            title: String(stateBackupData.title || ''),
            description: String(stateBackupData.description || ''),
            content: String(stateBackupData.content || ''),
        })
        setStateBackupData(null)
    }

    const handleBackupIgnore = () => setStateBackupData(null)

    const handleBackupDelete = () => {
        localStorage.removeItem(BACKUP_KEY)
        setStateBackupData(null)
    }

    useEffect(() => {
        const blog_uuid = (!!blog_init.uuid && (create_new || blog_init.user_id === email))
            ? blog_init.uuid
            : getUUID()
        setStateUUID(blog_uuid)

        // detect backup and prompt user — do not auto-load
        try {
            const backup = localStorage.getItem(BACKUP_KEY)
            if (backup) {
                setStateBackupData(JSON.parse(backup))
            }
        } catch {
            localStorage.removeItem(BACKUP_KEY)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // auto save form data to localStorage
    const watchTitle = watch('title');
    const watchDescription = watch('description');
    const watchContent = watch('content');
    useEffect(() => {
        // Skip until stateUUID is ready — avoids overwriting a valid backup on mount
        if (!stateUUID) return;
        try {
            localStorage.setItem(
                BACKUP_KEY,
                JSON.stringify({
                    title: watchTitle || '',
                    description: watchDescription || '',
                    content: watchContent || '',
                })
            )
        } catch (error) {
            console.error('save backup error:', error)
        }
    }, [stateUUID, watchTitle, watchDescription, watchContent]);

    const onSubmit = async (formData: blog) => {
        const result = await saveBlog({
            ...formData,
            uuid: stateUUID,
            user_id: email,
            created_at: blog_init?.created_at ? blog_init.created_at : new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            // clear backup after successful save
            localStorage.removeItem(BACKUP_KEY);

            if (create_new) {
                window.location.href = `/blog/${stateUUID}`
            } else {
                reset(formData)
                toast.success("saved")
            }
        } else {
            console.log(result.error);
            toast.danger("save data error");
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <AppModal
                isOpen={stateBackupData !== null}
                onClose={handleBackupIgnore}
                header="Unsaved backup found"
                body={
                    <div className='space-y-2'>
                        <p>A local backup of this blog post exists. Do you want to restore it?</p>
                        {stateBackupData?.title ? (
                            <p className='text-sm text-gray-500 truncate'>{String(stateBackupData.title).slice(0, 80)}</p>
                        ) : null}
                    </div>
                }
                footerButtons={[
                    { children: 'Load', variant: 'primary', onPress: handleBackupLoad },
                    { children: 'Ignore', variant: 'ghost', onPress: handleBackupIgnore },
                    { children: 'Delete', variant: 'danger', onPress: handleBackupDelete },
                ]}
            />
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
                        <Button variant="primary" size='sm'
                            onPress={() => setStateEdit(!stateEdit)}
                        >
                            {stateEdit ? 'View' : 'Edit'}
                        </Button>
                        <Button variant="primary" size='sm' type='submit'
                            isPending={formState.isSubmitting}
                            isDisabled={!formState.isDirty}
                        >
                            Save
                        </Button>
                    </div>
                )}
                {stateEdit ? (
                    <>
                        <Input className='text-2xl leading-tight font-roboto bg-sand-300 w-full'
                            placeholder='title'
                            {...register('title')}
                        />
                        <TextArea className='text-2xl leading-tight font-roboto bg-sand-300 w-full'
                            placeholder='description'
                            {...register('description')}
                        />
                        <MdEditor
                            {...restContent}
                            ref={refContent}
                        />
                    </>
                ) : (
                    <>
                        <div className='text-3xl leading-tight font-roboto font-bold'>
                            {watch('title')}
                        </div>
                        <div className='text-xl font-roboto'>
                            {watch('description')}
                        </div>
                        <div className='text-xl bg-sand-300 rounded-md p-2'>
                            <Markdown2Html content={watch('content')} withTOC />
                        </div>
                    </>
                )}
            </div>
        </form>
    )
}
