import { saveChapter } from '@/app/actions/reading';
import { getUUID } from '@/lib/utils';
import { Input, Link } from "@heroui/react";
import { read_chapter } from '@prisma/client';
import React from 'react'
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';

type Props = {
    book_uuid: string;
    email: string;
}

export default function Chapter({ book_uuid, email }: Props) {
    const { register, handleSubmit } = useForm<read_chapter>();
    const [stateDisable, setStateDisable] = React.useState<boolean>(false);

    const onSubmit = async (formData: read_chapter) => {
        setStateDisable(true)
        if (!book_uuid) {
            toast.error('no book selected')
            setStateDisable(false)
            return
        }
        if (!email) {
            toast.error('not logged in')
            setStateDisable(false)
            return
        }
        const result = await saveChapter({
            ...formData,
            uuid: getUUID(),
            book_uuid: book_uuid,
            order_num: parseInt(`${formData.order_num}`, 10),
            created_by: email,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            toast.success('save chapter success')
        } else {
            toast.error('save chapter failed')
            setStateDisable(false)
            return
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className='flex flex-col items-center gap-1'>
                <Input label='Order' variant='bordered' type="number" size='sm' {...register('order_num')} />
                <Input label='Name' variant='bordered' size='sm' {...register('name')} />
                <Link as='button' isDisabled={stateDisable} type='submit' className='bg-blue-500 rounded-md text-slate-50 px-2'>
                    add new chapter
                </Link>
            </div>
        </form >
    )
}