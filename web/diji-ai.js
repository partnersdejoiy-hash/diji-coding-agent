/* Diji AI for the apps Diji builds: chatbots and AI features with no API key.
   <script src="https://diji-pi.vercel.app/diji-ai.js"></script>
   const reply = await DijiAI.chat({ system: "You are a helpful tutor.", messages: [{ role: "user", content: "Hi" }], onToken: (t) => show(t) });
   const text = await DijiAI.ask("Summarise this: ...");
   Uses Diji's free models through this site's /api/chat. */
(function () {
  var script = document.currentScript;
  var BASE = (script && script.src && new URL(script.src).origin) || "https://diji-pi.vercel.app";

  function clean(text) {
    return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/^\s+/, "");
  }

  async function chat(opts) {
    opts = opts || {};
    var messages = (opts.messages || []).map(function (m) {
      return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") };
    });
    if (!messages.length) throw new Error("DijiAI.chat needs at least one message.");
    var res = await fetch(BASE + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify({
        provider: "diji-free",
        model: opts.model || "auto",
        effort: "low",
        temperature: typeof opts.temperature === "number" ? opts.temperature : 0.7,
        maxTokens: opts.maxTokens || 1500,
        system: opts.system || "You are a friendly, helpful assistant. Keep answers clear and short.",
        messages: messages.slice(-20),
      }),
    });
    if (!res.ok) {
      var j = await res.json().catch(function () { return {}; });
      throw new Error(j.error || "The AI is busy right now (" + res.status + "). Try again.");
    }
    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var text = "";
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      text += dec.decode(r.value, { stream: true });
      if (opts.onToken) opts.onToken(clean(text));
    }
    var err = text.match(/<diji-error>([\s\S]*?)<\/diji-error>/);
    if (err && !clean(text.replace(err[0], "")).trim()) throw new Error(err[1]);
    return clean(text.replace(/<diji-error>[\s\S]*?<\/diji-error>/g, "")).trim();
  }

  function ask(prompt, opts) {
    return chat(Object.assign({}, opts, { messages: [{ role: "user", content: String(prompt) }] }));
  }

  window.DijiAI = { chat: chat, ask: ask, base: BASE };
})();
