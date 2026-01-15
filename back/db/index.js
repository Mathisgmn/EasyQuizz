const { Pool } = require("pg");
const { config } = require("../config");

const buildPoolConfig = () => {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  return {
    host: process.env.PGHOST || "db",
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "postgres"
  };
};

const pool = new Pool(buildPoolConfig());

const query = (text, params) => pool.query(text, params);

const initDb = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS choices (
        id SERIAL PRIMARY KEY,
        label VARCHAR(50) NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vote_session (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        starts_at TIMESTAMP NOT NULL,
        ends_at TIMESTAMP NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        choice_id INTEGER NOT NULL,
        vote_session_id INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, vote_session_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (choice_id) REFERENCES choices(id),
        FOREIGN KEY (vote_session_id) REFERENCES vote_session(id)
      )
    `);

    for (const choice of config.choices) {
      await client.query(
        `
          INSERT INTO choices (id, label)
          VALUES ($1, $2)
          ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label
        `,
        [choice.id, choice.label]
      );
    }

    const sessionResult = await client.query(
      `
        INSERT INTO vote_session (question, starts_at, ends_at)
        VALUES ($1, NOW(), $2)
        RETURNING id
      `,
      [config.question, config.voteEndsAt]
    );

    await client.query("COMMIT");

    return sessionResult.rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  initDb
};
