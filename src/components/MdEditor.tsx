'use client'

import { Button, Tooltip } from "@heroui/react";
import { BiExpand, BiCollapse, BiHelpCircle } from 'react-icons/bi';
import { forwardRef, useRef, useState } from 'react'
import Markdown2Html from '@/components/markdown/markdown';

type Props = {
    defaultValue?: string;
    label?: string;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'defaultValue'>

const char1 = ["#", "⬌", "■", "=", "≈", "➤", "🡆"]
const char1Tips = ["heading", "left-right arrow", "square", "equals", "approx.", "right arrow", "right arrow"]

const char2 = ["ä", "Ä", "ö", "Ö", "ü", "Ü", "ß", "é", "€"]

const char3 = [
    { label: "B", start: "**", end: "**", tip: "bold (Ctrl+B)" },
    { label: "„“", start: "„", end: "“", tip: "German double quotes" },
    { label: "‚‘", start: "‚", end: "‘", tip: "German single quotes" },
    { label: "`c`", start: "`", end: "`", tip: "inline code (Ctrl+`)" },
    { label: "C", start: "`````\n", end: "\n`````", tip: "code block" },
]

const char4 = [
    { label: "I", start: "*", end: "*", tip: "italic (Ctrl+I)" },
    { label: "~~", start: "~~", end: "~~", tip: "strikethrough" },
    { label: "🔗", start: "[", end: "](url)", tip: "link" },
    { label: "---", start: "\n---\n", end: "", tip: "horizontal rule" },
]

const shortcutList = [
    ["Ctrl+B", "bold"],
    ["Ctrl+I", "italic"],
    ["Ctrl+`", "inline code"],
    ["Tab", "indent"],
    ["Shift+Tab", "dedent"],
    ["Enter", "continue list"],
    ["Escape", "close toolbar"],
]

const MdEditor = forwardRef<HTMLTextAreaElement, Props>(({ defaultValue, label = 'content', ...rest }, forwardedRef) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null)
    const [statePreview, setStatePreview] = useState(false)
    const [stateValue, setStateValue] = useState(defaultValue || '')
    const [insertOpen, setInsertOpen] = useState(false)
    const [stateFullscreen, setStateFullscreen] = useState(false)
    const [stateSpellCheck, setStateSpellCheck] = useState(false)
    const [stateShowShortcuts, setStateShowShortcuts] = useState(false)

    const wordCount = stateValue.trim() ? stateValue.trim().split(/\s+/).length : 0
    const charCount = stateValue.length

    const autoResize = (el: HTMLTextAreaElement) => {
        if (stateFullscreen) {
            el.style.height = ''
            return
        }
        const scrollY = window.scrollY
        el.style.height = 'auto'
        el.style.height = el.scrollHeight + 'px'
        window.scrollTo(0, scrollY)
    }

    const toggleFullscreen = () => {
        setStateFullscreen(prev => {
            const next = !prev
            setTimeout(() => {
                if (innerRef.current) {
                    innerRef.current.style.height = ''
                    if (!next) autoResize(innerRef.current)
                }
            }, 0)
            return next
        })
    }

    const replaceRange = (textarea: HTMLTextAreaElement, text: string, from?: number, to?: number) => {
        const s = from ?? textarea.selectionStart
        const e = to ?? textarea.selectionEnd
        textarea.setRangeText(text, s, e, 'end')
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }

    const insertToAnswer = (startText: string, endText: string) => {
        const textarea = innerRef.current
        if (!textarea) return
        textarea.focus()
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const selected = textarea.value.slice(start, end)
        replaceRange(textarea, startText + selected + endText, start, end)
        setTimeout(() => {
            if (start === end) {
                textarea.setSelectionRange(start + startText.length, start + startText.length)
            } else {
                textarea.setSelectionRange(start, start + startText.length + selected.length + endText.length)
            }
        }, 0)
    }

    const insertAtLineStart = (prefix: string) => {
        const textarea = innerRef.current
        if (!textarea) return
        textarea.focus()
        const start = textarea.selectionStart
        const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1
        replaceRange(textarea, prefix, lineStart, lineStart)
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const html = e.clipboardData.getData('text/html')
        if (!html) return
        e.preventDefault()
        const div = document.createElement('div')
        div.innerHTML = html
        replaceRange(e.currentTarget, div.textContent || div.innerText || '')
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const isMac = navigator.userAgent.includes('Mac')
        const ctrl = isMac ? e.metaKey : e.ctrlKey

        if (e.key === 'Escape') {
            setInsertOpen(false)
            return
        }

        if (e.key === 'Enter') {
            const textarea = innerRef.current!
            const start = textarea.selectionStart
            const val = textarea.value
            const lineStart = val.lastIndexOf('\n', start - 1) + 1
            const line = val.slice(lineStart, start)
            const unordered = line.match(/^- (.*)/)
            const ordered = line.match(/^(\d+)\. (.*)/)
            if (unordered) {
                e.preventDefault()
                if (!unordered[1]) {
                    replaceRange(textarea, '', lineStart, start)
                } else {
                    replaceRange(textarea, '\n- ', start, start)
                }
                return
            }
            if (ordered) {
                e.preventDefault()
                if (!ordered[2]) {
                    replaceRange(textarea, '', lineStart, start)
                } else {
                    replaceRange(textarea, `\n${parseInt(ordered[1]) + 1}. `, start, start)
                }
                return
            }
        }

        if (e.key === 'Tab') {
            e.preventDefault()
            if (e.shiftKey) {
                const textarea = innerRef.current!
                const start = textarea.selectionStart
                const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1
                const spaces = textarea.value.slice(lineStart).match(/^ {1,2}/)?.[0] ?? ''
                if (spaces) {
                    replaceRange(textarea, '', lineStart, lineStart + spaces.length)
                }
            } else {
                replaceRange(innerRef.current!, '  ')
            }
            return
        }

        if (ctrl) {
            if (e.key === 'b') { e.preventDefault(); insertToAnswer('**', '**') }
            else if (e.key === 'i') { e.preventDefault(); insertToAnswer('*', '*') }
            else if (e.key === '`') { e.preventDefault(); insertToAnswer('`', '`') }
        }
    }

    const toolbar = (
        <div className='flex flex-wrap gap-x-6 gap-y-3 px-1 py-2 border-b border-divider'>
            <div>
                <div className='text-xs text-foreground-400 uppercase tracking-wide mb-1'>Symbols</div>
                <div className='flex flex-wrap gap-1'>
                    {char1.map((v, i) =>
                        <Tooltip key={`c1-${i}`} content={char1Tips[i]} size='sm'>
                            <Button size='sm' isIconOnly className='text-xl' onPress={() => insertToAnswer(v, '')}>{v}</Button>
                        </Tooltip>
                    )}
                </div>
            </div>
            <div>
                <div className='text-xs text-foreground-400 uppercase tracking-wide mb-1'>German</div>
                <div className='flex flex-wrap gap-1'>
                    {char2.map((v, i) =>
                        <Tooltip key={`c2-${i}`} content={v} size='sm'>
                            <Button size='sm' isIconOnly className='text-xl' onPress={() => insertToAnswer(v, '')}>{v}</Button>
                        </Tooltip>
                    )}
                </div>
            </div>
            <div>
                <div className='text-xs text-foreground-400 uppercase tracking-wide mb-1'>Format</div>
                <div className='flex flex-wrap gap-1'>
                    {char3.map((v, i) =>
                        <Tooltip key={`c3-${i}`} content={v.tip} size='sm'>
                            <Button size='sm' isIconOnly className='text-xl' onPress={() => insertToAnswer(v.start, v.end)}>{v.label}</Button>
                        </Tooltip>
                    )}
                    {char4.map((v, i) =>
                        <Tooltip key={`c4-${i}`} content={v.tip} size='sm'>
                            <Button size='sm' isIconOnly className='text-xl' onPress={() => insertToAnswer(v.start, v.end)}>{v.label}</Button>
                        </Tooltip>
                    )}
                </div>
            </div>
            <div>
                <div className='text-xs text-foreground-400 uppercase tracking-wide mb-1'>Lists</div>
                <div className='flex flex-wrap gap-1'>
                    <Tooltip content='unordered list' size='sm'>
                        <Button size='sm' isIconOnly className='text-base font-mono' onPress={() => insertAtLineStart('- ')}>-</Button>
                    </Tooltip>
                    <Tooltip content='ordered list' size='sm'>
                        <Button size='sm' isIconOnly className='text-base font-mono' onPress={() => insertAtLineStart('1. ')}>1.</Button>
                    </Tooltip>
                </div>
            </div>
        </div>
    )

    return (
        <div className={stateFullscreen
            ? 'fixed inset-0 z-50 flex flex-col bg-sand-100 p-4'
            : 'flex flex-col gap-1 px-3 py-0.5 bg-default-100 hover:bg-default-200 rounded-medium'
        }>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div className='flex gap-1 items-center'>
                    <label className='text-foreground-500 text-small'>{label}</label>
                    <Button
                        size='sm'
                        variant={insertOpen ? 'solid' : 'light'}
                        onPress={() => setInsertOpen(v => !v)}
                    >
                        Tools
                    </Button>
                </div>
                <div className='flex gap-1 items-center'>
                    <Tooltip content='keyboard shortcuts' size='sm'>
                        <Button size='sm' variant='light' isIconOnly
                            onPress={() => setStateShowShortcuts(v => !v)}>
                            <BiHelpCircle className='text-lg' />
                        </Button>
                    </Tooltip>
                    <Tooltip content={stateSpellCheck ? 'disable spell check' : 'enable spell check'} size='sm'>
                        <Button size='sm' variant={stateSpellCheck ? 'solid' : 'light'}
                            onPress={() => setStateSpellCheck(v => !v)}>
                            ABC
                        </Button>
                    </Tooltip>
                    <Button size='sm' variant='light' onPress={() => setStatePreview(v => !v)}>
                        {statePreview ? 'editor' : 'preview'}
                    </Button>
                    <Tooltip content={stateFullscreen ? 'exit fullscreen' : 'fullscreen'} size='sm'>
                        <Button size='sm' variant='light' isIconOnly onPress={toggleFullscreen}>
                            {stateFullscreen ? <BiCollapse className='text-lg' /> : <BiExpand className='text-lg' />}
                        </Button>
                    </Tooltip>
                </div>
            </div>

            {/* Toolbar */}
            {insertOpen && toolbar}

            {/* Shortcuts panel */}
            {stateShowShortcuts && (
                <div className='flex flex-wrap gap-x-6 gap-y-1 px-1 py-2 text-sm text-foreground-500 border-b border-divider'>
                    {shortcutList.map(([key, desc]) => (
                        <span key={key}>
                            <kbd className='font-mono text-xs bg-default-200 px-1 rounded'>{key}</kbd> {desc}
                        </span>
                    ))}
                </div>
            )}

            {/* Textarea */}
            <textarea
                className={[
                    'w-full text-xl leading-tight font-roboto px-1.5 outline-none bg-transparent resize-none overflow-hidden',
                    stateFullscreen ? 'flex-1 min-h-0' : 'min-h-40',
                    statePreview ? 'hidden' : '',
                ].join(' ')}
                defaultValue={defaultValue}
                rows={1}
                autoComplete='off'
                autoCorrect='off'
                {...rest}
                spellCheck={stateSpellCheck}
                onPaste={handlePaste}
                onInput={(e) => {
                    const el = e.currentTarget
                    autoResize(el)
                    setStateValue(el.value)
                }}
                onKeyDown={handleKeyDown}
                ref={(e) => {
                    innerRef.current = e
                    if (e) autoResize(e)
                    if (typeof forwardedRef === 'function') forwardedRef(e)
                    else if (forwardedRef) forwardedRef.current = e
                }}
            />

            {/* Preview */}
            {statePreview && (
                <div className={[
                    'text-xl bg-sand-200 rounded-md p-2',
                    stateFullscreen ? 'flex-1 overflow-y-auto' : 'min-h-40',
                ].join(' ')}>
                    <Markdown2Html content={stateValue} withTOC />
                </div>
            )}

            {/* Word / char count */}
            {!statePreview && (
                <div className='text-xs text-foreground-400 text-right px-1'>
                    {wordCount} words · {charCount} chars
                </div>
            )}
        </div>
    )
})

MdEditor.displayName = 'MdEditor'

export default MdEditor
