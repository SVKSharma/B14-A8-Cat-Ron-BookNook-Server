import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const configuredClientUrl = process.env.CLIENT_URL;
if (!configuredClientUrl) throw new Error("CLIENT_URL must be configured in the backend environment.");
const BETTER_AUTH_BASE_URL = configuredClientUrl.replace(/\/$/, "");
const AUTH_JWKS = createRemoteJWKSet(new URL(`${BETTER_AUTH_BASE_URL}/api/auth/jwks`));

const client = new MongoClient(process.env.MONGODB_CONNECTION_STRING_URI);

async function connectToMongoDB() {
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

function ownerFilter(email) {
  return {
    $expr: {
      $eq: [
        { $toLower: { $ifNull: ["$addedByEmail", ""] } },
        String(email).trim().toLowerCase(),
      ],
    },
  };
}

async function requireAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).send({ message: "Access denied: unauthorized request. A valid bearer token is required." });
  }

  try {
    const { payload } = await jwtVerify(match[1], AUTH_JWKS, {
      issuer: BETTER_AUTH_BASE_URL,
      audience: BETTER_AUTH_BASE_URL,
      algorithms: ["EdDSA"],
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string" || !payload.email.trim()) {
      return res.status(401).send({ message: "Access denied: unauthorized request. The token has no valid user identity." });
    }

    req.auth = {
      userId: payload.sub,
      email: payload.email.trim(),
      name: typeof payload.name === "string" ? payload.name.trim() : payload.email.trim(),
    };
    return next();
  } catch {
    return res.status(401).send({ message: "Access denied: unauthorized request. The token is invalid or expired." });
  }
}

function forbidDifferentEmail(req, res, email) {
  if (email && String(email).trim().toLowerCase() !== req.auth.email.toLowerCase()) {
    res.status(403).send({ message: "Forbidden. You can only access your own account data." });
    return true;
  }
  return false;
}

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

async function initializeBookInventory(bookGroup) {
  const uninitializedCopies = await bookCollection.find(
    { ...bookGroup, availableCopies: { $exists: false } },
    { projection: { _id: 1 } }
  ).toArray();
  if (uninitializedCopies.length === 0) return;

  const copyIds = uninitializedCopies.map((copy) => copy._id);
  const borrowedCopyIds = new Set(
    (await borrowCollection.distinct("bookId", { bookId: { $in: copyIds } })).map(String)
  );
  await Promise.all(uninitializedCopies.map((copy) =>
    bookCollection.updateOne(
      { _id: copy._id, availableCopies: { $exists: false } },
      { $set: { availableCopies: borrowedCopyIds.has(String(copy._id)) ? 0 : 1 } }
    )
  ));
}

app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

app.get("/books", (req, res, next) => req.query.email ? requireAuth(req, res, next) : next(), async (req, res) => {
  const { limit, email } = req.query;
  if (forbidDifferentEmail(req, res, email)) return;
  const query = email ? ownerFilter(req.auth.email) : {};
  const cursor = bookCollection.find(query).sort({ createdAt: -1 });
  if (!email) cursor.project({ addedByEmail: 0 });

  const parsedLimit = Number.parseInt(limit, 10);
  if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
    cursor.limit(parsedLimit);
  }

  const result = await cursor.toArray();
  res.send(result);
});

app.get("/books/:id", (req, res, next) => req.query.owner === "true" ? requireAuth(req, res, next) : next(), async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid book id" });
  }

  const query = { _id: new ObjectId(id) };
  if (req.query.owner === "true") Object.assign(query, ownerFilter(req.auth.email));
  const result = await bookCollection.findOne(
    query,
    req.query.owner === "true" ? undefined : { projection: { addedByEmail: 0 } }
  );

  if (!result) {
    return res.status(404).send({ message: "Book not found" });
  }

  res.send(result);
});

app.get("/books/:id/availability", (req, res, next) => req.get("authorization") ? requireAuth(req, res, next) : next(), async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid book id" });
  const book = await bookCollection.findOne({ _id: new ObjectId(id) }, { projection: { isbn: 1 } });
  if (!book) return res.status(404).send({ message: "Book not found" });

  const bookGroup = book.isbn ? { isbn: book.isbn } : { _id: book._id };
  await initializeBookInventory(bookGroup);
  const copies = await bookCollection.find(bookGroup, { projection: { availableCopies: 1, addedByEmail: 1 } }).toArray();
  const ownsBook = req.auth
    ? Boolean(await bookCollection.findOne({ ...bookGroup, ...ownerFilter(req.auth.email) }, { projection: { _id: 1 } }))
    : false;
  const countCopies = (listings) => listings.reduce(
    (total, copy) => total + Math.max(0, Number(copy.availableCopies ?? 0)),
    0
  );
  const availableCopies = countCopies(copies);
  const borrowableCopies = req.auth
    ? countCopies(copies.filter((copy) =>
      String(copy.addedByEmail ?? "").trim().toLowerCase() !== req.auth.email.toLowerCase()
    ))
    : availableCopies;
  res.send({ availableCopies, borrowableCopies, ownsBook });
});

app.post("/books", requireAuth, async (req, res) => {
  const data = req.body || {};

  const requiredFields = [
    "title",
    "author",
    "isbn",
    "category",
    "image",
    "description",
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

  const ownerEmail = req.auth.email;
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

  const ownerBooks = await bookCollection.find(ownerFilter(ownerEmail)).toArray();
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
    availableCopies: 1,
    addedByName: req.auth.name,
    addedByEmail: ownerEmail,
    createdAt: new Date(),
  };

  const result = await bookCollection.insertOne(newBook);
  res.status(201).send(result);
});

app.patch("/books/:id", requireAuth, async (req, res) => {
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

  const currentBook = await bookCollection.findOne({ _id: new ObjectId(id), ...ownerFilter(req.auth.email) });
  if (!currentBook) {
    return res.status(404).send({ message: "Book not found" });
  }

  const nextTitle = updates.title ?? currentBook.title;
  const nextAuthor = updates.author ?? currentBook.author;
  const nextIsbn = updates.isbn ?? currentBook.isbn;
  if (nextIsbn) {
    const sameIsbnBooks = await bookCollection.find({
      isbn: normalizeIsbn(nextIsbn),
      _id: { $ne: new ObjectId(id) },
    }).toArray();
    const isbnConflict = sameIsbnBooks.find((candidate) =>
      normalizeBookText(candidate.title) !== normalizeBookText(nextTitle) ||
      normalizeBookText(candidate.author) !== normalizeBookText(nextAuthor)
    );
    if (isbnConflict) {
      return res.status(409).send({
        message: `This ISBN is already linked to “${isbnConflict.title}” by ${isbnConflict.author}. Did you mean “${isbnConflict.title}”? Check the ISBN or book details.`,
      });
    }
  }

  const ownerBooks = await bookCollection.find({
    ...ownerFilter(req.auth.email),
    _id: { $ne: new ObjectId(id) },
  }).toArray();
  const duplicate = ownerBooks.find((candidate) => {
    if (nextIsbn && candidate.isbn) return normalizeIsbn(candidate.isbn) === normalizeIsbn(nextIsbn);
    return normalizeBookText(candidate.title) === normalizeBookText(nextTitle) &&
      normalizeBookText(candidate.author) === normalizeBookText(nextAuthor);
  });
  if (duplicate) {
    return res.status(409).send({
      message: `“${duplicate.title}” by ${duplicate.author} is already in your listings. Edit that listing instead.`,
    });
  }

  const result = await bookCollection.updateOne(
    { _id: new ObjectId(id), ...ownerFilter(req.auth.email) },
    { $set: updates }
  );

  if (result.matchedCount === 0) {
    return res.status(404).send({ message: "Book not found" });
  }

  res.json(result);
});

app.delete("/books/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid book id" });
  }

  const result = await bookCollection.deleteOne({ _id: new ObjectId(id), ...ownerFilter(req.auth.email) });

  if (result.deletedCount === 0) {
    return res.status(404).send({ message: "Book not found" });
  }

  res.json(result);
});

app.post("/borrows", requireAuth, async (req, res) => {
  const data = req.body || {};
  const { bookId, returnDate } = data;

  if (!bookId || !ObjectId.isValid(bookId)) {
    return res.status(400).send({ message: "Invalid or missing book id" });
  }

  const book = await bookCollection.findOne({ _id: new ObjectId(bookId) });
  if (!book) {
    return res.status(404).send({ message: "Book not found" });
  }

  const bookGroup = book.isbn ? { isbn: book.isbn } : { _id: book._id };
  const ownsBook = await bookCollection.findOne(
    { ...bookGroup, ...ownerFilter(req.auth.email) },
    { projection: { _id: 1 } }
  );
  if (ownsBook) {
    return res.status(403).send({ message: "You can’t borrow a book you’ve shared with the community." });
  }

  const groupBooks = await bookCollection.find(bookGroup, { projection: { _id: 1 } }).toArray();
  const groupBookIds = groupBooks.map((copy) => copy._id);
  const existingBorrowQuery = { userEmail: req.auth.email };
  if (book.isbn) {
    existingBorrowQuery.$or = [
      { isbn: book.isbn },
      { bookId: { $in: groupBookIds } },
    ];
  } else {
    existingBorrowQuery.bookId = new ObjectId(bookId);
  }
  const existingBorrow = await borrowCollection.findOne(existingBorrowQuery);
  if (existingBorrow) {
    return res.status(409).send({ message: "You already have this book borrowed. Return it before borrowing it again." });
  }

  await initializeBookInventory(bookGroup);
  const eligibleBorrower = { $nor: [ownerFilter(req.auth.email)] };
  let borrowedBook = await bookCollection.findOneAndUpdate(
    {
      _id: new ObjectId(bookId),
      availableCopies: { $gt: 0 },
      ...eligibleBorrower,
    },
    { $inc: { availableCopies: -1 } }
  );
  if (!borrowedBook && book.isbn) {
    borrowedBook = await bookCollection.findOneAndUpdate(
      {
        ...bookGroup,
        _id: { $ne: new ObjectId(bookId) },
        availableCopies: { $gt: 0 },
        ...eligibleBorrower,
      },
      { $inc: { availableCopies: -1 } }
    );
  }
  if (!borrowedBook) {
    if (!book.isbn && String(book.addedByEmail).trim().toLowerCase() === req.auth.email.toLowerCase()) {
      return res.status(403).send({ message: "You can’t borrow a book from your own shelf." });
    }
    return res.status(409).send({ message: "All copies are currently borrowed. Check back soon; returned books become available here." });
  }

  const parsedReturnDate = returnDate ? new Date(returnDate) : null;
  const validReturnDate =
    parsedReturnDate && !Number.isNaN(parsedReturnDate.getTime())
      ? parsedReturnDate
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const newBorrow = {
    bookId: borrowedBook._id,
    ...(book.isbn ? { isbn: book.isbn } : {}),
    bookTitle: borrowedBook.title,
    bookImage: borrowedBook.image,
    userEmail: req.auth.email,
    borrowDate: new Date(),
    returnDate: validReturnDate,
  };

  try {
    const result = await borrowCollection.insertOne(newBorrow);
    res.status(201).send(result);
  } catch (error) {
    await bookCollection.updateOne({ _id: borrowedBook._id }, { $inc: { availableCopies: 1 } });
    throw error;
  }
});

app.get("/borrows", requireAuth, async (req, res) => {
  const { email } = req.query;
  if (forbidDifferentEmail(req, res, email)) return;
  const query = { userEmail: req.auth.email };
  const result = await borrowCollection
    .find(query)
    .sort({ borrowDate: -1 })
    .toArray();

  const legacyBorrowIds = result
    .filter((borrow) => !borrow.isbn)
    .map((borrow) => borrow.bookId);
  const legacyBooks = legacyBorrowIds.length
    ? await bookCollection.find({ _id: { $in: legacyBorrowIds } }, { projection: { isbn: 1 } }).toArray()
    : [];
  const isbnByBookId = new Map(legacyBooks.map((book) => [String(book._id), book.isbn]));
  res.send(result.map((borrow) => ({
    ...borrow,
    ...(borrow.isbn || isbnByBookId.get(String(borrow.bookId))
      ? { bookIsbn: borrow.isbn ?? isbnByBookId.get(String(borrow.bookId)) }
      : {}),
  })));
});

app.delete("/borrows/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid borrow id" });
  }

  const borrow = await borrowCollection.findOne({ _id: new ObjectId(id), userEmail: req.auth.email });

  if (!borrow) {
    return res.status(404).send({ message: "Borrow record not found" });
  }

  const result = await borrowCollection.deleteOne({ _id: borrow._id, userEmail: req.auth.email });
  if (result.deletedCount > 0) {
    await bookCollection.updateOne({ _id: borrow.bookId }, { $inc: { availableCopies: 1 } });
  }

  res.json(result);
});

export default app;
