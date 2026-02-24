require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// ================= DATABASE =================
const db = new sqlite3.Database("./database.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      role TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ================= RATE LIMIT =================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// ================= LOAD DOCS =================
const docs = JSON.parse(fs.readFileSync("./docs.json"));

// ================= GEMINI =================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ================= DOC MATCH =================
function findRelevantDoc(question) {
  const questionWords = question
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(" ");

  return docs.find(doc => {
    const docText = (doc.title + " " + doc.content)
      .toLowerCase()
      .replace(/[^\w\s]/g, "");

    return questionWords.some(word => docText.includes(word));
  });
}

// ================= CHAT =================
app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: "Missing sessionId or message" });
  }

  try {
    db.run(`INSERT OR IGNORE INTO sessions(id) VALUES(?)`, [sessionId]);

    db.run(
      `INSERT INTO messages(session_id, role, content) VALUES(?,?,?)`,
      [sessionId, "user", message]
    );

    const relevantDoc = findRelevantDoc(message);

    if (!relevantDoc) {
      const fallback = "Sorry, I don’t have information about that.";

      db.run(
        `INSERT INTO messages(session_id, role, content) VALUES(?,?,?)`,
        [sessionId, "assistant", fallback]
      );

      return res.json({ reply: fallback });
    }

    const prompt = `
Answer ONLY using the documentation below.
If answer not found, reply exactly:
"Sorry, I don’t have information about that."

Documentation:
${relevantDoc.content}

User Question:
${message}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const reply = response.text();

    db.run(
      `INSERT INTO messages(session_id, role, content) VALUES(?,?,?)`,
      [sessionId, "assistant", reply]
    );

    res.json({ reply });

  } catch (error) {
    console.error("Server Error:", error);
    res.json({ reply: "Sorry, I don’t have information about that." });
  }
});

// ================= GET CONVERSATION =================
app.get("/api/conversations/:sessionId", (req, res) => {
  db.all(
    `SELECT role, content, created_at
     FROM messages
     WHERE session_id=?
     ORDER BY created_at ASC`,
    [req.params.sessionId],
    (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    }
  );
});

// ================= LIST SESSIONS =================
app.get("/api/sessions", (req, res) => {
  db.all(`SELECT id, updated_at FROM sessions`, [], (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});

// ================= TEST =================
app.get("/test", (req, res) => {
  res.json({ message: "Backend working!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
