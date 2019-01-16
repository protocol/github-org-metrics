const tar = require('tar-stream')
const {createGunzip} = require('zlib')
const {PassThrough} = require('stream')
const getJSON = require('./get-json')

const fs = require('fs')

const filterStream = extract => {
  let p = new PassThrough({objectMode: true})
  let onentry = (header, stream, next) => {
    if (header.name.endsWith('.json')) {
      console.log(header.name)
      stream.filename = header.name
      p.write(stream.pipe(new PassThrough()))
    }
    stream.on('end', function() {
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
    let stream = fs.createReadStream(filename).pipe(createGunzip())
    let extract = filterStream(stream.pipe(tar.extract()))
    for await (let f of extract) {
      let data = await getJSON(f)
      if (Array.isArray(data)) {
        yield * data
      } else {
        // skip, this is the export schema
      }
    }
  })()
}

module.exports = getEvents
