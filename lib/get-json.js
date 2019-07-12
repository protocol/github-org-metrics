const getJSON = stream => {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => {
      resolve(JSON.parse(Buffer.concat(chunks).toString()))
    })
  })
}

module.exports = getJSON
