const bent = require('bent')
const mkdirp = require('mkdirp')
const path = require('path')
const fs = require('fs')
const getEvents = require('./get-events')
const { createObjectCsvStringifier } = require('csv-writer')

const getUser = ev => {
  let user = ev.user || ev.actor
  return user.slice('https://github.com/'.length)
}

const userRegistry = {}
const repoRegistry = {}

const users = {}
const userActions = {}
const totalActions = {}

const getQuarter = ev => {
  let dt = new Date(ev.created_at)
  let quarter = dt.getFullYear() + '-'
  let month = dt.getMonth()
  if (month < 3) {
    quarter += '03-01'
  } else if (month < 6) {
    quarter += '06-01'
  } else if (month < 9) {
    quarter += '09-01'
  } else {
    quarter += '12-1'
  }
  return quarter
}

const userFirstSeen = {}
const userLastSeen = {}
const userFirstSeenByType = {}
const userLastSeenByType = {}

const totalUserActionsByType = {}

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

  /* User totals */
  if (!userFirstSeen[user]) userFirstSeen[user] = event.created_at
  userLastSeen[user] = event.created_at
  if (!userLastSeenByType[event.type]) userLastSeenByType[event.type] = {}
  userLastSeenByType[event.type][user] = event.created_at
  if (!userFirstSeenByType[event.type]) {
    userFirstSeenByType[event.type] = {}
  }
  if (!userFirstSeenByType[event.type][user]) {
    userFirstSeenByType[event.type][user]= event.created_at 
  }
  if (!totalUserActionsByType[event.type]) {
    totalUserActionsByType[event.type] = {}
  }
  if (!totalUserActionsByType[event.type][user]) {
    totalUserActionsByType[event.type][user] = 0
  }
  totalUserActionsByType[event.type][user] += 1


  /* Quarterly totals */
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

const sorted = obj => {
  return (function * () {

    for (let key of Object.keys(obj).sort()) {
      yield [key, obj[key]]
    }
  })()
}

const uniqueKeys = arr => {
  let keys = new Set()
  for (let obj of arr) {
    Object.keys(obj).forEach(key => keys.add(key))
  }
  return Array.from(keys)
}

const mkcsv = records => {
  let keys = uniqueKeys(records)
  for (let record of records) {
    for (let key of keys) {
      if (!record[key]) record[key] = 0
    }
  }
  let header = []
  for (let key of Object.keys(records[0])) {
    header.push({id: key, title: key.toUpperCase()})
  }

  const csvStringifier = createObjectCsvStringifier({header})
  return [
    csvStringifier.getHeaderString(),
    csvStringifier.stringifyRecords(records)
  ].join('\n')
}

const onFinish = (outputDir) => {
  let metrics = {}
  metrics.uniqueUsers = {}
  for (let [quarter, _set] of sorted(users)) {
    metrics.uniqueUsers[quarter] = _set.size
  }

  let write = (filename, str) => {
    fs.writeFileSync(path.join(outputDir, filename), Buffer.from(str))
  }

  const processActions = container => {
    let quarters = Object.keys(container).sort()
    let types = uniqueKeys(Object.values(container))
    let records = {}

    for (let [quarter, value] of sorted(container)) {
      for (let [type, num] of Object.entries(value)) {
        if (!records[type]) records[type] = {type}
        if (num instanceof Set) num = num.size
        records[type][quarter] = num
      }
    }

    return mkcsv(Object.values(records))
  }
  const processActionGrowth = container => {
    let quarters = Object.keys(container).sort()
    let types = uniqueKeys(Object.values(container))
    let records = {}
    let prev = null
    for (let [quarter, value] of sorted(container)) {
      for (let [type, num] of Object.entries(value)) {
        if (prev) {
          if (!records[type]) records[type] = {type}
          if (num instanceof Set) num = num.size
          let last = prev[type]
          if (last instanceof Set) last = last.size
          records[type][quarter] = Math.round(((num - last) / last) * 100)
        }
      }
      prev = value
    }

    return mkcsv(Object.values(records))
  }
  write('total-actions.csv', processActions(totalActions))
  write('unique-users-by-action.csv', processActions(userActions))
  write('growth-of-total-action.csv', processActionGrowth(totalActions))
  write('growth-of-unique-users-by-action.csv', processActionGrowth(userActions))

  const uniqueUsersByQuarter = {}
  for (let [quarter, value] of sorted(userActions)) {
    let users = new Set()
    for (let [type, _set] of Object.entries(value)) {
      for (let user of _set) {
        users.add(user)
      }
    }
    uniqueUsersByQuarter[quarter] = users.size
  }

  write('unique-users.csv', mkcsv([uniqueUsersByQuarter]))
  write('metrics.json', JSON.stringify(metrics))
  
  /* Contributor Bubble Matrixes */
  const contributorSummaryPullRequestsOnly = []
  const contributorSummaryAllActivity = []
  const contributorTotals = {}
  for (let [type, users] of Object.entries(totalUserActionsByType)) {
    for (let [user, total] of Object.entries(users)) {
      if (type === 'pull_request') {
        contributorSummaryPullRequestsOnly.push({
          user,
          first: userFirstSeenByType[type][user].slice(0, '2018-01-01'.length),
          last: userLastSeenByType[type][user].slice(0, '2018-01-01'.length),
          prs: total
        })
      }
      if (!contributorTotals[user]) contributorTotals[user] = 0
      contributorTotals[user] += total
    }
  }
  for (let [user, total] of Object.entries(contributorTotals)) {
    contributorSummaryAllActivity.push({
      user,
      first: userFirstSeen[user].slice(0, '2018-01-01'.length),
      last: userLastSeen[user].slice(0, '2018-01-01'.length),
      activity: total
    })
  }
  write('contributor-summary-pull-requests.csv', mkcsv(contributorSummaryPullRequestsOnly))
  write('contributor-summary-all-activity.csv', mkcsv(contributorSummaryAllActivity))
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
  onFinish(argv.dir)
}

module.exports = allMetrics
