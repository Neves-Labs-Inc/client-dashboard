-- Local/CI only. Mirrors Neon's owner: no SUPERUSER, but BYPASSRLS so it can later create app_system with BYPASSRLS.
CREATE ROLE neondb_owner WITH LOGIN CREATEROLE BYPASSRLS PASSWORD 'neondb_owner_local';

CREATE DATABASE client_dashboard OWNER neondb_owner;
CREATE DATABASE client_dashboard_test OWNER neondb_owner;
