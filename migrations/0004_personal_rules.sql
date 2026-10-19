-- Personal rules (CONTEXT.md): the Owner's own merchant names and words, applied over the Template's web/rules.js.
-- Template updates never touch this table.
CREATE TABLE personal_rules (
  kind TEXT NOT NULL CHECK (kind IN ('name', 'word', 'word_in')),
  -- name:    match = the merchant name the app derives, value = the name the Owner wants to see
  -- word:    match = a word in a money-out movement's text, value = its category
  -- word_in: match = a word in a money-in movement's text, value = its category
  match TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (kind, match)
);
