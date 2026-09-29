-- Bulk write of readiness scores computed in code (one round trip per page).
-- Security invoker: RLS applies when called with a user's client.
create or replace function set_readiness(p_ids uuid[], p_scores int[])
returns int
language sql as $$
  with u as (
    update candidates c
       set readiness_score = s.score, readiness_updated_at = now()
      from unnest(p_ids, p_scores) as s(id, score)
     where c.id = s.id
    returning 1
  )
  select count(*)::int from u
$$;
