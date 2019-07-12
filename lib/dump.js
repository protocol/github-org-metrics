const getEvents = require('./get-events')
const path = require('path')
const fs = require('fs').promises

const run = async (dir, output) => {
  let files = await fs.readdir(dir).then(_files => _files.map(f => path.join(dir, f)))
  let types = new Set()
  for (let file of files) {
    for await (let event of getEvents(file)) {
      output.write(JSON.stringify(event)+'\n')
    }
  }
}

module.exports = argv => run(argv.input, argv.output ? createWriteStream(argv.output) : process.stdout)

