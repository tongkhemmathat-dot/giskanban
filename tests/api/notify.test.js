import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTestDb } from '../helpers/testDb.js';

const sendMail = vi.fn().mockResolvedValue({});
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

const { sendSlaDigest } = await import('../../server/services/notify.service.js');

describe('sendSlaDigest', () => {
  useTestDb();

  const original = { ...process.env };
  beforeEach(() => {
    sendMail.mockClear();
    process.env.NOTIFY_EMAIL_TO = 'noc@example.com';
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('throws when NOTIFY_EMAIL_TO is not configured', async () => {
    delete process.env.NOTIFY_EMAIL_TO;
    await expect(sendSlaDigest()).rejects.toThrow(/NOTIFY_EMAIL_TO/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends one email to NOTIFY_EMAIL_TO with a subject listing the risky-card count', async () => {
    const result = await sendSlaDigest();
    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe('noc@example.com');
    expect(call.subject).toContain(`${result.sentCount} รายการ`);
  });
});
