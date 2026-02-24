require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const db = require("./db");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Load documentation
const docs = JSON.parse(fs.readFileSync("./docs.json"));

// Gemini Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Improved doc matching
function findRelevantDoc(question) {
  const lowerQuestion = question.toLowerCase();

  return docs.find(doc => {
    const lowerTitle = doc.title.toLowerCase();
    const lowerContent = doc.content.toLowerCase();

    return (
      lowerQuestion.includes(lowerTitle) ||
      lowerTitle.split(" ").some(word =>
        lowerQuestion.includes(word)
      )
    );
  });
}

// =============================
// CHAT ENDPOINT
// =============================
app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: "Missing sessionId or message" });
  }

  try {
    // Create session if not exists
    db.run(`INSERT OR IGNORE INTO sessions(id) VALUES(?)`, [sessionId]);

    // Save user message
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

      return res.json({ reply: fallback, tokensUsed: 0 });
    }

    // Get last 10 messages (5 pairs)
    db.all(
      `SELECT role, content FROM messages
       WHERE session_id=?
       ORDER BY created_at DESC
       LIMIT 10`,
      [sessionId],
      async (err, rows) => {
        if (err) {
          console.error("DB error:", err);
          return res.json({ reply: "Database error.", tokensUsed: 0 });
        }

        const history = rows.reverse();

        const prompt = `
You are a support assistant.

STRICT RULES:
1. Answer ONLY using the documentation provided below.
2. Do NOT use external knowledge.
3. If answer not found, reply exactly:
"Sorry, I don’t have information about that."

Documentation:
${relevantDoc.content}

Conversation History:
${history.map(h => `${h.role}: ${h.content}`).join("\n")}

User Question:
${message}
`;

        try {
          const result = await model.generateContent(prompt);
          const response = await result.response;
          const reply = response.text();

          // Save assistant reply
          db.run(
            `INSERT INTO messages(session_id, role, content) VALUES(?,?,?)`,
            [sessionId, "assistant", reply]
          );

          res.json({
            reply,
            tokensUsed: 0
          });

        } catch (geminiError) {
          console.error("Gemini error:", geminiError);

          const fallback = "Sorry, I don’t have information about that.";

          db.run(
            `INSERT INTO messages(session_id, role, content) VALUES(?,?,?)`,
            [sessionId, "assistant", fallback]
          );

          res.json({ reply: fallback, tokensUsed: 0 });
        }
      }
    );

  } catch (error) {
    console.error("Server error:", error);
    res.json({ reply: "Server error occurred.", tokensUsed: 0 });
  }
});

// =============================
// FETCH CONVERSATION
// =============================
// app.get("/api/conversations/:sessionId", (req, res) => {
//   db.all(
//     `SELECT role, content, created_at
//      FROM messages
//      WHERE session_id=?
//      ORDER BY created_at ASC`,
//     [req.params.sessionId],
//     (err, rows) => {
//       if (err) return res.json([]);
//       res.json(rows);
//     }
//   );
// });

// =============================
// LIST SESSIONS
// =============================
// app.get("/api/sessions", (req, res) => {
//   db.all(
//     `SELECT id, updated_at FROM sessions`,
//     [],
//     (err, rows) => {
//       if (err) return res.json([]);
//       res.json(rows);
//     }
//   );
// });
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
// Test Route
app.get("/api/conversations/:sessionId", (req, res) => {
  db.all(
    `SELECT role, content, created_at
     FROM messages
     WHERE session_id=?
     ORDER BY created_at ASC`,
    [req.params.sessionId],  // ✅ req is valid here
    (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    }
  );
});
// app.get("/test", (req, res) => {
//   res.json({ message: "Backend working with Gemini!" });
// });

// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => console.log(`Server running on ${PORT}`));
