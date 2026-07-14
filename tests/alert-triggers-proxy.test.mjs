// Unit tests for the /api/v1/alerts/triggers* proxy (workers/api.mjs's
// handleAlertTriggersProxy, #4984 Part 1), which forwards POST/GET/PATCH/
// DELETE to workers/data-api.mjs's handleAlertTriggersRoute via the EXISTING
// DATA_API service binding. Unlike neurons-sync's proxyToDataApi (a raw
// pass-through), this one envelope-wraps the response via dataResponse/
// errorResponse -- see handleAlertTriggersProxy's own comment. The
// downstream CRUD logic itself is covered by tests/alert-triggers-route.test.mjs.
import assert from "node:assert/strict";
import { test } from "vitest";
import { handleRequest } from "../workers/api.mjs";

function req(path, { method = "GET", headers = {}, body } = {}) {
  return new Request(`https://api.metagraph.sh${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

test("returns 503 when DATA_API is not bound", async () => {
  const res = await handleRequest(
    req("/api/v1/alerts/triggers", { method: "POST", body: {} }),
    {},
    {},
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "alert_triggers_unavailable");
});

test("forwards POST to DATA_API and envelope-wraps a successful response", async () => {
  let receivedPath;
  let receivedMethod;
  const res = await handleRequest(
    req("/api/v1/alerts/triggers", {
      method: "POST",
      headers: { "x-alert-trigger-create-token": "shared-secret" },
      body: { channel: "email", destination: "a@b.com", netuid: 7 },
    }),
    {
      DATA_API: {
        fetch(request) {
          receivedPath = new URL(request.url).pathname;
          receivedMethod = request.method;
          return new Response(
            JSON.stringify({ id: "1", owner_token: "abc", netuid: 7 }),
            { status: 201 },
          );
        },
      },
    },
    {},
  );
  assert.equal(receivedPath, "/api/v1/alerts/triggers");
  assert.equal(receivedMethod, "POST");
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.data, { id: "1", owner_token: "abc", netuid: 7 });
});

test("forwards GET /{id} to DATA_API, including the owner-token header", async () => {
  let receivedToken;
  const res = await handleRequest(
    req("/api/v1/alerts/triggers/1", {
      method: "GET",
      headers: { "x-alert-trigger-owner-token": "abc" },
    }),
    {
      DATA_API: {
        fetch(request) {
          receivedToken = request.headers.get("x-alert-trigger-owner-token");
          return new Response(JSON.stringify({ id: "1", netuid: 7 }), {
            status: 200,
          });
        },
      },
    },
    {},
  );
  assert.equal(receivedToken, "abc");
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).data, { id: "1", netuid: 7 });
});

test("forwards PATCH to DATA_API", async () => {
  let receivedMethod;
  const res = await handleRequest(
    req("/api/v1/alerts/triggers/1", {
      method: "PATCH",
      headers: { "x-alert-trigger-owner-token": "abc" },
      body: { channel: "email", destination: "a@b.com", netuid: 8 },
    }),
    {
      DATA_API: {
        fetch(request) {
          receivedMethod = request.method;
          return new Response(JSON.stringify({ id: "1", netuid: 8 }), {
            status: 200,
          });
        },
      },
    },
    {},
  );
  assert.equal(receivedMethod, "PATCH");
  assert.equal(res.status, 200);
});

test("forwards DELETE to DATA_API", async () => {
  let receivedMethod;
  const res = await handleRequest(
    req("/api/v1/alerts/triggers/1", {
      method: "DELETE",
      headers: { "x-alert-trigger-owner-token": "abc" },
    }),
    {
      DATA_API: {
        fetch(request) {
          receivedMethod = request.method;
          return new Response(JSON.stringify({ id: "1", deleted: true }), {
            status: 200,
          });
        },
      },
    },
    {},
  );
  assert.equal(receivedMethod, "DELETE");
  assert.deepEqual((await res.json()).data, { id: "1", deleted: true });
});

test("relays a non-2xx upstream status with the upstream's error message", async () => {
  const res = await handleRequest(
    req("/api/v1/alerts/triggers", {
      method: "POST",
      headers: { "x-alert-trigger-create-token": "wrong" },
      body: {},
    }),
    {
      DATA_API: {
        fetch() {
          return new Response(
            JSON.stringify({ error: "provide a valid token" }),
            { status: 401 },
          );
        },
      },
    },
    {},
  );
  assert.equal(res.status, 401);
  const relayed = await res.json();
  assert.equal(relayed.error.message, "provide a valid token");
  // #5475: a 401 is now a distinct code, not the collapsed generic one.
  assert.equal(relayed.error.code, "alert_trigger_unauthorized");
});

// #5475: each upstream failure mode maps to its own documented error code
// instead of the single collapsed alert_trigger_request_failed.
for (const [status, code] of [
  [400, "alert_trigger_invalid_request"],
  [401, "alert_trigger_unauthorized"],
  [404, "alert_trigger_not_found"],
  [413, "alert_trigger_payload_too_large"],
  [429, "alert_trigger_rate_limited"],
  [502, "alert_triggers_unavailable"],
  [503, "alert_triggers_unavailable"],
]) {
  test(`maps upstream ${status} to error code ${code}`, async () => {
    const res = await handleRequest(
      req("/api/v1/alerts/triggers", { method: "POST", body: {} }),
      {
        DATA_API: {
          fetch() {
            return new Response(JSON.stringify({ error: "upstream said no" }), {
              status,
            });
          },
        },
      },
      {},
    );
    assert.equal(res.status, status);
    assert.equal((await res.json()).error.code, code);
  });
}

// #5475: an unmapped 4xx keeps the original generic code -- the reclass is
// additive, never a silent catch-all reassignment.
test("keeps the generic code for an unmapped 4xx status", async () => {
  const res = await handleRequest(
    req("/api/v1/alerts/triggers", { method: "POST", body: {} }),
    {
      DATA_API: {
        fetch() {
          return new Response(JSON.stringify({ error: "teapot" }), {
            status: 418,
          });
        },
      },
    },
    {},
  );
  assert.equal(res.status, 418);
  assert.equal((await res.json()).error.code, "alert_trigger_request_failed");
});

// #5475: the upstream's rate-limit header family is forwarded onto the proxied
// 429 so a throttled client sees the real backoff signal.
test("forwards the upstream rate-limit headers on a 429", async () => {
  const res = await handleRequest(
    req("/api/v1/alerts/triggers", {
      method: "POST",
      headers: { "x-alert-trigger-create-token": "shared-secret" },
      body: { channel: "email", destination: "a@b.com", netuid: 7 },
    }),
    {
      DATA_API: {
        fetch() {
          return new Response(
            JSON.stringify({ error: "too many alert trigger creation requests" }),
            {
              status: 429,
              headers: {
                "retry-after": "60",
                "x-ratelimit-limit": "10",
                "x-ratelimit-policy": "10;w=60",
                "x-ratelimit-remaining": "0",
              },
            },
          );
        },
      },
    },
    {},
  );
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "60");
  assert.equal(res.headers.get("x-ratelimit-limit"), "10");
  assert.equal(res.headers.get("x-ratelimit-policy"), "10;w=60");
  assert.equal(res.headers.get("x-ratelimit-remaining"), "0");
});

// #5475: header forwarding is a whitelisted copy -- absent upstream headers
// simply don't appear, and non-listed headers never leak through.
test("omits rate-limit headers when the upstream error carries none", async () => {
  const res = await handleRequest(
    req("/api/v1/alerts/triggers", { method: "POST", body: {} }),
    {
      DATA_API: {
        fetch() {
          return new Response(JSON.stringify({ error: "bad request" }), {
            status: 400,
            headers: { "set-cookie": "leak=1" },
          });
        },
      },
    },
    {},
  );
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("retry-after"), null);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("relays a non-2xx upstream status with a generic message when the body has no error string", async () => {
  const res = await handleRequest(
    req("/api/v1/alerts/triggers", { method: "POST", body: {} }),
    {
      DATA_API: {
        fetch() {
          return new Response(JSON.stringify({}), { status: 503 });
        },
      },
    },
    {},
  );
  assert.equal(res.status, 503);
  assert.match(
    (await res.json()).error.message,
    /alert triggers tier returned an error/,
  );
});

test("returns 502 when the upstream response body is unreadable", async () => {
  const res = await handleRequest(
    req("/api/v1/alerts/triggers", { method: "POST", body: {} }),
    {
      DATA_API: {
        fetch() {
          return new Response("not json", { status: 200 });
        },
      },
    },
    {},
  );
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.code, "alert_triggers_unavailable");
});
