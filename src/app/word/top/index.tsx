"use client"

import { Link } from '@heroui/react'
import { BiFilterAlt, BiBook } from 'react-icons/bi'

export default function Page() {
    return (
        <div className='flex flex-col items-center justify-center py-16 px-4 min-h-[50vh]'>
            <div className='text-center mb-10'>
                <p className='text-xs font-semibold tracking-widest text-amber-600 uppercase mb-3'>
                    Vokabelkatalog
                </p>
                <h1 className='text-3xl font-bold text-stone-800 mb-2 tracking-tight'>
                    Word Store
                </h1>
                <p className='text-stone-500 text-base max-w-xs leading-relaxed'>
                    Browse German vocabulary by frequency and add words to your flashcard collection.
                </p>
            </div>

            <div className='flex flex-col sm:flex-row gap-4 w-full max-w-xl'>
                <Link href='/word/top?lang=de' className='flex-1'>
                    <div className='group flex items-start gap-4 p-5 rounded-2xl border border-stone-200 bg-white shadow-sm hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer w-full'>
                        <div className='w-10 h-10 rounded-xl bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center flex-shrink-0 transition-colors'>
                            <BiFilterAlt className='text-amber-600' size={20} />
                        </div>
                        <div className='text-left'>
                            <div className='font-semibold text-stone-800 mb-1'>New Words</div>
                            <div className='text-sm text-stone-500 leading-snug'>
                                German words not yet in your flashcards
                            </div>
                            <div className='flex gap-1.5 mt-2.5'>
                                <span className='px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500 text-[11px] font-medium'>DE</span>
                                <span className='px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[11px] font-medium'>excludes cards</span>
                            </div>
                        </div>
                    </div>
                </Link>

                <Link href='/word/top?lang=de&all' className='flex-1'>
                    <div className='group flex items-start gap-4 p-5 rounded-2xl border border-stone-200 bg-white shadow-sm hover:shadow-md hover:border-stone-300 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer w-full'>
                        <div className='w-10 h-10 rounded-xl bg-stone-50 group-hover:bg-stone-100 flex items-center justify-center flex-shrink-0 transition-colors'>
                            <BiBook className='text-stone-600' size={20} />
                        </div>
                        <div className='text-left'>
                            <div className='font-semibold text-stone-800 mb-1'>All Words</div>
                            <div className='text-sm text-stone-500 leading-snug'>
                                Complete German vocabulary by frequency rank
                            </div>
                            <div className='flex gap-1.5 mt-2.5'>
                                <span className='px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500 text-[11px] font-medium'>DE</span>
                                <span className='px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500 text-[11px] font-medium'>all words</span>
                            </div>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    )
}
