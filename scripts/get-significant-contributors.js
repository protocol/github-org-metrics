const fs = require('fs')
const bent = require('bent')
const parse = require('csv-parse/lib/sync')
const { createObjectCsvStringifier } = require('csv-writer')

const get = bent('https://api.github.com', 'json', {
  'User-Agent': 'ipfs-metrics-migration@0.0.1',
  Authorization: `token ${process.env.GHTOKEN}`
})

let file = process.argv[process.argv.length - 1]  

let filecontents = fs.readFileSync(file)

let records = parse(filecontents.toString(), {
  columns: true,
  skip_empty_lines: true
})


const run = async () => {
  let people = []
  for (let row of records) {
    let prs = parseInt(row.PRS)
    if (prs > 9) {
      let name = row.USER
      let info = await get(`/users/${name}`)
      people.push({
        name,
        prs: row.PRS,
        last: row.LAST,
        email: info.email,
        fullname: info.name,
        company: info.company,
        location: info.location,
        bio: info.bio
      })
      console.log(people[people.length -1])
    }
  }
  const header = []
  for (let key of Object.keys(people[0])) {
    header.push({id: key, title: key.toUpperCase()})
  }
  const csvStringifier = createObjectCsvStringifier({header})
  const str = [
    csvStringifier.getHeaderString(),
    csvStringifier.stringifyRecords(people)
  ].join('\n')
  console.log(str)
}
run()
