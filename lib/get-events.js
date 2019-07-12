const tar = require('tar-stream')
const { createGunzip } = require('zlib')
const { PassThrough } = require('stream')
const getJSON = require('./get-json')

const fs = require('fs')

const filterStream = extract => {
  const p = new PassThrough({ objectMode: true })
  const onentry = (header, stream, next) => {
    if (header.name.endsWith('.json')) {
      stream.filename = header.name
      p.write(stream.pipe(new PassThrough()))
    }
    stream.on('end', function () {
      next()
    })
    stream.resume()
  }
  extract.on('entry', onentry)
  extract.on('finish', () => {
    p.end()
  })
  return p
}

const getEvents = filename => {
  return (async function * () {
    const stream = fs.createReadStream(filename).pipe(createGunzip())
    const extract = filterStream(stream.pipe(tar.extract()))
    for await (const f of extract) {
      const data = await getJSON(f)
      if (Array.isArray(data)) {
        yield * data
      } else {
        // skip, this is the export schema
      }
    }
  })()
}

module.exports = getEvents
