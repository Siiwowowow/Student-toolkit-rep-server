// Imports
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const OpenAI = require("openai").default;

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// App & Port
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ikrarq7.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db("schoolDB");

    const classesCollection = db.collection("classes");
    const budgetCollection = db.collection("budget");
    const questionsCollection = db.collection("questions");
    const studyTasksCollection = db.collection("studyTasks");
    const usersCollection = db.collection("users");
    
   
    
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
          - Classes: ${classes.map(c => c.name).join(", ")}
          - Budget management
          - Study planner
          - AI question generator
          Always answer questions about the website politely and helpfully.
        `;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          temperature: 0.6,
          max_tokens: 300
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
      const users = await usersCollection.find().toArray();
      res.send({ success: true, data: users });
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
   // Get all classes for a specific user
app.get("/classes", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).send({ success: false, error: "Email is required" });

  try {
    const classes = await classesCollection.find({ email }).toArray();
    res.send({ success: true, data: classes });
  } catch (error) {
    res.status(500).send({ success: false, error: "Failed to fetch classes" });
  }
});

// Add a new class for a specific user
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

// Delete a class only if it belongs to the user
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
    // ✅ GET budgets (email based)
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

// ✅ POST add budget
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

// ✅ PUT update budget
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

// ✅ DELETE budget
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
    // ✅ GET study tasks (email based)
app.get("/study-tasks", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    const tasks = await studyTasksCollection.find({ email }).toArray();
    res.send({ success: true, data: tasks });
  } catch (err) {
    res.status(500).send({ success: false, message: "Server error", error: err.message });
  }
});

// ✅ POST add study task
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

// ✅ PUT update study task
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

// ✅ DELETE study task
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
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
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

    // ===== Route Info =====
    app.get("/routes-info", (req, res) => {
      res.send({
        routes: [
          { route: "/", method: "GET", description: "Test route, server is running" },
          { route: "/users", method: "GET/POST", description: "Get or create users" },
          { route: "/classes", method: "GET/POST/DELETE", description: "Manage classes" },
          { route: "/budget", method: "GET/POST/PUT/DELETE", description: "Manage budget" },
          { route: "/study-tasks", method: "GET/POST/PUT/DELETE", description: "Manage study tasks" },
          { route: "/ai-chat", method: "POST", description: "Chat with AI assistant" },
          { route: "/generate-questions", method: "POST", description: "Generate AI questions for a topic" },
        ]
      });
    });

    console.log("Connected to MongoDB ✅");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

// Test Route
app.get("/", (req, res) => res.send("Server is running ✅"));

// Start Server
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
