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

const quarterlyBubble = {}


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

const lazyIncrement = (...args) => {
  let container = args.shift()
  while (args.length) {
    let key = args.shift()
    if (args.length) {
      if (!container[key]) container[key] = {}
      container = container[key]
    } else {
     if (!container[key]) container[key] = 0
     container[key] += 1
    }
  }
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

  /* User totals */
  let created = (new Date(event.created_at)).getTime()
  if (!userFirstSeen[user] || created < userFirstSeen[user]) userFirstSeen[user] = created
  if (!userLastSeen[user] || userLastSeen[user] < created) userLastSeen[user] = created
  
  if (!userLastSeenByType[event.type]) {
    userLastSeenByType[event.type] = {}
  }
  if (!userLastSeenByType[event.type][user] || userLastSeenByType[event.type][user] < created) {
    userLastSeenByType[event.type][user] = created
  }
  
  if (!userFirstSeenByType[event.type]) {
    userFirstSeenByType[event.type] = {}
  }
  if (!userFirstSeenByType[event.type][user] || created < userFirstSeenByType[event.type][user]) {
    userFirstSeenByType[event.type][user] = created 
  }

  lazyIncrement(totalUserActionsByType, event.type, user)


  /* Quarterly totals */
  let quarter = getQuarter(event)
  if (!users[quarter]) users[quarter] = new Set()
  users[quarter].add(user)
  if (!userActions[quarter]) userActions[quarter] = {}
  if (!userActions[quarter][event.type]) {
    userActions[quarter][event.type] = new Set()
  }
  userActions[quarter][event.type].add(user)
  
  lazyIncrement(totalActions, quarter, event.type)

  /* Quarterly Bubble Charts */
  // quarter user prs-total other-activity-total %-of-prs-in-quarter
  lazyIncrement(quarterlyBubble, quarter, user, event.type) 
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

  /* quarterly bubble views */
  let o = Object.entries
  let rows = []
  for (let [quarter, users] of o(quarterlyBubble)) {
    let lines = []
    let total = { pr: 0, a: 0 }
    for (let [user, events] of o(users)) {
      let prs = 0
      let activity = 0
      for (let [event, num] of o(events)) {
        if (event !== 'pull_request') {
          activity += num
        } else {
          prs = num
        }
      }
      total.pr += prs
      total.a += activity
      lines.push({quarter, user, prs, activity})
    }
    for (let line of lines) {
      line.share = line.prs / total.pr
      rows.push(line)
    }
  }
  write('contributor-bubbles.csv', mkcsv(rows)) 


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
        let first = (new Date(userFirstSeenByType[type][user])).toISOString().slice(0, '2018-01-01'.length)
        let last = (new Date(userLastSeenByType[type][user])).toISOString().slice(0, '2018-01-01'.length)
        contributorSummaryPullRequestsOnly.push({
          user,
          first,
          last,
          prs: total
        })
      }
      if (!contributorTotals[user]) contributorTotals[user] = 0
      contributorTotals[user] += total
    }
  }
  for (let [user, total] of Object.entries(contributorTotals)) {
    let first = (new Date(userFirstSeen[user])).toISOString().slice(0, '2018-01-01'.length)
    let last = (new Date(userLastSeen[user])).toISOString().slice(0, '2018-01-01'.length)
    contributorSummaryAllActivity.push({
      user,
      first,
      last,
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
