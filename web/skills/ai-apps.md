---
name: ai-apps
description: Build LLM features: prompts, streaming, tool calling, RAG and evaluation.
---
# AI Apps & Agents

- Keep provider-agnostic: most providers speak the OpenAI `/chat/completions` format; Anthropic uses `/v1/messages`. Wrap both behind one small function.
- Keys stay server-side (or are brought by the user and only proxied). Never ship a key in client code.
- Stream responses (SSE) for perceived speed; handle aborts and partial output.
- Prompts: a clear role, the task, constraints, output format, and 1–2 examples. Ask for structured JSON with a schema when code consumes the output, and validate it.
- Tool calling: describe tools with tight JSON schemas, validate arguments, cap the loop (e.g. 5 steps), and feed tool errors back as results.
- RAG: chunk by meaning (headings/paragraphs, ~300–800 tokens with overlap), embed, store in pgvector or a vector DB, retrieve top-k, cite sources in the answer.
- Reliability: timeouts, retries with backoff, fallback models, rate limits, and cost logging per request.
- Evaluate with a small fixed test set of real questions before and after prompt changes.
