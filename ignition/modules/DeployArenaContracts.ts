import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DeployArenaContracts = buildModule("DeployArenaContracts", (m) => {
  const deployerAddress = "0xE5d7e81226E2Ca1355F8954673eCe59Fe40fDBFd"; // <-- replace this
  const cadenceArch = "0x0000000000000000000000010000000000000001";

  const itemFactory = m.contract("ItemFactory", [deployerAddress]);

  const agentFactory = m.contract("AgentFactory", [cadenceArch]);

  const arena = m.contract("Arena", [agentFactory, cadenceArch]);

  return { itemFactory, agentFactory, arena };
});

export default DeployArenaContracts;
