// Imports
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const OpenAI = require("openai").default;

const app = express();
const port = process.env.PORT || 3000;

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// CORS Configuration
const allowedOrigins = [
  "https://student-toolkit-17af6.web.app",
  "https://student-toolkit-17af6.firebaseapp.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".web.app") ||
        origin.endsWith(".firebaseapp.com") ||
        origin.startsWith("http://localhost:")
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Fallback allow to avoid cross-origin blocking
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);

app.use(express.json());

// MongoDB Configuration
const dbUser = (process.env.DB_USER || "").replace(/^['"]|['"]$/g, "").trim();
const dbPass = (process.env.DB_PASS || "").replace(/^['"]|['"]$/g, "").trim();

const uri =
  process.env.MONGODB_URI ||
  `mongodb+srv://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPass)}@cluster0.ikrarq7.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 10000,
});

const db = client.db("schoolDB");
const classesCollection = db.collection("classes");
const budgetCollection = db.collection("budget");
const questionsCollection = db.collection("questions");
const studyTasksCollection = db.collection("studyTasks");
const usersCollection = db.collection("users");

let isConnecting = false;
let isConnected = false;

async function ensureConnected() {
  if (isConnected) return;
  if (isConnecting) {
    // Wait until connection attempt finishes
    let waitCount = 0;
    while (isConnecting && waitCount < 20) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      waitCount++;
    }
    if (isConnected) return;
  }

  isConnecting = true;
  try {
    await client.connect();
    isConnected = true;
    console.log("Connected to MongoDB ✅");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    throw err;
  } finally {
    isConnecting = false;
  }
}

// Ensure DB is ready before API operations
app.use(async (req, res, next) => {
  if (req.path === "/" || req.method === "OPTIONS") {
    return next();
  }

  try {
    await ensureConnected();
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message:
        "Database connection error. Please make sure MongoDB Atlas Network Access allows connections from anywhere (0.0.0.0/0).",
      error: err.message,
    });
  }
});

// ===== Test & Info Routes =====
app.get("/", (req, res) => {
  res.send("Server is running Student toolkit");
});

app.get("/health", async (req, res) => {
  try {
    await ensureConnected();
    res.json({ success: true, status: "healthy", database: "connected" });
  } catch (err) {
    res.status(500).json({ success: false, status: "unhealthy", error: err.message });
  }
});

app.get("/routes-info", (req, res) => {
  res.send({
    routes: [
      { route: "/", method: "GET", description: "Test route, server is running" },
      { route: "/health", method: "GET", description: "Health check and DB status" },
      { route: "/users", method: "GET/POST", description: "Get or create users" },
      { route: "/classes", method: "GET/POST/PUT/DELETE", description: "Manage classes" },
      { route: "/budget", method: "GET/POST/PUT/DELETE", description: "Manage budget" },
      { route: "/study-tasks", method: "GET/POST/PUT/DELETE", description: "Manage study tasks" },
      { route: "/ai-chat", method: "POST", description: "Chat with AI assistant" },
      { route: "/generate-questions", method: "POST", description: "Generate AI questions for a topic" },
    ],
  });
});

// ===== AI Chatbot =====
app.post("/ai-chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).send({ success: false, error: "Message is required" });

    // Fetch current classes dynamically
    const classes = await classesCollection.find().toArray();

    // System prompt with website info
    const systemPrompt = `
      You are a helpful AI assistant for AcademiaX.
      Website features:
      - Users: register/login
      - Classes: ${classes.map((c) => c.subject || c.name || "").join(", ")}
      - Budget management
      - Study planner
      - AI question generator
      Always answer questions about the website politely and helpfully.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.6,
      max_tokens: 300,
    });

    const reply = response.choices[0].message.content;
    res.send({ success: true, reply });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// ===== Users =====
app.get("/users", async (req, res) => {
  try {
    const users = await usersCollection.find({}).toArray();

    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, message: "No users found" });
    }

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users", error: error.message });
  }
});

app.post("/users", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).send({ success: false, error: "Email is required" });

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) return res.send({ success: true, message: "User exists", data: existingUser });

    const user = { ...req.body, createdAt: new Date(), last_log_in: new Date() };
    const result = await usersCollection.insertOne(user);
    res.send({ success: true, data: { ...user, _id: result.insertedId } });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

// ===== Classes =====
app.get("/classes", async (req, res) => {
  const { email } = req.query;

  try {
    let query = {};
    if (email) {
      query.email = email;
    }

    const classes = await classesCollection.find(query).toArray();
    res.send({ success: true, data: classes });
  } catch (error) {
    res.status(500).send({ success: false, error: "Failed to fetch classes" });
  }
});

app.post("/classes", async (req, res) => {
  const classData = req.body;
  if (!classData.email) return res.status(400).send({ success: false, error: "Email is required" });

  try {
    const result = await classesCollection.insertOne(classData);
    res.send({ success: true, data: { ...classData, _id: result.insertedId } });
  } catch (error) {
    res.status(500).send({ success: false, error: "Failed to add class" });
  }
});

app.put("/classes/:id", async (req, res) => {
  const { id } = req.params;
  const { email, subject, instructor, day, startTime, endTime, location } = req.body;
  if (!email) return res.status(400).send({ success: false, error: "Email is required" });
  if (!subject || !instructor || !day || !startTime || !endTime) {
    return res.status(400).send({ success: false, error: "Required class details are missing" });
  }

  try {
    const result = await classesCollection.updateOne(
      { _id: new ObjectId(id), email },
      { $set: { subject, instructor, day, startTime, endTime, location: location || "" } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, error: "Class not found" });
    }
    res.send({ success: true, data: result });
  } catch (error) {
    res.status(500).send({ success: false, error: "Failed to update class" });
  }
});

app.delete("/classes/:id", async (req, res) => {
  const { id } = req.params;
  const { email } = req.query;
  if (!email) return res.status(400).send({ success: false, error: "Email is required" });

  try {
    const result = await classesCollection.deleteOne({ _id: new ObjectId(id), email });
    if (result.deletedCount === 0) return res.status(403).send({ success: false, error: "Not authorized" });
    res.send({ success: true, data: result });
  } catch (error) {
    res.status(500).send({ success: false, error: "Failed to delete class" });
  }
});

// ===== Budget =====
app.get("/budget", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    const budget = await budgetCollection.find({ email }).toArray();
    res.send(budget);
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error", error: err.message });
  }
});

app.post("/budget", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    const result = await budgetCollection.insertOne(req.body);
    res.send({ success: true, data: result });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error", error: err.message });
  }
});

app.put("/budget/:id", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    const result = await budgetCollection.updateOne(
      { _id: new ObjectId(req.params.id), email },
      { $set: req.body }
    );
    res.send({ success: true, data: result });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error", error: err.message });
  }
});

app.delete("/budget/:id", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    const result = await budgetCollection.deleteOne({
      _id: new ObjectId(req.params.id),
      email,
    });
    res.send({ success: true, data: result });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error", error: err.message });
  }
});

// ===== Study Planner =====
app.get("/study-tasks", async (req, res) => {
  try {
    const { email } = req.query;

    let query = {};
    if (email) {
      query.email = email;
    }

    const tasks = await studyTasksCollection.find(query).toArray();
    res.send({
      success: true,
      data: tasks,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});

app.post("/study-tasks", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    const task = { ...req.body, createdAt: new Date(), completed: false };
    const result = await studyTasksCollection.insertOne(task);
    res.send({ success: true, data: { ...task, _id: result.insertedId } });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error", error: err.message });
  }
});

app.put("/study-tasks/:id", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    const result = await studyTasksCollection.updateOne(
      { _id: new ObjectId(req.params.id), email },
      { $set: req.body }
    );
    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "Task not found or not authorized" });
    }
    res.send({ success: true, data: result });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error", error: err.message });
  }
});

app.delete("/study-tasks/:id", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    const result = await studyTasksCollection.deleteOne({
      _id: new ObjectId(req.params.id),
      email,
    });
    if (result.deletedCount === 0) {
      return res.status(404).send({ success: false, message: "Task not found or not authorized" });
    }
    res.send({ success: true, data: result });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error", error: err.message });
  }
});

// ===== AI Question Generator =====
app.post("/generate-questions", async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).send({ success: false, error: "Topic required" });

    const system = `You are an exam generator. Return STRICT JSON:
    { "mcq":[{"question":string,"options":[string,string,string,string],"correct":string}],
      "trueFalse":[{"question":string,"answer":boolean}],
      "short":[{"question":string,"answer":string}]}`;

    const user = `Generate 5 MCQs, 5 True/False, 5 Short Answer for Topic: "${topic}"`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });

    const data = JSON.parse(response.choices[0].message.content);
    await questionsCollection.insertOne({ topic, questions: data, createdAt: new Date() });
    res.send({ success: true, data });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message || "Server error" });
  }
});

// Start Server locally if run directly
if (require.main === module) {
  const server = app.listen(port, () => console.log(`🚀 Server running on port ${port}`));

  process.on("SIGINT", async () => {
    console.log("Shutting down server...");
    try {
      await client.close();
      server.close(() => {
        console.log("Server closed.");
        process.exit(0);
      });
    } catch (err) {
      console.error("Error during shutdown", err);
      process.exit(1);
    }
  });
}

// Export for Vercel Serverless Function
module.exports = app;