# mynclex/db/

MyNclex-specific database artefacts.

Every object (tables, RPCs, policies, storage buckets) must be prefixed
`nclex_`. No exceptions. This prefix is the extraction mechanism — the day
MyNclex moves to its own Supabase project, every `nclex_*` object goes,
nothing else.

Migrations land in `migrations/`.
