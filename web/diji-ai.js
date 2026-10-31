/* Diji AI for the apps Diji builds: chatbots and AI features with no API key.
   <script src="https://diji-pi.vercel.app/diji-ai.js"></script>
   const reply = await DijiAI.chat({ system: "You are a helpful tutor.", messages: [{ role: "user", content: "Hi" }],
     onToken: (piece, soFar) => show(soFar) });   // piece = new text, soFar = the whole reply so far
   bubble.innerHTML = DijiAI.markdown(reply);       // safe Markdown → HTML
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
    var shown = "";
    var warned = false;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      text += dec.decode(r.value, { stream: true });
      var now = clean(text.replace(/<diji-error>[\s\S]*$/, ""));
      if (opts.onToken && now.length > shown.length) {
        var piece = now.slice(shown.length);
        shown = now;
        // A bug in the app's own callback must not lose the reply.
        try {
          opts.onToken(piece, now);
        } catch (e) {
          if (!warned) console.error("DijiAI onToken callback failed:", e);
          warned = true;
        }
      }
    }
    var err = text.match(/<diji-error>([\s\S]*?)<\/diji-error>/);
    if (err && !clean(text.replace(err[0], "")).trim()) throw new Error(err[1]);
    return clean(text.replace(/<diji-error>[\s\S]*?<\/diji-error>/g, "")).trim();
  }

  // Small, safe Markdown renderer for chat replies (escapes HTML first).
  function markdown(src) {
    var esc = String(src || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
    var blocks = esc.split(/```/);
    return blocks
      .map(function (part, i) {
        if (i % 2) return "<pre><code>" + part.replace(/^[\w-]*\n/, "") + "</code></pre>";
        return part
          .split(/\n{2,}/)
          .map(function (p) {
            var inline = function (t) {
              return t
                .replace(/`([^`]+)`/g, "<code>$1</code>")
                .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
                .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
                .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
            };
            if (!p.trim()) return "";
            var lines = p.split("\n");
            if (lines.every(function (l) { return /^\s*([-*]|\d+\.)\s+/.test(l) || !l.trim(); })) {
              var ordered = /^\s*\d+\./.test(lines[0]);
              return (ordered ? "<ol>" : "<ul>") + lines.filter(function (l) { return l.trim(); }).map(function (l) { return "<li>" + inline(l.replace(/^\s*([-*]|\d+\.)\s+/, "")) + "</li>"; }).join("") + (ordered ? "</ol>" : "</ul>");
            }
            var h = p.match(/^(#{1,3})\s+(.*)$/);
            if (h && lines.length === 1) return "<h" + (h[1].length + 2) + ">" + inline(h[2]) + "</h" + (h[1].length + 2) + ">";
            return p.trim() ? "<p>" + inline(p).replace(/\n/g, "<br>") + "</p>" : "";
          })
          .join("");
      })
      .join("");
  }

  function ask(prompt, opts) {
    return chat(Object.assign({}, opts, { messages: [{ role: "user", content: String(prompt) }] }));
  }

  window.DijiAI = { chat: chat, ask: ask, markdown: markdown, base: BASE };
})();
