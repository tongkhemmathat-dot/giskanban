// server/routes/attachments.routes.js (docs/04-api.md §7) — thin: parse,
// call service, send response. No SQL / business logic here. Mounted at
// '/api' since its endpoints span two prefixes ('/cards/:id/attachments' and
// '/attachments/:aid'), same as subtasks.routes.js.
//
// `upload.single('file')` (server/services/attachment.service.js) must run
// BEFORE validate(uploadAttachmentSchema) — multer is what populates
// req.body from the multipart form's text fields; validate() would see an
// empty body if it ran first.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { uploadAttachmentSchema } from '../schemas/attachment.schema.js';
import { idParamSchema, aidParamSchema } from '../schemas/common.schema.js';
import { AppError } from '../utils/AppError.js';
import * as svc from '../services/attachment.service.js';

const r = Router();

r.post(
  '/cards/:id/attachments',
  validate(idParamSchema, 'params'),
  svc.upload.single('file'),
  validate(uploadAttachmentSchema),
  (req, res) => {
    // multer leaves req.file undefined if the 'file' field was simply never
    // sent (as opposed to rejected by fileFilter/limits, which throw earlier).
    if (!req.file) throw new AppError('VALIDATION_ERROR', 'ต้องแนบไฟล์', 400, [{ path: 'file', message: 'ต้องแนบไฟล์' }]);
    res.status(201).json(svc.createAttachment(req.params.id, req.file, req.body.uploaderName));
  },
);

r.get('/attachments/:aid/download', validate(aidParamSchema, 'params'), (req, res) => {
  const { path, filename } = svc.getDownloadInfo(req.params.aid);
  res.download(path, filename);
});

r.delete('/attachments/:aid', validate(aidParamSchema, 'params'), (req, res) => {
  svc.deleteAttachment(req.params.aid);
  res.status(204).end();
});

export default r;
