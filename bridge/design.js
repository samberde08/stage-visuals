'use strict';
// "Design with Claude": turns a written brief and/or reference photos into a stage description (app/stagespec.js),
// or edits the current one. The page posts to /api/design on the bridge; the bridge calls Claude, so the API key
// stays on this computer and never reaches the browser.
//
// Credentials: ANTHROPIC_API_KEY, or a profile from `ant auth login` (the SDK finds either).
// The SDK is an optional dependency: `npm install` adds it. Without it the endpoint says how to set it up.

const StageSpec = require('../app/stagespec.js');

const MODEL = process.env.STAGE_DESIGN_MODEL || 'claude-opus-5-5';
const MAX_IMAGES = 8;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const SYSTEM = `You design concert and festival stages for a 3D previsualisation app. You answer with one stage description in the app's JSON format, nothing else needed.

${StageSpec.GUIDE}

How to work:
- With no current stage, build a complete one from the brief or photos. With a current stage, change only what is asked and keep every other part, id and number as it is.
- From photos: identify the plan shape of the deck and any thrust, wings, risers and stairs; estimate sizes against people (about 1.75 m), DJ tables (about 1.05 m high, 2 to 3 m wide), truss (0.3 to 0.4 m box) or any measurement the person gives, which always wins. Then add LED surfaces, set pieces and truss as seen. Several photos show one stage from different angles; combine them.
- Prefer shapes over long outlines when a shape fits. Keep part ids short and readable (deck, thrust, back-wall, booth).
- Say what you estimated in "notes".

Reply with a single JSON object and no other text: {"spec": <the full stage description>, "summary": "<one or two plain sentences on what you built or changed>"}`;

let sdkCache;
function sdk() {
  if (sdkCache !== undefined) return sdkCache;
  try { sdkCache = require('@anthropic-ai/sdk'); } catch (_) { sdkCache = null; }
  return sdkCache;
}

// The first JSON object in a reply, with or without a code fence around it.
function parseReply(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Claude did not return a stage description.');
  const obj = JSON.parse(body.slice(start, end + 1));
  if (obj && Array.isArray(obj.parts)) return { spec: obj, summary: '' };
  if (!obj || !obj.spec) throw new Error('Claude did not return a stage description.');
  return { spec: obj.spec, summary: String(obj.summary || '') };
}

// The request's content blocks: photos first, then the current stage and the brief.
function buildContent({ prompt, spec, images, measurement }) {
  const content = [];
  (images || []).slice(0, MAX_IMAGES).forEach((im) => {
    if (!im || !IMAGE_TYPES.includes(im.media_type) || typeof im.data !== 'string') return;
    content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } });
  });
  const parts = [];
  if (spec && Array.isArray(spec.parts) && spec.parts.length) parts.push(`Current stage:\n${JSON.stringify(spec)}`);
  else parts.push('There is no stage yet: build a new one.');
  if (content.length) parts.push(`${content.length} reference photo${content.length === 1 ? '' : 's'} above.`);
  if (measurement) parts.push(`Known measurement: ${measurement}`);
  parts.push(`Request: ${prompt || (content.length ? 'Build this stage from the photos.' : 'Design a stage.')}`);
  content.push({ type: 'text', text: parts.join('\n\n') });
  return content;
}

async function design(input, opts = {}) {
  const Anthropic = opts.client ? null : sdk();
  if (!opts.client && !Anthropic) {
    const e = new Error('Design with Claude needs the Anthropic SDK: run `npm install` in the stage-visuals folder, then restart.');
    e.status = 501; throw e;
  }
  const client = opts.client || new (Anthropic.default || Anthropic)();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: SYSTEM,
    messages: [{ role: 'user', content: buildContent(input) }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') { const e = new Error('Claude declined this request.'); e.status = 422; throw e; }
  if (msg.stop_reason === 'max_tokens') { const e = new Error('The design ran too long. Try a simpler brief.'); e.status = 422; throw e; }
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const reply = parseReply(text);
  const norm = StageSpec.normalize(reply.spec);
  return { spec: norm.spec, summary: reply.summary, warnings: norm.warnings, model: msg.model };
}

// HTTP handler for POST /api/design: { prompt, spec?, images?: [{ media_type, data (base64) }], measurement? }.
function handle(req, res, opts = {}) {
  const limit = 40 * 1024 * 1024, chunks = [];
  let size = 0, dead = false;
  const reply = (status, obj) => { if (dead) return; dead = true; res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  req.on('data', (c) => { size += c.length; if (size > limit) { reply(413, { error: 'Too much to send at once: use fewer or smaller photos.' }); req.destroy(); } else chunks.push(c); });
  req.on('end', async () => {
    if (dead) return;
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { reply(400, { error: 'Bad request.' }); return; }
    try { reply(200, await design(input, opts)); }
    catch (e) {
      const A = sdk(), Api = A && (A.default || A);
      if (Api && e instanceof Api.AuthenticationError) reply(401, { error: 'No working Claude credentials: set ANTHROPIC_API_KEY or run `ant auth login`, then restart the bridge.' });
      else if (Api && e instanceof Api.RateLimitError) reply(429, { error: 'Claude is busy (rate limited). Try again in a minute.' });
      else if (Api && e instanceof Api.APIConnectionError) reply(502, { error: 'Could not reach Claude. Check the internet connection.' });
      else if (Api && e instanceof Api.APIError) reply(502, { error: `Claude returned an error: ${e.message}` });
      else if (e instanceof SyntaxError) reply(502, { error: 'Claude returned a description that was not valid JSON. Try again.' });
      else reply(e.status && e.status >= 400 && e.status < 600 ? e.status : 500, { error: e.message || 'Design failed.' });
    }
  });
}

module.exports = { design, handle, parseReply, buildContent, SYSTEM, MODEL };
