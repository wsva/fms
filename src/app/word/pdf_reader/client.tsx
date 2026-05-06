'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString()

type Props = { email: string }

export default function PdfReader({ email: _email }: Props) {
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [numPages, setNumPages] = useState<number>(0)
    const [fileName, setFileName] = useState<string>('')
    const [fullWidth, setFullWidth] = useState<boolean>(false)
    const [pageWidth, setPageWidth] = useState<number>(800)
    const [jumpInput, setJumpInput] = useState<string>('')
    const containerRef = useRef<HTMLDivElement>(null)
    const pageRefs = useRef<(HTMLDivElement | null)[]>([])

    useEffect(() => {
        const measure = () => {
            if (!containerRef.current) return
            const w = containerRef.current.clientWidth
            setPageWidth(fullWidth ? w : Math.min(w, 800))
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [fullWidth])

    const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (pdfUrl) URL.revokeObjectURL(pdfUrl)
        setPdfUrl(URL.createObjectURL(file))
        setFileName(file.name)
        setNumPages(0)
        pageRefs.current = []
    }, [pdfUrl])

    const jumpToPage = (n: number) => {
        const idx = Math.max(1, Math.min(n, numPages)) - 1
        pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const handleJump = () => {
        const n = parseInt(jumpInput)
        if (!isNaN(n)) jumpToPage(n)
    }

    return (
        <div className="flex flex-col items-center w-full min-h-screen py-6 gap-4">
            {/* Header row */}
            <div className="w-full flex flex-wrap items-center gap-3 px-2">
                <label className="flex items-center gap-3 cursor-pointer">
                    <div className="px-4 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors">
                        {pdfUrl ? 'Change PDF' : 'Open PDF'}
                    </div>
                    {fileName && (
                        <span className="text-stone-500 text-sm truncate max-w-xs">{fileName}</span>
                    )}
                    <input type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
                </label>

                {pdfUrl && numPages > 0 && (
                    <>
                        <div className="h-4 w-px bg-stone-200 dark:bg-stone-700" />

                        {/* Full width toggle */}
                        <button
                            onClick={() => setFullWidth(v => !v)}
                            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                fullWidth
                                    ? 'bg-stone-700 border-stone-700 text-white'
                                    : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'
                            }`}
                        >
                            Full width
                        </button>

                        <div className="h-4 w-px bg-stone-200 dark:bg-stone-700" />

                        {/* Prev / Next */}
                        <button
                            onClick={() => jumpToPage(1)}
                            className="px-3 py-1.5 rounded-lg border bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 text-sm hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
                        >
                            ↑ Top
                        </button>
                        <button
                            onClick={() => jumpToPage(numPages)}
                            className="px-3 py-1.5 rounded-lg border bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 text-sm hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
                        >
                            ↓ Bottom
                        </button>

                        <div className="h-4 w-px bg-stone-200 dark:bg-stone-700" />

                        {/* Jump to page */}
                        <div className="flex items-center gap-1.5">
                            <input
                                type="number"
                                min={1}
                                max={numPages}
                                value={jumpInput}
                                onChange={e => setJumpInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleJump()}
                                placeholder={`1–${numPages}`}
                                className="w-20 px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-sm focus:outline-none focus:border-amber-400"
                            />
                            <button
                                onClick={handleJump}
                                className="px-3 py-1.5 rounded-lg border bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 text-sm hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
                            >
                                Go
                            </button>
                        </div>

                        <span className="text-stone-400 text-xs ml-auto">{numPages} pages</span>
                    </>
                )}
            </div>

            {/* PDF document */}
            {pdfUrl && (
                <div ref={containerRef} className="w-full flex flex-col items-center gap-2">
                    <Document
                        file={pdfUrl}
                        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                        loading={<div className="text-stone-400 text-sm py-8">Loading PDF…</div>}
                    >
                        {Array.from({ length: numPages }, (_, i) => (
                            <div
                                key={i}
                                ref={el => { pageRefs.current[i] = el }}
                                className="mb-4 shadow-md rounded overflow-hidden"
                            >
                                <Page
                                    pageNumber={i + 1}
                                    width={pageWidth}
                                    renderTextLayer={true}
                                    renderAnnotationLayer={true}
                                />
                            </div>
                        ))}
                    </Document>
                </div>
            )}

            {!pdfUrl && (
                <div className="flex flex-col items-center justify-center py-24 text-stone-300 dark:text-stone-600 select-none">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <p className="mt-3 text-sm">Open a PDF to start reading</p>
                </div>
            )}
        </div>
    )
}
