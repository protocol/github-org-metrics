const { counter } = require('../../reed-richards')
const getEvents = require('./get-events')
const fs = require('fs').promises
const path = require('path')
const mkcsv = require('mkcsv')

const metrics = counter('month', 'project', 'actor')

const run = async basedir => {
  let dirs = ['ipld', 'ipfs', 'filecoin-project', 'libp2p'].map(s => path.join(basedir, s))
  let files = [].concat(...await Promise.all(dirs.map(d => {
    return fs.readdir(d).then(_files => _files.map(f => path.join(d, f)))
  })))
  let types = new Set()
  for (let file of files) {
    let project = path.dirname(file)
    project = project.slice(project.lastIndexOf('/')+1)
    for await (let event of getEvents(file)) {
      event.project = project
      let dt = new Date(event.created_at)
      event.month = dt.getFullYear() + '-' + ( dt.getMonth() + 1 ).toString().padStart(2, 0)
      if (event.actor) {
        metrics.count(event)
      }
    }
  }
  let lines = []
  for (let [month, map] of metrics.data.entries()) {
    let line = { month }
    for (let [project, _map] of map.entries()) {
      line[project] = _map.size
    }
    lines.push(line)
  }
  console.log(mkcsv(lines))
}

run('..')
