import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function columnExists(tableName, columnName) {
  const result = await client.query(
    `select 1
     from information_schema.columns
     where table_schema = 'public'
       and table_name = $1
       and column_name = $2`,
    [tableName, columnName]
  );
  return result.rowCount > 0;
}

async function run() {
  await client.connect();

  if (!(await columnExists('certificates', 'signed_file_url'))) {
    await client.query('alter table "certificates" add column "signed_file_url" text');
    console.log('Added certificates.signed_file_url');
  } else {
    console.log('certificates.signed_file_url already exists');
  }

  if (!(await columnExists('reports', 'report_key'))) {
    await client.query(
      `alter table "reports" add column "report_key" varchar(50) default 'processing_delay' not null`
    );
    console.log('Added reports.report_key');
  } else {
    console.log('reports.report_key already exists');
  }

  if (!(await columnExists('reports', 'filters'))) {
    await client.query(`alter table "reports" add column "filters" jsonb default '{}'::jsonb not null`);
    console.log('Added reports.filters');
  } else {
    console.log('reports.filters already exists');
  }

  if (!(await columnExists('reports', 'summary'))) {
    await client.query('alter table "reports" add column "summary" jsonb');
    console.log('Added reports.summary');
  } else {
    console.log('reports.summary already exists');
  }

  await client.query(
    `insert into drizzle.__drizzle_migrations(hash, created_at)
     select $1, $2
     where not exists (
       select 1 from drizzle.__drizzle_migrations where created_at = $2
     )`,
    ['manual-local-repair-through-0007', '1785756394553']
  );
  console.log('Marked local Drizzle journal through 0007_curly_quentin_quire');
}

run()
  .finally(() => client.end())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
