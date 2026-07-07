import pg from 'pg';
import 'dotenv/config';

const url = process.env.DATABASE_URL;
console.log(
  'Connecting with:',
  url ? url.replace(/:[^:@]+@/, ':****@') : 'UNDEFINED - .env not loaded!'
);

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });

client
  .connect()
  .then(() => {
    console.log('CONNECTED SUCCESSFULLY');
    return client.query('SELECT current_database(), current_user, version()');
  })
  .then((res) => {
    console.log(res.rows[0]);
    return client.end();
  })
  .catch((err) => {
    console.error('CONNECTION FAILED:', err.message);
    console.error('Full error:', err);
  });
