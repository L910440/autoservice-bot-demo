const https = require('https');

function transcribeVoice(buffer) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.deepgram.com',
        path: '/v1/listen?language=ru&model=nova-2',
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'audio/ogg',
          'Content-Length': buffer.length,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
            resolve(text);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

module.exports = { transcribeVoice };
