import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const PORT = process.env.PORT || 5000;

const client = new MongoClient(process.env.MONGODB_CONNECTION_STRING_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

app.use(cors());
app.use(express.json());

const mongoClient = await connectToMongoDB();

if (!mongoClient) {
  console.error("Failed to connect to MongoDB. Shutting down...");
  process.exit(1);
}

const db = mongoClient.db("booknook");
const bookCollection = db.collection("books");
const borrowCollection = db.collection("borrows");

app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

app.get("/books", async (req, res) => {
  const { limit, email } = req.query;
  const query = email ? { addedByEmail: email } : {};
  const cursor = bookCollection.find(query).sort({ createdAt: -1 });

  const parsedLimit = Number.parseInt(limit, 10);
  if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
    cursor.limit(parsedLimit);
  }

  const result = await cursor.toArray();
  res.send(result);
});

app.get("/books/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid book id" });
  }

  const result = await bookCollection.findOne({ _id: new ObjectId(id) });

  if (!result) {
    return res.status(404).send({ message: "Book not found" });
  }

  res.send(result);
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
