// Seed data (docs/03-database.md §4). `seedDatabase(db)` is the single
// reusable entry point — `npm run seed` calls it against the real DB_PATH
// connection, and tests/setup.js calls the exact same function against an
// in-memory test database, so seed data never has to be duplicated.
import { pathToFileURL } from 'node:url';
import { calcSlaDueAt } from '../utils/sla.js';

const GAP = 65536;

const MEMBERS = [
  { name: 'สมชาย ก.', short: 'สช', color: '#6366f1' },
  { name: 'ณัฐพล ว.', short: 'ณพ', color: '#10b981' },
  { name: 'ปรียา ส.', short: 'ปย', color: '#f43f5e' },
  { name: 'อนุชา น.', short: 'อช', color: '#f59e0b' },
  { name: 'วีระ ท.', short: 'วร', color: '#0ea5e9' },
];

const LISTS = [
  { position: 1, name: 'Backlog', slug: 'backlog', wip_limit: null, is_done: 0 },
  { position: 2, name: 'To Do', slug: 'todo', wip_limit: null, is_done: 0 },
  { position: 3, name: 'In Progress', slug: 'doing', wip_limit: 4, is_done: 0 },
  { position: 4, name: 'Waiting Vendor', slug: 'waiting', wip_limit: null, is_done: 0 },
  { position: 5, name: 'Review', slug: 'review', wip_limit: null, is_done: 0 },
  { position: 6, name: 'Done', slug: 'done', wip_limit: null, is_done: 1 },
];

const TEMPLATES = {
  upgrade: {
    name: 'อัปเกรดซอฟต์แวร์',
    items: [
      'แจ้งผู้ใช้งาน + ขอ downtime window',
      'ตรวจ release note / compatibility',
      'ทำ backup ฐานข้อมูล + config',
      'ทำ snapshot เครื่อง (rollback point)',
      'ดาวน์โหลดตัวติดตั้ง + ตรวจ checksum',
      'หยุดบริการที่เกี่ยวข้อง',
      'ติดตั้งเวอร์ชันใหม่',
      'ตรวจสอบ license / authorize',
      'ทดสอบฟังก์ชันหลัก (smoke test)',
      'เปิดบริการ + แจ้งผู้ใช้',
      'เฝ้าระวัง 24 ชม. + สรุปผล',
    ],
  },
  pm: {
    name: 'ตรวจเช็คอุปกรณ์ (PM)',
    items: [
      'แจ้งเข้าพื้นที่ + ขออนุญาต',
      'ตรวจสภาพกายภาพ / ไฟสถานะ',
      'ทำความสะอาด + ตรวจพัดลม',
      'ตรวจ log & alarm ย้อนหลัง',
      'อัปเดต firmware (ถ้าจำเป็น)',
      'ทดสอบ redundancy / failover',
      'ถ่ายรูปหลังตรวจ',
      'บันทึกผลลง PM report',
    ],
  },
  incident: {
    name: 'แก้ไขเหตุขัดข้อง (Incident)',
    items: [
      'ยืนยันอาการ + ขอบเขตผลกระทบ',
      'แจ้งผู้ใช้งานที่กระทบ',
      'เก็บ log / evidence',
      'แก้ไขเบื้องต้น (workaround)',
      'แก้ไขถาวร',
      'ทดสอบยืนยันว่าใช้งานได้',
      'แจ้งปิดเหตุ',
      'สรุป root cause + แนวป้องกัน',
    ],
  },
  install: {
    name: 'ติดตั้งอุปกรณ์ใหม่',
    items: [
      'สำรวจหน้างาน + เตรียมพื้นที่',
      'เตรียมอุปกรณ์ + สาย',
      'ติดตั้ง rack / mount',
      'เดินสายไฟ + สายสัญญาณ',
      'ตั้งค่า config พื้นฐาน',
      'เชื่อมเข้าระบบ monitoring',
      'ทดสอบการใช้งาน',
      'ส่งมอบ + ทำเอกสาร',
    ],
  },
};

// SQLite datetime format ('YYYY-MM-DD HH:MM:SS', UTC) — matches calcSlaDueAt's
// output so seeded rows compare correctly against `datetime('now')`.
function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function insertMembers(db) {
  const stmt = db.prepare(
    'INSERT INTO members (name, short, color) VALUES (@name, @short, @color)',
  );
  const byName = {};
  for (const m of MEMBERS) {
    const info = stmt.run(m);
    byName[m.name] = Number(info.lastInsertRowid);
  }
  return byName;
}

function insertBoardAndLists(db) {
  const boardName = process.env.BOARD_NAME || 'NOC Operations';
  const boardId = Number(
    db.prepare('INSERT INTO boards (name) VALUES (?)').run(boardName).lastInsertRowid,
  );
  const stmt = db.prepare(`
    INSERT INTO lists (board_id, name, slug, position, wip_limit, is_done)
    VALUES (@board_id, @name, @slug, @position, @wip_limit, @is_done)
  `);
  const bySlug = {};
  for (const l of LISTS) {
    const info = stmt.run({ board_id: boardId, ...l });
    bySlug[l.slug] = Number(info.lastInsertRowid);
  }
  return { boardId, lists: bySlug };
}

function insertTemplates(db) {
  const stmt = db.prepare(
    'INSERT INTO templates (name, slug, items) VALUES (@name, @slug, @items)',
  );
  const bySlug = {};
  for (const [slug, t] of Object.entries(TEMPLATES)) {
    const info = stmt.run({ name: t.name, slug, items: JSON.stringify(t.items) });
    bySlug[slug] = Number(info.lastInsertRowid);
  }
  return bySlug;
}

function insertSubtasks(
  db,
  cardId,
  titles,
  { doneCount = 0, assigneeId = null, doneBy = null } = {},
) {
  const stmt = db.prepare(`
    INSERT INTO subtasks (card_id, title, is_done, position, assignee_id, done_by, done_at)
    VALUES (@card_id, @title, @is_done, @position, @assignee_id, @done_by, @done_at)
  `);
  titles.forEach((title, i) => {
    const isDone = i < doneCount ? 1 : 0;
    stmt.run({
      card_id: cardId,
      title,
      is_done: isDone,
      position: (i + 1) * GAP,
      assignee_id: assigneeId,
      done_by: isDone ? doneBy : null,
      done_at: isDone ? hoursAgo(1) : null,
    });
  });
}

function insertCard(db, listId, position, fields) {
  const createdAt = fields.createdAt ?? hoursAgo(0);
  const slaDueAt = calcSlaDueAt(fields.priority, createdAt);
  const stmt = db.prepare(`
    INSERT INTO cards (
      list_id, code, title, description, position, type, priority,
      due_date, sla_due_at, estimated_hours, site, customer, device_ref,
      project_code, creator_id, started_at, completed_at, created_at, updated_at
    ) VALUES (
      @list_id, @code, @title, @description, @position, @type, @priority,
      @due_date, @sla_due_at, @estimated_hours, @site, @customer, @device_ref,
      @project_code, @creator_id, @started_at, @completed_at, @created_at, @created_at
    )
  `);
  const info = stmt.run({
    list_id: listId,
    code: fields.code,
    title: fields.title,
    description: fields.description ?? null,
    position,
    type: fields.type,
    priority: fields.priority,
    due_date: fields.dueDate ?? null,
    sla_due_at: slaDueAt,
    estimated_hours: fields.estimatedHours ?? null,
    site: fields.site ?? null,
    customer: fields.customer ?? null,
    device_ref: fields.deviceRef ?? null,
    project_code: fields.projectCode ?? null,
    creator_id: fields.creatorId,
    started_at: fields.startedAt ?? null,
    completed_at: fields.completedAt ?? null,
    created_at: createdAt,
  });
  const cardId = Number(info.lastInsertRowid);
  const assigneeIds = fields.assigneeIds ?? [fields.creatorId];
  const assignStmt = db.prepare('INSERT INTO card_assignees (card_id, member_id) VALUES (?, ?)');
  for (const memberId of assigneeIds) {
    assignStmt.run(cardId, memberId);
  }
  return cardId;
}

function insertCards(db, { members, lists }) {
  const m = members;
  let code = 0;
  const nextCode = () => 'JC-' + String(++code).padStart(6, '0');
  const cards = {};

  // 1. Full "upgrade" template card, first 3 steps checked (docs/03-database.md §4.4).
  const arcgisId = insertCard(db, lists.todo, 1 * GAP, {
    code: nextCode(),
    title: 'Upgrade ArcGIS Enterprise 12.1',
    description: 'อัปเกรดระบบ ArcGIS Enterprise ให้เป็นเวอร์ชันล่าสุดตาม roadmap ฝ่าย GIS',
    type: 'change',
    priority: 'high',
    site: 'DC-Rama9',
    customer: 'ฝ่าย GIS',
    deviceRef: 'GIS-APP-01',
    creatorId: m['สมชาย ก.'],
    assigneeIds: [m['ณัฐพล ว.']],
    createdAt: hoursAgo(2),
  });
  insertSubtasks(db, arcgisId, TEMPLATES.upgrade.items, {
    doneCount: 3,
    assigneeId: m['ณัฐพล ว.'],
    doneBy: 'ณัฐพล ว.',
  });
  cards.arcgis = arcgisId;

  // 2. Overdue: critical (4h SLA) created 10h ago, in a non-done column.
  const overdueId = insertCard(db, lists.doing, 1 * GAP, {
    code: nextCode(),
    title: 'Router ที่ Site B ล่ม ผู้ใช้เข้าเน็ตไม่ได้ทั้งชั้น',
    description: 'ผู้ใช้แจ้งเน็ตหลุดทั้งชั้น 4 สงสัย router หลักที่ Site B ค้าง',
    type: 'incident',
    priority: 'critical',
    site: 'Site-B',
    customer: 'ฝ่ายบัญชี',
    deviceRef: 'RTR-B01',
    creatorId: m['ปรียา ส.'],
    assigneeIds: [m['วีระ ท.']],
    createdAt: hoursAgo(10),
  });
  cards.overdue = overdueId;

  // 3. PM template card, none done yet.
  const pmId = insertCard(db, lists.waiting, 1 * GAP, {
    code: nextCode(),
    title: 'PM ตรวจเช็ค UPS ประจำเดือน',
    type: 'maintenance',
    priority: 'medium',
    site: 'DC-Rama9',
    customer: 'ฝ่ายอาคาร',
    deviceRef: 'UPS-01',
    projectCode: 'E26-1002',
    creatorId: m['อนุชา น.'],
    assigneeIds: [m['อนุชา น.']],
    createdAt: hoursAgo(3),
  });
  insertSubtasks(db, pmId, TEMPLATES.pm.items, {});
  cards.pm = pmId;

  // 4. Install template card, none done yet.
  const installId = insertCard(db, lists.backlog, 1 * GAP, {
    code: nextCode(),
    title: 'ติดตั้ง Access Point ชั้น 3',
    type: 'service_request',
    priority: 'low',
    site: 'HQ',
    customer: 'ฝ่าย IT',
    creatorId: m['วีระ ท.'],
    assigneeIds: [m['วีระ ท.']],
    createdAt: hoursAgo(5),
  });
  insertSubtasks(db, installId, TEMPLATES.install.items, {});
  cards.install = installId;

  // 5. At-risk #1: high priority (24h SLA), 20h elapsed -> 4h (16.7%) left, in Review.
  const atRisk1Id = insertCard(db, lists.review, 1 * GAP, {
    code: nextCode(),
    title: 'แก้ไข VPN Client เชื่อมต่อไม่ได้',
    type: 'incident',
    priority: 'high',
    site: 'Remote',
    customer: 'พนักงาน WFH',
    creatorId: m['ณัฐพล ว.'],
    assigneeIds: [m['ปรียา ส.']],
    createdAt: hoursAgo(20),
  });
  insertSubtasks(db, atRisk1Id, TEMPLATES.incident.items, {
    doneCount: TEMPLATES.incident.items.length,
    assigneeId: m['ปรียา ส.'],
    doneBy: 'ปรียา ส.',
  });
  cards.atRisk1 = atRisk1Id;

  // 6. At-risk #2: low priority (168h SLA), 140h elapsed -> 28h (16.7%) left.
  const atRisk2Id = insertCard(db, lists.doing, 2 * GAP, {
    code: nextCode(),
    title: 'Backup Config Switch Core',
    type: 'maintenance',
    priority: 'low',
    site: 'DC-Rama9',
    deviceRef: 'SW-CORE-01',
    creatorId: m['สมชาย ก.'],
    assigneeIds: [m['สมชาย ก.']],
    createdAt: hoursAgo(140),
  });
  cards.atRisk2 = atRisk2Id;

  // 7-9, 11-12: assorted cards for board realism (ok SLA status).
  cards.emailAccess = insertCard(db, lists.todo, 2 * GAP, {
    code: nextCode(),
    title: 'ขอสิทธิ์เข้าถึงระบบ Email ผู้ใช้ใหม่',
    type: 'service_request',
    priority: 'medium',
    customer: 'ฝ่ายบุคคล',
    creatorId: m['ปรียา ส.'],
    assigneeIds: [m['ปรียา ส.']],
    createdAt: hoursAgo(1),
  });

  cards.firewallFw = insertCard(db, lists.backlog, 2 * GAP, {
    code: nextCode(),
    title: 'เปลี่ยน Firmware Firewall',
    type: 'change',
    priority: 'medium',
    site: 'HQ',
    deviceRef: 'FW-01',
    projectCode: 'E25-0099',
    creatorId: m['อนุชา น.'],
    assigneeIds: [m['วีระ ท.']],
    createdAt: hoursAgo(4),
  });

  cards.storageFull = insertCard(db, lists.doing, 3 * GAP, {
    code: nextCode(),
    title: 'ตรวจสอบ Server Storage เต็ม 90%',
    type: 'incident',
    priority: 'high',
    site: 'DC-Rama9',
    deviceRef: 'SRV-STORAGE-02',
    creatorId: m['วีระ ท.'],
    assigneeIds: [m['ณัฐพล ว.'], m['วีระ ท.']],
    createdAt: hoursAgo(1),
  });

  const doneId = insertCard(db, lists.done, 1 * GAP, {
    code: nextCode(),
    title: 'PM ตรวจเช็คเครื่องสำรองไฟห้อง Data Center',
    type: 'maintenance',
    priority: 'low',
    site: 'DC-Rama9',
    deviceRef: 'UPS-02',
    creatorId: m['สมชาย ก.'],
    assigneeIds: [m['อนุชา น.']],
    createdAt: hoursAgo(200),
    completedAt: hoursAgo(2),
  });
  insertSubtasks(db, doneId, TEMPLATES.pm.items, {
    doneCount: TEMPLATES.pm.items.length,
    assigneeId: m['อนุชา น.'],
    doneBy: 'อนุชา น.',
  });
  cards.done = doneId;

  cards.cctv = insertCard(db, lists.todo, 3 * GAP, {
    code: nextCode(),
    title: 'ติดตั้งกล้องวงจรปิดจุดใหม่',
    type: 'service_request',
    priority: 'low',
    site: 'HQ',
    creatorId: m['ณัฐพล ว.'],
    assigneeIds: [m['ณัฐพล ว.']],
    createdAt: hoursAgo(1),
  });

  cards.patchOs = insertCard(db, lists.waiting, 2 * GAP, {
    code: nextCode(),
    title: 'อัปเดต Patch OS Windows Server',
    type: 'change',
    priority: 'critical',
    site: 'DC-Rama9',
    deviceRef: 'SRV-AD-01',
    creatorId: m['ปรียา ส.'],
    assigneeIds: [m['สมชาย ก.']],
    createdAt: hoursAgo(0),
  });

  return cards;
}

export function seedDatabase(db) {
  const members = insertMembers(db);
  const { boardId, lists } = insertBoardAndLists(db);
  const templates = insertTemplates(db);
  const cards = insertCards(db, { members, lists, templates });
  return { members, boardId, lists, templates, cards };
}

// Run directly via `npm run seed` — seeds the DB at DB_PATH.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: db } = await import('./connection.js');
  const result = seedDatabase(db);
  console.warn(
    `Seeded ${Object.keys(result.members).length} members, ${Object.keys(result.lists).length} lists, ` +
      `${Object.keys(result.templates).length} templates, ${Object.keys(result.cards).length} cards.`,
  );
}
