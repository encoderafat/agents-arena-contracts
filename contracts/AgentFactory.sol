// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Interfaces.sol";

contract AgentFactory is IAgentFactory {
    // Make this configurable instead of hardcoded
    address public cadenceArch;

    mapping(uint256 => Agent) public agents;
    uint256 public tokenIdCounter;

    // A simple XP curve for leveling up. level^3 * 100
    // Level 1 -> 2: 100 XP, Level 2 -> 3: 800 XP, etc.
    mapping(uint256 => uint256) public xpToLevelUp;

    address public arenaContract;
    address public owner;

    event AgentMinted(uint256 indexed tokenId, DNA dna, string metadataCID);
    event LeveledUp(uint256 indexed tokenId, uint256 newLevel, DNA newDna);
    event ExperienceGained(uint256 indexed tokenId, uint256 xpGained, uint256 totalExperience);
    event ItemEquipped(uint256 indexed agentId, uint256 indexed itemId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    modifier onlyArenaContract() {
        require(msg.sender == arenaContract, "Only Arena can call this");
        _;
    }
    // Initialize with 0x0000000000000000000000010000000000000001
    constructor(address _cadenceArch) {
        owner = msg.sender;
        tokenIdCounter = 0;
        cadenceArch = _cadenceArch;
        
        // Pre-calculate XP requirements for the first few levels
        for (uint256 i = 1; i < 20; i++) {
            xpToLevelUp[i] = i * i * i * 100;
        }
    }

    function setArenaContract(address _arenaAddress) public onlyOwner {
        arenaContract = _arenaAddress;
    }

    function setCadenceArch(address _cadenceArch) public onlyOwner {
        cadenceArch = _cadenceArch;
    }

    function mintAgent(string memory _metadataCID) public {
        tokenIdCounter++;
        uint256 newId = tokenIdCounter;

        uint64 randomValue = ICadenceArch(cadenceArch).revertibleRandom();
        bytes32 hashedRandom = keccak256(abi.encodePacked(randomValue, block.timestamp, newId));

        // Generate DNA from the random hash
        DNA memory newDna = DNA({
            strength: (uint256(uint40(bytes5(hashedRandom))) % 50) + 25, // Stat between 25-74
            agility: (uint256(uint40(bytes5(hashedRandom << 40))) % 50) + 25, // Stat between 25-74
            intelligence: (uint256(uint40(bytes5(hashedRandom << 80))) % 50) + 25, // Stat between 25-74
            elementalAffinity: uint8(uint256(uint8(bytes1(hashedRandom << 120))) % 5) // 0-4
        });

        agents[newId] = Agent({
            id: newId,
            level: 1,
            experience: 0,
            dna: newDna,
            metadataCID: _metadataCID,
            equippedItem: 0
        });

        emit AgentMinted(newId, newDna, _metadataCID);
    }

    function levelUp(uint256 _tokenId) public {
        Agent storage agent = agents[_tokenId];
        require(agent.id != 0, "Agent does not exist");
        require(agent.experience >= xpToLevelUp[agent.level], "Not enough experience");

        agent.level++;

        // VRF-powered stat gains
        uint64 randomValue = ICadenceArch(cadenceArch).revertibleRandom();
        bytes32 hashedRandom = keccak256(abi.encodePacked(randomValue, agent.id));

        // Each stat has a 50% chance to get a larger boost
        agent.dna.strength += 2 + (uint256(uint8(bytes1(hashedRandom))) % 2) * 2; // +2 or +4
        agent.dna.agility += 2 + (uint256(uint8(bytes1(hashedRandom << 8))) % 2) * 2; // +2 or +4
        agent.dna.intelligence += 2 + (uint256(uint8(bytes1(hashedRandom << 16))) % 2) * 2; // +2 or +4

        emit LeveledUp(_tokenId, agent.level, agent.dna);
    }

    function gainExperience(uint256 _tokenId, uint256 _xp) public override onlyArenaContract {
        Agent storage agent = agents[_tokenId];
        require(agent.id != 0, "Agent does not exist");
        agent.experience += _xp;
        emit ExperienceGained(_tokenId, _xp, agent.experience);
    }

    function equipItem(uint256 _agentId, uint256 _itemId) public {
        // In a real scenario, you'd verify ownership of both agent and item
        agents[_agentId].equippedItem = _itemId;
        emit ItemEquipped(_agentId, _itemId);
    }

    function getAgent(uint256 _tokenId) public view override returns (Agent memory) {
        return agents[_tokenId];
    }
}