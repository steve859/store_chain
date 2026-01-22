-- Neon compatibility check (source DB)
-- This script is READ-ONLY.
-- Run against your SOURCE database before migrating to Neon.

\echo '=== 1) Server & DB info ==='
SELECT current_database() AS db, current_user AS "user", version() AS version;

\echo '\n=== 2) Installed extensions (verify Neon supports them) ==='
SELECT extname, extversion
FROM pg_extension
ORDER BY extname;

\echo '\n=== 3) Logical replication (publications/subscriptions/slots) ==='
-- Publications/subscriptions exist in normal Postgres, but require appropriate privileges/support.
SELECT pubname, puballtables
FROM pg_publication
ORDER BY pubname;

SELECT subname, subenabled AS enabled, subslotname AS slot_name, subconninfo AS conninfo
FROM pg_subscription
ORDER BY subname;

SELECT slot_name, plugin, slot_type, database, active
FROM pg_replication_slots
ORDER BY slot_name;

\echo '\n=== 4) Foreign data wrappers / foreign servers / foreign tables ==='
SELECT fdwname
FROM pg_foreign_data_wrapper
ORDER BY fdwname;

SELECT srvname, fdwname
FROM pg_foreign_server s
JOIN pg_foreign_data_wrapper w ON w.oid = s.srvfdw
ORDER BY srvname;

SELECT n.nspname AS schema, c.relname AS foreign_table
FROM pg_foreign_table ft
JOIN pg_class c ON c.oid = ft.ftrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname, c.relname;

\echo '\n=== 5) Unlogged tables (often fine, but worth noting) ==='
SELECT n.nspname AS schema, c.relname AS table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND c.relkind = 'r'
  AND c.relpersistence = 'u'
ORDER BY n.nspname, c.relname;

\echo '\n=== 6) Large objects (if > 0, dump/restore must include them) ==='
SELECT count(*) AS large_object_count
FROM pg_largeobject_metadata;

\echo '\n=== 7) User-defined collations (rare; empty is normal) ==='
-- Limit to collations created outside pg_catalog to avoid noisy ICU listings.
SELECT collname, collprovider, collcollate, collctype
FROM pg_collation
WHERE collnamespace <> 'pg_catalog'::regnamespace
ORDER BY collname;

\echo '\n=== 8) Summary counts ==='
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind='r') AS tables,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind='p') AS partitions,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind='m') AS matviews,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind='v') AS views;
