# API Reference

All API endpoints are prefixed with `/api`. Authenticated endpoints require a valid session cookie (`better-auth.session_token`) obtained by signing in through the OAuth2 flow.

---

## Authentication

Authentication is handled by [better-auth](https://better-auth.com) via OAuth2/PKCE with the WSVA provider.

| Endpoint | Description |
|---|---|
| `GET /api/auth/signin/wsva_oauth2` | Start the OAuth2 sign-in flow |
| `GET /api/auth/callback/wsva_oauth2` | OAuth2 callback (handled automatically) |
| `POST /api/auth/signout` | Sign out and clear the session cookie |

After a successful sign-in, the session cookie is set automatically by the browser. All authenticated endpoints below rely on this cookie.

---

## Cards

### Create a card

```
POST /api/card
```

Creates a new flashcard for the authenticated user.

**Authentication:** Required

**Request headers:**

```
Content-Type: application/json
Cookie: better-auth.session_token=<session>
```

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | Yes | The front side of the card |
| `answer` | string | Yes | The back side of the card |
| `suggestion` | string | No | A hint shown before the answer (defaults to `""`) |
| `note` | string | No | Additional notes (defaults to `""`) |

**Example request:**

```bash
curl -X POST http://localhost:3000/api/card \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<your-session-token>" \
  -d '{
    "question": "Was ist ein Apfel?",
    "answer": "Ein Apfel ist eine Frucht.",
    "suggestion": "Obst",
    "note": "A1 vocabulary"
  }'
```

**Success response — `201 Created`:**

```json
{
  "uuid": "a1b2c3d4e5f6...",
  "user_id": "user@example.com",
  "question": "Was ist ein Apfel?",
  "answer": "Ein Apfel ist eine Frucht.",
  "suggestion": "Obst",
  "note": "A1 vocabulary",
  "familiarity": 0,
  "created_at": "2026-04-02T10:00:00.000Z",
  "updated_at": "2026-04-02T10:00:00.000Z"
}
```

**Error responses:**

| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Invalid JSON body" }` | Request body is not valid JSON |
| `400` | `{ "error": "Validation failed", "details": [...] }` | Missing or invalid fields |
| `401` | `{ "error": "Unauthorized" }` | No valid session cookie |
| `500` | `{ "error": "..." }` | Database error |

**Notes:**
- `user_id` is always set from the session — it is not accepted from the request body.
- `familiarity` always starts at `0` for new cards.
- `uuid` is generated server-side.

---

## Books

### List books

```
GET /api/book
```

Returns all books owned by or public to the authenticated user.

**Authentication:** Required

**Success response — `200 OK`:** Array of `book_meta` objects.

---

### Create a book

```
POST /api/book
```

**Authentication:** Required

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Book title |
| `language` | string | Yes | Language code (e.g. `de`, `en`) |
| `author` | string | No | Author name |
| `description` | string | No | Short description |
| `source` | string | No | URL, ISBN, or other source reference |
| `is_public` | boolean | No | Whether the book is visible to others (default `false`) |

**Success response — `201 Created`:** The created `book_meta` object.

---

### Get a book

```
GET /api/book/:uuid
```

**Authentication:** Required

**Success response — `200 OK`:** The `book_meta` object. Returns `403` if the book is private and not owned by the user.

---

### Update a book

```
PUT /api/book/:uuid
```

**Authentication:** Required (must be owner)

**Request body:** Same fields as create (all required again except optional ones).

**Success response — `200 OK`:** The updated `book_meta` object.

---

### Delete a book

```
DELETE /api/book/:uuid
```

**Authentication:** Required (must be owner)

**Success response — `200 OK`:** `{ "deleted": "<uuid>" }`

---

## Chapters

### List chapters

```
GET /api/book/chapter?book_uuid=<uuid>
```

Returns all chapters of a book as a flat list. The client builds the tree from `parent_uuid` references.

**Authentication:** Required

**Query params:**

| Param | Required | Description |
|---|---|---|
| `book_uuid` | Yes | UUID of the book |

**Success response — `200 OK`:** Array of `book_chapter` objects ordered by `(parent_uuid, order_num)`.

---

### Create a chapter

```
POST /api/book/chapter
```

**Authentication:** Required (must be book owner)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `book_uuid` | string | Yes | UUID of the parent book |
| `title` | string | Yes | Chapter title |
| `parent_uuid` | string\|null | No | UUID of parent chapter (`null` for root) |
| `order_num` | integer | No | Position among siblings (auto-calculated if omitted) |
| `description` | string | No | Optional description |

**Success response — `201 Created`:** The created `book_chapter` object.

---

### Get a chapter

```
GET /api/book/chapter/:uuid
```

**Authentication:** Required

**Success response — `200 OK`:** The `book_chapter` object.

---

### Update a chapter

```
PUT /api/book/chapter/:uuid
```

**Authentication:** Required (must be book owner)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Chapter title |
| `description` | string | No | Optional description |
| `order_num` | integer | No | New position among siblings |
| `parent_uuid` | string\|null | No | Move to a different parent |

**Success response — `200 OK`:** The updated `book_chapter` object.

---

### Delete a chapter

```
DELETE /api/book/chapter/:uuid
```

**Authentication:** Required (must be book owner)

**Success response — `200 OK`:** `{ "deleted": "<uuid>" }`

---

## Sentences

### List sentences

```
GET /api/book/sentence?chapter_uuid=<uuid>
```

Returns all sentences in a chapter for the authenticated user, ordered by `order_num`.

**Authentication:** Required

**Query params:**

| Param | Required | Description |
|---|---|---|
| `chapter_uuid` | Yes | UUID of the chapter |

**Success response — `200 OK`:** Array of `book_sentence` objects.

---

### Create a sentence

```
POST /api/book/sentence
```

**Authentication:** Required (must be book owner)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `chapter_uuid` | string | Yes | UUID of the parent chapter |
| `content` | string | Yes | Sentence text |
| `sentence_type` | string | No | `text` (default) or `paragraph_break` |
| `order_num` | integer | No | Position in chapter (auto-calculated if omitted) |

**Success response — `201 Created`:** The created `book_sentence` object.

---

### Get a sentence

```
GET /api/book/sentence/:uuid
```

**Authentication:** Required (must be sentence owner)

**Success response — `200 OK`:** The `book_sentence` object.

---

### Update a sentence

```
PUT /api/book/sentence/:uuid
```

**Authentication:** Required (must be sentence owner)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | string | Yes | Sentence text |
| `sentence_type` | string | No | `text` or `paragraph_break` |
| `order_num` | integer | No | New position in chapter |

**Success response — `200 OK`:** The updated `book_sentence` object.

---

### Delete a sentence

```
DELETE /api/book/sentence/:uuid
```

**Authentication:** Required (must be sentence owner)

**Success response — `200 OK`:** `{ "deleted": "<uuid>" }`

---

## Media files

### Serve a file

```
GET /api/data/<path>
```

Serves files from the `/fms_data` volume. HLS video sources (directories containing `index.m3u8`) are automatically redirected to the manifest URL.

**Authentication:** Not required

**Example:**

```
GET /api/data/audio/recording.wav
GET /api/data/video/lesson1/         → redirects to /api/data/hls/video/lesson1/index.m3u8
```

---

## Subtitles

### Get subtitle file

```
GET /api/listen/subtitle/<uuid>
```

Returns the subtitle file for a given subtitle UUID. Supports `vtt` and `srt` formats.

**Authentication:** Not required

**Response:** Raw subtitle file with appropriate `Content-Type` header (`text/vtt` or `text/plain`).

**Error responses:**

| Status | Cause |
|---|---|
| `404` | Subtitle not found |
| `500` | Internal server error |
