import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function query(label, sql) {
  const result = await client.query(sql);
  console.log(label);
  console.log(JSON.stringify(result.rows, null, 2));
}

try {
  await client.connect();
  await query(
    'drizzle schemas/tables',
    `select table_schema, table_name
     from information_schema.tables
     where table_name like '%drizzle%' or table_schema = 'drizzle'
     order by table_schema, table_name`
  );
  await query('drizzle migrations', 'select * from drizzle.__drizzle_migrations order by id');
  await query(
    'known objects',
    `select 'type' as kind, typname as name
     from pg_type
     where typname in ('account_request_status', 'document_owner_type')
     union all
     select 'table' as kind, tablename as name
     from pg_tables
     where schemaname = 'public'
       and tablename in ('account_requests', 'certificates', 'reports')
     order by kind, name`
  );
  await query(
    'selected columns',
    `select table_name, column_name, data_type
     from information_schema.columns
     where table_schema = 'public'
       and (
         (table_name = 'reports' and column_name in ('report_key', 'filters', 'summary'))
         or (table_name = 'certificates' and column_name in (
           'approval_reference_number',
           'expires_at',
           'initial_issue_date',
           'current_issue_date',
           'dg_full_name_override',
           'scope_details',
           'signed_file_url'
         ))
       )
     order by table_name, column_name`
  );
  await query(
    'document_owner_type values',
    `select e.enumlabel
     from pg_type t
     join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'document_owner_type'
     order by e.enumsortorder`
  );
} finally {
  await client.end();
}
