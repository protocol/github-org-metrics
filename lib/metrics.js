const bent = require('bent')
const mkdirp = require('mkdirp')
const path = require('path')
const fs = require('fs')
const getEvents = require('./get-events')

const getUser = ev => {
  let user = ev.user || ev.actor
  return user.slice('https://github.com/'.length)
}

const userRegistry = {}
const repoRegistry = {}

const users = {}
const userActions = {}
const actions = {}
const totalActions = {}

const getQuarter = ev => {
  let dt = new Date(ev.created_at)
  let quarter = dt.getFullYear() + '-'
  let month = dt.getMonth()
  if (month < 3) {
    quarter += '1'
  } else if (month < 6) {
    quarter += '2'
  } else if (month < 9) {
    quarter += '3'
  } else {
    quarter += '4'
  }
  return quarter
}

const onEvent = event => {
  if (event.type === 'user') {
    userRegistry[event.login] = event
    return
  }
  if (event.type === 'repository') {
    repoRegistry[event.name] = event
    return
  }
  let skips = [
    'team',
    'organization',
    'protected_branch',
    'project'
  ]
  if (skips.includes(event.type)) {
    return
  }
  let user
  if (event.user === null) {
    // Delete User, nothing we can do about it.
    user = 'deleted'
  } else {
    user = getUser(event)
  }

  let quarter = getQuarter(event)
  if (!users[quarter]) users[quarter] = new Set()
  users[quarter].add(user)
  if (!userActions[quarter]) userActions[quarter] = {}
  if (!userActions[quarter][event.type]) {
    userActions[quarter][event.type] = new Set()
  }
  userActions[quarter][event.type].add(user)
  if (!totalActions[quarter]) {
    totalActions[quarter] = {}
  }
  if (!totalActions[quarter][event.type]) {
    totalActions[quarter][event.type] = 0
  }
  totalActions[quarter][event.type] += 1
}

const allMetrics = async argv => {
  let files = fs.readdirSync(argv.inputDir).filter(f => f.endsWith('tar.gz'))
  let promises = files.map(filename => {
    return (async () => {
      let f = path.join(argv.inputDir, filename)
      for await (let event of getEvents(f)) {
        onEvent(event)
      }
    })()
  })
  await Promise.all(promises)
}

module.exports = allMetrics
