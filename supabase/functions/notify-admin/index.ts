// PawTrack — email for the staff inbox.
//
// Two jobs, one function (deployed without JWT check; each job checks access):
//
//  1. {"id": "<inbox message id>"}  — sent by a database trigger for every new
//     inbox message. Emails it to the admin with Reply-To set to the sender.
//     Only real, not-yet-emailed rows are sent, so it can't be used for spam.
//
//  2. {"action": "reply", "message_id": "...", "body": "..."}  — sent by the
//     staff Inbox with the signed-in user's token. Emails the reply to the
//     person who wrote in and records it in public.inbox_replies.
//     Only active staff/admins can do this.
//
//  3. {"donation_id": "...", "event": "received" | "confirmed"}  — sent by a
//     database trigger. Emails the donor a thank-you (once per event).
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   GMAIL_APP_PASSWORD  App password of the admin Gmail (recommended). Emails
//                       are sent through smtp.gmail.com as ADMIN_EMAIL, so both
//                       notifications and replies work.
//   ADMIN_EMAIL         optional, default pawtrackoso@gmail.com
//   RESEND_API_KEY      optional fallback for notifications only (Resend
//                       without a domain can only email its own account).
//   SITE_URL            optional, adds an "Open the staff inbox" link.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import nodemailer from 'npm:nodemailer@6.9.16'

type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string }

// Read on every request so changed secrets apply without a redeploy.
const env = () => ({
  ADMIN_EMAIL: (Deno.env.get('ADMIN_EMAIL') || 'pawtrackoso@gmail.com').trim(),
  GMAIL_APP_PASSWORD: (Deno.env.get('GMAIL_APP_PASSWORD') || '').replace(/\s+/g, ''),
  RESEND_API_KEY: (Deno.env.get('RESEND_API_KEY') || '').trim(),
  SITE_URL: (Deno.env.get('SITE_URL') || '').trim().replace(/\/$/, ''),
})

const KIND_LABEL: Record<string, string> = {
  contact: 'Contact message',
  adoption: 'Adoption application',
  donation: 'Donation',
  staff: 'Staff application',
  report: 'Community report',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const looksLikeEmail = (s: string | null | undefined) => !!s && /^[^\s@]+@[^\s@]+$/.test(s.trim())

async function sendMail(mail: Mail): Promise<string | null> {
  const { ADMIN_EMAIL, GMAIL_APP_PASSWORD, RESEND_API_KEY } = env()
  if (GMAIL_APP_PASSWORD) {
    try {
      const transport = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: ADMIN_EMAIL, pass: GMAIL_APP_PASSWORD },
      })
      await transport.sendMail({ from: `PawTrack <${ADMIN_EMAIL}>`, ...mail })
      return null
    } catch (e) {
      return `Gmail: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  if (RESEND_API_KEY && mail.to.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'PawTrack <onboarding@resend.dev>',
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    })
    return res.ok ? null : `Resend ${res.status}: ${await res.text()}`
  }
  return 'Email is not set up: add the GMAIL_APP_PASSWORD secret (Edge Functions → Secrets).'
}

function layout(label: string, title: string, inner: string, foot: string) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#101c1a">
      <p style="margin:0 0 4px;color:#0f766e;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em">${esc(label)}</p>
      <h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>
      ${inner}
      <p style="margin:16px 0 0;color:#667873;font-size:13px">${foot}</p>
    </div>`
}

const box = (text: string) =>
  `<div style="background:#f5f7f6;border-radius:10px;padding:14px 16px;white-space:pre-wrap">${esc(text)}</div>`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let input: Record<string, unknown>
  try {
    input = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { ADMIN_EMAIL, SITE_URL } = env()
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ---- 2. Staff reply -------------------------------------------------------
  if (input.action === 'reply') {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await db.auth.getUser(token)
    if (!auth?.user) return json({ error: 'Please sign in again.' }, 401)
    const { data: me } = await db.from('profiles').select('id, display_name, role, status').eq('id', auth.user.id).maybeSingle()
    if (!me || me.status !== 'active' || !['staff', 'admin'].includes(me.role)) {
      return json({ error: 'Only staff can reply.' }, 403)
    }

    const messageId = String(input.message_id || '')
    const body = String(input.body || '').trim()
    if (!body) return json({ error: 'Write a reply first.' }, 400)
    if (body.length > 5000) return json({ error: 'The reply is too long.' }, 400)

    const { data: msg } = await db.from('inbox_messages').select('*').eq('id', messageId).maybeSingle()
    if (!msg) return json({ error: 'Message not found.' }, 404)
    if (!looksLikeEmail(msg.email)) return json({ error: 'This person did not leave an email address.' }, 400)

    const quoted = String(msg.body).split('\n').map((l) => '> ' + l).join('\n')
    const subject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`
    const err = await sendMail({
      to: msg.email.trim(),
      replyTo: ADMIN_EMAIL,
      subject,
      text: `${body}\n\n— ${me.display_name}, Ormoc Strays Oasis (PawTrack)\n\nYou wrote:\n${quoted}`,
      html: layout(
        'Ormoc Strays Oasis',
        subject,
        `${box(body)}<p style="margin:12px 0 0">— ${esc(me.display_name)}, Ormoc Strays Oasis</p>
         <p style="margin:18px 0 6px;color:#667873;font-size:13px">You wrote:</p>
         <div style="border-left:3px solid #e3e8e6;padding-left:12px;color:#667873;white-space:pre-wrap">${esc(msg.body)}</div>`,
        'Reply to this email to continue the conversation.',
      ),
    })
    if (err) return json({ error: err }, 502)

    const { data: saved } = await db
      .from('inbox_replies')
      .insert({ message_id: msg.id, body, sent_by: me.id, sent_by_name: me.display_name })
      .select('*')
      .single()
    await db.from('inbox_messages').update({ read: true }).eq('id', msg.id)
    return json({ sent: true, reply: saved })
  }

  // ---- 3. Thank-you email to a donor --------------------------------------
  if (input.donation_id) {
    const donationId = String(input.donation_id)
    const event = input.event === 'confirmed' ? 'confirmed' : 'received'
    const column = event === 'confirmed' ? 'confirmed_email_at' : 'thanked_at'
    // Claim it so each email goes out once, and only in the right state.
    let q = db.from('donations').update({ [column]: new Date().toISOString() }).eq('id', donationId).is(column, null)
    q = event === 'confirmed' ? q.eq('status', 'confirmed') : q.neq('status', 'rejected')
    const { data: d, error: claimErr } = await q.select('*').maybeSingle()
    if (claimErr) return json({ error: claimErr.message }, 500)
    if (!d) return json({ skipped: true })
    if (!looksLikeEmail(d.email)) return json({ skipped: true })

    const goods = d.method === 'In-kind Donation'
    const amount = '₱' + Number(d.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const who = d.anonymous || !d.name || d.name === 'Anonymous' ? 'friend' : String(d.name).split(' ')[0]
    const ref = d.reference_no ? ` (reference no. ${d.reference_no})` : ''
    // Food & supplies: thank them for the items, not a peso amount.
    const gift = goods ? `your donation of ${d.items || 'food and supplies'}` : `your donation of ${amount} via ${d.method}${ref}`
    const how = d.delivery === 'Pick up'
      ? 'Our staff will contact you to arrange the pick-up.'
      : d.delivery === 'Drop off'
        ? 'You can drop it off at the Ormoc City Dog Pound, Brgy. Cagbuhangin, any day from 9 AM to 10 PM.'
        : ''
    const subject = event === 'confirmed'
      ? 'Your donation to Ormoc Strays Oasis is confirmed'
      : 'Thank you for your donation to Ormoc Strays Oasis'
    const lines = event === 'confirmed'
      ? [
          `Dear ${who},`,
          '',
          goods ? `We have received ${gift}. Thank you!` : `We have received your donation of ${amount} via ${d.method}${ref}. Thank you!`,
          goods ? 'It goes straight to the dogs in our care.' : `It will go to: ${d.purpose}.`,
          '',
          'Every peso helps us feed, treat and rehome the dogs at the Ormoc City Dog Pound. Because of you, they get a second chance.',
          '',
          'With gratitude,',
          'The Ormoc Strays Oasis team',
        ]
      : [
          `Dear ${who},`,
          '',
          goods ? `Thank you for ${gift}!` : `Thank you for your donation of ${amount} via ${d.method}${ref}!`,
          goods
            ? `${how} We will email you again once the items are received.`.trim()
            : 'Our staff will check it against the payment record and confirm it shortly. We will email you again once it is confirmed.',
          '',
          'From all of us and the dogs in our care, thank you for your kindness.',
          '',
          'With gratitude,',
          'The Ormoc Strays Oasis team',
        ]
    const err = await sendMail({
      to: d.email.trim(),
      replyTo: ADMIN_EMAIL,
      subject,
      text: lines.join('\n'),
      html: layout(
        event === 'confirmed' ? 'Donation confirmed' : 'Thank you',
        subject,
        lines.map((l) => (l ? `<p style="margin:0 0 10px">${esc(l)}</p>` : '')).join(''),
        'Ormoc Strays Oasis · Brgy. Cagbuhangin, Ormoc City · Reply to this email if you have any questions.',
      ),
    })
    if (err) {
      await db.from('donations').update({ [column]: null }).eq('id', donationId)
      return json({ error: err }, 502)
    }
    return json({ sent: true })
  }

  // ---- 1. New message notification -----------------------------------------
  const id = String(input.id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Missing id' }, 400)

  // Claim the row so it is emailed once, even if called twice.
  const { data: msg, error } = await db
    .from('inbox_messages')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', id)
    .is('notified_at', null)
    .select('*')
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!msg) return json({ skipped: true })

  const kind = KIND_LABEL[msg.kind] || 'Message'
  const sender = looksLikeEmail(msg.email) ? msg.email.trim() : ''
  const foot = (sender ? 'Reply to this email to answer them directly.' : 'They did not leave an email address.') +
    (SITE_URL
      ? msg.kind === 'report'
        ? ` · <a href="${SITE_URL}/ops/reports" style="color:#0f766e">Review it on the Reports page</a>`
        : ` · <a href="${SITE_URL}/ops/inbox" style="color:#0f766e">Open the staff inbox</a>`
      : '')

  const err = await sendMail({
    to: ADMIN_EMAIL,
    replyTo: sender || undefined,
    subject: `[PawTrack] ${msg.subject}`,
    text: [`${kind} from ${msg.name}`, `Email: ${sender || '(not given)'}`, '', msg.body].join('\n'),
    html: layout(
      kind,
      msg.subject,
      `<p style="margin:0 0 4px"><b>From:</b> ${esc(msg.name)}</p>
       <p style="margin:0 0 16px"><b>Email:</b> ${sender ? esc(sender) : '(not given)'}</p>${box(msg.body)}`,
      foot,
    ),
  })

  if (err) {
    // Let a later retry send it.
    await db.from('inbox_messages').update({ notified_at: null }).eq('id', id)
    return json({ error: err }, 502)
  }
  return json({ sent: true })
})
