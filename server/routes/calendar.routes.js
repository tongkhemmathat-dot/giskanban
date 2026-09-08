// server/routes/calendar.routes.js (docs/04-api.md §12) — thin: parse, call
// service, send response. No SQL / business logic here.
//
// `/connect/:memberId` and `/callback` are the two exceptions to "every route
// returns JSON" in this codebase — they're mid-OAuth-flow browser
// navigations (the user's browser, not an XHR, follows these redirects to
// and from Microsoft's login page), so they always end in `res.redirect(...)`
// and `/callback` has its own try/catch instead of delegating to the shared
// `errorHandler` middleware, since it must redirect even on failure.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { memberIdParamSchema, eventsRangeQuerySchema } from '../schemas/calendar.schema.js';
import * as svc from '../services/calendar.service.js';

const r = Router();

r.get('/connect/:memberId', validate(memberIdParamSchema, 'params'), (req, res) => {
  res.redirect(svc.buildAuthorizationUrl(req.params.memberId));
});

r.get('/callback', async (req, res) => {
  if (req.query.error) {
    res.redirect(`/#/calendar?error=${encodeURIComponent(String(req.query.error_description || req.query.error))}`);
    return;
  }
  try {
    await svc.handleOAuthCallback(req.query.code, req.query.state);
    res.redirect('/#/calendar?connected=1');
  } catch (err) {
    res.redirect(`/#/calendar?error=${encodeURIComponent(err.message)}`);
  }
});

r.get('/connections', (req, res) => {
  res.json({ items: svc.listConnectionStatuses() });
});

r.delete('/connections/:memberId', validate(memberIdParamSchema, 'params'), (req, res) => {
  svc.disconnectMember(req.params.memberId);
  res.status(204).end();
});

r.get('/events', validate(eventsRangeQuerySchema, 'query'), (req, res) => {
  res.json({ items: svc.getMergedEvents(req.query.start, req.query.end) });
});

export default r;
