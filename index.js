// 1. Import required packages
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();

// 2. Create Express app
const app = express();
const port = process.env.PORT || 3000;

// 3. Middleware
app.use(cors());
app.use(express.json());

// 4. MongoDB connection string
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ikrarq7.mongodb.net/?retryWrites=true&w=majority`;

// 5. Create MongoDB client
const client = new MongoClient(uri);

async function run() {
  try {
    const db = client.db("schoolDB");

    // Collections
    const classesCollection = db.collection("classes");
   const budgetCollection = db.collection("budget");
    const questionsCollection = db.collection("questions");
    // ✅ Get all classes
    app.get("/classes", async (req, res) => {
      const classes = await classesCollection.find().toArray();
      res.send(classes);
    });

    // ✅ Add new class
    app.post("/classes", async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send({ success: true, data: result });
    });

    // ✅ Delete class
    app.delete("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const result = await classesCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ success: true, data: result });
    });

   // ✅ Get all budget transactions
app.get("/budget", async (req, res) => {
  const transactions = await budgetCollection.find().toArray();
  res.send(transactions);
});

// ✅ Add new budget transaction
app.post("/budget", async (req, res) => {
  const newTransaction = req.body;
  const result = await budgetCollection.insertOne(newTransaction);
  res.send({ success: true, data: result });
});

// ✅ Update budget transaction
app.put("/budget/:id", async (req, res) => {
  const id = req.params.id;
  const updatedTransaction = req.body;
  const result = await budgetCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedTransaction }
  );
  res.send({ success: true, data: result });
});

// ✅ Delete budget transaction
app.delete("/budget/:id", async (req, res) => {
  const id = req.params.id;
  const result = await budgetCollection.deleteOne({ _id: new ObjectId(id) });
  res.send({ success: true, data: result });
});
    console.log("Connected to MongoDB ✅");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

// 6. Test route
app.get("/", (req, res) => res.send("Server is running ✅"));

// 7. Start server
app.listen(port, () => console.log(`Server running on port ${port}`));
