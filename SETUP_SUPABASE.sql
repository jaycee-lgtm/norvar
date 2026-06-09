
-- Norvar.io v2 — run once in Supabase SQL Editor before norvar_ingest.py

create extension if not exists vector;

-- Migrate from v1 schema if present
drop table if exists public.regulatory_chunks cascade;
drop table if exists public.regulatory_sources cascade;
drop function if exists public.match_regulatory_chunks(vector, float, int);

create table if not exists regulatory_chunks (
    id              text primary key,
    reg_name        text not null,
    reg_abbr        text not null,
    domain          text not null,
    subdomain       text,
    jurisdiction    text not null,
    state           text,
    city            text,
    status          text,
    year            integer,
    chunk_index     integer not null,
    chunk_text      text not null,
    embedding       vector(1024),
    source_url      text,
    threshold       text,
    sensitive_data  boolean default false,
    gpc_required    boolean default false,
    notes           text,
    ingested_at     timestamptz default now(),
    corpus_version  text
);

create index if not exists regulatory_chunks_embedding_idx
    on regulatory_chunks
    using hnsw (embedding vector_cosine_ops);

create or replace function match_regulatory_chunks (
    query_embedding vector(1024),
    match_threshold float default 0.5,
    match_count     int default 10,
    filter_domain   text default null,
    filter_state    text default null,
    filter_status   text default null
)
returns table (
    id text, reg_name text, reg_abbr text, domain text,
    jurisdiction text, state text, chunk_text text,
    source_url text, notes text, similarity float
)
language sql stable as $$
    select id, reg_name, reg_abbr, domain, jurisdiction, state,
           chunk_text, source_url, notes,
           1 - (embedding <=> query_embedding) as similarity
    from regulatory_chunks
    where 1 - (embedding <=> query_embedding) > match_threshold
      and (filter_domain is null or domain = filter_domain)
      and (filter_state  is null or state  = filter_state)
      and (filter_status is null or status = filter_status)
    order by embedding <=> query_embedding
    limit match_count;
$$;

grant select on public.regulatory_chunks to authenticated;
grant all on public.regulatory_chunks to service_role;
grant execute on function public.match_regulatory_chunks to authenticated, service_role;

-- Assessments (saved compliance runs per Clerk user)
create table if not exists assessments (
    id            uuid primary key default gen_random_uuid(),
    user_id       text not null,
    title         text,
    description   text not null,
    result        jsonb not null,
    messages      jsonb not null default '[]'::jsonb,
    risk_tier     text,
    risk_score    integer,
    domains       text[],
    jurisdictions text[],
    created_at    timestamptz default now()
);

-- Upgrade path for existing deployments
alter table assessments add column if not exists title    text;
alter table assessments add column if not exists messages jsonb not null default '[]'::jsonb;

drop index if exists assessments_created_at_idx;
drop index if exists assessments_user_id_idx;
create index if not exists assessments_user_id_idx
    on assessments (user_id, created_at desc);

grant all on public.assessments to service_role;
