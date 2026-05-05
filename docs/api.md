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

### Update a card

```
PATCH /api/card
```

Updates fields on an existing flashcard owned by the authenticated user.

**Authentication:** Required (API key or session)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `uuid` | string (UUID) | Yes | UUID of the card to update |
| `answer` | string | Yes | New answer content |
| `question` | string | No | Replacement question text |
| `suggestion` | string | No | Replacement hint text |
| `note` | string | No | Replacement notes |

**Example request (Python):**

```python
import requests
requests.patch(
    "https://your-host/api/card",
    headers={"x-api-key": "<key>", "Content-Type": "application/json"},
    json={"uuid": "<card-uuid>", "answer": "# English\n**noun** ..."},
)
```

**Success response — `200 OK`:** the updated card object (same shape as POST 201).

**Error responses:**

| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Validation failed", "details": [...] }` | Missing or invalid fields |
| `401` | `{ "error": "Unauthorized" }` | No valid session |
| `403` | `{ "error": "Forbidden" }` | Card belongs to another user |
| `404` | `{ "error": "..." }` | Card UUID not found |

---

## Incomplete Cards

### List incomplete cards

```
GET /api/card/incomplete
GET /api/card/incomplete?tag_uuid=<uuid>
GET /api/card/incomplete?tag_uuid=<uuid>&page=1&limit=20
```

Returns cards owned by the authenticated user whose `answer` field is empty. Optionally filtered to cards that have a specific tag assigned.

**Authentication:** Required (session cookie or `x-api-key` header)

**Query params:**

| Param | Required | Description |
|---|---|---|
| `tag_uuid` | No | UUID of a tag in `settings_tag`; when provided only cards with this tag are returned |
| `page` | No | Page number (default `1`) |
| `limit` | No | Results per page, 1–100 (default `20`) |

**Success response — `200 OK`:**

```json
{
  "data": [ ...qsa_card objects... ],
  "page": 1,
  "total_pages": 2,
  "total_records": 35
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `401` | Not authenticated |

---

## Card Improvements

The improvement workflow: an external script fetches cards that need processing, runs AI, and writes improvements back via the API. The web UI at `/card/improve` is used to review and accept/reject each suggestion.

### List cards needing improvement

```
GET /api/card/improve?todo=1
```

Returns all cards owned by the user that have no pending or approved improvement record yet.

**Authentication:** Required (session cookie or `x-api-key` header)

**Response:** Array of `qsa_card` objects.

### List improvement records

```
GET /api/card/improve
GET /api/card/improve?status=pending
GET /api/card/improve?status=approved
GET /api/card/improve?status=rejected
GET /api/card/improve?page=1&limit=20
```

Returns improvement records with embedded card data.

**Response:**

```json
{
  "data": [
    {
      "uuid": "...",
      "card_uuid": "...",
      "current": "{\"question\":\"...\",\"suggestion\":\"...\",\"answer\":\"...\",\"note\":\"...\"}",
      "improved": "{\"question\":\"...\",\"suggestion\":\"...\",\"answer\":\"...\",\"note\":\"...\"}",
      "status": "pending",
      "note": "",
      "card": { ... }
    }
  ],
  "page": 1,
  "total_pages": 3,
  "total_records": 25
}
```

### Write an improvement

```
POST /api/card/improve
```

Creates a new improvement record with `status: "pending"`.

**Authentication:** Required

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `card_uuid` | string | Yes | UUID of the card being improved |
| `current` | string | Yes | JSON of current card content `{question, suggestion, answer, note}` |
| `improved` | string | Yes | JSON of AI-improved card content `{question, suggestion, answer, note}` |
| `note` | string | No | Optional note about the improvement |

**Example request:**

```python
import requests, json

session = "your-session-token"
headers = {"Cookie": f"better-auth.session_token={session}", "Content-Type": "application/json"}
# or: headers = {"x-api-key": "your-api-key", "Content-Type": "application/json"}

card = requests.get("https://your-host/api/card/improve?todo=1", headers=headers).json()[0]

current = {"question": card["question"], "suggestion": card["suggestion"],
           "answer": card["answer"], "note": card["note"]}
improved = {**current, "answer": "AI-improved answer here"}

requests.post("https://your-host/api/card/improve", headers=headers,
    json={"card_uuid": card["uuid"], "current": json.dumps(current), "improved": json.dumps(improved)})
```

**Response:** The created `qsa_card_improve` object with status `201 Created`.

**Notes:**
- `user_id` is set from the session.
- `uuid` is generated server-side.
- `status` is always set to `"pending"` — use the `/card/improve` web UI to accept or reject.

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

## Listen Media

### List media

```
GET /api/listen/media
```

Returns all listen media owned by or public to the authenticated user.

**Authentication:** Required

**Success response — `200 OK`:** Array of `listen_media` objects.

---

### Create media

```
POST /api/listen/media
```

Creates a new listen media item for the authenticated user.

**Authentication:** Required

Accepts either `application/json` or `multipart/form-data`. When a file is uploaded the server saves it to `/fms_data/listen/media/<uuid>.<ext>` and auto-sets `source` if not provided.

**JSON body fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Display title of the media |
| `source` | string | Yes | URL or path to the media file |
| `note` | string | No | Additional notes (defaults to `""`) |

**Multipart form fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Display title of the media |
| `file` | file | No | Audio or video file to upload |
| `source` | string | No | URL or path; defaults to `/api/data/listen/media/<uuid>.<ext>` when `file` is provided, required otherwise |
| `note` | string | No | Additional notes (defaults to `""`) |

**Example request (JSON):**

```bash
curl -X POST http://localhost:3000/api/listen/media \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<your-session-token>" \
  -d '{
    "title": "Nachrichten vom 01.05.2026",
    "source": "/api/data/listen/media/a1b2c3d4.mp3",
    "note": "B2 level"
  }'
```

**Example request (file upload):**

```bash
curl -X POST http://localhost:3000/api/listen/media \
  -H "Cookie: better-auth.session_token=<your-session-token>" \
  -F "title=Nachrichten vom 01.05.2026" \
  -F "note=B2 level" \
  -F "file=@/path/to/news-2026-05-01.mp3"
```

**Success response — `201 Created`:**

```json
{
  "uuid": "a1b2c3d4e5f6...",
  "user_id": "user@example.com",
  "title": "Nachrichten vom 01.05.2026",
  "source": "/api/data/listen/media/a1b2c3d4e5f6.mp3",
  "note": "B2 level",
  "created_at": "2026-05-01T10:00:00.000Z",
  "updated_at": "2026-05-01T10:00:00.000Z"
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `400` | Missing required fields, invalid JSON, or missing `source` when no file uploaded |
| `401` | Not authenticated |
| `500` | Database error or file write failure |

---

### Get tags for a media item

```
GET /api/listen/media/<uuid>/tag
```

Returns the list of tag UUIDs currently assigned to the media item.

**Authentication:** Required

**Success response — `200 OK`:** Array of tag UUID strings.

---

### Set tags on a media item

```
PUT /api/listen/media/<uuid>/tag
```

Replaces all tags on the media item with the provided list. Pass an empty array to remove all tags.

**Authentication:** Required

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `tag_uuids` | string[] | Yes | Full list of tag UUIDs to assign (replaces existing) |

**Example request:**

```python
import requests

requests.put(
    "http://localhost:3000/api/listen/media/<uuid>/tag",
    headers={"x-api-key": API_KEY},
    json={"tag_uuids": ["tag-uuid-1", "tag-uuid-2"]},
)
```

**Success response — `200 OK`:**

```json
{ "tag_uuids": ["tag-uuid-1", "tag-uuid-2"] }
```

**Error responses:**

| Status | Cause |
|---|---|
| `400` | Missing or invalid `tag_uuids` field |
| `401` | Not authenticated |
| `500` | Database error |

---

## Subtitles

### Add a subtitle

```
POST /api/listen/subtitle
```

Creates a new subtitle entry linked to an existing media item.

**Authentication:** Required

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `media_uuid` | string | Yes | UUID of the parent media item |
| `language` | string | Yes | Language code, e.g. `"de"`, `"en"` |
| `subtitle` | string | Yes | Full subtitle file content |
| `format` | string | No | File format: `"vtt"`, `"srt"` (defaults to `"vtt"`) |

**Success response — `201 Created`:** `listen_subtitle` object.

**Error responses:**

| Status | Cause |
|---|---|
| `400` | Missing required fields or invalid JSON |
| `401` | Not authenticated |
| `500` | Database error |

---

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

---

### Bulk import audio files with subtitles

The following script iterates over all audio files in a directory, uploads each file to the server, uploads the matching `.vtt` subtitle file (same base name) if it exists, and optionally assigns tags.

**Prerequisites:** Python 3, `requests` (`pip install requests`)

```python
#!/usr/bin/env python3
# Usage: AUDIO_DIR=/path/to/audio BASE_URL=http://localhost:3000 API_KEY=<key> [LANGUAGE=de] [TAG_UUIDS=uuid1,uuid2] python import_audio.py
import os
import sys
from pathlib import Path
import requests

AUDIO_DIR = Path(os.environ.get("AUDIO_DIR") or sys.exit("Set AUDIO_DIR"))
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
API_KEY = os.environ.get("API_KEY") or sys.exit("Set API_KEY")
LANGUAGE = os.environ.get("LANGUAGE", "de")
TAG_UUIDS = [t for t in os.environ.get("TAG_UUIDS", "").split(",") if t]

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".wav", ".ogg", ".flac"}

auth_headers = {"x-api-key": API_KEY}

for audio_file in sorted(AUDIO_DIR.iterdir()):
    if audio_file.suffix.lower() not in AUDIO_EXTENSIONS:
        continue

    title = audio_file.stem
    vtt_file = audio_file.with_suffix(".vtt")

    # Create media entry and upload audio file
    with audio_file.open("rb") as f:
        r = requests.post(
            f"{BASE_URL}/api/listen/media",
            headers=auth_headers,
            data={"title": title},
            files={"file": (audio_file.name, f)},
        )
    data = r.json()
    media_uuid = data.get("uuid")
    if not media_uuid:
        print(f"ERROR [{title}]: {data.get('error', data)}")
        continue
    print(f"OK [{title}] media={media_uuid}")

    # Upload subtitle if .vtt file exists alongside the audio
    if vtt_file.exists():
        r = requests.post(f"{BASE_URL}/api/listen/subtitle", headers=headers, json={
            "media_uuid": media_uuid,
            "language": LANGUAGE,
            "format": "vtt",
            "subtitle": vtt_file.read_text(encoding="utf-8"),
        })
        sub_data = r.json()
        sub_uuid = sub_data.get("uuid")
        if not sub_uuid:
            print(f"  ERROR subtitle: {sub_data.get('error', sub_data)}")
        else:
            print(f"  subtitle={sub_uuid}")
    else:
        print(f"  SKIP subtitle (no .vtt found at {vtt_file})")

    # Assign tags if provided
    if TAG_UUIDS:
        r = requests.put(f"{BASE_URL}/api/listen/media/{media_uuid}/tag", headers=headers, json={
            "tag_uuids": TAG_UUIDS,
        })
        tag_data = r.json()
        if "tag_uuids" not in tag_data:
            print(f"  ERROR tags: {tag_data.get('error', tag_data)}")
        else:
            print(f"  tags={tag_data['tag_uuids']}")
```

**Example run:**

```bash
AUDIO_DIR=/media/german/news \
BASE_URL=https://fms.example.com \
API_KEY=my-api-key \
LANGUAGE=de \
python import_audio.py
```

**Output:**

```
OK [2026-05-01-nachrichten] media=a1b2c3d4...
  subtitle=e5f6g7h8...
OK [2026-05-02-nachrichten] media=b2c3d4e5...
  SKIP subtitle (no .vtt found at /media/german/news/2026-05-02-nachrichten.vtt)
```
