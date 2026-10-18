import pg from 'pg';
const { Pool } = pg;
export function createPostgresRepository(connectionString = process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  return {
    async query(text, params) { return pool.query(text, params); },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async migrate() {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const schema = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../schema.sql'), 'utf8');
      return pool.query(schema);
    },
    async close() { await pool.end(); }
  };
}
