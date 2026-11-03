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

const BOOK_CATEGORIES = ["Fiction", "Science", "History", "Kids", "Others"];
const BOOK_UPDATE_FIELDS = ["title", "author", "category", "isbn", "image", "description"];

function compactIsbn(value) {
  return String(value ?? "").replace(/[\s-]/g, "");
}

function normalizeIsbn(value) {
  const isbn = compactIsbn(value);
  return /^\d{13}$/.test(isbn) ? isbn : null;
}

function normalizeBookText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

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

app.post("/books", async (req, res) => {
  const data = req.body || {};

  const requiredFields = [
    "title",
    "author",
    "isbn",
    "category",
    "image",
    "description",
    "addedByName",
    "addedByEmail",
  ];

  const missingFields = requiredFields.filter(
    (field) => !data[field] || String(data[field]).trim() === ""
  );

  if (missingFields.length > 0) {
    return res.status(400).send({
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  if (!BOOK_CATEGORIES.includes(data.category)) {
    return res.status(400).send({
      message: `Category must be one of: ${BOOK_CATEGORIES.join(", ")}`,
    });
  }

  const isbn = data.isbn ? normalizeIsbn(data.isbn) : "";
  if (data.isbn && !isbn) {
    return res.status(400).send({ message: "ISBN must contain exactly 13 digits" });
  }

  const ownerEmail = String(data.addedByEmail).trim();
  const normalizedOwnerEmail = ownerEmail.toLowerCase();
  const title = String(data.title).trim();
  const author = String(data.author).trim();
  const sameIsbnBooks = isbn ? await bookCollection.find({ isbn }).toArray() : [];
  const isbnConflict = sameIsbnBooks.find(
    (book) => normalizeBookText(book.title) !== normalizeBookText(title) ||
      normalizeBookText(book.author) !== normalizeBookText(author)
  );

  if (isbnConflict) {
    return res.status(409).send({
      message: `This ISBN is already linked to “${isbnConflict.title}” by ${isbnConflict.author}. Did you mean “${isbnConflict.title}”? Check the ISBN and book details.`,
    });
  }

  const ownerBooks = await bookCollection.find({ addedByEmail: ownerEmail }).toArray();
  const duplicateForOwner = ownerBooks.find((book) => {
    const sameTitleAndAuthor = normalizeBookText(book.title) === normalizeBookText(title) &&
      normalizeBookText(book.author) === normalizeBookText(author);
    const bothHaveIsbn = Boolean(isbn && book.isbn);
    return bothHaveIsbn
      ? compactIsbn(book.isbn) === isbn
      : sameTitleAndAuthor;
  }) ?? sameIsbnBooks.find(
    (book) => String(book.addedByEmail).trim().toLowerCase() === normalizedOwnerEmail
  );

  if (duplicateForOwner) {
    return res.status(409).send({
      message: `“${duplicateForOwner.title}” by ${duplicateForOwner.author} is already in your listings. A duplicate listing was not created.`,
    });
  }

  const newBook = {
    ...(isbn ? { isbn } : {}),
    title,
    author,
    category: data.category,
    image: String(data.image).trim(),
    description: String(data.description).trim(),
    addedByName: String(data.addedByName).trim(),
    addedByEmail: ownerEmail,
    createdAt: new Date(),
  };

  const result = await bookCollection.insertOne(newBook);
  res.status(201).send(result);
});

app.patch("/books/:id", async (req, res) => {
  const { id } = req.params;
  const data = req.body || {};

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid book id" });
  }

  const updates = {};

  for (const field of BOOK_UPDATE_FIELDS) {
    if (data[field] !== undefined && data[field] !== null) {
      updates[field] = String(data[field]).trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).send({
      message: `Provide at least one field to update: ${BOOK_UPDATE_FIELDS.join(", ")}`,
    });
  }

  const emptyFields = Object.entries(updates)
    .filter(([, value]) => value === "")
    .map(([field]) => field);

  if (emptyFields.length > 0) {
    return res.status(400).send({
      message: `Fields cannot be empty: ${emptyFields.join(", ")}`,
    });
  }

  if (updates.category && !BOOK_CATEGORIES.includes(updates.category)) {
    return res.status(400).send({
      message: `Category must be one of: ${BOOK_CATEGORIES.join(", ")}`,
    });
  }

  if (updates.isbn) {
    const normalizedIsbn = normalizeIsbn(updates.isbn);
    if (!normalizedIsbn) {
      return res.status(400).send({ message: "ISBN must contain exactly 13 digits" });
    }
    updates.isbn = normalizedIsbn;
  }

  const result = await bookCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  );

  if (result.matchedCount === 0) {
    return res.status(404).send({ message: "Book not found" });
  }

  res.json(result);
});

app.delete("/books/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid book id" });
  }

  const result = await bookCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    return res.status(404).send({ message: "Book not found" });
  }

  res.json(result);
});

app.post("/borrows", async (req, res) => {
  const data = req.body || {};
  const { bookId, userEmail, returnDate } = data;

  if (!bookId || !ObjectId.isValid(bookId)) {
    return res.status(400).send({ message: "Invalid or missing book id" });
  }

  if (!userEmail || String(userEmail).trim() === "") {
    return res.status(400).send({ message: "User email is required" });
  }

  const book = await bookCollection.findOne({ _id: new ObjectId(bookId) });
  if (!book) {
    return res.status(404).send({ message: "Book not found" });
  }

  const parsedReturnDate = returnDate ? new Date(returnDate) : null;
  const validReturnDate =
    parsedReturnDate && !Number.isNaN(parsedReturnDate.getTime())
      ? parsedReturnDate
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const newBorrow = {
    bookId: new ObjectId(bookId),
    bookTitle: data.bookTitle ? String(data.bookTitle).trim() : book.title,
    bookImage: data.bookImage ? String(data.bookImage).trim() : book.image,
    userEmail: String(userEmail).trim(),
    borrowDate: new Date(),
    returnDate: validReturnDate,
  };

  const result = await borrowCollection.insertOne(newBorrow);
  res.status(201).send(result);
});

app.get("/borrows", async (req, res) => {
  const { email } = req.query;
  const query = email ? { userEmail: email } : {};
  const result = await borrowCollection
    .find(query)
    .sort({ borrowDate: -1 })
    .toArray();

  res.send(result);
});

app.delete("/borrows/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid borrow id" });
  }

  const result = await borrowCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    return res.status(404).send({ message: "Borrow record not found" });
  }

  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
