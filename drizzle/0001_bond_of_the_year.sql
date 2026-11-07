-- Dear You · Bond of the Year edition
-- Data migration: the public competition is database-driven, never hardcoded in the UI.
-- Entry is free; Premium membership and Love Coins are not part of eligibility or judging.

INSERT INTO "competitions" (
  "slug", "title", "description", "rules", "criteria", "starts_at", "ends_at", "status", "created_at", "updated_at"
)
VALUES (
  'bond-of-the-year-2026',
  'Bond of the Year',
  'Celebrate the person who makes ordinary days feel a little more like home. One true story, written in your own words. Every eligible entry is read by people and scored with the rubric below — Premium, purchases, and Love Coins never affect eligibility, judging, or ranking.',
  '["Open to active Dear You members who are 18 or older and eligible to enter where they live.","Tell one original story about a real bond. Keep it kind, and do not include other people''s private contact details or information they have not agreed to share.","One entry per member. Entries close at 23:59 UTC on February 14, 2027, and every submission is held for human moderation before it appears publicly.","Disqualifications include plagiarism, harassment, unsafe content, duplicate accounts, and promotional posts.","Entry is free. Premium purchases, paid features, and Love Coins have no influence on judging, scoring, or ranking — no purchase is necessary to enter or win."]',
  '[{"name":"Thoughtfulness & specificity","description":"A sincere, personal detail that helps the bond feel real.","weight":40},{"name":"Shared-memory storytelling","description":"A clear, engaging moment that shows what the relationship means to you.","weight":35},{"name":"Kindness & respect","description":"A warm, respectful story that honors the people involved.","weight":25}]',
  TIMESTAMPTZ '2026-01-01T00:00:00Z',
  TIMESTAMPTZ '2027-02-14T23:59:59Z',
  'open',
  now(),
  now()
)
ON CONFLICT ("slug") DO NOTHING;
