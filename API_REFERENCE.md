# API Reference

> Base URL: `http://localhost:3000/api/v1`
> All responses wrap data in `{ statusCode, message, data }` unless noted otherwise.

---

## Generate Pro

### `POST /generate-pro/create`

Submit a product image + details to generate a UGC video via Kie.ai (Sora).

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | File | ✅ | jpg / jpeg / png / webp, max 5 MB |
| `jobId` | string | ✅ | Client-generated UUID — used as SSE stream key |
| `productTitle` | string | ✅ | Product name |
| `productDescription` | string | ✅ | Features / selling points |

**Rate limit:** 2 requests / 60 s

**Response `201`**
```json
{
  "statusCode": 201,
  "message": "Task submitted to Kie.ai",
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "taskId": "kie_task_abc123",
    "imageUrl": "https://storage-gambar-ai.s3.us-east-1.amazonaws.com/generate-pro/xxx.jpg",
    "generatedPrompt": "[0s–2s] A woman greets the camera warmly..."
  }
}
```

> `jobId` = client UUID (for SSE)
> `taskId` = Kie.ai task ID (for status polling + DB lookup)

---

### `GET /generate-pro/progress/:jobId` — SSE

Real-time progress stream. Connect with `new EventSource(url)`.

> Use `jobId` (the client UUID), **not** `taskId`.

Each `onmessage` event `data` field parses to:

```json
{
  "message": "Uploading product image...",
  "progress": 5,
  "status": "processing",
  "resultUrls": null,
  "failMsg": null
}
```

**Progress map:**

| `progress` | `status` | Stage |
|---|---|---|
| `5` | `processing` | Uploading image to S3 |
| `15` | `processing` | GPT-4o generating Sora prompt |
| `30` | `processing` | Submitting task to Kie.ai |
| `35` | `processing` | Saving job metadata to DB |
| `40` | `processing` | Task queued — Kie.ai rendering |
| `41–99` | `processing` | Kie.ai rendering progress (mapped from 0–100) |
| `100` | `success` | Done — `resultUrls` populated |
| `-1` | `failed` | Error — see `failMsg` |

**Success event:**
```json
{
  "message": "success",
  "progress": 100,
  "status": "success",
  "resultUrls": ["https://cdn.kie.ai/output/video.mp4"],
  "failMsg": null
}
```

**Failure event:**
```json
{
  "message": "failed",
  "progress": -1,
  "status": "failed",
  "resultUrls": null,
  "failMsg": "Content policy violation"
}
```

---

### `GET /generate-pro/active-job`

Returns the most recent job still in `processing` status.
Used on page load to reconnect the SSE stream after a browser refresh.

Returns `null` in `data` if no active job exists, or if Kie.ai already reports it done.

**Response `200`**
```json
{
  "statusCode": 200,
  "message": "Active job retrieved",
  "data": {
    "jobId": "kie_task_abc123",
    "productName": "Sandal Wanita Hak Tahu 3cm",
    "thumbnailUrl": "https://storage-gambar-ai.s3.us-east-1.amazonaws.com/generate-pro/xxx.jpg",
    "status": "processing",
    "createdAt": "2026-02-21T10:00:00.000Z"
  }
}
```

> `data` can be `null` — handle this in the frontend.
> Note: in this context `jobId` is the Kie.ai `taskId` (that's what's stored in the DB).

---

### `GET /generate-pro/status/:taskId`

Fallback polling endpoint. Use `taskId` returned from `/create`.
Also syncs DB status if Kie.ai is already done but DB is still `processing`.

**Response `200`**
```json
{
  "statusCode": 200,
  "message": "Task status retrieved",
  "data": {
    "taskId": "kie_task_abc123",
    "state": "success",
    "model": "sora-2-image-to-video",
    "resultUrls": ["https://cdn.kie.ai/output/video.mp4"],
    "failCode": null,
    "failMsg": null,
    "costTime": 95000
  }
}
```

`state` values: `"success"` | `"processing"` | `"fail"`

---

### `POST /generate-pro/callback` — Kie.ai webhook (not called by frontend)

Kie.ai calls this when generation finishes. Updates DB and fires SSE event.

**Body (from Kie.ai):**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "kie_task_abc123",
    "state": "success",
    "resultJson": "{\"resultUrls\":[\"https://cdn.kie.ai/output/video.mp4\"]}",
    "failCode": null,
    "failMsg": null,
    "model": "sora-2-image-to-video",
    "completeTime": 1708512000000,
    "costTime": 95000,
    "createTime": 1708511905000,
    "param": "{}"
  }
}
```

**Response:** `{ "received": true }`

---

### `POST /generate-pro/progress-callback` — Kie.ai webhook (not called by frontend)

Kie.ai calls this with intermediate progress (0–100). Mapped to 40–99 range and forwarded to SSE clients.

**Body (from Kie.ai):**
```json
{
  "data": {
    "taskId": "kie_task_abc123",
    "progress": 60
  }
}
```

**Response:** `{ "received": true }`

---

## Notifications

### `GET /notifications`

Fetch paginated notifications.

**Query params:**

| Param | Type | Default |
|---|---|---|
| `page` | number | `1` |
| `limit` | number | `20` |

**Response `200`**
```json
{
  "statusCode": 200,
  "message": "Notifications retrieved",
  "data": {
    "notifications": [
      {
        "id": "uuid-string",
        "userId": 0,
        "type": "video_success",
        "title": "Video selesai!",
        "message": "Video \"Sandal Wanita Hak Tahu\" berhasil dibuat",
        "jobId": "kie_task_abc123",
        "isRead": false,
        "createdAt": "2026-02-21T10:05:00.000Z"
      }
    ],
    "meta": {
      "total": 5,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

`type` values: `"video_success"` | `"video_failed"`

---

### `GET /notifications/unread-count`

**Response `200`**
```json
{
  "statusCode": 200,
  "message": "Unread count retrieved",
  "data": {
    "count": 3
  }
}
```

---

### `PATCH /notifications/:id/read`

Mark a single notification as read.

**Params:** `:id` — notification UUID

**Response `200`**
```json
{
  "statusCode": 200,
  "message": "Notification marked as read",
  "data": null
}
```

---

### `PATCH /notifications/read-all`

Mark all notifications as read.

**Response `200`**
```json
{
  "statusCode": 200,
  "message": "All notifications marked as read",
  "data": null
}
```
