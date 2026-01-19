const { neon } = require("@neondatabase/serverless");
const { getConfig } = require("../config");

const getDatabaseUrl = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  return process.env.DATABASE_URL;
};

const sql = neon(getDatabaseUrl(), { fullResults: true });

const normalizeResult = (result) => {
  if (result && typeof result === "object") {
    if (Array.isArray(result.rows)) {
      return result;
    }
    if ("rowCount" in result) {
      return { rows: result.rows || [], rowCount: result.rowCount };
    }
  }
  if (Array.isArray(result)) {
    return { rows: result, rowCount: result.length };
  }
  return { rows: [], rowCount: 0 };
};

const query = async (text, params) => {
  const result = await sql(text, params);
  return normalizeResult(result);
};

const initDb = async () => {
  try {
    await query("BEGIN");

    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS choices (
        id SERIAL PRIMARY KEY,
        label VARCHAR(50) NOT NULL
      )
    `);

    await query(`
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

    await query(`
      CREATE TABLE IF NOT EXISTS vote_session (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        starts_at TIMESTAMP NOT NULL,
        ends_at TIMESTAMP NOT NULL
      )
    `);

    const config = getConfig();

    for (const choice of config.choices) {
      await query(
        `
          INSERT INTO choices (id, label)
          VALUES ($1, $2)
          ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label
        `,
        [choice.id, choice.label]
      );
    }

    const sessionResult = await query(
      `
        SELECT 1
        FROM vote_session
        LIMIT 1
      `
    );

    if (sessionResult.rowCount === 0) {
      await query(
        `
          INSERT INTO vote_session (question, starts_at, ends_at)
          VALUES ($1, NOW(), $2)
        `,
        [config.question, config.voteEndsAt]
      );
    }

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
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
  try {
    await query("BEGIN");
    await query("TRUNCATE votes");
    await query("TRUNCATE vote_session");

    const choiceIds = choices.map((choice) => choice.id);
    for (const choice of choices) {
      await query(
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
      await query(
        `
          DELETE FROM choices
          WHERE id NOT IN (${placeholders})
        `,
        choiceIds
      );
    }

    await query(
      `
        INSERT INTO vote_session (question, starts_at, ends_at)
        VALUES ($1, NOW(), $2)
      `,
      [question, voteEndsAt]
    );

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

module.exports = {
  query,
  initDb,
  getCurrentConfig,
  createVoteSession
};
