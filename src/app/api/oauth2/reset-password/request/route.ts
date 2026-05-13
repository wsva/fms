import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resetTokenMap } from '@/lib/oauth2-reset'
import { respondOk, respondErr } from '@/lib/oauth2'
import nodemailer from 'nodemailer'

export async function POST(request: NextRequest) {
    let body: { email?: string }
    try {
        body = await request.json()
    } catch {
        return respondErr('invalid request')
    }

    const email = (body.email ?? '').trim().toLowerCase()
    if (!email) return respondErr('email required')

    const user = await prisma.oauth2_user.findFirst({
        where: { email, is_active: 'Y' },
    })

    // Always respond OK to avoid user enumeration
    if (!user) return respondOk()

    const token = resetTokenMap.generate(email)

    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
    const resetLink = `${baseUrl}/oauth2/reset-password?token=${token}`

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    })

    await transporter.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: user.email,
        subject: 'Reset your password',
        text: `Hello${user.nickname ? ` ${user.nickname}` : ''},\n\nClick the link below to reset your password. The link expires in 1 hour.\n\n${resetLink}\n\nIf you did not request a password reset, you can ignore this email.`,
        html: `<p>Hello${user.nickname ? ` <strong>${user.nickname}</strong>` : ''},</p>
<p>Click the link below to reset your password. The link expires in <strong>1 hour</strong>.</p>
<p><a href="${resetLink}">${resetLink}</a></p>
<p>If you did not request a password reset, you can ignore this email.</p>`,
    })

    return respondOk()
}
