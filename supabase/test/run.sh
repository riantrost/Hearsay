#!/usr/bin/env bash
# RLS contract suite: applies schema.sql to a scratch database on local Postgres
# (with a small Supabase-environment stub) and runs every product-rule assertion.
# A clean exit + "ALL RLS ASSERTIONS PASSED" means the authority model holds.
#
#   sudo -u postgres ./run.sh        # or run as any superuser role
set -euo pipefail
cd "$(dirname "$0")"

PSQL="${PSQL:-psql}"
DB=hearsay_rls_test

$PSQL -q -c "drop database if exists $DB" -c "create database $DB"
cat rls-harness.sql ../schema.sql rls-tests.sql | $PSQL -v ON_ERROR_STOP=1 -q -d "$DB" -f -
$PSQL -q -c "drop database if exists $DB"
