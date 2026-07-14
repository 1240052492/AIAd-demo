// Empirically probes the file-upload configuration used by
// apps/server/src/routes/projects.ts:
//     const upload = multer({ dest: 'uploads/' })
//     ... upload.single('file') ...
//     projectService.uploadAsset(..., req.file, ...)  // reads req.file.buffer
//
// multer's diskStorage (the `dest` shorthand) writes the file to disk and does
// NOT populate req.file.buffer. If the handler reads req.file.buffer, every
// upload will throw (TypeError: buffer is undefined) -> HTTP 500.
//
// This spins a tiny Express app with the EXACT config and posts a real multipart
// file, then reports whether req.file.buffer is present. It also checks the
// memoryStorage() alternative (the fix) populates the buffer.

import assert from 'node:assert/strict'
import express from 'express'
import multer from 'multer'
import { test, done } from './_harness.mjs'

function startServer(storageKind) {
  const app = express()
  const upload =
    storageKind === 'disk' ? multer({ dest: 'uploads/' }) : multer({ storage: multer.memoryStorage() })
  app.post('/upload', upload.single('file'), (req, res) => {
    res.json({
      hasBuffer: Buffer.isBuffer(req.file && req.file.buffer),
      hasPath: !!(req.file && req.file.path),
      size: req.file ? req.file.size : null,
    })
  })
  return new Promise((resolve) => {
    const srv = app.listen(0, () => {
      const addr = srv.address()
      resolve({ srv, port: addr.port })
    })
  })
}

async function postFile(port) {
  const form = new FormData()
  form.append('file', new Blob([Buffer.from('fake-png-bytes')], { type: 'image/png' }), 'logo.png')
  const resp = await fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body: form })
  return resp.json()
}

test('CURRENT config (multer dest:uploads/) does NOT populate req.file.buffer -> uploads 500', async () => {
  const { srv, port } = await startServer('disk')
  try {
    const json = await postFile(port)
    assert.equal(
      json.hasBuffer,
      true,
      `req.file.buffer is ${json.hasBuffer}; with diskStorage the buffer is undefined, so uploadAsset(file.buffer) throws 500`,
    )
  } finally {
    srv.close()
  }
})

test('FIX (multer.memoryStorage()) populates req.file.buffer', async () => {
  const { srv, port } = await startServer('memory')
  try {
    const json = await postFile(port)
    assert.equal(json.hasBuffer, true, 'memoryStorage must provide the buffer the handler reads')
    assert.equal(json.size, 16)
  } finally {
    srv.close()
  }
})

done(import.meta.url)
