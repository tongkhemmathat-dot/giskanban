// server/services/notify.service.js — daily SLA-risk email digest (backlog:
// replaces LINE Notify, which LINE discontinued in Mar 2025). Sends one
// summary email/day to a single team address rather than a per-card alert on
// every status transition — no "already notified" tracking needed, and it's
// what a 5-15 person NOC team actually wants (docs/07-roadmap.md backlog).
import nodemailer from 'nodemailer';
import { listCards } from './card.service.js';

export function buildDigestText(cards) {
  if (cards.length === 0) {
    return 'วันนี้ไม่มีใบงานที่ใกล้ชนหรือเกินกำหนด SLA 🎉';
  }
  const lines = cards.map((c) => {
    const status = c.slaStatus === 'overdue' ? 'เกินกำหนด' : 'ใกล้ครบกำหนด';
    const assignees = (c.assignees || []).map((a) => a.name).join(', ') || '—';
    return `- [${status}] ${c.code} ${c.title} (ผู้รับผิดชอบ: ${assignees}, กำหนด: ${c.slaDueAt ?? '—'})`;
  });
  return `ใบงานที่ใกล้ชนหรือเกินกำหนด SLA (${cards.length} รายการ):\n\n${lines.join('\n')}`;
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

// Called once/day by the scheduler in server/index.js. Throws on missing
// config or SMTP failure — the caller there is responsible for catching and
// logging, same as any other background job in this codebase.
export async function sendSlaDigest() {
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to) throw new Error('NOTIFY_EMAIL_TO ไม่ได้ตั้งค่า');

  const cards = listCards({}).filter((c) => c.slaStatus === 'overdue' || c.slaStatus === 'at_risk');
  const text = buildDigestText(cards);

  await getTransport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `[JobCard Pro] สรุปงานใกล้ชน SLA — ${cards.length} รายการ`,
    text,
  });

  return { sentCount: cards.length };
}
