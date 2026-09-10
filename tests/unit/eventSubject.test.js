import { describe, it, expect } from 'vitest';
import { parseEventSubject } from '../../server/utils/eventSubject.js';

describe('parseEventSubject', () => {
  it('splits "<project> <code> : <task>" into three parts', () => {
    expect(parseEventSubject('DPT E25-5036 : Copy Data ที่เครื่อง DB DPT')).toEqual({
      projectCode: 'E25-5036',
      project: 'DPT',
      task: 'Copy Data ที่เครื่อง DB DPT',
    });
  });

  it('handles a multi-word project name before the code', () => {
    expect(parseEventSubject('กรมพัฒนาที่ดิน E26-1234 : ประชุมติดตามความคืบหน้า')).toEqual({
      projectCode: 'E26-1234',
      project: 'กรมพัฒนาที่ดิน',
      task: 'ประชุมติดตามความคืบหน้า',
    });
  });

  it('falls back to task = whole subject when there is no project code', () => {
    expect(parseEventSubject('MOAC Agri-map Bi-Weekly Meeting')).toEqual({
      projectCode: '',
      project: '',
      task: 'MOAC Agri-map Bi-Weekly Meeting',
    });
  });

  it('does not match a non-project-code pattern like "VA2026-00683"', () => {
    const subject = 'Walkthrough VA2026-00683 25-05712-3BB-Merge-Phase2-OSS-FBSS-WF-DEV_CN';
    expect(parseEventSubject(subject)).toEqual({ projectCode: '', project: '', task: subject });
  });

  it('handles null/undefined without throwing', () => {
    expect(parseEventSubject(null)).toEqual({ projectCode: '', project: '', task: '' });
    expect(parseEventSubject(undefined)).toEqual({ projectCode: '', project: '', task: '' });
  });
});
