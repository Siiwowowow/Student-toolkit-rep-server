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
    const studyTasksCollection = db.collection("studyTasks"); // New collection for study planner
    const usersCollection = db.collection("users"); 


    //=======user rote====
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send({ success: true, data: users });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });
    // Create new user
// Create new user (only if not exists)
app.post("/users", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).send({ success: false, error: "Email is required" });
    }

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });

    if (existingUser) {
      // User already exists, return existing user
      return res.send({ success: true, message: "User already exists", data: existingUser });
    }

    // Create new user
    const user = {
      ...req.body,
      createdAt: new Date(),
      last_log_in: new Date()
    };

    const result = await usersCollection.insertOne(user);
    res.send({ success: true, data: { ...user, _id: result.insertedId } });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});


    // ===== Classes Routes =====
    app.get("/classes", async (req, res) => {
      const classes = await classesCollection.find().toArray();
      res.send(classes);
    });
    app.post("/classes", async (req, res) => {
      const result = await classesCollection.insertOne(req.body);
      res.send({ success: true, data: result });
    });
    app.delete("/classes/:id", async (req, res) => {
      const result = await classesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send({ success: true, data: result });
    });

    // ===== Budget Routes =====
    app.get("/budget", async (req, res) => {
      const transactions = await budgetCollection.find().toArray();
      res.send(transactions);
    });
    app.post("/budget", async (req, res) => {
      const result = await budgetCollection.insertOne(req.body);
      res.send({ success: true, data: result });
    });
    app.put("/budget/:id", async (req, res) => {
      const result = await budgetCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );
      res.send({ success: true, data: result });
    });
    app.delete("/budget/:id", async (req, res) => {
      const result = await budgetCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send({ success: true, data: result });
    });

    // ===== Study Planner Routes =====
    // Get all study tasks
    app.get("/study-tasks", async (req, res) => {
      try {
        const tasks = await studyTasksCollection.find().toArray();
        res.send({ success: true, data: tasks });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Create a new study task
    app.post("/study-tasks", async (req, res) => {
      try {
        const task = {
          ...req.body,
          createdAt: new Date(),
          completed: false
        };
        const result = await studyTasksCollection.insertOne(task);
        res.send({ success: true, data: { ...task, _id: result.insertedId } });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Update a study task (toggle completion or edit)
    app.put("/study-tasks/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await studyTasksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: req.body }
        );
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Delete a study task
    app.delete("/study-tasks/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await studyTasksCollection.deleteOne({ _id: new ObjectId(id) });
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // ===== AI Question Generator =====
    app.post("/generate-questions", async (req, res) => {
      try {
        const { topic } = req.body;
        if (!topic) return res.status(400).send({ success: false, error: "Topic required" });

        const system = `You are an exam generator. Always return STRICT JSON:
    {
      "mcq":[{"question":string,"options":[string,string,string,string],"correct":string}],
      "trueFalse":[{"question":string,"answer":boolean}],
      "short":[{"question":string,"answer":string}]
    }`;

        const user = `Generate:
    - 5 MCQs, 5 True/False, 5 Short Answer
    Topic: "${topic}"`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          temperature: 0.4,
          max_tokens: 1200,
          response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        let data;
        try {
          data = JSON.parse(content);
        } catch (err) {
          return res.status(500).send({
            success: false,
            error: "Invalid AI JSON",
            raw: content?.slice(0, 300),
          });
        }

        // Save generated questions to DB
        await questionsCollection.insertOne({
          topic,
          questions: data,
          createdAt: new Date(),
        });

        res.send({ success: true, data });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, error: err.message || "Server error" });
      }
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