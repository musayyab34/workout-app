-- Version 2: private owner-scoped documents, transactional CAS, receipts and staged imports.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.session_set_ids(owner_id uuid not null references auth.users(id) on delete cascade,set_id text not null,session_id text not null,primary key(owner_id,set_id));
create table private.form_schemas(kind text primary key, document jsonb not null);
create table public.account_sync_state(owner_id uuid primary key references auth.users(id) on delete cascade, change_version bigint not null default 0);
create table public.workout_sessions(owner_id uuid not null references auth.users(id) on delete cascade,id text not null,payload jsonb not null,server_revision bigint not null,change_version bigint not null,deleted_at timestamptz,primary key(owner_id,id));
create table public.workout_programs(like public.workout_sessions including all);
alter table public.workout_programs add foreign key(owner_id) references auth.users(id) on delete cascade;
create table public.account_preferences(like public.workout_sessions including all);
alter table public.account_preferences add foreign key(owner_id) references auth.users(id) on delete cascade;
create table public.sync_mutations(owner_id uuid not null references auth.users(id) on delete cascade,mutation_id uuid not null,request jsonb not null,receipt jsonb not null,primary key(owner_id,mutation_id));
create table public.import_batches(owner_id uuid not null references auth.users(id) on delete cascade,id uuid not null,head bigint not null,item_count integer not null check(item_count>=0),receipt jsonb,created_at timestamptz not null default now(),primary key(owner_id,id));
create table private.validated_import_items(owner_id uuid not null,batch uuid not null,item integer not null,operation jsonb not null,primary key(owner_id,batch,item),foreign key(owner_id,batch) references public.import_batches(owner_id,id) on delete cascade);
create table public.import_items(owner_id uuid not null,batch uuid not null,item integer not null,fragment integer not null,total integer not null,body text not null,checksum text not null,primary key(owner_id,batch,item,fragment),foreign key(owner_id,batch) references public.import_batches(owner_id,id) on delete cascade);
do $$ declare t text; begin foreach t in array array['account_sync_state','workout_sessions','workout_programs','account_preferences','sync_mutations','import_batches','import_items'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy own_rows on public.%I for select to authenticated using (owner_id=(select auth.uid()))',t);
 end loop;
 foreach t in array array['workout_sessions','workout_programs','account_preferences'] loop execute format('create index on public.%I(owner_id,change_version,id)',t);end loop;end $$;

create function private.matches(v jsonb,s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
#variable_conflict use_variable
declare k text; sub jsonb; n numeric; ty text; matches integer=0; begin
 if s ? 'oneOf' then for sub in select value from jsonb_array_elements(s->'oneOf') loop if private.matches(v,sub) then matches=matches+1;end if;end loop;return matches=1;end if;
 if s ? 'anyOf' then for sub in select value from jsonb_array_elements(s->'anyOf') loop if private.matches(v,sub) then return true;end if;end loop;return false;end if;
 if s ? 'const' and v<>s->'const' then return false;end if;
 if s ? 'enum' and not (s->'enum' @> jsonb_build_array(v)) then return false;end if;
 ty=s->>'type';
 if ty='null' then return v='null'::jsonb;end if;
 if ty='object' then
 if jsonb_typeof(v)<>'object' then return false;end if;
 for k in select jsonb_array_elements_text(coalesce(s->'required','[]')) loop if not v ? k then return false;end if;end loop;
 for k,sub in select * from jsonb_each(v) loop if s->'properties' ? k then if not private.matches(sub,s->'properties'->k) then return false;end if;elsif s->'additionalProperties'='false'::jsonb then return false;end if;end loop;
 elsif ty='array' then
 if jsonb_typeof(v)<>'array' then return false;end if;
 if s ? 'minItems' and jsonb_array_length(v)<(s->>'minItems')::int then return false;end if;
 if s ? 'maxItems' and jsonb_array_length(v)>(s->>'maxItems')::int then return false;end if;
 for sub in select value from jsonb_array_elements(v) loop if not private.matches(sub,s->'items') then return false;end if;end loop;
 elsif ty='string' then
 if jsonb_typeof(v)<>'string' then return false;end if;k=v#>>'{}';
 if s ? 'minLength' and length(k)<(s->>'minLength')::int then return false;end if;
 if s ? 'maxLength' and length(k)>(s->>'maxLength')::int then return false;end if;
 if s ? 'pattern' and k !~ (s->>'pattern') then return false;end if;
 if s->>'format'='date-time' then perform k::timestamptz;end if;
 if s->>'format'='uri' and k !~ '^https?://' then return false;end if;
 elsif ty in ('integer','number') then
 if jsonb_typeof(v)<>'number' then return false;end if;n=(v#>>'{}')::numeric;
 if ty='integer' and n<>trunc(n) then return false;end if;
 if s ? 'minimum' and n<(s->>'minimum')::numeric then return false;end if;
 if s ? 'maximum' and n>(s->>'maximum')::numeric then return false;end if;
 elsif ty='boolean' and jsonb_typeof(v)<>'boolean' then return false;
 end if;return true;exception when others then return false;end $$;

create function private.validate_entity(kind text,id text,v jsonb) returns void language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare schema jsonb; e jsonb; p jsonb; r jsonb; idx integer=0; ids text[]='{}'; sets text[]='{}';begin
 select document into schema from private.form_schemas where form_schemas.kind=validate_entity.kind;
 if schema is null or not private.matches(v,schema) then raise exception 'Invalid % document',kind;end if;
 if kind='preferences' then if id<>'main' then raise exception 'Invalid preferences identity';end if;return;end if;
 if kind='program' then
 if v#>>'{definition,id}'<>id or v#>>'{definition,availability}'<>'active' or (v->>'kind'='bundled-override' and id<>'beginner-conditioning') or (v->>'kind'='custom' and id in ('beginner-conditioning','pull-up-progression','future-training')) then raise exception 'Invalid program identity';end if;
 p=v#>'{definition,templates,0}';
 else
 if v->>'id'<>id then raise exception 'Session identity mismatch';end if;
 if not exists(select from pg_timezone_names where name=v->>'timeZone') then raise exception 'Invalid time zone';end if;
 perform (v->>'startLocalDate')::date;perform (v->>'endLocalDate')::date;
 if (v->>'endedAt')::timestamptz<(v->>'startedAt')::timestamptz or v->>'endLocalDate'<v->>'startLocalDate' or (v->>'createdAt')::timestamptz>(v->>'updatedAt')::timestamptz or (v->>'calculatedDurationMs')::numeric>extract(epoch from ((v->>'endedAt')::timestamptz-(v->>'startedAt')::timestamptz))*1000 then raise exception 'Invalid session chronology';end if;
 p=v->'snapshot';
 end if;
 for e in select value from jsonb_array_elements(p->'exercises') loop
 if e->>'id'=any(ids) then raise exception 'Duplicate exercise entry';end if;ids=array_append(ids,e->>'id');
 for r in select value from jsonb_array_elements(e->'sets') loop
 if r->>'id'=any(sets) then raise exception 'Duplicate prescription';end if;sets=array_append(sets,r->>'id');
 if (r->>'setNumber')::int<>array_position(array(select value->>'id' from jsonb_array_elements(e->'sets')),r->>'id') then raise exception 'Set order mismatch';end if;
 if kind='session' then
 declare actual jsonb=v->'sets'->idx;begin
 if actual is null or actual->>'templateSetId'<>r->>'id' or actual->>'exerciseEntryId'<>e->>'id' or actual->>'exerciseId'<>e->>'exerciseId' or actual->'setNumber'<>r->'setNumber' or actual->'target'<>r->'target' or actual->>'status'='pending' then raise exception 'Set references differ';end if;
 if actual->>'status'='recorded' then
 if actual->'actualReps'='null'::jsonb or actual->'activityDate'='null'::jsonb or (actual->>'activityDate')::date<(v->>'startLocalDate')::date or (actual->>'activityDate')::date>(v->>'endLocalDate')::date or (actual->>'origin'='live' and actual->'recordedAt'='null'::jsonb) then raise exception 'Invalid recorded result';end if;
 else if actual->'actualReps'<>'null'::jsonb or actual->'activityDate'<>'null'::jsonb then raise exception 'Invalid missing result';end if;end if;
 if actual->'recordedAt'<>'null'::jsonb and ((actual->>'recordedAt')::timestamptz<(v->>'startedAt')::timestamptz or (actual->>'recordedAt')::timestamptz>(v->>'endedAt')::timestamptz) then raise exception 'Invalid result timestamp';end if;
 end;idx=idx+1;
 end if;
 end loop;end loop;
 if kind='session' then
 if idx<>jsonb_array_length(v->'sets') or (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(v->'sets')) then raise exception 'Invalid set count/identity';end if;
 if (v->>'outcome'='completed')<>(not exists(select from jsonb_array_elements(v->'sets') where value->>'status'<>'recorded')) then raise exception 'Invalid outcome';end if;
 end if;
end $$;

create function private.apply_mutation(request jsonb,prevalidated boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare uid uuid=auth.uid(); k text=request->>'kind'; ident text=request->>'id'; tab text; current_row record; rev bigint; cv bigint; rec record; entity jsonb; result jsonb;begin
 if uid is null or request->>'owner' is distinct from uid::text or request->>'protocol'<>'2' then raise exception 'Authentication or protocol invalid';end if;
 insert into public.account_sync_state(owner_id) values(uid) on conflict do nothing;perform 1 from public.account_sync_state where owner_id=uid for update;
 select * into rec from public.sync_mutations where owner_id=uid and mutation_id=(request->>'mutation_id')::uuid;
 if found then if rec.request<>request then raise exception 'Mutation ID reused with different content';end if;return rec.receipt;end if;
 tab=case k when 'session' then 'workout_sessions' when 'program' then 'workout_programs' when 'preferences' then 'account_preferences' else null end;if tab is null then raise exception 'Invalid entity kind';end if;
 execute format('select payload,server_revision,change_version,deleted_at from public.%I where owner_id=$1 and id=$2',tab) into current_row using uid,ident;
 rev=current_row.server_revision;
 if request->'payload'<>'null'::jsonb then if not prevalidated then perform private.validate_entity(k,ident,request->'payload');end if;elsif k<>'session' then raise exception 'Only sessions may be deleted';end if;
 if rev is not null and request->'expected'='null'::jsonb and current_row.deleted_at is null and (current_row.payload-'revision')=((request->'payload')-'revision') then
 entity=jsonb_build_object('kind',k,'id',ident,'payload',current_row.payload,'revision',rev::text,'change',current_row.change_version::text);result=jsonb_build_object('entity',entity);
 elsif rev is distinct from (request->>'expected')::bigint or (current_row.deleted_at is not null and request->'payload'<>'null'::jsonb and coalesce((request->>'restore')::boolean,false)=false) then
 entity=jsonb_build_object('kind',k,'id',ident,'payload',case when current_row.deleted_at is null then current_row.payload else null end,'revision',rev::text,'change',current_row.change_version::text);return jsonb_build_object('conflict',true,'entity',entity);
 else
 if k='session' and request->'payload'<>'null'::jsonb then
 if current_row.payload is not null and (current_row.payload->'snapshot'<>(request->'payload')->'snapshot' or jsonb_path_query_array(current_row.payload,'$.sets[*].id')<>jsonb_path_query_array(request->'payload','$.sets[*].id')) then raise exception 'Historical prescription and identities are immutable';end if;
 insert into private.session_set_ids select uid,value->>'id',ident from jsonb_array_elements(request#>'{payload,sets}') on conflict do nothing;
 if exists(select from private.session_set_ids where owner_id=uid and session_id<>ident and set_id in(select value->>'id' from jsonb_array_elements(request#>'{payload,sets}'))) then raise exception 'Set identity already exists';end if;
 end if;
 update public.account_sync_state set change_version=change_version+1 where owner_id=uid returning change_version into cv;
 rev=coalesce(rev,0)+1;
 execute format('insert into public.%I(owner_id,id,payload,server_revision,change_version,deleted_at) values($1,$2,$3,$4,$5,$6) on conflict(owner_id,id) do update set payload=excluded.payload,server_revision=excluded.server_revision,change_version=excluded.change_version,deleted_at=excluded.deleted_at',tab) using uid,ident,case when request->'payload'='null'::jsonb then coalesce(current_row.payload,'{}') else request->'payload' end,rev,cv,case when request->'payload'='null'::jsonb then now() else null end;
 entity=jsonb_build_object('kind',k,'id',ident,'payload',request->'payload','revision',rev::text,'change',cv::text);result=jsonb_build_object('entity',entity);
 end if;
 insert into public.sync_mutations values(uid,(request->>'mutation_id')::uuid,request,result);return result;end $$;

create function public.form_mutate(request jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_mutation(request,false); $$;
create function public.form_pull(since text default '0',expected_head text default null,after_key text default '') returns jsonb language sql stable security definer set search_path='' as $$
 with head as(select coalesce((select change_version from public.account_sync_state where owner_id=auth.uid()),0) h), entities as (
 select 'session' kind,id,payload,server_revision,change_version,deleted_at from public.workout_sessions where owner_id=auth.uid()
 union all select 'program',id,payload,server_revision,change_version,deleted_at from public.workout_programs where owner_id=auth.uid()
 union all select 'preferences',id,payload,server_revision,change_version,deleted_at from public.account_preferences where owner_id=auth.uid()), page as(
 select *,lpad(change_version::text,20,'0')||':'||kind||':'||id key from entities,head where change_version>since::bigint and change_version<=h and lpad(change_version::text,20,'0')||':'||kind||':'||id>after_key order by change_version,kind,id limit 200)
 select jsonb_build_object('head',h::text,'stale',expected_head is not null and expected_head<>h::text,'entities',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'payload',case when deleted_at is null then payload else null end,'revision',server_revision::text,'change',change_version::text) order by key) from page),'[]'),'next',case when (select count(*) from page)=200 then (select max(key) from page) else null end) from head where auth.uid() is not null;
 $$;

create function public.form_import_begin(batch uuid,head text,item_count integer,intended_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
begin if auth.uid() is null or auth.uid() is distinct from intended_owner then raise exception 'Authentication required';end if;
 insert into public.import_batches(owner_id,id,head,item_count) values(auth.uid(),batch,head::bigint,item_count) on conflict do nothing;
 if not exists(select from public.import_batches b where owner_id=auth.uid() and id=batch and b.head=head::bigint and b.item_count=form_import_begin.item_count) then raise exception 'Batch identity reused';end if;return coalesce((select receipt from public.import_batches where owner_id=auth.uid() and id=batch),jsonb_build_object('staged',true));end $$;
create function public.form_import_chunk(batch uuid,item integer,fragment integer,total integer,body text,checksum text,intended_owner uuid) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare assembled text;pieces integer;op jsonb;begin if auth.uid() is null or auth.uid() is distinct from intended_owner or fragment<0 or fragment>=total or total<1 or octet_length(body)>240000 or item<0 then raise exception 'Invalid chunk';end if;
 if not exists(select from public.import_batches b where owner_id=auth.uid() and id=batch and item<b.item_count and receipt is null) then raise exception 'Batch unavailable';end if;
 insert into public.import_items values(auth.uid(),batch,item,fragment,total,body,checksum) on conflict do nothing;
 if not exists(select from public.import_items i where owner_id=auth.uid() and i.batch=form_import_chunk.batch and i.item=form_import_chunk.item and i.fragment=form_import_chunk.fragment and i.body=form_import_chunk.body and i.total=form_import_chunk.total and i.checksum=form_import_chunk.checksum) then raise exception 'Chunk reused';end if;
 select count(*),string_agg(i.body,'' order by i.fragment) into pieces,assembled from public.import_items i where owner_id=auth.uid() and i.batch=batch and i.item=item;
 if pieces=total then
 if exists(select from public.import_items i where owner_id=auth.uid() and i.batch=batch and i.item=item and (i.total<>total or i.checksum<>checksum)) or encode(sha256(convert_to(assembled,'UTF8')),'hex')<>checksum then raise exception 'Invalid chunk checksum or count';end if;
 op=assembled::jsonb;
 if op->>'owner' is distinct from auth.uid()::text or op->>'protocol'<>'2' or op->>'kind' not in ('session','program','preferences') then raise exception 'Invalid import operation';end if;
 if op->'payload'<>'null'::jsonb then perform private.validate_entity(op->>'kind',op->>'id',op->'payload');end if;
 insert into private.validated_import_items values(auth.uid(),batch,item,op) on conflict do nothing;
 end if;end $$;
create function public.form_import_commit(batch uuid,intended_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare b record;i integer;assembled text;expected text;fragments integer;parts integer;result jsonb;op jsonb;results jsonb='[]';begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 insert into public.account_sync_state(owner_id) values(auth.uid()) on conflict do nothing;perform 1 from public.account_sync_state where owner_id=auth.uid() for update;
 select * into b from public.import_batches where owner_id=auth.uid() and id=batch for update;if not found then raise exception 'Batch missing';end if;if b.receipt is not null then return b.receipt;end if;
 if b.head<>(select change_version from public.account_sync_state where owner_id=auth.uid()) then raise exception 'Preview stale; refresh before importing';end if;
 for i in 0..b.item_count-1 loop
 select string_agg(body,'' order by fragment),min(checksum),min(total),count(*) into assembled,expected,fragments,parts from public.import_items where owner_id=auth.uid() and import_items.batch=form_import_commit.batch and item=i;
 if parts<>fragments or assembled is null then raise exception 'Incomplete or inconsistent import';end if;
 select operation into op from private.validated_import_items where owner_id=auth.uid() and validated_import_items.batch=form_import_commit.batch and validated_import_items.item=i;
 if op is null then raise exception 'Import item was not validated';end if;
 result=private.apply_mutation(op,true);if result ? 'conflict' then raise exception 'Import conflict; nothing applied';end if;
 end loop;
 result=jsonb_build_object('committed',true,'count',b.item_count);update public.import_batches set receipt=result where owner_id=auth.uid() and id=batch;delete from public.import_items where owner_id=auth.uid() and import_items.batch=form_import_commit.batch;delete from private.validated_import_items where owner_id=auth.uid() and validated_import_items.batch=form_import_commit.batch;return result;end $$;

revoke execute on all functions in schema private from public,anon,authenticated;
revoke execute on function public.form_mutate(jsonb),public.form_pull(text,text,text),public.form_import_begin(uuid,text,integer,uuid),public.form_import_chunk(uuid,integer,integer,integer,text,text,uuid),public.form_import_commit(uuid,uuid) from public,anon;
grant execute on function public.form_mutate(jsonb),public.form_pull(text,text,text),public.form_import_begin(uuid,text,integer,uuid),public.form_import_chunk(uuid,integer,integer,integer,text,text,uuid),public.form_import_commit(uuid,uuid) to authenticated;
create function public.form_import_cancel(batch uuid,intended_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb;begin
 if auth.uid() is null or auth.uid() is distinct from intended_owner then raise exception 'Authentication required';end if;
 perform 1 from public.account_sync_state where owner_id=auth.uid() for update;
 select b.receipt into receipt from public.import_batches b where owner_id=auth.uid() and id=batch for update;
 if receipt is not null then return receipt;end if;
 delete from public.import_batches where owner_id=auth.uid() and id=batch;return jsonb_build_object('canceled',true);
 end $$;
revoke execute on function public.form_import_cancel(uuid,uuid) from public,anon;
grant execute on function public.form_import_cancel(uuid,uuid) to authenticated;
