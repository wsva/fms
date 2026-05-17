# Media

## Media Files

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
