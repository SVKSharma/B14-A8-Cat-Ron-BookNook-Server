<div align="center">

<h1 style="font-size: 3rem; font-weight: 800;">
	<img src="https://b14-a8-cat-ron-book-nook-client-svk.vercel.app/icon.svg" width="48" height="48" alt="BookNook icon" style="vertical-align: middle; margin-right: 0.3em;" /> BookNook API / <font color="#315b45">A small online library</font>
</h1>

<h3 style="font-size: 1.1rem; font-weight: 700;"><font color="#315b45">B14-A8 · Cat_Ron · Express + MongoDB API</font></h3>

<h2 style="font-size: 1.8rem; font-weight: 800;">Every shared shelf needs a reliable backend.</h2>

A focused REST API for browsing books, adding listings, borrowing stories, and returning them to the community.

**Live API:** <a href="https://b14-a8-cat-ron-book-nook-server-svk.vercel.app/" target="_blank" rel="noopener noreferrer">Open BookNook API</a>

[![Live API](https://img.shields.io/badge/Live%20API-BookNook-315b45?style=for-the-badge)](https://b14-a8-cat-ron-book-nook-server-svk.vercel.app/)
[![Live Website](https://img.shields.io/badge/Live%20Website-Visit%20BookNook-d09b56?style=for-the-badge)](https://b14-a8-cat-ron-book-nook-client-svk.vercel.app/)

</div>

---

## 🔗 Project Links

| Resource | Link |
| --- | --- |
| ⚙️ **Live API** | [b14-a8-cat-ron-book-nook-server-svk.vercel.app](https://b14-a8-cat-ron-book-nook-server-svk.vercel.app/) |
| 🌐 **Live website** | [b14-a8-cat-ron-book-nook-client-svk.vercel.app](https://b14-a8-cat-ron-book-nook-client-svk.vercel.app/) |
| 🗄️ **Server repository** | [SVKSharma/B14-A8-Cat-Ron-BookNook-Server](https://github.com/SVKSharma/B14-A8-Cat-Ron-BookNook-Server) |
| 💻 **Client repository** | [SVKSharma/B14-A8-Cat-Ron-BookNook-Client](https://github.com/SVKSharma/B14-A8-Cat-Ron-BookNook-Client) |

> **This is the backend repository.** The Next.js client that consumes this API lives in the [client repository](https://github.com/SVKSharma/B14-A8-Cat-Ron-BookNook-Client). The client handles authentication, image uploads, and all reader-facing pages.

---

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">About BookNook API</font></h2>

The BookNook API is the server-side half of a small community library. It gives readers a public catalogue, lets signed-in contributors manage their own listings, and keeps borrowing records private to the reader who created them.

It is intentionally small and direct: **Express 5**, the native **MongoDB** driver, and a clean eight-route REST contract. Every protected request is authenticated with a **Better Auth JWT** verified against the client’s JWKS endpoint, so the API trusts verified token identity rather than data sent by the browser.

The core idea is simple:

> **Add a book, borrow a book, return a book.**

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">🌟 Key Features</font></h2>

- **Eight focused REST endpoints:** Exactly the book and borrow routes needed by the application, plus a small health route at `/`.
- **Public catalogue access:** Anyone can browse all books or open a single book without signing in.
- **Newest-first listings:** `GET /books` sorts by `createdAt` descending and supports a `limit` query parameter for the home page’s latest six books.
- **Protected write operations:** Adding, editing, and deleting books all require a valid Bearer token.
- **Verified Better Auth JWTs:** Tokens are verified with `jose` against the Better Auth JWKS endpoint, including issuer, audience, and `EdDSA` algorithm checks.
- **Identity from the token:** The API derives the reader’s email and name from the verified JWT. Client-supplied identity is never trusted for ownership.
- **Owner-only book management:** `PATCH /books/:id` and `DELETE /books/:id` only affect books added by the authenticated reader.
- **Private “My Books” filtering:** `GET /books?email=...` requires authentication and rejects requests for another reader’s email.
- **Borrow protection:** Readers cannot borrow the same book twice, and they cannot borrow a book from their own shelf.
- **Seven-day borrowing window:** A borrow defaults to a return date seven days after creation, or accepts a valid date supplied by the client.
- **Private borrow history:** `GET /borrows` returns only the authenticated reader’s records, newest first.
- **Safe return flow:** `DELETE /borrows/:id` only removes a borrow owned by the authenticated reader.
- **Duplicate listing prevention:** The API rejects a second listing of the same ISBN or the same title and author by the same contributor.
- **ISBN conflict detection:** A 13-digit ISBN already linked to a different title or author returns a clear `409` conflict message.
- **Input validation:** Required fields, category allow-listing, 13-digit ISBN normalization, non-empty update values, and valid MongoDB ObjectIds are checked before database writes.
- **Consistent JSON errors:** Every error returns a JSON object with a human-readable `message`.
- **Owner email privacy:** Public book responses project away `addedByEmail`, while owner views keep it for the client’s shelf filtering.
- **MongoDB-native implementation:** Direct collection access with the official driver, no Mongoose layer.
- **Serverless-ready deployment:** `vercel.json` exposes `index.js` as a Vercel Node function, while `dev.js` runs a normal local server.
- **Health check:** `GET /` returns `{ "message": "Server is running fine!" }` for uptime checks.

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">🛠️ Technologies Used</font></h2>

- **Runtime:** Node.js with ES modules
- **Framework:** Express 5
- **Database:** MongoDB Atlas via the official `mongodb` driver
- **Authentication:** Better Auth JWT verification, `jose` JWKS client
- **Configuration:** `dotenv`
- **CORS:** `cors`
- **Development:** `nodemon`
- **Deployment:** Vercel Node functions via `@vercel/node`
- **Module style:** `"type": "module"` with top-level `await`

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">📡 API Contract</font></h2>

**Local base URL:** `http://localhost:5000`  
**Live base URL:** `https://b14-a8-cat-ron-book-nook-server-svk.vercel.app`

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | Public | Health check |
| `GET` | `/books` | Public | List all books, newest first |
| `GET` | `/books/:id` | Public | Get one book |
| `POST` | `/books` | Bearer JWT | Add a book |
| `PATCH` | `/books/:id` | Bearer JWT + owner | Update a book |
| `DELETE` | `/books/:id` | Bearer JWT + owner | Delete a book |
| `POST` | `/borrows` | Bearer JWT | Borrow a book |
| `GET` | `/borrows` | Bearer JWT | Get the reader’s borrows |
| `DELETE` | `/borrows/:id` | Bearer JWT + owner | Return a book |

### `GET /books`

- Returns every book sorted by `createdAt` descending.
- Optional `limit` query parameter: positive integer, for example `/books?limit=6`.
- Optional `email` query parameter: activates the “My Books” view, requires a Bearer token, and must match the token’s email.
- Public responses exclude `addedByEmail`.

### `GET /books/:id`

- Returns a single book by MongoDB ObjectId.
- Returns `400` for an invalid id and `404` when the book does not exist.
- Add `?owner=true` with a Bearer token to apply owner filtering.
- Public responses exclude `addedByEmail`.

### `POST /books`

Required body fields:

```json
{
  "isbn": "9780000000000",
  "title": "The Name of the Wind",
  "author": "Patrick Rothfuss",
  "category": "Fiction",
  "image": "https://example.com/cover.jpg",
  "description": "A short description of the book."
}
```

- Category must be one of `Fiction`, `Science`, `History`, `Kids`, or `Others`.
- ISBN must contain exactly 13 digits after spaces and hyphens are removed.
- `addedByName`, `addedByEmail`, and `createdAt` are created on the server.
- Rejects duplicate listings by the same contributor.
- Rejects an ISBN already linked to a different title or author with `409`.
- Returns `201` with the MongoDB insert result.

### `PATCH /books/:id`

- Only the book’s owner can update it.
- Accepts any of `title`, `author`, `category`, `isbn`, `image`, and `description`.
- Rejects an empty update, empty field values, invalid categories, invalid ISBNs, and duplicate/conflicting listings.
- Returns `404` when the book does not exist or is not owned by the reader.

### `DELETE /books/:id`

- Only the book’s owner can delete it.
- Returns `404` when no matching owned book exists.
- Returns `{ "acknowledged": true, "deletedCount": 1 }` on success.

### `POST /borrows`

```json
{
  "bookId": "64f0c2a1b7e4d9a1f2c3b456",
  "returnDate": "2026-11-10T00:00:00.000Z"
}
```

- `bookId` is required and must be a valid ObjectId.
- `returnDate` is optional. When omitted or invalid, the server sets it to seven days from now.
- The server snapshots `bookTitle` and `bookImage` into the borrow record.
- `userEmail` comes from the verified token.
- Rejects borrowing a book from the reader’s own shelf with `403`.
- Rejects a second active borrow of the same book with `409`.
- Returns `201` with the insert result.

### `GET /borrows`

- Returns only the authenticated reader’s borrow records.
- Optional `email` query parameter must match the authenticated reader.
- Sorted by `borrowDate` descending.

### `DELETE /borrows/:id`

- Deletes a borrow record only when it belongs to the authenticated reader.
- Returns `404` when no matching record exists.

### Quick requests

```bash
# Health check
curl http://localhost:5000/

# Latest six books
curl "http://localhost:5000/books?limit=6"

# My Books (requires a Better Auth JWT)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/books?email=reader@example.com"

# My Borrows
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/borrows?email=reader@example.com"
```

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">🔐 Authentication Flow</font></h2>

1. The client signs readers in with **Better Auth** using email/password or Google.
2. Better Auth’s JWT plugin issues a seven-day token with `sub`, `email`, and `name` claims.
3. The client sends the token as `Authorization: Bearer <token>`.
4. The API loads Better Auth’s public keys from:

   ```text
   ${CLIENT_URL}/api/auth/jwks
   ```

5. `requireAuth` verifies the token signature, issuer, audience, and `EdDSA` algorithm.
6. The verified identity is attached to `req.auth`:

   ```js
   {
     userId: payload.sub,
     email: payload.email,
     name: payload.name
   }
   ```

7. Ownership filters and borrow ownership are derived from this verified email.
8. Missing, malformed, expired, or invalid tokens receive `401`; different-account access receives `403`.

`CLIENT_URL` must be the deployed client origin, without a trailing slash. The server uses it for both the JWKS URL and the expected JWT issuer/audience.

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">🗃️ Data Models</font></h2>

Database: **`booknook`**

### `books`

```js
{
  _id: ObjectId,
  isbn: "9780000000000",   // 13 digits, separators removed
  title: "The Name of the Wind",
  author: "Patrick Rothfuss",
  category: "Fiction",     // Fiction | Science | History | Kids | Others
  image: "https://...",    // ImgBB cover URL
  description: "A short description...",
  addedByName: "Reader Name",
  addedByEmail: "reader@example.com",
  createdAt: Date
}
```

### `borrows`

```js
{
  _id: ObjectId,
  bookId: ObjectId,
  bookTitle: "The Name of the Wind",
  bookImage: "https://...",
  userEmail: "reader@example.com",
  borrowDate: Date,
  returnDate: Date
}
```

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">📂 Project Structure</font></h2>

```text
BookNook-Backend/
├── dev.js              # Local server entry point
├── index.js            # Express app, routes, auth middleware, Mongo setup
├── nodemon.json        # Nodemon watch configuration
├── package.json
├── vercel.json         # Vercel Node function configuration
├── .env.example
└── README.md
```

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">🚀 Getting Started</font></h2>

Follow these steps to run the API locally.

### 1. Clone the repository

Using HTTPS:

```bash
git clone https://github.com/SVKSharma/B14-A8-Cat-Ron-BookNook-Server.git
cd B14-A8-Cat-Ron-BookNook-Server
```

Using SSH:

```bash
git clone git@github.com:SVKSharma/B14-A8-Cat-Ron-BookNook-Server.git
cd B14-A8-Cat-Ron-BookNook-Server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the environment file

Create `.env` in the project root:

```bash
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_CONNECTION_STRING_URI=your_mongodb_connection_string
```

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | Yes for local startup | Port used by `dev.js`; defaults are not assumed |
| `CLIENT_URL` | Yes | Client origin used for the JWKS URL and JWT issuer/audience |
| `MONGODB_CONNECTION_STRING_URI` | Yes | MongoDB Atlas connection string |

> Never commit `.env`. Use `.env.example` as the shared template.

### 4. Start the development server

```bash
npm run dev
```

This starts the server with `nodemon` on the configured `PORT`.

### 5. Verify the API

```bash
curl http://localhost:5000/
```

Expected response:

```json
{ "message": "Server is running fine!" }
```

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">🧪 Available Scripts</font></h2>

```bash
npm run dev      # Start with nodemon through dev.js
npm start        # Start through dev.js without nodemon
node index.js    # Import the Express app directly
```

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">🌐 Deployment</font></h2>

The API is deployed on **Vercel** using the Node runtime.

1. Import the [server repository](https://github.com/SVKSharma/B14-A8-Cat-Ron-BookNook-Server) into Vercel.
2. Add `MONGODB_CONNECTION_STRING_URI` and `CLIENT_URL` to the project’s environment variables.
3. Set `CLIENT_URL` to the production client origin:

   ```text
   https://b14-a8-cat-ron-book-nook-client-svk.vercel.app
   ```

4. Deploy. `vercel.json` routes every request to `index.js`, which exports the Express app.

The client must point `NEXT_PUBLIC_API_URL` at the deployed API:

```text
https://b14-a8-cat-ron-book-nook-server-svk.vercel.app
```

The matching client deployment instructions are in the [client README](https://github.com/SVKSharma/B14-A8-Cat-Ron-BookNook-Client).

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">⚠️ Error Responses</font></h2>

Errors use a consistent JSON shape:

```json
{ "message": "A clear explanation of what went wrong." }
```

| Status | Meaning |
| --- | --- |
| `400` | Missing or invalid input, invalid ObjectId, invalid category, or bad ISBN |
| `401` | Missing, malformed, expired, or invalid Bearer token |
| `403` | Trying to access another reader’s data or borrow your own book |
| `404` | Book or borrow record not found |
| `409` | Duplicate listing, conflicting ISBN, or duplicate active borrow |

<h2 style="font-size: 1.5rem; font-weight: 800;"><font color="#315b45">✅ Project Notes</font></h2>

- Book covers are uploaded by the client through its protected ImgBB route; this API stores the resulting image URL.
- The API intentionally does not use Mongoose. It talks directly to the `books` and `borrows` collections.
- Public reads hide `addedByEmail`; authenticated owner reads retain it for the client’s shelf filter.
- CORS is enabled so the separately deployed client can call the API.
- The server derives borrow ownership from the token, so a reader cannot create or view another reader’s borrow records.
- The API has no email verification or password-reset endpoints; those flows are intentionally omitted for the assignment.

Thank you for exploring the BookNook API. This project was built for the **B14-A8** assignment with a small, security-conscious Express API, Better Auth JWT verification, MongoDB-native data access, and a clean contract shared with the Next.js client.

---

<div align="center">

Built with 💚 by <a href="https://github.com/SVKSharma">Showvik</a>

</div>
