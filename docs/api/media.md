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
