const getEvents = require('./get-events')
const path = require('path')
const fs = require('fs').promises
const { createWriteStream } = require('fs')

const run = async (dir, output) => {
  const files = await fs.readdir(dir).then(_files => _files.map(f => path.join(dir, f)))
  for (const file of files) {
    for await (const event of getEvents(file)) {
      output.write(JSON.stringify(event) + '\n')
    }
  }
}

module.exports = argv => run(argv.input, argv.output ? createWriteStream(argv.output) : process.stdout)
