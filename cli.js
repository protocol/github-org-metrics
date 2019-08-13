#!/usr/bin/env node
const yargs = require('yargs')
const path = require('path')
const exportData = require('./lib/export')
const metrics = require('./lib/metrics')
const mkdirp = require('mkdirp')
const dump = require('./lib/dump')

const runExport = async argv => {
  if (argv.dir === null) {
    argv.dir = path.join(__dirname, argv.org)
  }
  mkdirp.sync(argv.dir)
  exportData(argv)
}

const runStatus = async argv => {
  console.log(await exportData.checkMigrationStatus(argv.org))
}

const runCSV = async argv => {
  if (argv.dir === null) {
    argv.dir = path.join(__dirname, argv.inputDir + '_metrics')
  }
  mkdirp.sync(argv.dir)
  metrics(argv)
}

const runLs = async argv => {
  const orgs = argv.org.split(',')
  for (const org of orgs) {
    for await (const repo of exportData.getRepos(org, argv.token)) {
      console.log(repo)
    }
  }
}

const tokenOption = yargs => {
  yargs.option('token', {
    describe: 'GitHub token',
    required: true,
    default: process.env.GHTOKEN
  })
}

const args = yargs
  .command('ls [org]', 'list all repos in org', yargs => {
    yargs.positional('org', {
      describe: 'Name of the org you want to pull',
      required: true
    })
    tokenOption(yargs)
  }, runLs)
  .command('pull [org]', 'export org data', yargs => {
    yargs.positional('org', {
      describe: 'Name of the org you want to pull. Supports multiple orgs with command separation.',
      required: true
    })
      .option('dir', {
        describe: 'Output directory, defaults to org name',
        alias: 'd',
        default: null
      })
    tokenOption(yargs)
  }, runExport)
  .command('export [input]', 'export data as line separate JSON', yargs => {
    yargs.positional('input', {
      describe: 'Directory containing all exported tarballs',
      required: true
    })
      .option('output', {
        describe: 'Output file, defaults to stdout',
        alias: 'o',
        default: null
      })
  }, dump)
  .command('status [org]', 'get status information on org migrations', yargs => {
    yargs.positional('org', {
      describe: 'Name of the org you want to check',
      required: true
    })
  }, runStatus)
  .command('metrics [inputDir]', 'output csv files for org metrics', yargs => {
    yargs.positional('inputDir', {
      describe: 'Name of the directory of exported migration tarballs',
      required: true
    })
      .option('dir', {
        describe: 'Output directory, defaults to {inputDir}_metrics',
        alias: 'd',
        default: null
      })
  }, runCSV)
  .option('verbose', {
    describe: 'Verbose output mode',
    alias: 'v',
    default: false
  })
  .scriptName('github-org-metrics')
  .argv

if (!args._.length) {
  yargs.showHelp()
}
