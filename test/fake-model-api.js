import http from 'node:http';

// Faux serveur de l'API du modèle, pour les tests de l'assistance d'écriture
// (branché par ANTHROPIC_BASE_URL). Il garde tout ce qu'il reçoit : c'est ainsi
// qu'on vérifie ce que le site envoie réellement — et seulement cela.
//   api.seen            requêtes reçues ({ url, headers, body, raw })
//   api.reply(status, json)   impose la réponse du prochain appel

export function fakeModelApi() {
  const seen = [];
  let next = null; // réponse imposée au prochain appel
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ url: req.url, headers: req.headers, body, raw });
      const reply = next || {
        status: 200,
        json: {
          id: 'msg_test', type: 'message', role: 'assistant', model: body?.model, stop_reason: 'end_turn', stop_sequence: null,
          content: [{ type: 'text', text: JSON.stringify({ suggestions: [
            { text: 'Elle détourna les yeux.', why: 'retenue' }, { text: 'Un sourire, à peine.', why: 'ellipse' }, { text: '   ', why: 'vide : à écarter' },
          ] }) }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      };
      next = null;
      res.writeHead(reply.status, { 'Content-Type': 'application/json', 'x-should-retry': 'false' });
      res.end(JSON.stringify(reply.json));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    base: `http://127.0.0.1:${server.address().port}`,
    seen,
    reply(status, json) { next = { status, json }; },
    stop: () => new Promise((r) => server.close(r)),
  })));
}
