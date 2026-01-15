const { Client } = require("pg");
const { getConfig } = require("../config");

const buildClientConfig = () => {
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

const client = new Client(buildClientConfig());

const connect = async () => {
  if (!client._connected) {
    await client.connect();
    client._connected = true;
  }
};

const query = async (text, params) => {
  await connect();
  return client.query(text, params);
};

const initDb = async () => {
  await connect();

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
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        choice_id INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (choice_id) REFERENCES choices(id)
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

    const config = getConfig();

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
        SELECT 1
        FROM vote_session
        LIMIT 1
      `
    );

    if (sessionResult.rowCount === 0) {
      await client.query(
        `
          INSERT INTO vote_session (question, starts_at, ends_at)
          VALUES ($1, NOW(), $2)
        `,
        [config.question, config.voteEndsAt]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const getCurrentConfig = async () => {
  const sessionResult = await query(
    `
      SELECT id, question, ends_at
      FROM vote_session
      ORDER BY id DESC
      LIMIT 1
    `
  );

  const choicesResult = await query(
    `
      SELECT id, label
      FROM choices
      ORDER BY id
    `
  );

  const config = getConfig();

  if (sessionResult.rowCount === 0) {
    return {
      sessionId: null,
      question: config.question,
      voteEndsAt: config.voteEndsAt,
      choices: config.choices
    };
  }

  const session = sessionResult.rows[0];

  return {
    sessionId: session.id,
    question: session.question,
    voteEndsAt: new Date(session.ends_at).toISOString(),
    choices: choicesResult.rows.map((choice) => ({
      id: choice.id,
      label: choice.label,
      qrCodeUrl: `/qrcodes/${choice.id}`
    }))
  };
};

const createVoteSession = async ({ question, voteEndsAt, choices }) => {
  await connect();

  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE votes");
    await client.query("TRUNCATE vote_session");

    const choiceIds = choices.map((choice) => choice.id);
    for (const choice of choices) {
      await client.query(
        `
          INSERT INTO choices (id, label)
          VALUES ($1, $2)
          ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label
        `,
        [choice.id, choice.label]
      );
    }

    if (choiceIds.length > 0) {
      const placeholders = choiceIds
        .map((_, index) => `$${index + 1}`)
        .join(", ");
      await client.query(
        `
          DELETE FROM choices
          WHERE id NOT IN (${placeholders})
        `,
        choiceIds
      );
    }

    await client.query(
      `
        INSERT INTO vote_session (question, starts_at, ends_at)
        VALUES ($1, NOW(), $2)
      `,
      [question, voteEndsAt]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

module.exports = {
  client,
  query,
  initDb,
  getCurrentConfig,
  createVoteSession
};
