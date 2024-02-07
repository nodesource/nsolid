import assert from 'assert';
import http from 'node:http';
import {
  getExportRequestProto,
  ServiceClientType,
} from '@opentelemetry/otlp-proto-exporter-base';

// Create a local server to receive data from
async function startServer(cb) {
  const ExportSpansServiceRequestProto =
    getExportRequestProto(ServiceClientType.SPANS);

  const server = http.createServer(async (req, res) => {
    const body = [];
    req.on('data', (chunk) => {
      body.push(chunk);
    }).on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: 'Hello World!',
      }));

      const data = ExportSpansServiceRequestProto.decode(Buffer.concat(body));
      const spans = data?.toJSON();
      cb(null, spans);
    });
  });

  await new Promise((resolve, reject) => {
    server.listen(0, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return server;
}

const server = await startServer((err, spans) => {
  assert.ifError(err);
  process.send({ type: 'spans', spans });
});

process.send({ type: 'port', port: server.address().port });
process.on('message', (message) => {
  if (message.type === 'close') {
    server.close(() => {
      process.exit(0);
    });
  }
});
