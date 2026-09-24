-- reply_classifier v2: never record the absence of a fact as a fact.
insert into prompt_templates (org_id, name, version, content)
select null, 'reply_classifier', 2, content || $p$
- Only record facts the candidate actually states. Never add a fact saying something was not mentioned or is unknown ("no role preference stated"); leave it out.
$p$
from prompt_templates where org_id is null and name = 'reply_classifier' and version = 1
  and not exists (select 1 from prompt_templates where org_id is null and name = 'reply_classifier' and version = 2);
update prompt_templates set active = false where org_id is null and name = 'reply_classifier' and version = 1;
