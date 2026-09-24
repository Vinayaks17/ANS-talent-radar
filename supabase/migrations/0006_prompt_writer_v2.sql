-- conversation_writer v2: don't imply a specific vacancy; no small talk about money.
-- v1 stays in the table (inactive) so audits can show what produced older drafts.
insert into prompt_templates (org_id, name, version, content)
select null, 'conversation_writer', 2, content || $p$
- Our first email is usually market mapping, not a specific vacancy. Unless the thread names a role, do not imply one exists; offer to share relevant roles as they come up.
- Do not comment on the candidate's pay, bonus or personal circumstances beyond acknowledging their timing.
$p$
from prompt_templates where org_id is null and name = 'conversation_writer' and version = 1
  and not exists (select 1 from prompt_templates where org_id is null and name = 'conversation_writer' and version = 2);
update prompt_templates set active = false where org_id is null and name = 'conversation_writer' and version = 1;
