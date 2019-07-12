const { counter, quarter } = require('reed-richards')
const getEvents = require('./get-events')
const fs = require('fs').promises
const path = require('path')
const mkcsv = require('mkcsv')

const monthly = counter('month', 'project', 'actor')
const quarterly = counter('quarter', 'project', 'actor')
const byType = counter('month', 'project', 'type')

const projects = [
  'ipld',
  'ipfs',
  'filecoin-project',
  'ipfs-shipyard',
  'libp2p'
]

const ignores = ['user', 'repository', 'team', 'organization', 'protected_branch', 'project']

const run = async basedir => {
  const dirs = projects.map(s => path.join(basedir, s))
  const files = [].concat(...await Promise.all(dirs.map(d => {
    return fs.readdir(d).then(_files => _files.map(f => path.join(d, f)))
  })))
  for (const file of files) {
    let project = path.dirname(file)
    project = project.slice(project.lastIndexOf('/') + 1)
    for await (const event of getEvents(file)) {
      event.project = project
      if (project === 'ipfs-shipyard') event.project = 'ipfs'
      const dt = new Date(event.created_at)
      event.quarter = quarter(dt)
      event.month = dt.getFullYear() + '-' + (dt.getMonth() + 1).toString().padStart(2, 0)
      const count = () => {
        monthly.count(event)
        quarterly.count(event)
        byType.count(event)
      }
      if (event.actor) {
        count()
      } else if (event.user) {
        event.actor = event.user
        count()
      } else {
        if (!ignores.includes(event.type) && event.user !== null) {
          console.log(event.type)
          console.log(event)
        }
      }
    }
  }
  let lines = []
  for (const [month, map] of monthly.data.entries()) {
    const line = { month }
    for (const [project, _map] of map.entries()) {
      line[project] = _map.size
    }
    lines.push(line)
  }
  await fs.writeFile(path.join(__dirname, 'monthly.csv'), mkcsv(lines))

  lines = []
  for (const [quarter, map] of quarterly.data.entries()) {
    const line = { quarter }
    for (const [project, _map] of map.entries()) {
      line[project] = _map.size
    }
    lines.push(line)
  }

  await fs.writeFile(path.join(__dirname, 'quarterly.csv'), mkcsv(lines))
  await fs.writeFile(path.join(__dirname, 'byType.csv'), mkcsv((Array.from(byType.objects()))))
}

module.exports = run

// run('../q2-2019-raw-data')
