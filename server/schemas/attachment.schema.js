// server/schemas/attachment.schema.js (docs/10-conventions.md §5, docs/04-api.md §7).
// The file itself is validated by multer (server/services/attachment.service.js's
// fileFilter + limits.fileSize) since it arrives as a stream, not JSON — this
// schema only covers the multipart form's text field.
import { z } from 'zod';

export const uploadAttachmentSchema = z
  .object({
    uploaderName: z.string().min(1, 'ต้องระบุชื่อผู้แนบไฟล์').max(100),
  })
  .strip();
