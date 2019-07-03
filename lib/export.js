const bent = require('bent')
const sleep = require('sleep-promise')
const parseLinkHeader = require('parse-link-header')
const path = require('path')
const fs = require('fs')
const getJSON = require('./get-json.js')
const baseurl = 'https://api.github.com'

const get = bent({
  'User-Agent': 'ipfs-metrics-migration@0.0.1',
  Authorization: `token ${process.env.GHTOKEN}`
})

const post = bent('POST', {
  'User-Agent': 'ipfs-metrics-migration@0.0.1',
  Accept: 'application/vnd.github.wyandotte-preview+json',
  Authorization: `token  ${process.env.GHTOKEN}`
}, 201)

/* pull all github repos in org */

const getRepos = async org => {
  console.log('Finding all repos in org.')
  let url = `https://api.github.com/orgs/${org}/repos`
  let resp = await get(url)
  let repos = (await getJSON(resp)).map(r => r.full_name)
  let links = parseLinkHeader(resp.headers.link)
  while (links && links.next) {
    url = links.next.url
    resp = await get(url)
    repos = repos.concat((await getJSON(resp)).map(r => r.full_name))
    links = parseLinkHeader(resp.headers.link)
  }
  let r = new Set(repos)
  console.log(`Found ${r.size} repos.`)
  return r
}

const exportRepos = async (argv, repos) => {
  let org = argv.org
  let dir = argv.dir
  let body = {
    lock_repositories: false,
    exclude_attachments: true,
    repositories: Array.from(repos)
  }
  let url = `https://api.github.com/orgs/${org}/migrations`
  let resp = await post(url, body)
  let data = await getJSON(resp)
  let id = data.id
  let ts = Date.now()
  let status = await checkMigrationStatus(org, id)
  let _repos = status.repositories.map(r => r.full_name)
  while (status.state !== 'exported' && status.state !== 'failed') {
    let str = `Export of (${_repos.join(', ')}) is still ${status.state}, waiting one minute`
    console.log(str)
    await sleep(60 * 1000)
    status = await checkMigrationStatus(org, id)
  }
  if (status.state === 'failed') {
    console.error(`FAILED: ${_repos.join(', ')}`)
    return
  }
  let stream = await downloadArchive(status.archive_url)
  let f = fs.createWriteStream(path.join(dir, `${org}-${ts}.tar.gz`))
  f.on('close', () => {
    console.log('Wrote', `${org}-${ts}.tar.gz`)
  })
  stream.pipe(f)
}

const exportData = async argv => {
  let org = argv.org
  let repos = Array.from(await getRepos(org)).sort()
  let chunks = []
  while (repos.length) {
    chunks.push(repos.splice(0, 5))
  }
  // let pull = () => {
  //   if (chunks.length) {
  //     exportRepos(argv, chunks.shift()).then(pull)
  //   }
  // }
  // pull()
  // pull()
  // pull()
  // pull()
  while (chunks && chunks.length) {
    console.log(`Starting migration of ${chunks[0].join(', ')}`)
    exportRepos(argv, chunks.shift())
    await sleep(1000 /* one second */)
  }
}

const downloadArchive = async (url) => {
  let download = bent({
    'User-Agent': 'ipfs-metrics-migration@0.0.1',
    Accept: 'application/vnd.github.wyandotte-preview+json',
    Authorization: `token ${process.env.GHTOKEN}`
  }, 302, 'string')
  url = await download(url)
  return bent()(url)
}

const listMigrations = async org => {
  let url = `https://api.github.com/orgs/${org}/migrations`
  let req = bent({
    'User-Agent': 'ipfs-metrics-migration@0.0.1',
    Accept: 'application/vnd.github.wyandotte-preview+json',
    Authorization: `token ${process.env.GHTOKEN}`
  })
  let resp = await req(url)
  let data = await getJSON(resp)
  let d = data[0]
  return data
}

const checkMigrationStatus = async (org, id) => {
  let url = `https://api.github.com/orgs/${org}/migrations/${id}`
  let req = bent({
    'User-Agent': 'ipfs-metrics-migration@0.0.1',
    Accept: 'application/vnd.github.wyandotte-preview+json',
    Authorization: `token ${process.env.GHTOKEN}`
  })
  let resp = await req(url)
  let data = await getJSON(resp)
  return data
}

module.exports = exportData
module.exports.checkMigrationStatus = checkMigrationStatus
