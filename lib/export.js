const bent = require('bent')
const sleep = require('sleep-promise')
const parseLinkHeader = require('parse-link-header')
const path = require('path')
const fs = require('fs')
const getJSON = require('./get-json.js')

/* pull all github repos in org */
const getRepos = async (org, token) => {
  const get = bent({
    'User-Agent': 'ipfs-metrics-migration@0.0.1',
    Authorization: `token ${token}`
  })

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
  const r = new Set(repos)
  console.log(`Found ${r.size} repos.`)
  return r
}

const exportRepos = async (argv, repos) => {
  const token = argv.token
  const post = bent('POST', {
    'User-Agent': 'ipfs-metrics-migration@0.0.1',
    Accept: 'application/vnd.github.wyandotte-preview+json',
    Authorization: `token  ${token}`
  }, 201)

  const org = argv.org
  const dir = argv.dir
  const body = {
    lock_repositories: false,
    exclude_attachments: true,
    repositories: Array.from(repos)
  }
  const url = `https://api.github.com/orgs/${org}/migrations`
  const resp = await post(url, body)
  const data = await getJSON(resp)
  const id = data.id
  const ts = Date.now()
  let status = await checkMigrationStatus(org, id, token)
  const _repos = status.repositories.map(r => r.full_name)
  while (status.state !== 'exported' && status.state !== 'failed') {
    const str = `Export of (${_repos.join(', ')}) is still ${status.state}, waiting one minute`
    console.log(str)
    await sleep(60 * 1000)
    status = await checkMigrationStatus(org, id, token)
  }
  if (status.state === 'failed') {
    console.error(`FAILED: ${_repos.join(', ')}`)
    return
  }
  const stream = await downloadArchive(status.archive_url, token)
  const f = fs.createWriteStream(path.join(dir, `${org}-${ts}.tar.gz`))
  f.on('close', () => {
    console.log('Wrote', `${org}-${ts}.tar.gz`)
  })
  stream.pipe(f)
}

const exportData = async argv => {
  const org = argv.org
  const token = argv.token
  const repos = Array.from(await getRepos(org, token)).sort()
  const chunks = []
  while (repos.length) {
    chunks.push(repos.splice(0, 5))
  }
  while (chunks && chunks.length) {
    console.log(`Starting migration of ${chunks[0].join(', ')}`)
    exportRepos(argv, chunks.shift(), token)
    await sleep(1000 /* one second */)
  }
}

const downloadArchive = async (url, token) => {
  const download = bent({
    'User-Agent': 'ipfs-metrics-migration@0.0.1',
    Accept: 'application/vnd.github.wyandotte-preview+json',
    Authorization: `token ${token}`
  }, 302, 'string')
  url = await download(url)
  return bent()(url)
}

const listMigrations = async (org, token) => {
  const url = `https://api.github.com/orgs/${org}/migrations`
  const req = bent({
    'User-Agent': 'ipfs-metrics-migration@0.0.1',
    Accept: 'application/vnd.github.wyandotte-preview+json',
    Authorization: `token ${token}`
  })
  const resp = await req(url)
  const data = await getJSON(resp)
  return data
}

const checkMigrationStatus = async (org, id, token) => {
  const url = `https://api.github.com/orgs/${org}/migrations/${id}`
  const req = bent({
    'User-Agent': 'ipfs-metrics-migration@0.0.1',
    Accept: 'application/vnd.github.wyandotte-preview+json',
    Authorization: `token ${token}`
  })
  const resp = await req(url)
  const data = await getJSON(resp)
  return data
}

module.exports = exportData
module.exports.checkMigrationStatus = checkMigrationStatus
module.exports.listMigrations = listMigrations
