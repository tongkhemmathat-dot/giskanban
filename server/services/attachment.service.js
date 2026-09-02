// server/services/attachment.service.js — attachments read/write + disk
// storage (docs/04-api.md §7, docs/05-business-rules.md §7: 10MB max,
// whitelisted types). card.service.js imports listAttachments from here
// (one-directional, same pattern as comment.service.js / subtask.service.js).
import { mkdirSync, unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { toApiDateTime } from '../utils/date.js';
import { findOrCreateMemberByName } from './member.service.js';
import { logActivity } from './activity.service.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
mkdirSync(UPLOAD_DIR, { recursive: true }); // same pattern as db/connection.js's DB_PATH dir

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;

// docs/04-api.md §7: image/*, application/pdf, text/plain, .log, .csv, .zip.
// Checked by extension for .log/.csv/.zip since browsers report inconsistent
// MIME types for these (e.g. .log commonly arrives as application/octet-stream).
const ALLOWED_EXTENSIONS = new Set(['.log', '.csv', '.zip', '.pdf', '.txt']);

function fileFilter(req, file, cb) {
  const ext = extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith('image/') || ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new AppError('VALIDATION_ERROR', 'ชนิดไฟล์นี้ไม่รองรับ', 400));
  }
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

// Route middleware — attachments.routes.js uses `upload.single('file')`.
// A MulterError with code LIMIT_FILE_SIZE bubbles to middleware/error.js,
// which maps it to 413 PAYLOAD_TOO_LARGE (docs/04-api.md §1).
export const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_UPLOAD_BYTES } });

const ATTACHMENT_SELECT = `
  SELECT a.*, m.name AS uploader_name, m.color AS uploader_color
  FROM attachments a LEFT JOIN members m ON m.id = a.uploader_id
`;

function mapAttachmentRow(row) {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size,
    uploader: row.uploader_id ? { id: row.uploader_id, name: row.uploader_name, color: row.uploader_color } : null,
    createdAt: toApiDateTime(row.created_at),
  };
}

export function listAttachments(cardId) {
  return db
    .prepare(`${ATTACHMENT_SELECT} WHERE a.card_id = ? ORDER BY a.created_at`)
    .all(cardId)
    .map(mapAttachmentRow);
}

// `file` is multer's req.file — already written to UPLOAD_DIR by the time
// this runs (multer streams it to disk during multipart parsing, before the
// route handler executes).
function createAttachmentTxn(cardId, file, uploaderName) {
  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  const uploader = findOrCreateMemberByName(uploaderName);
  const info = db
    .prepare('INSERT INTO attachments (card_id, filename, stored_name, mime_type, size, uploader_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(cardId, file.originalname, file.filename, file.mimetype, file.size, uploader.id);

  logActivity({ cardId, actorName: uploaderName, action: 'attachment_added', meta: { filename: file.originalname } });

  return mapAttachmentRow(db.prepare(`${ATTACHMENT_SELECT} WHERE a.id = ?`).get(info.lastInsertRowid));
}

export function createAttachment(cardId, file, uploaderName) {
  return db.transaction(createAttachmentTxn)(cardId, file, uploaderName);
}

// Route-only: the API shape (mapAttachmentRow) never exposes stored_name, so
// the download route needs this instead to build the on-disk path.
export function getDownloadInfo(aid) {
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(aid);
  if (!row) throw new AppError('NOT_FOUND', 'ไม่พบไฟล์แนบนี้', 404);
  return { path: join(UPLOAD_DIR, row.stored_name), filename: row.filename };
}

export function deleteAttachment(aid) {
  const existing = db.prepare('SELECT * FROM attachments WHERE id = ?').get(aid);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบไฟล์แนบนี้', 404);

  db.prepare('DELETE FROM attachments WHERE id = ?').run(aid);

  try {
    unlinkSync(join(UPLOAD_DIR, existing.stored_name));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err; // real disk error — don't swallow silently
  }
}
