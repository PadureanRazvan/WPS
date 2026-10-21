const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

// Resolve through the actual consumers, including if npm changes the hoisting layout.
const fromAdmin = createRequire(require.resolve('firebase-admin/app'));
const busboyPath = fromAdmin.resolve('@fastify/busboy');
const Busboy = fromAdmin('@fastify/busboy');
const fromFunctions = createRequire(require.resolve('firebase-functions'));
const fromExpress = createRequire(fromFunctions.resolve('express'));
const proxyAddr = fromExpress('proxy-addr');
const fromFirestore = createRequire(fromAdmin.resolve('@google-cloud/firestore'));
const fromGax = createRequire(fromFirestore.resolve('google-gax'));
process.env.GRPC_NODE_DEBUG_SEND_ERROR_DETAILS = 'false';
const grpc = fromGax('@grpc/grpc-js');

function parsePart(headers, value = 'fixture') {
  return new Promise((resolve, reject) => {
    const parser = new Busboy({
      headers: { 'content-type': 'multipart/form-data; boundary=sherpa-test' }
    });
    const parts = [];
    parser.on('field', (name, content) => parts.push({ name, content }));
    parser.on('file', (name, stream, filename) => {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => parts.push({ name, filename, content: Buffer.concat(chunks).toString() }));
    });
    parser.on('error', reject);
    parser.on('finish', () => resolve(parts));
    parser.end(`--sherpa-test\r\n${headers.join('\r\n')}\r\n\r\n${value}\r\n--sherpa-test--\r\n`);
  });
}

test('multipart parsing preserves ordinary fields and files', async () => {
  assert.deepEqual(await parsePart(['Content-Disposition: form-data; name="message"'], 'Bună'), [
    { name: 'message', content: 'Bună' }
  ]);
  assert.deepEqual(await parsePart([
    'Content-Disposition: form-data; name="upload"; filename="fixture.csv"',
    'Content-Type: text/csv'
  ], 'day,hours\n1,8'), [{ name: 'upload', filename: 'fixture.csv', content: 'day,hours\n1,8' }]);
});

// GHSA-x8mw-p69m-v3mx: inherited Object keys must not crash the multipart parser.
test('multipart headers with prototype names do not crash parsing', async () => {
  for (const name of ['__proto__', 'constructor']) {
    assert.deepEqual(await parsePart([
      `${name}: fixture`, 'Content-Disposition: form-data; name="message"'
    ]), [{ name: 'message', content: 'fixture' }]);
  }
});

// GHSA-gxm5-99cw-xjw9: neither literal nor encoded line breaks may escape in names.
test('multipart parsing discards names and filenames containing CR or LF', async () => {
  for (const disposition of [
    'form-data; name="field\rname"',
    'form-data; name="field\nname"',
    'form-data; name="field"; filename="file\rname.csv"',
    'form-data; name="field"; filename="file\nname.csv"',
    "form-data; name*=utf-8''field%0Dname",
    "form-data; name=field; filename*=utf-8''file%0Aname.csv"
  ]) {
    assert.deepEqual(await parsePart([`Content-Disposition: ${disposition}`]), []);
  }
});

// GHSA-xjh9-v7x6-24jw: isolate this case so a vulnerable parser cannot hang the suite.
test('a fragmented 252-byte multipart boundary cannot stall the process', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const Busboy = require(${JSON.stringify(busboyPath)});
    const boundary = 'A'.repeat(252);
    const parser = new Busboy({ headers: { 'content-type': 'multipart/form-data; boundary=' + boundary } });
    parser.write(Buffer.from('--' + boundary.slice(0, -1)));
    parser.write(Buffer.from('X'), error => process.exit(error ? 1 : 0));
    setTimeout(() => process.exit(2), 1000);
  `], { timeout: 3000, windowsHide: true, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

// GHSA-jqcg-44mw-7w3h: exercise both trust compilation and forwarded-address selection.
test('proxy trust rejects spoofed forwarded addresses and preserves valid subnet behavior', () => {
  for (const peer of ['203.0.113.9', '::ffff:203.0.113.9']) {
    const request = { connection: { remoteAddress: peer }, headers: { 'x-forwarded-for': '192.0.2.1' } };
    assert.equal(proxyAddr(request, ['::ffff:10.0.0.0/8']), peer);
    assert.equal(proxyAddr.compile(['::/1'])(peer), false);
  }
  for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
    const trust = proxyAddr.compile([subnet]);
    assert.equal(trust('10.0.0.1'), true);
    assert.equal(trust('::ffff:10.0.0.1'), true);
    assert.equal(trust('203.0.113.9'), false);
  }
  assert.equal(proxyAddr.compile(['2001:db8::/32'])('2001:db8::1'), true);
});

// Exercise the real transport used by Firestore, entirely on loopback.
// GHSA-f596-whhp-79r4: thrown server errors must not disclose private details.
test('gRPC preserves unary calls and hides unexpected handler error details', { timeout: 10000 }, async t => {
  const serialize = value => Buffer.from(JSON.stringify(value));
  const deserialize = value => JSON.parse(value.toString());
  const service = {
    echo: {
      path: '/sherpa.test/Echo', requestStream: false, responseStream: false,
      requestSerialize: serialize, requestDeserialize: deserialize,
      responseSerialize: serialize, responseDeserialize: deserialize
    }
  };
  const server = new grpc.Server();
  t.after(() => server.forceShutdown());
  server.addService(service, { echo(call, callback) {
    if (call.request.fail) throw new Error('private-fixture-detail');
    callback(null, { reply: call.request.message });
  } });
  const port = await new Promise((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) reject(error); else resolve(boundPort);
    });
  });
  const Client = grpc.makeGenericClientConstructor(service, 'SherpaTest');
  const client = new Client(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  t.after(() => client.close());
  const invoke = data => new Promise((resolve, reject) => {
    client.echo(data, { deadline: Date.now() + 3000 }, (error, result) => error ? reject(error) : resolve(result));
  });
  assert.deepEqual(await invoke({ message: 'ready' }), { reply: 'ready' });
  await assert.rejects(invoke({ fail: true }), error => {
    assert.equal(error.code, grpc.status.UNKNOWN);
    assert.doesNotMatch(error.details, /private-fixture-detail/);
    return true;
  });
});
