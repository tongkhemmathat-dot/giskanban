-- SLA pause (backlog idea: "Waiting Vendor" shouldn't count against SLA —
-- the team isn't the one dragging their feet while a vendor ticket is open).
-- lists.pauses_sla mirrors the existing is_done column's shape/precedent
-- (a static per-list flag, seed-only, no admin UI to toggle it -- same as
-- is_done). cards.sla_paused_at is bookkeeping only: set when a card enters
-- a pauses_sla list, used to push sla_due_at forward by the paused duration
-- when it leaves (server/services/card.service.js's moveCardTxn).
ALTER TABLE lists ADD COLUMN pauses_sla INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN sla_paused_at TEXT;

UPDATE lists SET pauses_sla = 1 WHERE slug = 'waiting';
