import { saveBook } from '@/app/actions/reading';
import { getUUID } from '@/lib/utils';
import { Input, Link } from "@heroui/react";
import { read_book } from '@prisma/client';
import React from 'react'
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';

type Props = {
    email: string;
}

export default function Book({ email }: Props) {
    const { register, handleSubmit } = useForm<read_book>();
    const [stateDisable, setStateDisable] = React.useState<boolean>(false);

    const onSubmit = async (formData: read_book) => {
        setStateDisable(true)
        if (!email) {
            toast.error('not logged in')
            setStateDisable(false)
            return
        }
        const result = await saveBook({
            ...formData,
            uuid: getUUID(),
            user_id: email,
            created_by: email,
            created_at: new Date(),
            updated_at: new Date(),
        })
        if (result.status === 'success') {
            toast.success('save book success')
        } else {
            toast.error('save book failed')
            setStateDisable(false)
            return
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className='flex flex-col items-center gap-1'>
                <Input label='Name' variant='bordered' size='sm' {...register('name')} />
                <Link as='button' isDisabled={stateDisable} type='submit' className='bg-blue-500 rounded-md text-slate-50 px-2'>
                    add new book
                </Link>
            </div>
        </form >
    )
}