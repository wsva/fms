# Cards

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
