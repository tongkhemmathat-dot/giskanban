import { describe, it, expect } from 'vitest';
import { buildDigestText } from '../../server/services/notify.service.js';

describe('buildDigestText', () => {
  it('no risky cards -> friendly all-clear message, no card lines', () => {
    const text = buildDigestText([]);
    expect(text).toContain('ไม่มีใบงาน');
  });

  it('lists each overdue/at_risk card with status, code, title, assignees, due date', () => {
    const text = buildDigestText([
      { code: 'INC-0001', title: 'Router ล่ม', slaStatus: 'overdue', slaDueAt: '2026-09-01 10:00:00', assignees: [{ name: 'สมชาย' }] },
      { code: 'SR-0002', title: 'ขอ VPN', slaStatus: 'at_risk', slaDueAt: '2026-09-03 10:00:00', assignees: [] },
    ]);
    expect(text).toContain('2 รายการ');
    expect(text).toContain('[เกินกำหนด] INC-0001 Router ล่ม (ผู้รับผิดชอบ: สมชาย, กำหนด: 2026-09-01 10:00:00)');
    expect(text).toContain('[ใกล้ครบกำหนด] SR-0002 ขอ VPN (ผู้รับผิดชอบ: —, กำหนด: 2026-09-03 10:00:00)');
  });
});
