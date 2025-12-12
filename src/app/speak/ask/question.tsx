'use client'

import { Link } from "@heroui/react";
import { ask_question } from "@/generated/prisma/client";

type Props = {
    user_id: string;
    item: ask_question;
    handleDelete: (item: ask_question) => Promise<void>;
}

export default function Page({ user_id, item, handleDelete }: Props) {
    return (
        <div className="flex flex-col w-full items-start rounded-md p-1">
            <div className='flex flex-row w-full items-center justify-start gap-2'>
                <Link target='_blank' className='text-2xl text-blue-600 hover:underline'
                    href={`/speak/ask/${item.uuid}`}
                >
                    {item.title}
                </Link>
            </div>
            <div className="flex flex-row w-full items-center justify-end gap-4">
                <Link target='_blank'
                    href={`/speak/practice?user_id=${item.user_id}`}
                    className='text-sm text-gray-500 hover:underline w-full'
                >
                    {`by ${item.user_id}`}
                </Link>
                {item.user_id === user_id && (
                    <Link as='button' isBlock color='danger' className='text-xl'
                        onPress={async () => {
                            if (window.confirm("Are you sure to delete?")) {
                                await handleDelete(item)
                            }
                        }}
                    >
                        delete
                    </Link>
                )}
            </div>
        </div>
    );
}