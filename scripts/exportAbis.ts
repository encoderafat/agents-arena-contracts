import fs from 'fs'
import path from 'path'

// List of contracts you want to export ABIs for
const contracts = ['ItemFactory', 'AgentFactory', 'Arena']

contracts.forEach((contract) => {
  const artifactPath = path.resolve(__dirname, `../artifacts/contracts/${contract}.sol/${contract}.json`)
  const outputPath = path.resolve(__dirname, `./abis/${contract}.json`)

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  const abi = artifact.abi

  fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2))
  console.log(`✅ ABI for ${contract} written to ./abis/${contract}.json`)
})
